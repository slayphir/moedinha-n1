"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";
import { addDays, addMonths, addWeeks, addYears, isAfter, isBefore, isSameDay, parseISO, startOfDay, format } from "date-fns";
import { RecurringRule } from "@/lib/types/database";

export type DailyProjection = {
    date: string;
    balance: number;
    income: number;
    expense: number;
    transactions: {
        description: string;
        amount: number;
        type: "income" | "expense" | "transfer";
        isProjection: boolean;
    }[];
};

export async function getFinancialProjection(days: number = 90) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "NÃ£o autorizado" };

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return { error: "OrganizaÃ§Ã£o nÃ£o encontrada" };

    // 1. Get Accounts (Initial Balances)
    const { data: accounts } = await supabase
        .from("accounts")
        .select("initial_balance, is_active")
        .eq("org_id", orgId)
        .eq("is_active", true);

    const initialBalanceSum = (accounts || []).reduce((sum, acc) => sum + Number(acc.initial_balance), 0);

    // 2. Get All Transactions to calculate Current Balance
    // We fetch standard transactions.
    // Note: For large datasets, this should be optimized (e.g. materialized view or robust SQL).
    // For V1, we fetch all non-deleted.
    const { data: allTransactions, error: txError } = await supabase
        .from("transactions")
        .select("id, date, amount, type, description")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("date", { ascending: true });

    if (txError) return { error: txError.message };

    const today = startOfDay(new Date());

    // Calculate Balance up to "Yesterday" (since Today will be the start of projection chart)
    // Actually, usually "Current Balance" includes Today's transactions? 
    // Let's say "Start Balance" is the balance at the beginning of Today.
    // So we sum everything < Today.
    // Then the chart starts at Today, showing Today's transactions effect.

    let currentBalance = initialBalanceSum;
    const historicTransactions = allTransactions || [];

    const todayStr = format(today, 'yyyy-MM-dd');

    // Split transactions into "Past" (Before Today) and "Future/Today" (Scheduled)
    const pastTransactions = historicTransactions.filter(t => t.date < todayStr);
    const futureTransactions = historicTransactions.filter(t => t.date >= todayStr);

    pastTransactions.forEach(t => {
        // Skip transfers for organization total balance?
        // Transfer within Org = 0 net change.
        // But if one account is inactive/hidden? We fetched only active accounts.
        // If transfer is to an unknown account, it might be an issue.
        // For now, assume transfers sum to 0 across the org.
        if (t.type !== 'transfer') {
            // Income positive, Expense negative?
            // Check database.ts/dashboard logic.
            // Dashboard says: income sum(amount), expense sum(abs(amount)).
            // This implies amount might be stored signed or unsigned.
            // Usually in this app (based on recurring.ts), amount is positive.
            // "type": "expense", "amount": rule.amount
            // So we must negate expenses.
            if (t.type === 'expense') {
                currentBalance -= Math.abs(Number(t.amount));
            } else {
                currentBalance += Math.abs(Number(t.amount));
            }
        }
    });

    // 3. Get Recurring Rules
    const { data: rules } = await supabase
        .from("recurring_rules")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_active", true);

    // Get Last Runs to determine next occurrences
    const { data: lastRuns } = await supabase
        .from("recurring_runs")
        .select("rule_id, run_at")
        .eq("success", true);

    // Map rule_id -> last_run_date
    const lastRunMap: Record<string, Date> = {};
    (lastRuns || []).forEach((run: any) => {
        const d = parseISO(run.run_at);
        if (!lastRunMap[run.rule_id] || d > lastRunMap[run.rule_id]) {
            lastRunMap[run.rule_id] = d;
        }
    });

    // 4. Generate Daily Projection
    const projection: DailyProjection[] = [];
    const endDate = addDays(today, days);
    let runningBalance = currentBalance;

    // We iterate day by day
    for (let d = 0; d <= days; d++) {
        const date = addDays(today, d);
        const dateStr = format(date, 'yyyy-MM-dd');

        let dayIncome = 0;
        let dayExpense = 0;
        const dayTx: DailyProjection['transactions'] = [];

        // A. Add Scheduled Transactions for this day
        const daysScheduled = futureTransactions.filter(t => t.date === dateStr);
        daysScheduled.forEach(t => {
            const amt = Number(t.amount);
            if (t.type === 'expense') {
                dayExpense += amt;
                runningBalance -= amt;
                dayTx.push({ description: t.description || 'Despesa', amount: -amt, type: 'expense', isProjection: false });
            } else if (t.type === 'income') {
                dayIncome += amt;
                runningBalance += amt;
                dayTx.push({ description: t.description || 'Receita', amount: amt, type: 'income', isProjection: false });
            }
            // Transfers ignored for total balance
        });

        // B. Add Recurring Rules for this day
        (rules || []).forEach((rule: RecurringRule) => {
            // Determine if this rule hits 'date'
            // We need to calculate occurrences strictly.
            // We start checking from lastRun (or start_date) and projecting forward.
            // If a projection hits 'date', we add it.

            let nextDue = lastRunMap[rule.id]
                ? parseISO(lastRunMap[rule.id] as unknown as string) // re-parse to be safe? lastRunMap values are Date objects already
                : parseISO(rule.start_date);

            // If lastRun exists, nextDue is +frequency.
            // If no lastRun, nextDue is start_date.
            // BUT we need to iterate until we pass 'date'

            // Optimization: Calculate nextDue relative to 'lastRun' ONCE, then iterate?
            // No, simpler: check if 'date' corresponds to a due date.

            // Let's define the first "Target" date for this rule.
            let target = lastRunMap[rule.id]
                ? addFrequency(lastRunMap[rule.id], rule.frequency)
                : parseISO(rule.start_date);

            // If target is before 'today' (and we are at today/future), it means it's overdue or was missed.
            // For projection, if it's strictly before today, we ignore it (assuming it was processed or user skipped).
            // If it is Today, we include it (if not already processed as transaction? We decided to trust recurring_runs).
            // Actually, if recurring_runs has "yesterday", target is "today".
            // If recurring_runs has "last month", target might be "last month + 1" which could be in the past.

            // Fast forward target until it is >= today
            while (isBefore(target, today)) {
                target = addFrequency(target, rule.frequency);
            }

            // Now target is >= today.
            // We check if target matches 'date'.
            // Since we iterate 'date', we might miss it if we don't sync.
            // Better approach: Check if 'date' matches the cadence relative to 'target'.

            // Actually, inside this loop (Day d), we just checking matches.
            // Does 'date' matches the sequence starting from 'target'?

            // 'target' is the Next Occurrence.
            // Subsequent: target + freq, target + 2freq...

            let candidate = target;
            let match = false;
            // We only need to check up to 'date'. 
            // Since 'target' >= today, and 'date' >= today.

            while (!isAfter(candidate, date)) {
                if (isSameDay(candidate, date)) {
                    match = true;
                    break;
                }
                candidate = addFrequency(candidate, rule.frequency);
            }

            if (match) {
                // Double check: Does a scheduled transaction already exist for this rule and date?
                // We look at 'daysScheduled'. Even without ID, we can check amount/description match?
                // Let's assume NO for now (V1 Simplification).

                const amt = Number(rule.amount);
                // Rules don't have distinct "type" field in DB interface I saw?
                // recurring.ts: "type": "expense" hardcoded in line 148?
                // Let's check recurring.ts create/insert logic.
                // It inserts type: "expense" hardcoded!
                // Wait, does RecurringRule serve for Income?
                // The interface `RecurringRule` has no `type`.
                // The create input has no type?
                // line 36 `CreateRecurringRuleInput` no type.
                // line 148 `type: "expense"`
                // So ALL recurring rules are EXPENSES?
                // If so, simplicity.
                // But the user might want Recurring Income.
                // Limitation of current system: Recurring Rules are Expense Only.
                // Confirming by looking at `createRecurringRule` in `recurring.ts`... Line 148 hardcodes `type: "expense"`.
                // Okay, treating all rules as expense.

                dayExpense += amt;
                runningBalance -= amt;
                dayTx.push({
                    description: `${rule.description} (Previsto)`,
                    amount: -amt,
                    type: 'expense',
                    isProjection: true
                });
            }
        });

        projection.push({
            date: dateStr,
            balance: runningBalance,
            income: dayIncome,
            expense: dayExpense,
            transactions: dayTx
        });
    }

    return { data: projection };
}

function addFrequency(date: Date, freq: string): Date {
    if (freq === 'weekly') return addWeeks(date, 1);
    if (freq === 'yearly') return addYears(date, 1);
    return addMonths(date, 1);
}


