/**
 * Cálculo de métricas mensais por bucket e persistência em month_snapshots.
 * Transferências não entram no gasto do bucket.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  format,
  getDaysInMonth,
  isAfter,
  isBefore,
  min as minDate,
  parseISO,
  startOfMonth,
  subMonths,
  differenceInDays,
} from "date-fns";
import type { MonthSnapshotBucketData, RecurringRule } from "@/lib/types/database";
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
 * Retorna o primeiro e último dia do mês em YYYY-MM-DD no **calendário local**
 * (evita deslocamento para o dia anterior/posterior que ocorre com toISOString/UTC).
 */
function monthRange(month: Date): { start: string; end: string } {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
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

  const monthStr = format(startOfMonth(month), "yyyy-MM-dd");
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

function addFrequencyForRule(date: Date, freq: RecurringRule["frequency"]): Date {
  if (freq === "weekly") return addWeeks(date, 1);
  if (freq === "yearly") return addYears(date, 1);
  return addMonths(date, 1);
}

/**
 * Recorrências ativas com ocorrência no mês que ainda não geraram lançamento naquele período.
 * Mesma cadência que calendário/projeção; evita duplicar quando já existe tx com metadata.recurring_rule_id.
 */
async function totalRecurringExpenseProjectedInMonth(
  supabase: SupabaseClient,
  orgId: string,
  month: Date
): Promise<number> {
  const { start, end } = monthRange(month);
  const startDate = parseISO(`${start}T12:00:00`);
  const endDate = parseISO(`${end}T12:00:00`);

  const { data: rules } = await supabase
    .from("recurring_rules")
    .select("id, amount, frequency, start_date, end_date")
    .eq("org_id", orgId)
    .eq("is_active", true);

  if (!rules?.length) return 0;

  const ruleIds = rules.map((r) => r.id);

  const { data: lastRuns } = await supabase
    .from("recurring_runs")
    .select("rule_id, run_at")
    .eq("success", true)
    .in("rule_id", ruleIds);

  const lastRunMap: Record<string, Date> = {};
  (lastRuns ?? []).forEach((run: { rule_id: string; run_at: string }) => {
    const d = parseISO(run.run_at);
    if (!lastRunMap[run.rule_id] || d.getTime() > lastRunMap[run.rule_id].getTime()) {
      lastRunMap[run.rule_id] = d;
    }
  });

  const metaSelect = "date, due_date, metadata";
  const { data: txsMetaByDate } = await supabase
    .from("transactions")
    .select(metaSelect)
    .eq("org_id", orgId)
    .gte("date", start)
    .lte("date", end)
    .is("deleted_at", null)
    .not("metadata", "is", null);

  const { data: txsMetaByDue } = await supabase
    .from("transactions")
    .select(metaSelect)
    .eq("org_id", orgId)
    .not("due_date", "is", null)
    .gte("due_date", start)
    .lte("due_date", end)
    .is("deleted_at", null)
    .not("metadata", "is", null);

  const coveredByGeneratedTx = new Set<string>();
  const addCoverage = (t: { date?: string | null; due_date?: string | null; metadata?: unknown }) => {
    const meta = t.metadata as { recurring_rule_id?: string } | null | undefined;
    const rid = meta?.recurring_rule_id;
    if (!rid) return;
    if (typeof t.date === "string" && t.date.length >= 10) {
      coveredByGeneratedTx.add(`${rid}|${t.date.slice(0, 10)}`);
    }
    if (typeof t.due_date === "string" && t.due_date.length >= 10) {
      coveredByGeneratedTx.add(`${rid}|${t.due_date.slice(0, 10)}`);
    }
  };
  for (const t of txsMetaByDate ?? []) addCoverage(t);
  for (const t of txsMetaByDue ?? []) addCoverage(t);

  let total = 0;
  const ruleRows = rules as Pick<RecurringRule, "id" | "amount" | "frequency" | "start_date" | "end_date">[];
  for (const ruleRow of ruleRows) {
    const ruleEnd = ruleRow.end_date ? parseISO(ruleRow.end_date) : null;
    if (ruleEnd && isBefore(ruleEnd, startDate)) continue;

    const ruleStart = parseISO(ruleRow.start_date);
    if (isAfter(ruleStart, endDate)) continue;

    let target = lastRunMap[ruleRow.id]
      ? addFrequencyForRule(lastRunMap[ruleRow.id], ruleRow.frequency)
      : ruleStart;

    while (isBefore(target, startDate)) {
      target = addFrequencyForRule(target, ruleRow.frequency);
    }

    while (!isAfter(target, endDate)) {
      if (ruleEnd && isAfter(target, ruleEnd)) break;

      const dStr = format(target, "yyyy-MM-dd");
      const key = `${ruleRow.id}|${dStr}`;
      if (!coveredByGeneratedTx.has(key)) {
        total += Math.abs(Number(ruleRow.amount));
      }
      target = addFrequencyForRule(target, ruleRow.frequency);
    }
  }

  return finiteNumber(total);
}

/**
 * Resultado operacional realizado no mês (receitas − despesas), mesma regra do dashboard.
 */
async function resultadoOperacionalMesRealizado(
  supabase: SupabaseClient,
  orgId: string,
  month: Date
): Promise<{ receitas: number; despesas: number; resultado: number }> {
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
  const rows = attachCategoryType(
    (data ?? []) as {
      amount: number | string | null;
      type: string;
      contact_id?: string | null;
      category_id?: string | null;
      contact_payment_direction?: string | null;
    }[],
    categoryTypeById
  );
  const receitas = sumReceitas(rows, contactPaysMeCategoryIds);
  const despesas = sumDespesas(rows, contactPaysMeCategoryIds);
  return {
    receitas,
    despesas,
    resultado: finiteNumber(receitas - despesas),
  };
}

/**
 * Total de compromissos por transações via RPC Postgres (mesma regra que consulta manual no SQL Editor).
 * Requer migration `00018_forecast_commitments_tx_total.sql`.
 */
async function totalDespesasCompromissosNoMes(
  supabase: SupabaseClient,
  orgId: string,
  month: Date
): Promise<number> {
  const pMonth = format(startOfMonth(month), "yyyy-MM-dd");
  const { data, error } = await supabase.rpc("forecast_commitments_tx_total", {
    p_org_id: orgId,
    p_month: pMonth,
  });
  if (error) {
    console.error("forecast_commitments_tx_total", error);
    throw error;
  }
  return finiteNumber(Number(data ?? 0));
}

export type NextMonthForecast = {
  /** Próximo mês civil (alvo do previsto). */
  monthLabel: string;
  /** Mês “de onde vem a sobra”: o mês civil anterior ao próximo (= mês atual da referência). */
  mesBaseLabel: string;
  receitaPrevista: number;
  /** Transações com vencimento no mês ou à vista com data no mês. */
  compromissosTransacoesMes: number;
  /** Recorrências ativas com data prevista no mês e sem lançamento já gerado. */
  compromissosRecorrenciasMes: number;
  /** compromissosTransacoesMes + compromissosRecorrenciasMes */
  despesaCompromissosMes: number;
  despesaMedia3m: number;
  /** Despesa usada no cálculo (compromissos do próximo mês ou média 3m). */
  despesaProjetada: number;
  /**
   * Sobra do mês anterior ao próximo: receitas − despesas operacionais realizadas (cleared/reconciled)
   * no mês civil atual em relação à data âncora.
   */
  resultadoMesBase: number;
  /** Receita prevista − despesa projetada (sem incluir a sobra do mês base). */
  fluxoProximoMes: number;
  /** resultadoMesBase + receita prevista − despesa projetada. */
  saldoProjetado: number;
  incomeSource: "distribution" | "historical_avg";
  /** Qual base foi usada na despesa projetada. */
  expenseBasis: "compromissos_mes" | "media_3m";
};

/**
 * Estimativa para o próximo mês civil: receita (distribuição ou média 3m)
 * menos **compromissos daquele mês**: transações (due_date no mês + à vista com data no mês)
 * mais **recorrências** com ocorrência projetada no mês que ainda não geraram lançamento.
 * Se não houver nenhum compromisso identificado, usa a média de despesas dos 3 meses anteriores.
 */
export async function computeNextMonthForecast(
  supabase: SupabaseClient,
  orgId: string,
  anchorDate: Date
): Promise<NextMonthForecast> {
  const mesBase = startOfMonth(anchorDate);
  const nextMonth = startOfMonth(addMonths(anchorDate, 1));
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(nextMonth);
  const mesBaseLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(mesBase);

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

  const compromissosTransacoesMes = finiteNumber(await totalDespesasCompromissosNoMes(supabase, orgId, nextMonth));
  const compromissosRecorrenciasMes = finiteNumber(await totalRecurringExpenseProjectedInMonth(supabase, orgId, nextMonth));
  const despesaCompromissosMes = finiteNumber(compromissosTransacoesMes + compromissosRecorrenciasMes);
  const temCompromissos = despesaCompromissosMes > 0;
  const despesaProjetada = finiteNumber(temCompromissos ? despesaCompromissosMes : despesaMedia3m);

  receitaPrevista = finiteNumber(receitaPrevista);
  const despesaMedia3mF = finiteNumber(despesaMedia3m);
  const despesaCompromissosF = despesaCompromissosMes;

  const { resultado: resultadoMesBase } = await resultadoOperacionalMesRealizado(supabase, orgId, mesBase);
  const fluxoProximoMes = finiteNumber(receitaPrevista - despesaProjetada);
  const saldoProjetado = finiteNumber(resultadoMesBase + fluxoProximoMes);

  return {
    monthLabel,
    mesBaseLabel,
    receitaPrevista,
    compromissosTransacoesMes,
    compromissosRecorrenciasMes,
    despesaCompromissosMes: despesaCompromissosF,
    despesaMedia3m: despesaMedia3mF,
    despesaProjetada,
    resultadoMesBase,
    fluxoProximoMes,
    saldoProjetado,
    incomeSource,
    expenseBasis: temCompromissos ? "compromissos_mes" : "media_3m",
  };
}
