"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Checks for recent income and calculates pending funding based on distribution rules.
 */
export async function getPendingFunding(orgId: string) {
    const supabase = await createClient();

    // 1. Get active distribution
    const { data: distribution } = await supabase
        .from("distributions")
        .select("*, buckets:distribution_buckets(*)")
        .eq("org_id", orgId)
        .eq("is_default", true)
        .single();

    if (!distribution) return { totalIncome: 0, fundingPlan: [] };

    // 2. Get Income from current month (or last 30 days) that has NOT been funded
    // We need a way to mark transactions as "funded".
    // For now, let's use a simple approach:
    // Sum all income in current month.
    // Sum all "Goal Funding" transfers in current month.
    // Pending = (Income * Goal%) - Funded.

    // Let's refine: We will look for "Income" transactions.
    // And we will look for "Transfer" transactions where category = 'Financial Goals' (or similar).

    // Better approach for MVP:
    // Just show the "Expected" funding based on "Month to Date" income.
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: incomeTx } = await supabase
        .from("transactions")
        .select("amount")
        .eq("org_id", orgId)
        .eq("type", "income")
        .gte("date", startOfMonth.toISOString());

    const totalIncome = incomeTx?.reduce((sum, tx) => sum + tx.amount, 0) || 0;

    // Calculate expected funding for each bucket
    const fundingPlan = distribution.buckets.map((bucket: any) => ({
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
