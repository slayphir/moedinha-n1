import { createClient } from "@/lib/supabase/server";
import { startOfMonth, subMonths, endOfMonth, differenceInDays } from "date-fns";

export type InsightType = 'spending_spike' | 'goal_risk' | 'new_recurrence' | 'budget_overflow' | 'opportunity';
export type InsightSeverity = 'info' | 'warn' | 'critical';

interface Insight {
    type: InsightType;
    title: string;
    message: string;
    severity: InsightSeverity;
    metadata?: any;
}

export async function runInsightsEngine() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Fetch Data
    // Get active org
    const { data: orgs } = await supabase.from("orgs").select("id").eq("owner_id", user.id).single();
    const org_id = orgs?.id;
    if (!org_id) return;

    const today = new Date();
    const currentMonthStart = startOfMonth(today);
    const lastMonthStart = startOfMonth(subMonths(today, 1));
    const lastMonthEnd = endOfMonth(subMonths(today, 1));

    // Get aggregated spending by category for current and last month
    // Note: This is simplified. Ideally use RPC or efficient queries.
    const { data: currentMonthTx } = await supabase
        .from("transactions")
        .select("amount, category_id, categories(name)")
        .eq("org_id", org_id)
        .gte("date", currentMonthStart.toISOString())
        .lt("amount", 0); // Expenses only

    const { data: lastMonthTx } = await supabase
        .from("transactions")
        .select("amount, category_id")
        .eq("org_id", org_id)
        .gte("date", lastMonthStart.toISOString())
        .lte("date", lastMonthEnd.toISOString())
        .lt("amount", 0);

    // Get Goals
    const { data: goals } = await supabase
        .from("goals")
        .select("*")
        .eq("org_id", org_id)
        .eq("status", "active");

    const insights: Insight[] = [];

    // 2. Analyze Spending Spikes
    const currentSpending = aggregateByCategory(currentMonthTx || []);
    const lastMonthSpending = aggregateByCategory(lastMonthTx || []);

    const CATEGORY_SPIKE_THRESHOLD = 1.2; // 20% increase
    const CRITICAL_SPIKE_THRESHOLD = 1.4; // 40% increase

    for (const [catId, amount] of Object.entries(currentSpending)) {
        const lastAmount = lastMonthSpending[catId] || 0;
        const catName = (currentMonthTx?.find(t => t.category_id === catId)?.categories as any)?.name || "Categoria";

        if (lastAmount > 0) { // Only compare if there was spending last month
            const ratio = Math.abs(amount) / Math.abs(lastAmount);

            // Check if absolute increase is significant (e.g., > R$ 50)
            const absDiff = Math.abs(amount) - Math.abs(lastAmount);

            if (ratio > CATEGORY_SPIKE_THRESHOLD && absDiff > 50) {
                const pct = Math.round((ratio - 1) * 100);
                const severity: InsightSeverity = ratio > CRITICAL_SPIKE_THRESHOLD ? 'critical' : 'warn';

                insights.push({
                    type: 'spending_spike',
                    title: `${catName} subiu +${pct}%`,
                    message: `Gasto de ${formatCurrency(Math.abs(amount))} vs ${formatCurrency(Math.abs(lastAmount))} no mês passado.`,
                    severity,
                    metadata: { category_id: catId, increase_pct: pct, diff: absDiff }
                });
            }
        }
    }

    // 3. Analyze Goal Risks
    if (goals) {
        for (const goal of goals) {
            if (goal.target_amount && goal.target_date) {
                const targetDate = new Date(goal.target_date);
                const daysLeft = differenceInDays(targetDate, today);
                const amountLeft = goal.target_amount - goal.current_amount;

                if (daysLeft <= 0 && amountLeft > 0) {
                    insights.push({
                        type: 'goal_risk',
                        title: `Meta "${goal.name}" expirada`,
                        message: `O prazo acabou e ainda faltam ${formatCurrency(amountLeft)}.`,
                        severity: 'critical',
                        metadata: { goal_id: goal.id }
                    });
                } else if (daysLeft > 0 && amountLeft > 0) {
                    // Calculate required monthly saving vs current pace (if we had pace data)
                    // For now, simple check: time is short (e.g. < 1 month) and amount is large
                    if (daysLeft < 30 && amountLeft > 1000) { // Arbitrary heuristic
                        insights.push({
                            type: 'goal_risk',
                            title: `Reta final para "${goal.name}"`,
                            message: `Faltam ${formatCurrency(amountLeft)} e apenas ${daysLeft} dias.`,
                            severity: 'warn',
                            metadata: { goal_id: goal.id }
                        });
                    }
                }
            }
        }
    }

    // 4. Save Insights (Upsert/Insert)
    // Simplified: Delete old insights of these types and insert new ones to avoid duplicates/stale
    // In production, we'd be smarter about history.

    if (insights.length > 0) {
        // First, fetch existing active insights to avoid re-notifying if nothing changed?
        // For MVP, just insert.

        const { error } = await supabase.from("insights").insert(
            insights.map(i => ({
                org_id,
                type: i.type,
                title: i.title,
                message: i.message,
                severity: i.severity,
                metadata: i.metadata,
                status: 'active'
            }))
        );

        if (error) console.error("Error saving insights:", error);
    }
}

function aggregateByCategory(transactions: any[]): Record<string, number> {
    return transactions.reduce((acc, t) => {
        if (!t.category_id) return acc;
        acc[t.category_id] = (acc[t.category_id] || 0) + t.amount;
        return acc;
    }, {});
}

function formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
}
