/**
 * Endpoint para Vercel Cron (ou chamada manual) atualizar month_snapshots e gerar alertas.
 * Proteger com CRON_SECRET ou Vercel Cron auth.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { startOfMonth } from "date-fns";
import { computeMonthlyMetrics } from "@/lib/distribution/metrics";
import { generateAlerts } from "@/lib/alerts/generate";
import { env } from "@/lib/env";
import { attachCategoryType, sumDespesas, isDespesa } from "@/lib/transactions/classification";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const now = new Date();
  const month = startOfMonth(now);
  const monthStr = month.toISOString().slice(0, 10);

  const { data: orgs } = await supabase.from("orgs").select("id");
  if (!orgs?.length) {
    return NextResponse.json({ ok: true, message: "No orgs" });
  }

  let snapshotsUpdated = 0;
  let alertsEmitted = 0;

  for (const org of orgs) {
    const orgId = org.id;
    const metrics = await computeMonthlyMetrics(supabase, orgId, month);
    if (!metrics) continue;
    snapshotsUpdated++;

    const bucketNames: Record<string, string> = {};
    const { data: buckets } = await supabase
      .from("distribution_buckets")
      .select("id, name")
      .in("id", metrics.bucket_data.map((b) => b.bucket_id));
    (buckets ?? []).forEach((b: { id: string; name: string }) => {
      bucketNames[b.id] = b.name;
    });

    const { data: categoryRows } = await supabase
      .from("categories")
      .select("id, type, is_creditor_center")
      .eq("org_id", orgId);
    const contactPaysMeCategoryIds = new Set((categoryRows ?? []).filter((c) => c.is_creditor_center).map((c) => c.id));
    const categoryTypeById = new Map((categoryRows ?? []).map((c) => [c.id, c.type]));

    const { data: txList } = await supabase
      .from("transactions")
      .select("bucket_id, amount, type, contact_id, category_id, contact_payment_direction")
      .eq("org_id", orgId)
      .neq("type", "transfer")
      .gte("date", monthStr.slice(0, 7) + "-01")
      .lte("date", monthStr.slice(0, 7) + "-31")
      .is("deleted_at", null);

    const monthTx = attachCategoryType((txList ?? []) as {
      bucket_id: string | null;
      amount: number | string;
      type: string;
      contact_id?: string | null;
      category_id?: string | null;
      contact_payment_direction?: string | null;
    }[], categoryTypeById);
    const totalExpense = sumDespesas(monthTx, contactPaysMeCategoryIds);
    const despesas = monthTx.filter((t) => isDespesa(t, contactPaysMeCategoryIds));
    const pendingCount = despesas.filter((t) => !t.bucket_id).length;
    const pendingSpend = despesas
      .filter((t) => !t.bucket_id)
      .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const pendingPct = totalExpense > 0 ? (pendingSpend / totalExpense) * 100 : 0;

    const emitted = await generateAlerts(supabase, orgId, null, monthStr, metrics, bucketNames, {
      pendingCount,
      pendingPct,
    });
    alertsEmitted += emitted;
  }


  return NextResponse.json({
    ok: true,
    snapshotsUpdated,
    alertsEmitted,
    month: monthStr,
  });
}
