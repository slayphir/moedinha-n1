"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { startOfMonth, endOfMonth } from "date-fns";
import { attachCategoryType, sumReceitas } from "@/lib/transactions/classification";

/**
 * Checks for recent income and calculates pending funding based on distribution rules.
 * Usa a mesma regra de receitas do dashboard: o card segue o `type` do lancamento
 * e ignora dados historicos inconsistentes com categoria de despesa.
 */
export async function getPendingFunding(orgId: string) {
    const supabase = await createClient();

    const { data: distribution } = await supabase
        .from("distributions")
        .select("*, buckets:distribution_buckets(*)")
        .eq("org_id", orgId)
        .eq("is_default", true)
        .single();

    if (!distribution) return { totalIncome: 0, fundingPlan: [] };

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const startIso = monthStart.toISOString().slice(0, 10);
    const endIso = monthEnd.toISOString().slice(0, 10);

    const { data: categoryRows } = await supabase
        .from("categories")
        .select("id, type, is_creditor_center")
        .eq("org_id", orgId);
    const contactPaysMeCategoryIds = new Set((categoryRows ?? []).filter((c) => c.is_creditor_center).map((c) => c.id));
    const categoryTypeById = new Map((categoryRows ?? []).map((c) => [c.id, c.type]));

    const { data: monthTx } = await supabase
        .from("transactions")
        .select("amount, type, contact_id, category_id, contact_payment_direction")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .neq("type", "transfer")
        .in("status", ["cleared", "reconciled"])
        .gte("date", startIso)
        .lte("date", endIso);

    const totalIncome = sumReceitas(
        attachCategoryType(
            (monthTx ?? []) as {
                type: string;
                amount: number | string | null;
                contact_id?: string | null;
                category_id?: string | null;
                contact_payment_direction?: string | null;
            }[],
            categoryTypeById
        ),
        contactPaysMeCategoryIds
    );

    // Calculate expected funding for each bucket
    const fundingPlan = distribution.buckets.map((bucket: { id: string; name: string; percent_bps: number; color?: string }) => ({
        bucketId: bucket.id,
        bucketName: bucket.name,
        targetAmount: (totalIncome * bucket.percent_bps) / 10000,
        color: bucket.color
    }));

    return { totalIncome, fundingPlan };
}

/**
 * Creates a transfer transaction to fund a specific goal/bucket.
 */
export async function executeFunding(
    orgId: string,
    amount: number,
    sourceAccountId: string,
    description: string,
    goalId?: string
) {
    const supabase = await createClient();

    const { error } = await supabase.from("transactions").insert({
        org_id: orgId,
        type: "expense", // Treating funding as an expense from the main account to "Vault"
        amount: amount,
        account_id: sourceAccountId,
        description: description,
        date: new Date().toISOString(),
        category_id: null, // Optional: could link to a "Savings" category
        status: "cleared",
        metadata: { goal_id: goalId, type: "funding" }
    });

    if (error) return { error: error.message };

    revalidatePath("/dashboard");
    return { success: true };
}
