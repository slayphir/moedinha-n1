import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "./_components/dashboard-client";
import { SetupWizard } from "./_components/setup-wizard";
import { startOfMonth, endOfMonth, subDays } from "date-fns";
import { computeMonthlyMetrics } from "@/lib/distribution/metrics";
import { getGoals } from "@/app/actions/goals";
import { getSetupData } from "@/app/actions/complete-setup";



export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: members } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1);
  const orgId = members?.[0]?.org_id;
  if (!orgId) redirect("/onboarding");

  // ── Setup Wizard check ──
  const { data: org } = await supabase
    .from("orgs")
    .select("setup_completed")
    .eq("id", orgId)
    .single();

  if (!org?.setup_completed) {
    const setupData = await getSetupData();
    if (setupData) {
      return (
        <SetupWizard
          orgId={setupData.orgId}
          existingAccounts={setupData.accounts}
          existingCategories={setupData.categories}
        />
      );
    }
  }

  // ── Filter Logic ──
  const now = new Date();
  const startParam = typeof searchParams.start === 'string' ? searchParams.start : undefined;
  const endParam = typeof searchParams.end === 'string' ? searchParams.end : undefined;

  const monthStart = startParam ? new Date(startParam) : startOfMonth(now);
  const monthEnd = endParam ? new Date(endParam) : endOfMonth(now);

  const monthStr = monthStart.toISOString().slice(0, 7) + "-01";
  const ninetyDaysAgo = subDays(monthStart, 90);

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, initial_balance")
    .eq("org_id", orgId)
    .eq("is_active", true);

  const { count: categoryCount } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  const { count: totalTxCount } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("deleted_at", null);

  const { count: distCount } = await supabase
    .from("distributions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  const { data: txList, error } = await supabase
    .from("transactions")
    .select("id, amount, date, type, category_id, bucket_id, deleted_at")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .gte("date", ninetyDaysAgo.toISOString().slice(0, 10))
    .lte("date", monthEnd.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  if (error) {
    console.error("Error fetching transactions:", error);
    throw error;
  }

  const tx = (txList ?? []).filter((t) => !t.deleted_at);

  const monthTx = tx.filter(
    (t) => t.date >= monthStart.toISOString().slice(0, 10) && t.date <= monthEnd.toISOString().slice(0, 10)
  );

  const receitasMes = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const despesasMes = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const saldoOrbita =
    (accounts?.reduce((s, a) => s + Number(a.initial_balance), 0) ?? 0) +
    tx.reduce((s, t) => s + (t.type === "transfer" ? 0 : Number(t.amount)), 0);

  const { data: byCategory, error: catError } = await supabase
    .from("transactions")
    .select("amount, category_id, categories(name)")
    .eq("org_id", orgId)
    .eq("type", "expense")
    .gte("date", monthStart.toISOString().slice(0, 10))
    .lte("date", monthEnd.toISOString().slice(0, 10))
    .is("deleted_at", null);

  if (catError) {
    console.error("Error fetching categories:", catError);
  }

  const categoryTotals: Record<string, number> = {};
  (byCategory ?? []).forEach((r: { amount: number; categories: { name: string } | { name: string }[] | null }) => {
    const cat = Array.isArray(r.categories) ? r.categories[0] : r.categories;
    const name = cat?.name ?? "Sem categoria";
    categoryTotals[name] = (categoryTotals[name] ?? 0) + Math.abs(Number(r.amount));
  });

  // Comparison Logic (Previous Period)
  const durationDays = Math.ceil((monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
  const lastMonthStart = subDays(monthStart, durationDays);
  const lastMonthEnd = subDays(monthStart, 1);

  const lastMonthTx = tx.filter(
    (t) => t.date >= lastMonthStart.toISOString().slice(0, 10) && t.date <= lastMonthEnd.toISOString().slice(0, 10)
  );
  const lastDespesas = lastMonthTx.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const variacao = lastDespesas > 0 ? ((despesasMes - lastDespesas) / lastDespesas) * 100 : 0;

  const previousCategoryTotals: Record<string, number> = {};
  const { data: previousByCategory, error: prevCatError } = await supabase
    .from("transactions")
    .select("amount, category_id, categories(name)")
    .eq("org_id", orgId)
    .eq("type", "expense")
    .gte("date", lastMonthStart.toISOString().slice(0, 10))
    .lte("date", lastMonthEnd.toISOString().slice(0, 10))
    .is("deleted_at", null);

  if (prevCatError) {
    console.error("Error fetching previous categories:", prevCatError);
  }

  (previousByCategory ?? []).forEach((r: { amount: number; categories: { name: string } | { name: string }[] | null }) => {
    const cat = Array.isArray(r.categories) ? r.categories[0] : r.categories;
    const name = cat?.name ?? "Sem categoria";
    previousCategoryTotals[name] = (previousCategoryTotals[name] ?? 0) + Math.abs(Number(r.amount));
  });

  const categoriasEmAlta = Object.entries(categoryTotals)
    .map(([name, current]) => {
      const previous = previousCategoryTotals[name] ?? 0;
      const increase = current - previous;
      const pct = previous > 0 ? (increase / previous) * 100 : current > 0 ? 100 : 0;
      return { name, current, previous, increase, pct };
    })
    .filter((row) => row.increase > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  let runningBalance = 0;
  const flow90Start = subDays(monthEnd, 90);
  const flow90 = tx
    .filter(t => t.date >= flow90Start.toISOString().slice(0, 10) && t.date <= monthEnd.toISOString().slice(0, 10))
    .map((item) => {
      runningBalance += item.type === "transfer" ? 0 : Number(item.amount);
      return { date: item.date, saldo: runningBalance };
    });

  // Month snapshot e alertas
  let monthSnapshot: Awaited<ReturnType<typeof computeMonthlyMetrics>> | null = null;
  const bucketNames: Record<string, string> = {};

  const { data: snapshotRow } = await supabase
    .from("month_snapshots")
    .select("*")
    .eq("org_id", orgId)
    .eq("month", monthStr)
    .maybeSingle();

  if (snapshotRow) {
    monthSnapshot = {
      base_income: Number(snapshotRow.base_income),
      base_income_mode: snapshotRow.base_income_mode,
      bucket_data: (snapshotRow.bucket_data ?? []) as { bucket_id: string; budget: number; spend: number; spend_pct: number; pace_ideal: number; projection: number }[],
      day_ratio: Number(snapshotRow.day_ratio ?? 0),
      total_spend: Number(snapshotRow.total_spend ?? 0),
      total_budget: Number(snapshotRow.total_budget ?? 0),
    };
    const bucketIds = Array.from(new Set(monthSnapshot.bucket_data.map((b) => b.bucket_id)));
    if (bucketIds.length > 0) {
      const { data: buckets } = await supabase
        .from("distribution_buckets")
        .select("id, name")
        .in("id", bucketIds);
      (buckets ?? []).forEach((b: { id: string; name: string }) => {
        bucketNames[b.id] = b.name;
      });
    }
  } else {
    const computed = await computeMonthlyMetrics(supabase, orgId, monthStart);
    if (computed) {
      monthSnapshot = computed;
      const { data: buckets } = await supabase
        .from("distribution_buckets")
        .select("id, name")
        .in("id", computed.bucket_data.map((b) => b.bucket_id));
      (buckets ?? []).forEach((b: { id: string; name: string }) => {
        bucketNames[b.id] = b.name;
      });
    }
  }

  const { data: alertsList } = await supabase
    .from("alerts")
    .select("id, alert_code, severity, message, cta_primary, cta_secondary, created_at")
    .eq("org_id", orgId)
    .eq("month", monthStr)
    .order("created_at", { ascending: false })
    .limit(10);

  const goals = await getGoals();

  const pendingCount = monthTx.filter((t) => t.type === "expense" && !t.bucket_id).length;
  const totalExpense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const pendingPct = totalExpense > 0 ? (monthTx.filter((t) => t.type === "expense" && !t.bucket_id).reduce((s, t) => s + Math.abs(Number(t.amount)), 0) / totalExpense) * 100 : 0;

  return (
    <DashboardClient
      saldoOrbita={saldoOrbita}
      receitasMes={receitasMes}
      despesasMes={despesasMes}
      resultadoMes={receitasMes - despesasMes}
      fluxo90={flow90}
      categoriasMes={Object.entries(categoryTotals).map(([name, value]) => ({ name, value }))}
      categoriasEmAlta={categoriasEmAlta}
      variacaoMesAnterior={variacao}
      mediaDespesa={lastDespesas > 0 ? lastDespesas : 0}
      monthSnapshot={monthSnapshot}
      bucketNames={bucketNames}
      alerts={alertsList ?? []}
      pendingCount={pendingCount}
      pendingPct={pendingPct}
      goals={goals}
      gamification={{
        accountCount: accounts?.length ?? 0,
        categoryCount: categoryCount ?? 0,
        transactionCount: totalTxCount ?? 0,
        hasDistribution: (distCount ?? 0) > 0,
        goalCount: goals.length,
      }}
    />
  );
}
