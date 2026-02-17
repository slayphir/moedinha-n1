"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { InvoiceData } from "@/app/actions/invoices";
import { addMonths, subMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface InvoiceViewProps {
    data: InvoiceData;
    availableInvoices: { month: number; year: number; label: string }[];
    onMonthChange: (year: number, month: number) => void;
}

export function InvoiceView({ data, onMonthChange }: InvoiceViewProps) {
    const { account, invoice, transactions, period } = data;
    const [viewingMonth, setViewingMonth] = useState(new Date(period.year, period.month, 1));

    const handlePrevMonth = () => {
        const newDate = subMonths(viewingMonth, 1);
        setViewingMonth(newDate);
        onMonthChange(newDate.getFullYear(), newDate.getMonth());
    };

    const handleNextMonth = () => {
        const newDate = addMonths(viewingMonth, 1);
        setViewingMonth(newDate);
        onMonthChange(newDate.getFullYear(), newDate.getMonth());
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "open": return "text-blue-600 bg-blue-50 border-blue-200";
            case "closed": return "text-gray-600 bg-gray-50 border-gray-200";
            case "overdue": return "text-red-600 bg-red-50 border-red-200";
            case "paid": return "text-green-600 bg-green-50 border-green-200";
            default: return "text-gray-600";
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case "open": return "Aberta";
            case "closed": return "Fechada";
            case "overdue": return "Vencida";
            case "paid": return "Paga";
            default: return status;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header / Navigation */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h2 className="text-xl font-semibold capitalize min-w-[150px] text-center">
                        {format(viewingMonth, "MMMM yyyy", { locale: ptBR })}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={handleNextMonth}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                <div className={`px-3 py-1 rounded-full border text-sm font-medium ${getStatusColor(invoice.status)}`}>
                    {getStatusLabel(invoice.status)}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Valor da Fatura</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{formatCurrency(Math.abs(invoice.total))}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Vencimento: {format(new Date(invoice.dueDate), "dd/MM/yyyy")}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Limite Disponível</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {/* Simple calculation, assumes total invoice is debt. Real implementation might need current balance from account */}
                        <p className="text-2xl font-bold text-emerald-600">
                            {formatCurrency(account.credit_limit - Math.abs(invoice.total))}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Limite Total: {formatCurrency(account.credit_limit)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Melhor Dia de Compra</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {/* Approximate: Closing Day + 1 */}
                        <p className="text-2xl font-bold">
                            Dia {account.closing_day + 1}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Fechamento: Dia {account.closing_day}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Transactions List */}
            <Card>
                <CardHeader>
                    <CardTitle>Lançamentos</CardTitle>
                </CardHeader>
                <CardContent>
                    {transactions.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Nenhum lançamento nesta fatura.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {transactions.map((tx: any) => (
                                <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0 hover:bg-slate-50 px-2 rounded -mx-2">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center text-xl">
                                            {tx.category?.icon || "📄"}
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">{tx.description}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {format(new Date(tx.date), "dd/MM")} • {tx.category?.name || "Sem categoria"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-semibold text-sm ${tx.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>
                                            {formatCurrency(Math.abs(tx.amount))}
                                        </p>
                                        {tx.installments && (
                                            <p className="text-xs text-muted-foreground">
                                                {tx.installment_number}/{tx.installments}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
