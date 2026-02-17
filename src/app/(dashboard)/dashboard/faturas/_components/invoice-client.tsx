"use client";

import { useState } from "react";
import { format, addMonths, subMonths, setDate, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CreditCard, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Account, Transaction } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";

type Props = {
    account: Account;
    transactions: Transaction[]; // Should be fetched for a wide range or just the relevant ones
};

export function InvoiceClient({ account, transactions }: Props) {
    const [viewDate, setViewDate] = useState(new Date()); // Represents the month/year of the invoice

    if (!account.is_credit_card || !account.closing_day || !account.due_day) {
        return (
            <div className="p-8 text-center">
                <AlertCircle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
                <h2 className="text-xl font-bold">Configuração incompleta</h2>
                <p>Este cartão não tem dia de fechamento ou vencimento configurados.</p>
                <Button className="mt-4" variant="outline">Configurar agora</Button>
            </div>
        );
    }

    // Calculate invoice period
    // Logic: An invoice for "April" generally means it is DUE in April.
    // Buying period: From Closing Day of March to Closing Day of April.
    // Example: Closing Day 5, Due Day 12.
    // April Invoice (Due April 12): Buys from March 5 to April 5 (excl).
    // Let's align `viewDate` with the DUE DATE month.

    const dueMonth = viewDate;
    const dueDate = setDate(dueMonth, account.due_day);

    // Validating if Due Day is before Closing Day (e.g. Due 5, Closing 25 of PREVIOUS month)
    // Common: Closing 25, Due 5 of NEXT month.
    // Common: Closing 5, Due 12 of SAME month.

    // Let's assume standard: Invoice closes on X, Due on Y.
    // If Y < X, Y is next month. 
    // If Y > X, Y is same month (usually).
    // Actually, let's just use the `viewDate` as the reference for "Invoice of [Month]".

    // Period Start: Closing Day of previous month (relative to the invoice cycle)
    // Period End: Closing Day of current invoice cycle.

    // Simplified:
    // If we are looking at "April Invoice":
    // Closing Day is April 5 (example).
    // Range: March 5 to April 4.
    // Due Date: April 12.

    const closingDateCurrent = setDate(viewDate, account.closing_day);
    const closingDatePrevious = subMonths(closingDateCurrent, 1);

    // Adjust if closing day > 28 to avoid issues? date-fns handles setDate well (clamps).

    const periodStart = closingDatePrevious;
    const periodEnd = subMonths(closingDateCurrent, 0); // Logic check?
    // Wait.
    // Closing Date: 5.
    // Invoice April: Closes April 5.
    // Range: Mar 5 - Apr 4. Correct.

    // Filter Transactions
    // Transaction Date must be >= periodStart and < periodEnd.
    // Actually, usually it includes the start date and excludes the end date (closing date itself is usually "open" for next invoice or "closed"? Varies. Let's say < closingDateCurrent).

    const invoiceTransactions = transactions.filter(t => {
        const tDate = new Date(t.date);
        // We need to be careful with timezones. assuming string YYYY-MM-DD.
        // Let's just compare strings or set hours.
        // date-fns/isAfter etc.
        return tDate >= periodStart && tDate < periodEnd;
    });

    const totalInvoice = invoiceTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const isClosed = isAfter(new Date(), periodEnd);
    // isPaid logic can be added later

    return (
        <div className="space-y-6">
            {/* Header / Navigation */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-center">
                        <h2 className="text-lg font-semibold capitalize">
                            {format(dueDate, "MMMM yyyy", { locale: ptBR })}
                        </h2>
                        <span className="text-xs text-muted-foreground">
                            Vence dia {format(dueDate, "dd/MM")}
                        </span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                <div className="text-right">
                    <p className="text-sm text-muted-foreground">Valor da Fatura</p>
                    <p className="text-2xl font-bold text-destructive">{formatCurrency(Math.abs(totalInvoice))}</p>
                </div>
            </div>

            {/* Invoice Status Card */}
            <Card className={`border-l-4 ${isClosed ? "border-l-indigo-500" : "border-l-green-500"}`}>
                <CardContent className="pt-6 flex items-center justify-between">
                    <div>
                        <Badge variant={isClosed ? "secondary" : "default"}>
                            {isClosed ? "Fechada" : "Aberta"}
                        </Badge>
                        <p className="text-sm mt-2 text-muted-foreground">
                            Compras de {format(periodStart, "dd/MM")} até {format(periodEnd, "dd/MM")}
                        </p>
                    </div>
                    {/* Placeholder for payment button or status */}
                    <div className="text-right">
                        <p className="text-sm font-medium">Limite disponível</p>
                        <p className="text-lg">{formatCurrency((account.credit_limit || 0) - Math.abs(totalInvoice))}</p>
                    </div>
                </CardContent>
            </Card>

            {/* Transactions List */}
            <div className="space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Lançamentos</h3>
                {invoiceTransactions.length === 0 ? (
                    <div className="p-8 border rounded-lg hover:bg-muted/50 border-dashed text-center text-muted-foreground">
                        Nenhuma compra neste período.
                    </div>
                ) : (
                    invoiceTransactions.map(t => (
                        <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="font-medium">{t.description}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {format(new Date(t.date), "dd/MM, HH:mm")} • {t.category?.name || "Sem categoria"}
                                    </p>
                                </div>
                            </div>
                            <span className="font-semibold text-destructive">
                                {formatCurrency(Math.abs(Number(t.amount)))}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
