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

    const { data: txList } = await supabase
      .from("transactions")
      .select("bucket_id, amount")
      .eq("org_id", orgId)
      .eq("type", "expense")
      .gte("date", monthStr.slice(0, 7) + "-01")
      .lte("date", monthStr.slice(0, 7) + "-31")
      .is("deleted_at", null);

    const monthTx = txList ?? [];
    const totalExpense = monthTx.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const pendingCount = monthTx.filter((t) => !t.bucket_id).length;
    const pendingSpend = monthTx.filter((t) => !t.bucket_id).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
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
