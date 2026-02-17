"use server";

import { createClient } from "@/lib/supabase/server";
import { addMonths, subMonths, setDate, isBefore, isAfter, startOfDay, endOfDay } from "date-fns";

export interface InvoiceData {
    account: {
        id: string;
        name: string;
        credit_limit: number;
        closing_day: number;
        due_day: number;
    };
    period: {
        start: Date;
        end: Date;
        month: number;
        year: number;
    };
    invoice: {
        total: number;
        status: "open" | "closed" | "overdue" | "paid";
        dueDate: Date;
    };
    transactions: any[];
}

export async function getInvoiceData(accountId: string, year?: number, month?: number): Promise<{ data?: InvoiceData; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Não autorizado" };

    // 1. Fetch Account Details
    const { data: account, error: accountError } = await supabase
        .from("accounts")
        .select("id, name, credit_limit, closing_day, due_day")
        .eq("id", accountId)
        .single();

    if (accountError || !account) return { error: "Conta não encontrada" };
    if (!account.closing_day || !account.due_day) return { error: "Conta não configurada como cartão de crédito" };

    // 2. Determine Dates
    const now = new Date();
    const targetYear = year ?? now.getFullYear();
    const targetMonth = month ?? now.getMonth();

    // Closing Date: The day calculation closes for this month
    // Example: Closing Day 5. Target: Feb 2024.
    // Closing Date = Feb 5, 2024.
    let closingDate = new Date(targetYear, targetMonth, account.closing_day);

    // Period End: Day before closing date (inclusive)
    // Example: Feb 4, 2024.
    let periodEnd = new Date(closingDate);
    periodEnd.setDate(periodEnd.getDate() - 1);
    periodEnd = endOfDay(periodEnd);

    // Period Start: One month before Closing Date
    // Example: Jan 5, 2024.
    let periodStart = subMonths(closingDate, 1);
    periodStart = startOfDay(periodStart);

    // Due Date Calculation
    // If due day is smaller than closing day, it usually means next month
    // Example: Closing 25, Due 5.
    // Invoice closes Jan 25. Due Feb 5.
    let dueDate = new Date(targetYear, targetMonth, account.due_day);
    if (account.due_day < account.closing_day) {
        dueDate = addMonths(dueDate, 1);
    }

    // 3. Fetch Transactions
    const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select(`
            *,
            category:categories(id, name, color, icon)
        `)
        .eq("account_id", accountId)
        .gte("date", periodStart.toISOString())
        .lte("date", periodEnd.toISOString())
        .order("date", { ascending: false });

    if (txError) {
        console.error("Error fetching transactions:", txError);
        return { error: "Erro ao buscar transações" };
    }

    // 4. Calculate Total
    const total = transactions?.reduce((acc, curr) => {
        const amount = Number(curr.amount);
        if (curr.type === 'expense') return acc - amount;
        if (curr.type === 'income') return acc + amount;
        return acc;
    }, 0) || 0;

    // 5. Determine Status
    let status: "open" | "closed" | "overdue" | "paid" = "closed";

    if (isBefore(now, closingDate)) {
        status = "open";
    } else if (isAfter(now, dueDate) && total < 0) {
        // Only overdue if negative balance (debt)
        status = "overdue";
    } else {
        status = "closed";
    }

    return {
        data: {
            account,
            period: {
                start: periodStart,
                end: periodEnd,
                month: targetMonth,
                year: targetYear
            },
            invoice: {
                total,
                status,
                dueDate
            },
            transactions: transactions || []
        }
    };
}

export async function getAvailableInvoices(accountId: string) {
    const supabase = await createClient();

    // Fetch distinct months from transactions
    const { data, error } = await supabase
        .from("transactions")
        .select("date")
        .eq("account_id", accountId)
        .order("date", { ascending: false });

    if (error || !data) return [];

    const uniqueMonths = new Set<string>();
    const invoices = [];

    for (const tx of data) {
        const date = new Date(tx.date);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        if (!uniqueMonths.has(key)) {
            uniqueMonths.add(key);
            invoices.push({
                year: date.getFullYear(),
                month: date.getMonth(),
                label: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date)
            });
        }
    }

    // Ensure current month and next month are available if not present (for open invoices)
    const now = new Date();
    // Add current month
    const currentKey = `${now.getFullYear()}-${now.getMonth()}`;
    if (!uniqueMonths.has(currentKey)) {
        invoices.unshift({
            year: now.getFullYear(),
            month: now.getMonth(),
            label: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(now)
        });
        uniqueMonths.add(currentKey);
    }

    // Add next month (often future invoice)
    const nextMonth = addMonths(now, 1);
    const nextKey = `${nextMonth.getFullYear()}-${nextMonth.getMonth()}`;
    if (!uniqueMonths.has(nextKey)) {
        invoices.unshift({
            year: nextMonth.getFullYear(),
            month: nextMonth.getMonth(),
            label: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(nextMonth)
        });
    }

    // Sort by date desc
    return invoices.sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
    });
}
