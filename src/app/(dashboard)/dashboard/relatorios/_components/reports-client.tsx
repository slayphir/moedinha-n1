"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { GlobalFilter } from "../../../_components/filters/global-filter";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    Area,
    AreaChart,
    Legend,
} from "recharts";
import {
    BarChart3,
    PieChart as PieIcon,
    TrendingUp,
    Layers,
    Calendar,
    Flame,
    ArrowUpRight,
    ArrowDownRight,
    Scissors,
} from "lucide-react";
import type { ReportMetrics, CategorySpend } from "@/app/actions/reports";
import { CategoryDrilldownModal } from "./category-drilldown-modal";
import { ReductionPlanModal } from "./reduction-plan-modal";
import { DailyProjection } from "@/app/actions/projections";
import { CashFlowChart } from "./cash-flow-chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CHART_COLORS = [
    "#2E9F62", "#4D79AE", "#F1C31E", "#825219", "#C5473A",
    "#4B8A9A", "#8E5A99", "#6B7A8F", "#D17D2F", "#5E6BAE",
];

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ── Sub-components ──

function CategoryRankingChart({ data, onCategoryClick }: { data: CategorySpend[]; onCategoryClick?: (cat: CategorySpend) => void }) {
    const top10 = data.slice(0, 10);
    const chartData = top10.map((c) => ({
        name: c.name.length > 14 ? c.name.slice(0, 14) + "…" : c.name,
        fullName: c.name,
        value: c.amount,
        pct: c.pct,
        variation: c.variation,
    }));

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Top Categorias
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                            <Tooltip
                                formatter={(value: number) => formatCurrency(value)}
                                labelFormatter={(label) => {
                                    const item = chartData.find((c) => c.name === label);
                                    return `${item?.fullName ?? label} (${item?.pct.toFixed(1)}%)`;
                                }}
                            />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(_, index: number) => onCategoryClick?.(data[index])}>
                                {chartData.map((_, i) => (
                                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                {/* Variation badges */}
                <div className="mt-3 flex flex-wrap gap-2">
                    {top10.slice(0, 5).map((c) => (
                        <span
                            key={c.name}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${c.variation > 0
                                ? "bg-red-100 text-red-700"
                                : c.variation < 0
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                        >
                            {c.variation > 0 ? <ArrowUpRight className="h-3 w-3" /> : c.variation < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
                            {c.name.slice(0, 10)}: {c.variation > 0 ? "+" : ""}{c.variation.toFixed(0)}%
                        </span>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function CategoryDonutChart({ data, onCategoryClick }: { data: CategorySpend[]; onCategoryClick?: (cat: CategorySpend) => void }) {
    const top6 = data.slice(0, 6);
    const others = data.slice(6).reduce((s, c) => s + c.amount, 0);
    const chartData = [
        ...top6.map((c) => ({ name: c.name, value: c.amount })),
        ...(others > 0 ? [{ name: "Outros", value: others }] : []),
    ];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <PieIcon className="h-5 w-5" />
                    Participação
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={90}
                                paddingAngle={2}
                                cursor="pointer"
                                onClick={(_, index: number) => {
                                    const clickedName = chartData[index]?.name;
                                    if (clickedName === "Outros") return;
                                    const cat = data.find((c) => c.name === clickedName);
                                    if (cat) onCategoryClick?.(cat);
                                }}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {chartData.map((_, i) => (
                                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}

function SpendingEvolutionChart({ data, categories }: { data: ReportMetrics["timeSeries"]; categories: string[] }) {
    // Transform for stacked area: each point needs { label, cat1: val, cat2: val, ... }
    const top5Cats = categories.slice(0, 5);
    const chartData = data.map((point) => {
        const row: Record<string, number | string> = { label: point.label };
        top5Cats.forEach((cat) => {
            row[cat] = point.categories[cat] ?? 0;
        });
        // "Outros"
        const othersVal = Object.entries(point.categories)
            .filter(([key]) => !top5Cats.includes(key))
            .reduce((s, [, v]) => s + v, 0);
        if (othersVal > 0) row["Outros"] = othersVal;
        return row;
    });

    const allKeys = [...top5Cats, ...(chartData.some((r) => Number(r["Outros"] ?? 0) > 0) ? ["Outros"] : [])];

    return (
        <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5" />
                    Evolução do Gasto
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                            <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                            {allKeys.map((key, i) => (
                                <Area
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    stackId="1"
                                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                                    fillOpacity={0.6}
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}

function BucketUsageChart({ data }: { data: ReportMetrics["bucketUsage"] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Uso por Bucket
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {data.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum bucket configurado.</p>
                )}
                {data.map((b) => {
                    const status = b.spend_pct >= 90 ? "critical" : b.spend_pct >= 70 ? "warn" : "ok";
                    return (
                        <div key={b.bucket_id} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">{b.name}</span>
                                <span className="text-muted-foreground">
                                    {formatCurrency(b.spend)} / {formatCurrency(b.budget)} ({b.spend_pct.toFixed(0)}%)
                                </span>
                            </div>
                            <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
                                {/* Threshold markers */}
                                <div className="absolute left-[70%] top-0 h-full w-px bg-amber-300/60" />
                                <div className="absolute left-[90%] top-0 h-full w-px bg-red-300/60" />
                                <div
                                    className={`h-full rounded-full transition-all ${status === "critical"
                                        ? "bg-red-500"
                                        : status === "warn"
                                            ? "bg-amber-500"
                                            : "bg-emerald-500"
                                        }`}
                                    style={{ width: `${Math.min(100, b.spend_pct)}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}

function WaterfallChart({ data }: { data: ReportMetrics["waterfall"] }) {
    // Waterfall: compute cumulative for positioning
    let running = 0;
    const chartData = data.map((item) => {
        const start = running;
        running += item.value;
        return {
            name: item.label,
            label: item.label,
            value: Math.abs(item.value),
            start: item.type === "balance" ? 0 : Math.min(start, running),
            displayValue: item.value,
            fill:
                item.type === "income"
                    ? "#2E9F62"
                    : item.type === "balance"
                        ? (item.value >= 0 ? "#4D79AE" : "#C5473A")
                        : "#C5473A",
        };
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Flame className="h-5 w-5" />
                    Fluxo (Cascata)
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                            <YAxis tickFormatter={(v) => formatCurrency(v)} />
                            <Tooltip
                                formatter={(value: number, name: string) => {
                                    if (name === "start") return [null, null];
                                    return [formatCurrency(value), "Valor"];
                                }}
                            />
                            <Bar dataKey="start" stackId="waterfall" fill="transparent" />
                            <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]}>
                                {chartData.map((entry, i) => (
                                    <Cell key={i} fill={entry.fill} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}

function FixedVarChart({ data }: { data: ReportMetrics["fixedVsVariable"] }) {
    const chartData = [
        { name: "Fixos", value: data.fixed },
        { name: "Variáveis", value: data.variable },
    ];
    const total = data.fixed + data.variable;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Fixos vs Variáveis
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis tickFormatter={(v) => formatCurrency(v)} />
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                <Cell fill="#4D79AE" />
                                <Cell fill="#D17D2F" />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>Fixos: {total > 0 ? ((data.fixed / total) * 100).toFixed(0) : 0}% da despesa</span>
                    <span>Variáveis: {total > 0 ? ((data.variable / total) * 100).toFixed(0) : 0}% da despesa</span>
                </div>
            </CardContent>
        </Card>
    );
}

function HeatmapChart({ data }: { data: ReportMetrics["heatmap"] }) {
    const max = Math.max(...data.map((d) => d.total), 1);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Flame className="h-5 w-5" />
                    Gasto por Dia da Semana
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-7 gap-2">
                    {data.map((d) => {
                        const intensity = d.total / max;
                        const bg =
                            intensity > 0.75
                                ? "bg-red-500 text-white"
                                : intensity > 0.5
                                    ? "bg-amber-400 text-amber-900"
                                    : intensity > 0.25
                                        ? "bg-yellow-200 text-yellow-800"
                                        : "bg-slate-100 text-slate-600";
                        return (
                            <div
                                key={d.day}
                                className={`flex flex-col items-center justify-center rounded-lg p-3 ${bg} transition-colors`}
                            >
                                <span className="text-xs font-semibold">{DAY_NAMES[d.day]}</span>
                                <span className="mt-1 text-sm font-bold">{formatCurrency(d.total)}</span>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}

// ── Main Component ──

export function ReportsClient({ metrics, projection, startDate, endDate }: { metrics: ReportMetrics; projection: DailyProjection[]; startDate: string; endDate: string }) {
    const allCategories = metrics.categoryRanking.map((c) => c.name);
    const [drilldown, setDrilldown] = useState<{ open: boolean; categoryId: string | null; categoryName: string }>({ open: false, categoryId: null, categoryName: "" });
    const [reductionOpen, setReductionOpen] = useState(false);

    const handleCategoryClick = (cat: CategorySpend) => {
        setDrilldown({ open: true, categoryId: cat.category_id, categoryName: cat.name });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <section className="overflow-hidden rounded-xl border border-stroke/60 bg-gradient-to-r from-vault-950 via-vault-900 to-bronze p-5 text-paper shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-paper/80">Relatórios</p>
                        <h1 className="font-display text-3xl">Análise Financeira</h1>
                        <p className="mt-1 text-sm text-paper/85">Visão detalhada por categoria, bucket e período.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-paper/30 bg-paper/10 text-paper hover:bg-paper/20"
                            onClick={() => setReductionOpen(true)}
                        >
                            <Scissors className="mr-2 h-4 w-4" />
                            Plano de Redução
                        </Button>
                        <GlobalFilter />
                    </div>
                </div>
            </section>

            {/* Tabs for Analysis vs Projection */}
            <Tabs defaultValue="analysis" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="analysis">Análise</TabsTrigger>
                    <TabsTrigger value="projection">Projeção (Fluxo de Caixa)</TabsTrigger>
                </TabsList>

                <TabsContent value="analysis" className="space-y-6">
                    {/* Summary cards */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardContent className="pt-6">
                                <p className="text-xs text-muted-foreground">Total Receitas</p>
                                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(metrics.totalIncome)}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6">
                                <p className="text-xs text-muted-foreground">Total Despesas</p>
                                <p className="text-2xl font-bold text-red-500">{formatCurrency(metrics.totalExpense)}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6">
                                <p className="text-xs text-muted-foreground">Resultado</p>
                                <p className={`text-2xl font-bold ${metrics.totalIncome - metrics.totalExpense >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                    {formatCurrency(metrics.totalIncome - metrics.totalExpense)}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6">
                                <p className="text-xs text-muted-foreground">Categorias Ativas</p>
                                <p className="text-2xl font-bold">{metrics.categoryRanking.length}</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Row 1: Bucket Usage + Waterfall */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        <BucketUsageChart data={metrics.bucketUsage} />
                        <WaterfallChart data={metrics.waterfall} />
                    </div>

                    {/* Row 2: Top categories + Donut — click to drill-down */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        <CategoryRankingChart data={metrics.categoryRanking} onCategoryClick={handleCategoryClick} />
                        <CategoryDonutChart data={metrics.categoryRanking} onCategoryClick={handleCategoryClick} />
                    </div>
                    <p className="-mt-4 text-center text-xs text-muted-foreground">💡 Clique em uma categoria para ver detalhes</p>

                    {/* Row 3: Spending Evolution (full width) */}
                    <SpendingEvolutionChart data={metrics.timeSeries} categories={allCategories} />

                    {/* Row 4: Heatmap + Fixed vs Variable */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        <HeatmapChart data={metrics.heatmap} />
                        <FixedVarChart data={metrics.fixedVsVariable} />
                    </div>
                </TabsContent>

                <TabsContent value="projection" className="space-y-4">
                    <CashFlowChart data={projection} />
                </TabsContent>
            </Tabs>

            {/* Modals */}
            <CategoryDrilldownModal
                open={drilldown.open}
                onOpenChange={(open) => setDrilldown((prev) => ({ ...prev, open }))}
                categoryId={drilldown.categoryId}
                categoryName={drilldown.categoryName}
                startDate={startDate}
                endDate={endDate}
            />
            <ReductionPlanModal
                open={reductionOpen}
                onOpenChange={setReductionOpen}
                startDate={startDate}
                endDate={endDate}
            />
        </div>
    );
}
