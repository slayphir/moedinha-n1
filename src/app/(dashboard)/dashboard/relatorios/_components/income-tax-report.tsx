"use client";

import { IRData } from "@/app/actions/ir-helper";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface IncomeTaxReportProps {
    data: IRData;
}

export function IncomeTaxReport({ data }: IncomeTaxReportProps) {
    return (
        <div className="space-y-8 print:space-y-6 text-sm md:text-base">
            <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold uppercase tracking-wide text-foreground">Relatório Auxiliar para Imposto de Renda</h2>
                <p className="text-muted-foreground">Ano Base: <span className="font-mono font-bold text-foreground">{data.year}</span></p>
            </div>

            {/* 1. Bens e Direitos */}
            <Card className="print:shadow-none print:border-none">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-semibold">1. Bens e Direitos (Saldos de Contas)</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Conta / Local</TableHead>
                                <TableHead className="text-right">Saldo em 31/12/{data.year - 1}</TableHead>
                                <TableHead className="text-right">Saldo em 31/12/{data.year}</TableHead>
                                <TableHead className="text-right">Variação</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.accounts.map((acc) => {
                                const diff = acc.balance_current_year - acc.balance_previous_year;
                                return (
                                    <TableRow key={acc.id}>
                                        <TableCell className="font-medium">{acc.name}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(acc.balance_previous_year)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(acc.balance_current_year)}</TableCell>
                                        <TableCell className={`text-right font-mono ${diff >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                            {diff > 0 ? "+" : ""}{formatCurrency(diff)}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {/* Total Row */}
                            <TableRow className="bg-muted/50 font-bold">
                                <TableCell>TOTAL</TableCell>
                                <TableCell className="text-right">
                                    {formatCurrency(data.accounts.reduce((sum, acc) => sum + acc.balance_previous_year, 0))}
                                </TableCell>
                                <TableCell className="text-right">
                                    {formatCurrency(data.accounts.reduce((sum, acc) => sum + acc.balance_current_year, 0))}
                                </TableCell>
                                <TableCell className="text-right">
                                    {formatCurrency(data.accounts.reduce((sum, acc) => sum + (acc.balance_current_year - acc.balance_previous_year), 0))}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* 2. Resumo Anual */}
            <div className="grid gap-6 md:grid-cols-2">
                <Card className="print:break-inside-avoid print:shadow-none print:border-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-semibold text-emerald-600">2. Rendimentos (Receitas)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold mb-4">{formatCurrency(data.total_income)}</div>
                        <Table>
                            <TableBody>
                                {data.incomes_by_category.slice(0, 10).map((cat) => (
                                    <TableRow key={cat.id}>
                                        <TableCell>{cat.name}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(cat.total)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card className="print:break-inside-avoid print:shadow-none print:border-none">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-semibold text-red-600">3. Pagamentos (Despesas)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold mb-4">{formatCurrency(data.total_expense)}</div>
                        <Table>
                            <TableBody>
                                {data.expenses_by_category.slice(0, 15).map((cat) => (
                                    <TableRow key={cat.id}>
                                        <TableCell>{cat.name}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(cat.total)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <p className="text-xs text-muted-foreground mt-2 text-center">Exibindo top 15 categorias de despesa.</p>
                    </CardContent>
                </Card>
            </div>

            <div className="print:hidden text-center text-muted-foreground text-xs">
                <p>Este relatório é apenas um auxiliar para conferência de saldo e soma de categorias.</p>
                <p>Verifique sempre os informes oficiais dos bancos e instituições financeiras.</p>
            </div>
        </div>
    );
}
