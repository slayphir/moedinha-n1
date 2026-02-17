/**
 * Geração de alertas a partir de month_snapshots e regras em alert_definitions.
 * Cooldown e histerese por alert_code.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { subHours } from "date-fns";
import type { MonthSnapshotBucketData } from "@/lib/types/database";
import type { ComputeMonthlyMetricsResult } from "@/lib/distribution/metrics";

interface AlertDefinitionRow {
  id: string;
  code: string;
  name: string;
  severity: string;
  cooldown_hours: number;
  hysteresis_pct: number;
  message_template: string;
  cta_primary: string | null;
  cta_secondary: string | null;
}

interface AlertRow {
  alert_code: string;
  context_json: Record<string, unknown>;
  created_at: string;
}

/**
 * Último alerta emitido para org + alert_code (para cooldown/histerese).
 */
async function getLastAlert(
  supabase: SupabaseClient,
  orgId: string,
  alertCode: string,
  month: string
): Promise<AlertRow | null> {
  const { data } = await supabase
    .from("alerts")
    .select("alert_code, context_json, created_at")
    .eq("org_id", orgId)
    .eq("alert_code", alertCode)
    .eq("month", month)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as AlertRow | null;
}

/**
 * Verifica cooldown: não emitir se último alerta foi há menos de cooldown_hours.
 */
function isInCooldown(lastAlert: AlertRow | null, cooldownHours: number): boolean {
  if (!lastAlert) return false;
  const since = new Date(lastAlert.created_at).getTime();
  const cutoff = subHours(new Date(), cooldownHours).getTime();
  return since > cutoff;
}

/**
 * Histerese: reemitir só se variação >= hysteresis_pct (ex.: spend_pct subiu 5%).
 * Simplificado: se já existe alerta recente com mesmo context (ex. bucket_id), não reemitir a menos que valor mude significativamente.
 */
function shouldSkipHysteresis(
  lastAlert: AlertRow | null,
  rule: AlertDefinitionRow,
  context: Record<string, unknown>
): boolean {
  if (!lastAlert?.context_json) return false;
  const lastPct = lastAlert.context_json.spend_pct as number | undefined;
  const currPct = context.spend_pct as number | undefined;
  if (lastPct == null || currPct == null) return false;
  const diff = Math.abs(currPct - lastPct);
  return diff < (rule.hysteresis_pct ?? 5);
}

/**
 * Substitui placeholders na mensagem: {bucket}, {projection_pct}, etc.
 */
function formatMessage(template: string, context: Record<string, unknown>): string {
  let msg = template;
  for (const [k, v] of Object.entries(context)) {
    msg = msg.replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
  }
  return msg;
}

/**
 * Condições por código (base). Retorna true se o alerta deve ser emitido.
 */
function evaluateCondition(
  code: string,
  metrics: ComputeMonthlyMetricsResult,
  bucketData?: MonthSnapshotBucketData,
  bucketName?: string,
  extra?: { pendingCount?: number; pendingPct?: number; totalSpend?: number }
): { emit: boolean; context: Record<string, unknown> } {
  const context: Record<string, unknown> = {
    bucket: bucketName ?? bucketData?.bucket_id ?? "",
    spend_pct: bucketData?.spend_pct,
    projection_pct: bucketData && bucketData.budget > 0
      ? (bucketData.projection / bucketData.budget) * 100
      : 0,
    pace_ratio: bucketData && bucketData.pace_ideal > 0
      ? (bucketData.spend - bucketData.pace_ideal) / bucketData.pace_ideal
      : 0,
    ...extra,
  };

  if (!bucketData && !["pending_pct", "pending_count", "concentration_bucket"].includes(code)) {
    return { emit: false, context };
  }

  switch (code) {
    case "bucket_70":
      return { emit: (bucketData?.spend_pct ?? 0) >= 70, context };
    case "bucket_90":
      return { emit: (bucketData?.spend_pct ?? 0) >= 90, context };
    case "bucket_over":
      return { emit: (bucketData?.spend_pct ?? 0) >= 100, context };
    case "pace_15": {
      const ratio = bucketData && bucketData.pace_ideal > 0
        ? (bucketData.spend - bucketData.pace_ideal) / bucketData.pace_ideal
        : 0;
      return { emit: ratio >= 0.15, context };
    }
    case "pace_30": {
      const ratio = bucketData && bucketData.pace_ideal > 0
        ? (bucketData.spend - bucketData.pace_ideal) / bucketData.pace_ideal
        : 0;
      return { emit: ratio >= 0.3, context };
    }
    case "projection": {
      const projPct = bucketData && bucketData.budget > 0
        ? (bucketData.projection / bucketData.budget) * 100
        : 0;
      context.projection_pct = projPct;
      return { emit: projPct >= 90, context };
    }
    case "concentration_bucket": {
      const total = metrics.total_spend || 1;
      const maxBucketSpend = Math.max(...metrics.bucket_data.map((b) => b.spend), 0);
      const share = (maxBucketSpend / total) * 100;
      context.share_pct = share;
      return { emit: share > 60, context };
    }
    case "concentration_top5":
      return { emit: false, context }; // requer análise de transações; deixar para implementação futura
    case "pending_pct":
      return { emit: (extra?.pendingPct ?? 0) > 10, context };
    case "pending_count":
      return { emit: (extra?.pendingCount ?? 0) >= 20, context };
    default:
      return { emit: false, context };
  }
}

