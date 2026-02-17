"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { formatCurrency } from "@/lib/utils";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowRight, Sparkles, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Goal } from "@/app/actions/goals";
import { GoalFundingWidget } from "@/app/(dashboard)/dashboard/metas/_components/goal-funding-widget";

function getGreeting(): { text: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 12) return { text: "Bom dia", emoji: "☀️" };
  if (h < 18) return { text: "Boa tarde", emoji: "🌤️" };
  return { text: "Boa noite", emoji: "🌙" };
}

type MonthSnapshot = {
  base_income: number;
  base_income_mode: string;
  bucket_data: {
    bucket_id: string;
    budget: number;
    spend: number;
    spend_pct: number;
    pace_ideal: number;
    projection: number;
  }[];
  day_ratio: number;
  total_spend: number;
  total_budget: number;
};

type AlertRow = {
  id: string;
  alert_code: string;
  severity: string;
  message: string;
  cta_primary: string | null;
  cta_secondary: string | null;
  created_at: string;
};

type RisingCategory = {
  name: string;
  current: number;
  previous: number;
  increase: number;
  pct: number;
};

import { calcXP, getLevel } from "@/lib/gamification";
import type { GamificationStats } from "@/lib/gamification";

type DashboardClientProps = {
  saldoOrbita: number;
  receitasMes: number;
  despesasMes: number;
  resultadoMes: number;
  fluxo90: { date: string; saldo: number }[];
  categoriasMes: { name: string; value: number }[];
  categoriasEmAlta: RisingCategory[];
  variacaoMesAnterior: number;
  mediaDespesa: number;
  monthSnapshot: MonthSnapshot | null;
  bucketNames: Record<string, string>;
  alerts: AlertRow[];
  pendingCount: number;
  pendingPct: number;
  goals: Goal[];
  gamification: GamificationStats;
};

const CHART_COLORS = [
  "#2E9F62",
  "#4D79AE",
  "#F1C31E",
  "#825219",
  "#C5473A",
  "#4B8A9A",
  "#8E5A99",
  "#6B7A8F",
  "#D17D2F",
  "#5E6BAE",
];

function bucketStatus(spendPct: number): "ok" | "warn" | "critical" {
  if (spendPct >= 100) return "critical";
  if (spendPct >= 90) return "warn";
  return "ok";
}

function getGoalProgress(goal: Goal): number {
  const target = Number(goal.target_amount ?? 0);
  const current = Number(goal.current_amount ?? 0);
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, (current / target) * 100));
}

