"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    ReferenceLine
} from "recharts";
import { TrendingUp, AlertTriangle } from "lucide-react";
import { DailyProjection } from "@/app/actions/projections";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CashFlowChartProps {
    data: DailyProjection[];
}

export function CashFlowChart({ data }: CashFlowChartProps) {
    if (!data || data.length === 0) {
        return (
            <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                    Sem dados para projeção.
                </CardContent>
            </Card>
        );
    }

    const minBalance = Math.min(...data.map(d => d.balance));
    const maxBalance = Math.max(...data.map(d => d.balance));

    // Custom Tooltip
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const dayData = payload[0].payload as DailyProjection;
            return (
                <div className="rounded-lg border bg-background p-3 shadow-lg text-xs md:text-sm">
                    <p className="font-bold mb-2">{format(parseISO(dayData.date), "dd 'de' MMM, yyyy", { locale: ptBR })}</p>
                    <div className="space-y-1">
                        <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Saldo Projetado:</span>
                            <span className={`font-semibold ${dayData.balance < 0 ? "text-red-500" : "text-emerald-600"}`}>
                                {formatCurrency(dayData.balance)}
                            </span>
                        </div>
                        {dayData.income > 0 && (
                            <div className="flex justify-between gap-4 text-emerald-600">
                                <span>Receitas:</span>
                                <span>+{formatCurrency(dayData.income)}</span>
                            </div>
                        )}
                        {dayData.expense > 0 && (
                            <div className="flex justify-between gap-4 text-red-500">
                                <span>Despesas:</span>
                                <span>-{formatCurrency(dayData.expense)}</span>
                            </div>
                        )}

                        {dayData.transactions.length > 0 && (
                            <div className="mt-3 border-t pt-2">
                                <p className="font-semibold text-muted-foreground mb-1">Transações Previstas:</p>
                                <ul className="space-y-1 max-h-32 overflow-y-auto">
                                    {dayData.transactions.map((tx, idx) => (
                                        <li key={idx} className="flex justify-between gap-2 text-[10px] md:text-xs">
                                            <span className={`truncate max-w-[120px] ${tx.isProjection ? 'italic text-muted-foreground' : ''}`}>
                                                {tx.description}
                                            </span>
                                            <span className={tx.type === 'expense' ? 'text-red-500' : 'text-emerald-500'}>
                                                {formatCurrency(Math.abs(tx.amount))}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        return null;
    };

    const gradientOffset = () => {
        if (maxBalance <= 0) return 0;
        if (minBalance >= 0) return 1;
        return maxBalance / (maxBalance - minBalance);
    };

    const off = gradientOffset();

    return (
        <Card className="col-span-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Projeção de Fluxo de Caixa (90 dias)
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset={off} stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset={off} stopColor="#ef4444" stopOpacity={0.3} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(str) => format(parseISO(str), "dd/MM")}
                                minTickGap={30}
                                tick={{ fontSize: 12 }}
                            />
                            <YAxis
                                tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`}
                                tick={{ fontSize: 12 }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <ReferenceLine y={0} stroke="#000" strokeOpacity={0.2} path="" />
                            <Area
                                type="monotone"
                                dataKey="balance"
                                stroke="#64748b"
                                fill="url(#splitColor)"
                                strokeWidth={2}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {minBalance < 0 && (
                    <div className="mt-4 flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
                        <div>
                            <p className="font-semibold">Atenção: Risco de saldo negativo projetado.</p>
                            <p>O fluxo de caixa indica que você poderá ficar no vermelho em alguns momentos nos próximos 90 dias com base nas regras recorrentes e transações agendadas.</p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
