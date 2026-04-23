/**
 * Cálculo de métricas mensais por bucket e persistência em month_snapshots.
 * Transferências não entram no gasto do bucket.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addMonths,
  endOfMonth,
  getDaysInMonth,
  min as minDate,
  startOfMonth,
  subMonths,
  differenceInDays,
} from "date-fns";
import type { MonthSnapshotBucketData } from "@/lib/types/database";
import {
  attachCategoryType,
  isDespesa,
  isReceita,
  sumDespesas,
  sumReceitas,
} from "@/lib/transactions/classification";

const TOTAL_BPS = 10000;

/** Status usados no previsto do próximo mês (inclui em aberto). */
const FORECAST_TX_STATUSES = ["pending", "cleared", "reconciled"] as const;

function finiteNumber(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

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

async function getCategoryMetadata(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ contactPaysMeCategoryIds: Set<string>; categoryTypeById: Map<string, string> }> {
  const { data } = await supabase
    .from("categories")
    .select("id, type, is_creditor_center")
    .eq("org_id", orgId);

  return {
    contactPaysMeCategoryIds: new Set((data ?? []).filter((category) => category.is_creditor_center).map((category) => category.id)),
    categoryTypeById: new Map((data ?? []).map((category) => [category.id, category.type])),
  };
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
 * Base de renda do mês atual conforme a mesma regra do dashboard.
 */
async function getCurrentMonthIncome(
  supabase: SupabaseClient,
  orgId: string,
  month: Date
): Promise<number> {
  const { start, end } = monthRange(month);
  const { contactPaysMeCategoryIds, categoryTypeById } = await getCategoryMetadata(supabase, orgId);

  const { data } = await supabase
    .from("transactions")
    .select("amount, type, contact_id, category_id, contact_payment_direction")
    .eq("org_id", orgId)
    .neq("type", "transfer")
    .in("status", ["cleared", "reconciled"])
    .gte("date", start)
    .lte("date", end)
    .is("deleted_at", null);

  return sumReceitas(
    attachCategoryType(
      (data ?? []) as {
        type: string;
        amount: number | string | null;
        contact_id?: string | null;
        category_id?: string | null;
        contact_payment_direction?: string | null;
      }[],
      categoryTypeById
    ),
    contactPaysMeCategoryIds
  );
}

/**
 * Média de receitas dos últimos N meses com a mesma regra do dashboard.
 */
async function getAvgIncome(
  supabase: SupabaseClient,
  orgId: string,
  month: Date,
  numMonths: number
): Promise<number> {
  const { start } = monthRange(subMonths(month, numMonths));
  const { end } = monthRange(month);
  const { contactPaysMeCategoryIds, categoryTypeById } = await getCategoryMetadata(supabase, orgId);

  const { data } = await supabase
    .from("transactions")
    .select("date, amount, type, contact_id, category_id, contact_payment_direction")
    .eq("org_id", orgId)
    .neq("type", "transfer")
    .in("status", ["cleared", "reconciled"])
    .gte("date", start)
    .lte("date", end)
    .is("deleted_at", null);

  const rows = attachCategoryType(
    (data ?? []) as {
      date: string;
      amount: number | string | null;
      type: string;
      contact_id?: string | null;
      category_id?: string | null;
      contact_payment_direction?: string | null;
    }[],
    categoryTypeById
  );
  const byMonth: Record<string, number> = {};
  rows.forEach((r) => {
    const m = r.date.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = 0;
    if (isReceita(r, contactPaysMeCategoryIds)) {
      byMonth[m] += Math.abs(Number(r.amount));
    }
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

async function getCurrentMonthIncomeForecast(
  supabase: SupabaseClient,
  orgId: string,
  month: Date
): Promise<number> {
  const { start, end } = monthRange(month);
  const { contactPaysMeCategoryIds, categoryTypeById } = await getCategoryMetadata(supabase, orgId);

  const { data } = await supabase
    .from("transactions")
    .select("amount, type, contact_id, category_id, contact_payment_direction")
    .eq("org_id", orgId)
    .neq("type", "transfer")
    .in("status", [...FORECAST_TX_STATUSES])
    .gte("date", start)
    .lte("date", end)
    .is("deleted_at", null);

  return sumReceitas(
    attachCategoryType(
      (data ?? []) as {
        type: string;
        amount: number | string | null;
        contact_id?: string | null;
        category_id?: string | null;
        contact_payment_direction?: string | null;
      }[],
      categoryTypeById
    ),
    contactPaysMeCategoryIds
  );
}

async function getAvgIncomeForecast(
  supabase: SupabaseClient,
  orgId: string,
  month: Date,
  numMonths: number
): Promise<number> {
  const { start } = monthRange(subMonths(month, numMonths));
  const { end } = monthRange(month);
  const { contactPaysMeCategoryIds, categoryTypeById } = await getCategoryMetadata(supabase, orgId);

  const { data } = await supabase
    .from("transactions")
    .select("date, amount, type, contact_id, category_id, contact_payment_direction")
    .eq("org_id", orgId)
    .neq("type", "transfer")
    .in("status", [...FORECAST_TX_STATUSES])
    .gte("date", start)
    .lte("date", end)
    .is("deleted_at", null);

  const rows = attachCategoryType(
    (data ?? []) as {
      date: string;
      amount: number | string | null;
      type: string;
      contact_id?: string | null;
      category_id?: string | null;
      contact_payment_direction?: string | null;
    }[],
    categoryTypeById
  );
  const byMonth: Record<string, number> = {};
  rows.forEach((r) => {
    const m = r.date.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = 0;
    if (isReceita(r, contactPaysMeCategoryIds)) {
      byMonth[m] += Math.abs(Number(r.amount));
    }
  });
  const months = Object.keys(byMonth).length || 1;
  const total = Object.values(byMonth).reduce((s, v) => s + v, 0);
  return total / months;
}

async function getBaseIncomeForForecast(
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
    return getCurrentMonthIncomeForecast(supabase, orgId, month);
  }
  if (mode === "avg_3m") {
    return getAvgIncomeForecast(supabase, orgId, month, 3);
  }
  if (mode === "avg_6m") {
    return getAvgIncomeForecast(supabase, orgId, month, 6);
  }
  return getCurrentMonthIncomeForecast(supabase, orgId, month);
}

/**
 * Distribuição ativa para a org no mês (default ou por período active_from/active_to).
 */
export async function getActiveDistribution(
  supabase: SupabaseClient,
  orgId: string,
  month: Date
): Promise<{ distribution: DistributionRow; buckets: BucketRow[] } | null> {
  void month; // reserved for future month-scoped query
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
 * Gasto por bucket no mês usando apenas despesas operacionais.
 */
async function getSpendByBucket(
  supabase: SupabaseClient,
  orgId: string,
  month: Date
): Promise<Record<string, number>> {
  const { start, end } = monthRange(month);
  const { contactPaysMeCategoryIds, categoryTypeById } = await getCategoryMetadata(supabase, orgId);

  const { data } = await supabase
    .from("transactions")
    .select("bucket_id, amount, type, contact_id, category_id, contact_payment_direction")
    .eq("org_id", orgId)
    .neq("type", "transfer")
    .in("status", ["cleared", "reconciled"])
    .gte("date", start)
    .lte("date", end)
    .is("deleted_at", null);

  const byBucket: Record<string, number> = {};
  attachCategoryType(
    (data ?? []) as (ExpenseRow & {
      type: string;
      contact_id?: string | null;
      category_id?: string | null;
      contact_payment_direction?: string | null;
    })[],
    categoryTypeById
  ).forEach(
    (r: ExpenseRow & { type: string; contact_id?: string | null; category_id?: string | null; category_type?: string | null }) => {
      if (!isDespesa(r, contactPaysMeCategoryIds)) return;
      const bid = r.bucket_id ?? "_none_";
      byBucket[bid] = (byBucket[bid] ?? 0) + Math.abs(Number(r.amount));
    }
  );
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

/** Despesas para média do previsto (inclui pending = compromissos em aberto). */
async function totalDespesasOperacionaisMonthForecast(
  supabase: SupabaseClient,
  orgId: string,
  month: Date
): Promise<number> {
  const { start, end } = monthRange(month);
  const { contactPaysMeCategoryIds, categoryTypeById } = await getCategoryMetadata(supabase, orgId);
  const { data } = await supabase
    .from("transactions")
    .select("amount, type, contact_id, category_id, contact_payment_direction")
    .eq("org_id", orgId)
    .neq("type", "transfer")
    .in("status", [...FORECAST_TX_STATUSES])
    .gte("date", start)
    .lte("date", end)
    .is("deleted_at", null);
  return sumDespesas(
    attachCategoryType(
      (data ?? []) as {
        amount: number | string | null;
        type: string;
        contact_id?: string | null;
        category_id?: string | null;
        contact_payment_direction?: string | null;
      }[],
      categoryTypeById
    ),
    contactPaysMeCategoryIds
  );
}

export type NextMonthForecast = {
  monthLabel: string;
  receitaPrevista: number;
  despesaMedia3m: number;
  resultadoPrevisto: number;
  incomeSource: "distribution" | "historical_avg";
};

/**
 * Estimativa para o próximo mês civil: receita (modo da distribuição ou média 3m)
 * menos média das despesas operacionais dos 3 meses anteriores ao mês corrente.
 */
export async function computeNextMonthForecast(
  supabase: SupabaseClient,
  orgId: string,
  anchorDate: Date
): Promise<NextMonthForecast> {
  const nextMonth = startOfMonth(addMonths(anchorDate, 1));
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(nextMonth);

  const active = await getActiveDistribution(supabase, orgId, nextMonth);
  let receitaPrevista: number;
  let incomeSource: NextMonthForecast["incomeSource"] = "historical_avg";

  if (active) {
    receitaPrevista = await getBaseIncomeForForecast(supabase, orgId, nextMonth, active.distribution);
    incomeSource = "distribution";
  } else {
    receitaPrevista = await getAvgIncomeForecast(supabase, orgId, startOfMonth(anchorDate), 3);
  }

  const curStart = startOfMonth(anchorDate);
  let sumDesp = 0;
  for (let i = 1; i <= 3; i++) {
    sumDesp += await totalDespesasOperacionaisMonthForecast(supabase, orgId, subMonths(curStart, i));
  }
  const despesaMedia3m = sumDesp / 3;

  receitaPrevista = finiteNumber(receitaPrevista);
  const despesaMedia3mF = finiteNumber(despesaMedia3m);
  const resultadoPrevisto = finiteNumber(receitaPrevista - despesaMedia3mF);

  return {
    monthLabel,
    receitaPrevista,
    despesaMedia3m: despesaMedia3mF,
    resultadoPrevisto,
    incomeSource,
  };
}
