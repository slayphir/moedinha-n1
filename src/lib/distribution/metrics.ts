/**
 * Cálculo de métricas mensais por bucket e persistência em month_snapshots.
 * Transferências não entram no gasto do bucket.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  differenceInDays,
  getDaysInMonth,
  min as minDate,
  max as maxDate,
} from "date-fns";
import type { MonthSnapshotBucketData } from "@/lib/types/database";

const TOTAL_BPS = 10000;

export type BaseIncomeMode = "current_month" | "avg_3m" | "avg_6m" | "planned_manual";

interface DistributionRow {
  id: string;
  base_income_mode: string;
  planned_income: number | null;
}

interface BucketRow {
  id: string;
  percent_bps: number;
}

interface ExpenseRow {
  bucket_id: string | null;
  amount: number;
}

/**
 * Retorna a data do primeiro e último dia do mês (string YYYY-MM-DD).
 */
function monthRange(month: Date): { start: string; end: string } {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/**
 * Base de renda do mês atual (soma de receitas no mês, excluindo transferências).
 */
async function getCurrentMonthIncome(
  supabase: SupabaseClient,
  orgId: string,
  month: Date
): Promise<number> {
  const { start, end } = monthRange(month);
  const { data } = await supabase
    .from("transactions")
    .select("amount")
    .eq("org_id", orgId)
    .eq("type", "income")
    .gte("date", start)
    .lte("date", end)
    .is("deleted_at", null);

  const total = (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  return total;
}

/**
 * Média de receitas dos últimos N meses (excluindo transferências).
 */
async function getAvgIncome(
  supabase: SupabaseClient,
  orgId: string,
  month: Date,
  numMonths: number
): Promise<number> {
  const { start } = monthRange(subMonths(month, numMonths));
  const { end } = monthRange(month);
  const { data } = await supabase
    .from("transactions")
    .select("date, amount")
    .eq("org_id", orgId)
    .eq("type", "income")
    .gte("date", start)
    .lte("date", end)
    .is("deleted_at", null);

  const byMonth: Record<string, number> = {};
  (data ?? []).forEach((r: { date: string; amount: number }) => {
    const m = r.date.slice(0, 7);
    byMonth[m] = (byMonth[m] ?? 0) + Number(r.amount);
  });
  const months = Object.keys(byMonth).length || 1;
  const total = Object.values(byMonth).reduce((s, v) => s + v, 0);
  return total / months;
}

/**
 * Base de renda conforme distribution.base_income_mode.
 */
export async function getBaseIncome(
  supabase: SupabaseClient,
  orgId: string,
  month: Date,
  distribution: DistributionRow
): Promise<number> {
  const mode = distribution.base_income_mode as BaseIncomeMode;
  if (mode === "planned_manual" && distribution.planned_income != null) {
    return Number(distribution.planned_income);
  }
  if (mode === "current_month") {
    return getCurrentMonthIncome(supabase, orgId, month);
  }
  if (mode === "avg_3m") {
    return getAvgIncome(supabase, orgId, month, 3);
  }
  if (mode === "avg_6m") {
    return getAvgIncome(supabase, orgId, month, 6);
  }
  return getCurrentMonthIncome(supabase, orgId, month);
}

/**
 * Distribuição ativa para a org no mês (default ou por período active_from/active_to).
 */
export async function getActiveDistribution(
  supabase: SupabaseClient,
  orgId: string,
  month: Date
): Promise<{ distribution: DistributionRow; buckets: BucketRow[] } | null> {
  const monthStr = month.toISOString().slice(0, 10);

  // Prefer default distribution; else one active in this month
  const { data: defaultDist } = await supabase
    .from("distributions")
    .select("id, base_income_mode, planned_income")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  let distList: { id: string; base_income_mode: string; planned_income: number | null }[] | null = null;
  if (defaultDist) {
    distList = [defaultDist as DistributionRow];
  } else {
    const { data: anyDist } = await supabase
      .from("distributions")
      .select("id, base_income_mode, planned_income")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (anyDist) distList = [anyDist as DistributionRow];
  }

  const dist = distList?.[0];
  if (!dist) return null;

  const { data: buckets } = await supabase
    .from("distribution_buckets")
    .select("id, percent_bps")
    .eq("distribution_id", dist.id)
    .order("sort_order", { ascending: true });

  if (!buckets?.length) return null;

  return {
    distribution: { id: dist.id, base_income_mode: dist.base_income_mode, planned_income: dist.planned_income },
    buckets: buckets as BucketRow[],
  };
}

/**
 * Gasto por bucket no mês (apenas expense; transferências excluídas).
 */
async function getSpendByBucket(
  supabase: SupabaseClient,
  orgId: string,
  month: Date
): Promise<Record<string, number>> {
  const { start, end } = monthRange(month);
  const { data } = await supabase
    .from("transactions")
    .select("bucket_id, amount")
    .eq("org_id", orgId)
    .eq("type", "expense")
    .gte("date", start)
    .lte("date", end)
    .is("deleted_at", null);

  const byBucket: Record<string, number> = {};
  (data ?? []).forEach((r: ExpenseRow) => {
    const bid = r.bucket_id ?? "_none_";
    byBucket[bid] = (byBucket[bid] ?? 0) + Math.abs(Number(r.amount));
  });
  return byBucket;
}

export interface ComputeMonthlyMetricsResult {
  base_income: number;
  base_income_mode: BaseIncomeMode;
  bucket_data: MonthSnapshotBucketData[];
  day_ratio: number;
  total_spend: number;
  total_budget: number;
}

/**
 * Calcula métricas do mês: base_income, por bucket (budget, spend, spend_pct, pace_ideal, projection).
 * Escreve em month_snapshots (upsert por org_id + month).
 */
export async function computeMonthlyMetrics(
  supabase: SupabaseClient,
  orgId: string,
  month: Date
): Promise<ComputeMonthlyMetricsResult | null> {
  const active = await getActiveDistribution(supabase, orgId, month);
  if (!active) return null;

  const baseIncome = await getBaseIncome(supabase, orgId, month, active.distribution);
  const spendByBucket = await getSpendByBucket(supabase, orgId, month);

  const daysInMonth = getDaysInMonth(month);
  const today = new Date();
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const dayPassed = differenceInDays(minDate([today, monthEnd]), monthStart) + 1;
  const dayRatio = Math.min(1, Math.max(0, dayPassed / daysInMonth));

  const bucket_data: MonthSnapshotBucketData[] = [];
  let total_spend = 0;
  let total_budget = 0;

  for (const bucket of active.buckets) {
    const budget = (baseIncome * bucket.percent_bps) / TOTAL_BPS;
    const spend = spendByBucket[bucket.id] ?? 0;
    const spend_pct = budget > 0 ? (spend / budget) * 100 : 0;
    const pace_ideal = budget * dayRatio;
    const projection = dayPassed > 0 ? (spend / dayPassed) * daysInMonth : 0;

    bucket_data.push({
      bucket_id: bucket.id,
      budget,
      spend,
      spend_pct,
      pace_ideal,
      projection,
    });
    total_spend += spend;
    total_budget += budget;
  }

  const base_income_mode = active.distribution.base_income_mode as BaseIncomeMode;

  const monthStr = month.toISOString().slice(0, 10);
  await supabase.from("month_snapshots").upsert(
    {
      org_id: orgId,
      month: monthStr,
      base_income: baseIncome,
      base_income_mode: base_income_mode,
      bucket_data,
      day_ratio: dayRatio,
      total_spend,
      total_budget,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "org_id,month" }
  );

  return {
    base_income: baseIncome,
    base_income_mode: base_income_mode,
    bucket_data,
    day_ratio: dayRatio,
    total_spend,
    total_budget,
  };
}
