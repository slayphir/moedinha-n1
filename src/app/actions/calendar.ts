"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";
import { addMonths, addWeeks, addYears, endOfMonth, format, getDay, isAfter, isBefore, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek, endOfWeek, addDays, getDaysInMonth } from "date-fns";
import { RecurringRule } from "@/lib/types/database";

export type CalendarEvent = {
    id: string; // transaction id or rule id + date
    date: string;
    description: string;
    amount: number;
    type: "income" | "expense" | "transfer";
    status: "paid" | "pending" | "projected";
    isRecurring?: boolean;
};

export type CalendarDayData = {
    date: string;
    income: number;
    expense: number;
    balance_change: number; // income - expense
    events: CalendarEvent[];
};

export async function getMonthFinancialEvents(year: number, month: number) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "NÃ£o autorizado" };

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return { error: "OrganizaÃ§Ã£o nÃ£o encontrada" };

    // Create date range for the view
    // Month is 0-indexed in JS Date? User likely passes 1-indexed or 0-indexed?
    // Let's assume standard JS Month (0 = Jan).
    const startDate = new Date(year, month, 1);
    const endDate = endOfMonth(startDate);

    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');

    // 1. Fetch Actual Transactions
    const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select("id, date, amount, type, description, status")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .gte("date", startStr)
        .lte("date", endStr)
        .order("date", { ascending: true });

    if (txError) return { error: txError.message };

    // 2. Fetch Recurring Rules & Last Runs (to project missing items)
    const { data: rules } = await supabase
        .from("recurring_rules")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_active", true);

    const { data: lastRuns } = await supabase
        .from("recurring_runs")
        .select("rule_id, run_at")
        .eq("success", true);

    const lastRunMap: Record<string, Date> = {};
    (lastRuns || []).forEach((run: any) => {
        const d = parseISO(run.run_at);
        if (!lastRunMap[run.rule_id] || d > lastRunMap[run.rule_id]) {
            lastRunMap[run.rule_id] = d;
        }
    });

    // 3. Build Daily Map
    const daysMap: Record<string, CalendarDayData> = {};

    const numDays = getDaysInMonth(startDate);
    for (let i = 1; i <= numDays; i++) {
        const d = new Date(year, month, i);
        const dStr = format(d, 'yyyy-MM-dd');
        daysMap[dStr] = {
            date: dStr,
            income: 0,
            expense: 0,
            balance_change: 0,
            events: []
        };
    }

    // A. Process Transactions
    (transactions || []).forEach(t => {
        const dStr = t.date;
        if (daysMap[dStr]) {
            const amt = Number(t.amount);
            const isExpense = t.type === 'expense';

            if (isExpense) {
                daysMap[dStr].expense += amt;
                daysMap[dStr].balance_change -= amt;
            } else if (t.type === 'income') {
                daysMap[dStr].income += amt;
                daysMap[dStr].balance_change += amt;
            }

            daysMap[dStr].events.push({
                id: t.id,
                date: dStr,
                description: t.description || (isExpense ? 'Despesa' : 'Receita'),
                amount: amt,
                type: t.type,
                status: t.status === 'pending' ? 'pending' : 'paid',
                isRecurring: false
            });
        }
    });

    // B. Process Recurring Projections
    // Only project if date > today? Or project everything that is NOT in transactions?
    // Logic: Iterate rules. Find occurrences in this month.
    // Check if a transaction likely exists (simple duplicate check not possible without loose matching).
    // Strategy: If "Today" < occurrence date, treat as projected.
    // OR: If user hasn't generated it yet.

    // Since we have `getFinancialProjection` logic, let's reuse/simplify.
    // We need to find occurrences strictly within [startDate, endDate].

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    (rules || []).forEach((rule: RecurringRule) => {
        // Find next occurrence relative to last run
        let target = lastRunMap[rule.id]
            ? addFrequency(lastRunMap[rule.id], rule.frequency)
            : parseISO(rule.start_date);

        // Wind forward until we reach or pass startDate
        while (isBefore(target, startDate)) {
            target = addFrequency(target, rule.frequency);
        }

        // Now iterate while within endDate
        while (!isAfter(target, endDate)) {
            const dStr = format(target, 'yyyy-MM-dd');

            // Check if we should add this as a projection
            // 1. Is it in the future?
            // 2. Or is it today/past but not processed?

            // Heuristic: If we already have a transaction from this rule on this day (via Metadata?), suppress.
            // But we didn't fetch metadata in step 1.
            // Let's assume: If date >= Today, show as projected.
            // If date < Today, assume it was missed or paid (don't show "ghost" on past calendar days to avoid clutter, unless we highlight as MISSED).
            // For V1: Show only if date >= Today.

            if (!isBefore(target, today)) {
                if (daysMap[dStr]) {
                    const amt = Number(rule.amount);

                    // Duplicate check: Look for event with same amount and similar description?
                    // Skipping for now.

                    daysMap[dStr].expense += amt;
                    daysMap[dStr].balance_change -= amt;

                    daysMap[dStr].events.push({
                        id: `proj-${rule.id}-${dStr}`,
                        date: dStr,
                        description: `${rule.description} (Previsto)`,
                        amount: amt,
                        type: "expense", // Rules are currently expense-only
                        status: "projected",
                        isRecurring: true
                    });
                }
            }

            target = addFrequency(target, rule.frequency);
        }
    });

    return { data: Object.values(daysMap) };
}

function addFrequency(date: Date, freq: string): Date {
    if (freq === 'weekly') return addWeeks(date, 1);
    if (freq === 'yearly') return addYears(date, 1);
    return addMonths(date, 1);
}


