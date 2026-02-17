"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";
import { format, parseISO } from "date-fns";

export type IRAccountBalance = {
    id: string;
    name: string;
    balance_previous_year: number; // 31/12/YYYY-1
    balance_current_year: number;  // 31/12/YYYY
};

export type IRCategoryTotal = {
    id: string;
    name: string;
    total: number;
};

export type IRData = {
    year: number;
    accounts: IRAccountBalance[];
    total_income: number;
    total_expense: number;
    expenses_by_category: IRCategoryTotal[];
    incomes_by_category: IRCategoryTotal[];
};

export async function getIncomeTaxData(year: number): Promise<{ data?: IRData; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "NÃ£o autorizado" };

    const orgId = await getActiveOrgIdForUser(supabase, user.id);
    if (!orgId) return { error: "OrganizaÃ§Ã£o nÃ£o encontrada" };

    // Date Boundaries
    const startOfYear = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;
    const endOfPreviousYear = `${year - 1}-12-31`;

    // 1. Fetch Accounts
    const { data: accountsData, error: accError } = await supabase
        .from("accounts")
        .select("id, name, initial_balance")
        .eq("org_id", orgId)
        .eq("is_active", true); // Should we include inactive? Maybe yes for IR? limiting to active for now.

    if (accError) return { error: accError.message };

    // 2. Fetch All Transactions UP TO endOfYear
    // We need full history to calculate correct balances from initial_balance
    const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select("id, date, amount, type, account_id, transfer_account_id, category_id, categories(name)")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .lte("date", endOfYear)
        .order("date", { ascending: true }); // Ordered for replay

    if (txError) return { error: txError.message };

    // 3. Calculate Balances
    // Map account_id -> current_simulated_balance
    const balances: Record<string, number> = {};
    (accountsData || []).forEach(acc => {
        balances[acc.id] = Number(acc.initial_balance);
    });

    // Snapshots
    const snapshotPrevious: Record<string, number> = {}; // at endOfPreviousYear
    const snapshotCurrent: Record<string, number> = {};  // at endOfYear

    // Helper to record snapshots
    const recordSnapshot = (dateStr: string) => {
        // If we just passed the boundary, record? 
        // Easier: Iterate transactions. Before processing a tx, check if we passed a boundary?
        // Or just run replay, and check dates.
        // The query is filtered lte endOfYear, so at end of loop we have endOfYear balance.
    };

    // We need to capture state exactly at endOfPreviousYear.
    // We can just iterate and when date > endOfPreviousYear, we freeze the snapshot for those that haven't been captured?
    // Actually, simpler:
    // Iterate all tx.
    // If tx.date <= endOfPreviousYear: Apply to "Previous" and "Current" calculators.
    // If tx.date > endOfPreviousYear (and <= endOfYear): Apply only to "Current".

    // Note: balances map tracks the running total.
    // We need two running totals? Or just capture the state.

    // Let's initialize snapshotPrevious with initial balances too.
    (accountsData || []).forEach(acc => {
        snapshotPrevious[acc.id] = Number(acc.initial_balance);
        snapshotCurrent[acc.id] = Number(acc.initial_balance);
    });

    // Replay
    (transactions || []).forEach(tx => {
        const amt = Number(tx.amount);
        const date = tx.date;
        const isPrev = date <= endOfPreviousYear;

        // Apply Function
        const apply = (map: Record<string, number>, id: string, amount: number) => {
            if (map[id] !== undefined) map[id] += amount;
        };

        if (tx.type === 'expense') {
            apply(snapshotCurrent, tx.account_id, -amt);
            if (isPrev) apply(snapshotPrevious, tx.account_id, -amt);
        }
        else if (tx.type === 'income') {
            apply(snapshotCurrent, tx.account_id, amt);
            if (isPrev) apply(snapshotPrevious, tx.account_id, amt);
        }
        else if (tx.type === 'transfer') {
            // Out from account_id
            apply(snapshotCurrent, tx.account_id, -amt);
            if (isPrev) apply(snapshotPrevious, tx.account_id, -amt);

            // In to transfer_account_id
            if (tx.transfer_account_id) {
                apply(snapshotCurrent, tx.transfer_account_id, amt);
                if (isPrev) apply(snapshotPrevious, tx.transfer_account_id, amt);
            }
        }
    });

    const accountsResult: IRAccountBalance[] = (accountsData || []).map(acc => ({
        id: acc.id,
        name: acc.name,
        balance_previous_year: snapshotPrevious[acc.id] || 0,
        balance_current_year: snapshotCurrent[acc.id] || 0
    }));

    // 4. Calculate Totals for the Selected Year (Income/Expense/Category)
    // These are only transactions strictly INSIDE the year [startOfYear, endOfYear].

    let totalIncome = 0;
    let totalExpense = 0;
    const expenseCatMap: Record<string, IRCategoryTotal> = {};
    const incomeCatMap: Record<string, IRCategoryTotal> = {};

    (transactions || []).forEach(tx => {
        if (tx.date >= startOfYear && tx.date <= endOfYear) {
            const amt = Number(tx.amount);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const categoryData = tx.categories as any;
            const catName = Array.isArray(categoryData) ? categoryData[0]?.name : categoryData?.name;
            const catId = tx.category_id || 'uncategorized';
            const safeCatName = catName || 'Sem Categoria';

            if (tx.type === 'expense') {
                totalExpense += amt;
                if (!expenseCatMap[catId]) expenseCatMap[catId] = { id: catId, name: safeCatName, total: 0 };
                expenseCatMap[catId].total += amt;
            }
            else if (tx.type === 'income') {
                totalIncome += amt;
                if (!incomeCatMap[catId]) incomeCatMap[catId] = { id: catId, name: safeCatName, total: 0 };
                incomeCatMap[catId].total += amt;
            }
        }
    });

    return {
        data: {
            year,
            accounts: accountsResult,
            total_income: totalIncome,
            total_expense: totalExpense,
            expenses_by_category: Object.values(expenseCatMap).sort((a, b) => b.total - a.total),
            incomes_by_category: Object.values(incomeCatMap).sort((a, b) => b.total - a.total)
        }
    };
}


