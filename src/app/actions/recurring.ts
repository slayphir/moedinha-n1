"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";
import { revalidatePath } from "next/cache";
import { RecurringRule } from "@/lib/types/database";
import { addMonths, addWeeks, addYears, isAfter, parseISO, startOfDay } from "date-fns";

export async function getRecurringRules(orgId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("recurring_rules")
        .select("*, account:accounts(name), category:categories(name)")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

    if (error) return { error: error.message };
    return { data: data as (RecurringRule & { account: { name: string }; category: { name: string } | null })[] };
}

export async function deleteRecurringRule(id: string) {
    const supabase = await createClient();
    const { error } = await supabase.from("recurring_rules").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/dashboard/assinaturas");
    return {};
}

export async function toggleRecurringRule(id: string, isActive: boolean) {
    const supabase = await createClient();
    const { error } = await supabase.from("recurring_rules").update({ is_active: isActive }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/dashboard/assinaturas");
    return {};
}

export type CreateRecurringRuleInput = {
    description: string;
    amount: number;
    account_id: string;
    category_id?: string;
    frequency: "weekly" | "monthly" | "yearly";
    start_date: string;
    end_date?: string;
};

export async function createRecurringRule(input: CreateRecurringRuleInput) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "NÃ£o autorizado" };

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return { error: "Sem organizaÃ§Ã£o" };

    // Calculate day_of_month/week from start_date
    const date = parseISO(input.start_date);
    const day_of_month = input.frequency === 'monthly' ? date.getDate() : null;
    const day_of_week = input.frequency === 'weekly' ? date.getDay() : null;

    const { error } = await supabase.from("recurring_rules").insert({
        org_id: orgId,
        description: input.description,
        amount: input.amount,
        account_id: input.account_id,
        category_id: input.category_id || null,
        frequency: input.frequency,
        start_date: input.start_date,
        end_date: input.end_date || null,
        day_of_month,
        day_of_week,
        is_active: true
    });

    if (error) return { error: error.message };
    revalidatePath("/dashboard/assinaturas");
    return {};
}

export async function updateRecurringRule(id: string, input: Partial<CreateRecurringRuleInput>) {
    const supabase = await createClient();

    // Logic to recalculate day_of... if start_date changes
    const updates: Record<string, string | number | null | undefined> = { ...input };
    if (input.start_date && input.frequency) {
        const date = parseISO(input.start_date);
        updates.day_of_month = input.frequency === 'monthly' ? date.getDate() : null;
        updates.day_of_week = input.frequency === 'weekly' ? date.getDay() : null;
    }

    const { error } = await supabase.from("recurring_rules").update(updates).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/dashboard/assinaturas");
    return {};
}

export async function processRecurringRules(orgId: string) {
    const supabase = await createClient();

    // 1. Get active rules
    const { data: rules } = await supabase
        .from("recurring_rules")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_active", true);

    if (!rules || rules.length === 0) return { processed: 0 };

    const today = startOfDay(new Date());
    let processedCount = 0;

    for (const rule of rules) {
        // 2. Find last run in recurring_runs
        const { data: lastRun } = await supabase
            .from("recurring_runs")
            .select("run_at")
            .eq("rule_id", rule.id)
            .eq("success", true)
            .order("run_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        let nextDueDate: Date;

        if (lastRun) {
            const lastDate = parseISO(lastRun.run_at);
            // Calculate next due date based on LAST RUN
            if (rule.frequency === 'monthly') nextDueDate = addMonths(lastDate, 1);
            else if (rule.frequency === 'weekly') nextDueDate = addWeeks(lastDate, 1);
            else if (rule.frequency === 'yearly') nextDueDate = addYears(lastDate, 1);
            else nextDueDate = addMonths(lastDate, 1);
        } else {
            // First run ever
            // We generate if start_date <= today.
            nextDueDate = parseISO(rule.start_date);

            // If start_date is in the future, nextDueDate will be in the future, and we won't process it yet.
            // If start_date is way in the past, we start from there.
        }

        // If nextDueDate is today or in the past, generate
        if (!isAfter(nextDueDate, today)) {
            // Check if we should really generate it. 
            // Double-check: ensure we don't have a run for this rule at this specific date (approx)
            // But relying on run_at from the previous record + interval should be safe enough if we consistently insert run_at = nextDueDate

            // Generate Transaction
            const { data: tx, error: insertError } = await supabase.from("transactions").insert({
                org_id: orgId,
                type: "expense",
                status: "pending",
                amount: rule.amount,
                account_id: rule.account_id,
                category_id: rule.category_id,
                description: `${rule.description} (AutomÃ¡tico)`,
                date: nextDueDate.toISOString().slice(0, 10),
                created_by: null,
                metadata: { recurring_rule_id: rule.id, source: "recurring_worker" }
            }).select("id").single();

            if (!insertError && tx) {
                // Log the run
                await supabase.from("recurring_runs").insert({
                    rule_id: rule.id,
                    transaction_id: tx.id,
                    run_at: nextDueDate.toISOString(), // Use the DUE DATE as the run_at marker
                    success: true
                });
                processedCount++;
            }
        }
    }

    if (processedCount > 0) {
        revalidatePath("/dashboard");
        revalidatePath("/dashboard/lancamentos");
    }

    return { processed: processedCount };
}

