import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { differenceInCalendarDays, endOfMonth, startOfMonth, subDays } from "date-fns";
import { DashboardClient } from "./_components/dashboard-client";
import { SetupWizard } from "./_components/setup-wizard";
import { computeMonthlyMetrics } from "@/lib/distribution/metrics";
import { getGoals } from "@/app/actions/goals";
import { getSetupData } from "@/app/actions/complete-setup";
import { isRetroactiveInstallmentBackfill } from "@/lib/transactions/retroactive";

type DashboardFilterPreset = "day" | "7d" | "30d" | "month" | "custom";

type PageSearchParams = {
  [key: string]: string | string[] | undefined;
};

function signedAmount(tx: { type: string; amount: number | string | null }) {
  const raw = Number(tx.amount ?? 0);
  const abs = Math.abs(raw);

  if (tx.type === "income") return abs;
  if (tx.type === "expense") return -abs;
  return 0;
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function atStartOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function earliestDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
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
    .order("created_at", { ascending: true })
    .limit(1);
  const orgId = members?.[0]?.org_id;
  if (!orgId) redirect("/onboarding");

  const { data: org } = await supabase
    .from("orgs")
    .select("setup_completed, balance_start_date")
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

  const now = atStartOfDay(new Date());
  const rawPreset = typeof searchParams.preset === "string" ? searchParams.preset : undefined;
  const startParam = typeof searchParams.start === "string" ? searchParams.start : undefined;
  const endParam = typeof searchParams.end === "string" ? searchParams.end : undefined;
  const parsedStart = parseIsoDate(startParam);
  const parsedEnd = parseIsoDate(endParam);

  let selectedPreset: DashboardFilterPreset = "month";
  if (rawPreset === "day" || rawPreset === "7d" || rawPreset === "30d" || rawPreset === "month" || rawPreset === "custom") {
    selectedPreset = rawPreset;
  } else if (parsedStart && parsedEnd) {
    selectedPreset = "custom";
  }

  let rangeStart = startOfMonth(now);
  let rangeEnd = endOfMonth(now);

  if (selectedPreset === "day") {
    rangeStart = now;
    rangeEnd = now;
  } else if (selectedPreset === "7d") {
    rangeStart = subDays(now, 6);
    rangeEnd = now;
  } else if (selectedPreset === "30d") {
    rangeStart = subDays(now, 29);
    rangeEnd = now;
  } else if (selectedPreset === "custom" && parsedStart && parsedEnd) {
    rangeStart = parsedStart;
    rangeEnd = parsedEnd;
  }

  if (rangeStart.getTime() > rangeEnd.getTime()) {
    const swap = rangeStart;
    rangeStart = rangeEnd;
    rangeEnd = swap;
  }

  const selectedStartIso = toDateOnly(rangeStart);
  const selectedEndIso = toDateOnly(rangeEnd);
  const balanceStartIso =
    typeof org?.balance_start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(org.balance_start_date)
      ? org.balance_start_date
      : null;

  const comparisonDays = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart) + 1);
  const previousStart = subDays(rangeStart, comparisonDays);
  const previousEnd = subDays(rangeStart, 1);
  const flow90Start = subDays(rangeEnd, 90);
  const txQueryStart = earliestDate(previousStart, flow90Start);

  const monthAnchor = startOfMonth(rangeEnd);
  const monthStr = `${monthAnchor.getFullYear()}-${String(monthAnchor.getMonth() + 1).padStart(2, "0")}-01`;

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
    .gte("date", toDateOnly(txQueryStart))
    .lte("date", selectedEndIso)
    .order("date", { ascending: true });

  if (error) {
    console.error("Error fetching transactions:", error);
    throw error;
  }

  const tx = (txList ?? []).filter((t) => !t.deleted_at);

  let txBalanceQuery = supabase
    .from("transactions")
    .select("amount, type, date, deleted_at, installment_id, created_at, metadata")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .in("status", ["cleared", "reconciled"])
    .lte("date", selectedEndIso);

  if (balanceStartIso) {
    txBalanceQuery = txBalanceQuery.gte("date", balanceStartIso);
  }

  const { data: txBalanceList, error: balanceError } = await txBalanceQuery;

  if (balanceError) {
    console.error("Error fetching balance transactions:", balanceError);
    throw balanceError;
  }

  const txBalance = (txBalanceList ?? []).filter(
    (t) => !t.deleted_at && !isRetroactiveInstallmentBackfill(t)
  );

  const monthTx = tx.filter((t) => t.date >= selectedStartIso && t.date <= selectedEndIso);

  const receitasMes = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const despesasMes = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const initialBalanceTotal = accounts?.reduce((s, a) => s + Number(a.initial_balance), 0) ?? 0;
  const saldoOrbita = initialBalanceTotal + txBalance.reduce((s, t) => s + signedAmount(t), 0);

  const { data: byCategory, error: catError } = await supabase
    .from("transactions")
    .select("amount, category_id, categories(name)")
    .eq("org_id", orgId)
    .eq("type", "expense")
    .gte("date", selectedStartIso)
    .lte("date", selectedEndIso)
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

  const lastMonthTx = tx.filter((t) => t.date >= toDateOnly(previousStart) && t.date <= toDateOnly(previousEnd));
  const lastDespesas = lastMonthTx.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const variacao = lastDespesas > 0 ? ((despesasMes - lastDespesas) / lastDespesas) * 100 : 0;

  const previousCategoryTotals: Record<string, number> = {};
  const { data: previousByCategory, error: prevCatError } = await supabase
    .from("transactions")
    .select("amount, category_id, categories(name)")
    .eq("org_id", orgId)
    .eq("type", "expense")
    .gte("date", toDateOnly(previousStart))
    .lte("date", toDateOnly(previousEnd))
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
  const flow90 = tx
    .filter((t) => t.date >= toDateOnly(flow90Start) && t.date <= selectedEndIso)
    .map((item) => {
      runningBalance += signedAmount(item);
      return { date: item.date, saldo: runningBalance };
    });

  let monthSnapshot: Awaited<ReturnType<typeof computeMonthlyMetrics>> | null = null;
  const bucketNames: Record<string, string> = {};

  // Always recompute snapshot so dashboard reflects recent category/bucket changes immediately.
  try {
    monthSnapshot = await computeMonthlyMetrics(supabase, orgId, monthAnchor);
  } catch (snapshotError) {
    console.error("Error computing monthly snapshot:", snapshotError);
  }

  if (!monthSnapshot) {
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
        bucket_data: (snapshotRow.bucket_data ?? []) as {
          bucket_id: string;
          budget: number;
          spend: number;
          spend_pct: number;
          pace_ideal: number;
          projection: number;
        }[],
        day_ratio: Number(snapshotRow.day_ratio ?? 0),
        total_spend: Number(snapshotRow.total_spend ?? 0),
        total_budget: Number(snapshotRow.total_budget ?? 0),
      };
    }
  }

  if (monthSnapshot) {
    const bucketIds = Array.from(new Set(monthSnapshot.bucket_data.map((b) => b.bucket_id)));
    if (bucketIds.length > 0) {
      const { data: buckets } = await supabase
        .from("distribution_buckets")
        .select("id, name")
        .in("id", bucketIds);

      (buckets ?? []).forEach((bucket: { id: string; name: string }) => {
        bucketNames[bucket.id] = bucket.name;
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
  const pendingPct =
    totalExpense > 0
      ? (monthTx.filter((t) => t.type === "expense" && !t.bucket_id).reduce((s, t) => s + Math.abs(Number(t.amount)), 0) /
          totalExpense) *
        100
      : 0;

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
      filter={{
        preset: selectedPreset,
        start: selectedStartIso,
        end: selectedEndIso,
      }}
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