/**
 * Gera alertas para a org no mês, inserindo em alerts.
 * Requer métricas já computadas (month_snapshots) e opcionalmente contagem de pendências.
 */
export async function generateAlerts(
  supabase: SupabaseClient,
  orgId: string,
  userId: string | null,
  month: string,
  metrics: ComputeMonthlyMetricsResult,
  bucketNames: Record<string, string>,
  options?: { pendingCount?: number; pendingPct?: number }
): Promise<number> {
  const { data: definitions } = await supabase
    .from("alert_definitions")
    .select("id, code, name, severity, cooldown_hours, hysteresis_pct, message_template, cta_primary, cta_secondary")
    .in("code", [
      "bucket_70",
      "bucket_90",
      "bucket_over",
      "pace_15",
      "pace_30",
      "projection",
      "concentration_bucket",
      "concentration_top5",
      "pending_pct",
      "pending_count",
    ]);

  const rules = (definitions ?? []) as AlertDefinitionRow[];
  let emitted = 0;
  const extra = {
    pendingCount: options?.pendingCount ?? 0,
    pendingPct: options?.pendingPct ?? 0,
    totalSpend: metrics.total_spend,
  };

  for (const rule of rules) {
    const lastAlert = await getLastAlert(supabase, orgId, rule.code, month);
    if (isInCooldown(lastAlert, rule.cooldown_hours)) continue;

    if (["pending_pct", "pending_count", "concentration_bucket"].includes(rule.code)) {
      const { emit, context } = evaluateCondition(rule.code, metrics, undefined, undefined, extra);
      if (emit) {
        if (shouldSkipHysteresis(lastAlert, rule, context)) continue;
        const message = formatMessage(rule.message_template, context);
        await supabase.from("alerts").insert({
          org_id: orgId,
          user_id: userId,
          month,
          alert_code: rule.code,
          severity: rule.severity,
          message,
          context_json: context,
          cta_primary: rule.cta_primary,
          cta_secondary: rule.cta_secondary,
        });
        emitted++;
      }
      continue;
    }

    for (const b of metrics.bucket_data) {
      const bucketName = bucketNames[b.bucket_id] ?? b.bucket_id;
      const { emit, context } = evaluateCondition(rule.code, metrics, b, bucketName, extra);
      if (emit) {
        if (shouldSkipHysteresis(lastAlert, rule, context)) continue;
        const message = formatMessage(rule.message_template, context);
        await supabase.from("alerts").insert({
          org_id: orgId,
          user_id: userId,
          month,
          alert_code: rule.code,
          severity: rule.severity,
          message,
          context_json: context,
          cta_primary: rule.cta_primary,
          cta_secondary: rule.cta_secondary,
        });
        emitted++;
        break; // um alerta por regra por mês (por bucket pode ser 1 por bucket; aqui 1 por regra para simplificar)
      }
    }
  }

  return emitted;
}