function goalEtaLabel(goal: Goal): string {
  if (!goal.target_date) return "Sem ETA";
  const today = new Date();
  const target = new Date(goal.target_date);
  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `Atrasada ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return "Vence hoje";
  return `ETA ${diffDays}d`;
}

function resolveAlertHref(alertCode: string): string {
  if (alertCode.startsWith("pending")) return "/dashboard/lancamentos";
  if (alertCode.startsWith("bucket") || alertCode.startsWith("pace") || alertCode.startsWith("projection")) {
    return "/dashboard/distribuicao";
  }
  return "/dashboard/relatorios";
}

function formatAlertDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

function shortDateLabel(value: string): string {
  if (value.length >= 10) return `${value.slice(8, 10)}/${value.slice(5, 7)}`;
  return value;
}

export function DashboardClient({
  saldoOrbita,
  receitasMes,
  despesasMes,
  resultadoMes,
  fluxo90,
  categoriasMes,
  categoriasEmAlta,
  variacaoMesAnterior,
  mediaDespesa,
  monthSnapshot,
  bucketNames,
  alerts,
  pendingCount,
  pendingPct,
  goals,
  gamification,
}: DashboardClientProps) {
  const xp = calcXP(gamification);
  const { level: currentLevel, index: levelIndex, next: nextLevel, pct: levelPct } = getLevel(xp);
  const [categoryView, setCategoryView] = useState<"value" | "percent">("value");

  const paceIdealTotal = monthSnapshot ? monthSnapshot.total_budget * monthSnapshot.day_ratio : 0;
  const projectionTotal =
    monthSnapshot && monthSnapshot.day_ratio > 0 ? monthSnapshot.total_spend / monthSnapshot.day_ratio : 0;
  const projectionPct =
    monthSnapshot && monthSnapshot.total_budget > 0 ? (projectionTotal / monthSnapshot.total_budget) * 100 : 0;

  const top10Categorias = useMemo(
    () => [...categoriasMes].sort((a, b) => b.value - a.value).slice(0, 10),
    [categoriasMes]
  );

  const totalCategorias = useMemo(
    () => top10Categorias.reduce((sum, item) => sum + Number(item.value), 0),
    [top10Categorias]
  );

  const categoryChartData = useMemo(
    () =>
      top10Categorias.map((item) => ({
        ...item,
        percent: totalCategorias > 0 ? (Number(item.value) / totalCategorias) * 100 : 0,
      })),
    [top10Categorias, totalCategorias]
  );

  const alertFeed = useMemo(() => {
    const rows = alerts.map((alert) => ({
      id: alert.id,
      code: alert.alert_code,
      severity: alert.severity,
      message: alert.message,
      cta: alert.cta_primary ?? "Resolver agora",
      href: resolveAlertHref(alert.alert_code),
      created_at: alert.created_at,
    }));

    if (pendingCount > 0) {
      rows.unshift({
        id: "pending",
        code: "pending_bucket",
        severity: pendingPct >= 10 ? "warn" : "info",
        message: `${pendingCount} lancamento(s) sem bucket (${pendingPct.toFixed(1)}% das despesas).`,
        cta: "Categorizar pendentes",
        href: "/dashboard/lancamentos",
        created_at: new Date().toISOString(),
      });
    }

    return rows.slice(0, 5);
  }, [alerts, pendingCount, pendingPct]);

  const hasAlerts = alertFeed.length > 0;

  const greeting = getGreeting();

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up overflow-hidden rounded-xl border border-stroke/60 bg-[length:200%_200%] bg-gradient-to-r from-vault-950 via-vault-900 to-bronze p-5 text-paper shadow-sm animate-gradient-shift">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-paper/80 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> Painel Principal
            </p>
            <h1 className="font-display text-3xl">
              {greeting.text} {greeting.emoji}
            </h1>
            <p className="mt-1 text-sm text-paper/85">Visão mensal com distribuição, alertas e metas.</p>
          </div>

          {/* Level Badge */}
          <div className="hidden sm:flex items-center gap-3 rounded-xl bg-paper/10 backdrop-blur-sm px-4 py-2.5 border border-paper/15">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-coin text-ink font-bold text-xs shadow-md">
              Lv.{levelIndex}
            </div>
            <div className="min-w-[120px]">
              <p className="text-sm font-semibold text-coin leading-tight">
                {currentLevel.emoji} {currentLevel.title}
              </p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-paper/20">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-coin to-coin/70 transition-all duration-700"
                  style={{ width: `${levelPct}%` }}
                />
              </div>
              <p className="mt-0.5 text-[10px] text-paper/60">
                {xp} XP {nextLevel && `· ${nextLevel.minXP - xp} para Lv.${levelIndex + 1}`}
              </p>
            </div>
          </div>
        </div>
      </section>

      <GoalFundingWidget />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
        <Card className="xl:col-span-2 animate-fade-in-up stagger-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink/80">Saldo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <AnimatedNumber value={saldoOrbita} className="text-xl font-bold text-ink" />
              <Wallet className="h-4 w-4 text-vault-700" />
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2 animate-fade-in-up stagger-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink/80">Receitas</CardTitle>
          </CardHeader>
          <CardContent>
            <AnimatedNumber value={receitasMes} className="text-xl font-bold text-vault-700" />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2 animate-fade-in-up stagger-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink/80">Despesas</CardTitle>
          </CardHeader>
          <CardContent>
            <AnimatedNumber value={despesasMes} className="text-xl font-bold text-destructive" />
          </CardContent>
        </Card>

        <Card className="xl:col-span-4 animate-fade-in-up stagger-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink/80">Resultado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              <AnimatedNumber
                value={resultadoMes}
                className={`text-xl font-bold ${resultadoMes >= 0 ? "text-vault-700" : "text-destructive"}`}
              />
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${variacaoMesAnterior <= 0
                  ? "bg-vault-100 text-vault-800"
                  : "bg-bronze/20 text-bronze"
                  }`}
              >
                {variacaoMesAnterior <= 0 ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <TrendingUp className="h-3 w-3" />
                )}
                {Math.abs(variacaoMesAnterior).toFixed(1)}% vs mês anterior
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2 animate-fade-in-up stagger-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink/80">Média anterior</CardTitle>
          </CardHeader>
          <CardContent>
            <AnimatedNumber value={mediaDespesa} className="text-base font-semibold text-ink" />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <Card className="min-h-[260px] xl:col-span-8">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Distribuição do mês</CardTitle>
            <Link href="/dashboard/distribuicao" className="text-sm font-medium text-vault-700 hover:underline">
              Ver tudo
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {monthSnapshot && monthSnapshot.bucket_data.length > 0 ? (
              <>
                {monthSnapshot.bucket_data.map((bucket) => {
                  const status = bucketStatus(bucket.spend_pct);
                  const name = bucketNames[bucket.bucket_id] ?? bucket.bucket_id;
                  return (
                    <div key={bucket.bucket_id} className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-ink">{name}</span>
                        <span className="text-ink/75">
                          {formatCurrency(bucket.spend)} / {formatCurrency(bucket.budget)} ({bucket.spend_pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="relative h-3 w-full overflow-hidden rounded-full bg-stroke/85">
                        <div className="absolute left-[70%] top-0 h-full w-px bg-paper/70" />
                        <div className="absolute left-[90%] top-0 h-full w-px bg-paper/70" />
                        <div className="absolute left-[100%] top-0 h-full w-px bg-paper/70" />
                        <div
                          className={`h-full rounded-full progress-animated ${status === "critical" ? "bg-destructive" : status === "warn" ? "bg-bronze" : "bg-vault-700"
                            }`}
                          style={{ width: `${Math.min(100, bucket.spend_pct)}%` }}
                        />
                      </div>
                      <div className="text-xs text-ink/70">
                        Ritmo ideal: {formatCurrency(bucket.pace_ideal)} | Projeção: {bucket.projection.toFixed(0)}%
                      </div>
                    </div>
                  );
                })}
                <div className="grid gap-3 border-t border-stroke/60 pt-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-ink/70">Ritmo ideal consolidado</p>
                    <p className="font-semibold text-ink">{formatCurrency(paceIdealTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink/70">Projeção de fechamento</p>
                    <p className="font-semibold text-ink">
                      {formatCurrency(projectionTotal)} ({projectionPct.toFixed(0)}%)
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-stroke/70 bg-paper/30 text-center">
                <p className="text-sm text-ink/75">Sem distribuição configurada para este período.</p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/distribuicao">Definir distribuição</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[260px] xl:col-span-4">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Alertas e ações</CardTitle>
            <Link href="/dashboard/lancamentos" className="text-sm font-medium text-vault-700 hover:underline">
              Ver tudo
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasAlerts ? (
              <div className="space-y-3">
                {alertFeed.map((item) => (
                  <div key={item.id} className="rounded-lg border border-stroke/70 bg-paper/35 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex h-2 w-2 rounded-full ${item.severity === "critical"
                          ? "bg-destructive"
                          : item.severity === "warn"
                            ? "bg-bronze"
                            : "bg-vault-700"
                          }`}
                      />
                      <span className="text-[11px] text-ink/60">{formatAlertDate(item.created_at)}</span>
                    </div>
                    <p className="text-sm text-ink">{item.message}</p>
                    <Link href={item.href} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-vault-700 hover:underline">
                      {item.cta} <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-stroke/70 bg-paper/35 p-6 text-center">
                <p className="text-sm text-ink/70">Tudo tranquilo no período.</p>
              </div>
            )}

            <div className="rounded-lg border border-stroke/70 bg-paper/40 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/70">Resolver agora</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/lancamentos">Categorizar pendentes</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/distribuicao">Definir teto</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/metas">Criar plano de redução</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <Card className="min-h-[260px] xl:col-span-8">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Gasto por categoria (Top 10)</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant={categoryView === "value" ? "default" : "outline"}
                size="sm"
                onClick={() => setCategoryView("value")}
              >
                R$
              </Button>
              <Button
                variant={categoryView === "percent" ? "default" : "outline"}
                size="sm"
                onClick={() => setCategoryView("percent")}
              >
                %
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {categoryChartData.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryChartData} layout="vertical" margin={{ left: 10, right: 10, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(226 235 225)" />
                    <XAxis
                      type="number"
                      tickFormatter={(value) =>
                        categoryView === "value" ? `${Math.round(Number(value) / 1000)}k` : `${Number(value).toFixed(0)}%`
                      }
                    />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number, _name, payload: { payload?: { value?: number; percent?: number } }) => {
                        if (categoryView === "percent") {
                          return [`${Number(value).toFixed(1)}%`, "Participação"];
                        }
                        const raw = Number(payload?.payload?.value ?? value);
                        const pct = Number(payload?.payload?.percent ?? 0);
                        return [`${formatCurrency(raw)} (${pct.toFixed(1)}%)`, "Total"];
                      }}
                    />
                    <Bar dataKey={categoryView === "value" ? "value" : "percent"} radius={[0, 4, 4, 0]}>
                      {categoryChartData.map((_, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-stroke/70 bg-paper/35 text-sm text-ink/70">
                Sem despesas categorizadas no período.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[260px] xl:col-span-4">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Fluxo de caixa (90d)</CardTitle>
            <Link href="/dashboard/relatorios" className="text-sm font-medium text-vault-700 hover:underline">
              Ver tudo
            </Link>
          </CardHeader>
          <CardContent>
            {fluxo90.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={fluxo90}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(226 235 225)" />
                    <XAxis dataKey="date" tickFormatter={shortDateLabel} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                    <Tooltip
                      labelFormatter={(label) => String(label)}
                      formatter={(value: number) => [formatCurrency(Number(value)), "Saldo"]}
                    />
                    <Line type="monotone" dataKey="saldo" stroke="#295033" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-stroke/70 bg-paper/35 text-sm text-ink/70">
                Sem movimento no fluxo para o periodo.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <Card className="min-h-[240px] xl:col-span-8">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Metas em destaque</CardTitle>
            <Link href="/dashboard/metas" className="text-sm font-medium text-vault-700 hover:underline">
              Ver tudo
            </Link>
          </CardHeader>
          <CardContent>
            {goals.length > 0 ? (
              <div className="space-y-4">
                {goals.slice(0, 4).map((goal) => {
                  const progress = getGoalProgress(goal);
                  return (
                    <div key={goal.id} className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-ink">{goal.name}</span>
                        <span className="text-ink/70">{goalEtaLabel(goal)}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-stroke/80">
                        <div className="h-full rounded-full bg-vault-700 progress-animated" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="flex flex-wrap items-center justify-between text-xs text-ink/70">
                        <span>
                          {formatCurrency(Number(goal.current_amount ?? 0))}
                          {" / "}
                          {goal.target_amount ? formatCurrency(Number(goal.target_amount)) : "Sem alvo"}
                        </span>
                        <span>{progress.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-stroke/70 bg-paper/35 text-center">
                <Target className="h-5 w-5 text-ink/50" />
                <p className="text-sm text-ink/70">Nenhuma meta ativa.</p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/metas">Criar primeira meta</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[240px] xl:col-span-4">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Categorias que mais subiram</CardTitle>
            <Link href="/dashboard/relatorios" className="text-sm font-medium text-vault-700 hover:underline">
              Ver tudo
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {categoriasEmAlta.length > 0 ? (
              <>
                {categoriasEmAlta.map((item) => (
                  <div key={item.name} className="rounded-lg border border-stroke/70 bg-paper/35 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{item.name}</p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-bronze/20 px-2 py-0.5 text-xs font-medium text-bronze">
                        <AlertTriangle className="h-3 w-3" />+{item.pct.toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-xs text-ink/70">
                      Atual: {formatCurrency(item.current)} | Anterior: {formatCurrency(item.previous)}
                    </p>
                  </div>
                ))}
                <Button asChild size="sm" className="w-full">
                  <Link href="/dashboard/metas">Criar plano de redução</Link>
                </Button>
              </>
            ) : (
              <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-stroke/70 bg-paper/35 text-center">
                <p className="text-sm text-ink/70">Nenhuma alta relevante no periodo.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

