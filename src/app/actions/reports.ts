"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";
import { isRetroactiveInstallmentBackfill } from "@/lib/transactions/retroactive";

export type CategorySpend = {
  category_id: string | null;
  name: string;
  amount: number;
  pct: number;
  variation: number;
};

export type BucketUsage = {
  bucket_id: string;
  name: string;
  budget: number;
  spend: number;
  spend_pct: number;
};

export type TimeSeriesPoint = {
  date: string;
  label: string;
  categories: Record<string, number>;
  total: number;
};

export type ReportMetrics = {
  categoryRanking: CategorySpend[];
  bucketUsage: BucketUsage[];
  timeSeries: TimeSeriesPoint[];
  fixedVsVariable: { fixed: number; variable: number; income: number };
  waterfall: { label: string; value: number; type: "income" | "expense" | "balance" }[];
  heatmap: { day: number; hour?: number; total: number }[];
  totalIncome: number;
  totalExpense: number;
};

type NameRelation = { name: string } | { name: string }[] | null;

type TransactionRow = {
  id: string;
  amount: number | string;
  date: string;
  type: "income" | "expense" | "transfer";
  category_id: string | null;
  bucket_id: string | null;
  due_date: string | null;
  installment_id: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
  categories: NameRelation;
  distribution_buckets: NameRelation;
};

type PrevTransactionRow = {
  amount: number | string;
  type: "income" | "expense" | "transfer";
  date: string;
  installment_id: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
  category_id: string | null;
};

type DistributionRow = {
  id: string;
};

type DistributionBucketRow = {
  id: string;
  name: string;
  percent_bps: number;
};

type SnapshotRow = {
  base_income: number | string;
};

function relationName(value: NameRelation, fallback: string): string {
  if (!value) return fallback;
  if (Array.isArray(value)) {
    return value[0]?.name ?? fallback;
  }
  return value.name ?? fallback;
}

export async function getReportMetrics(startDate: string, endDate: string): Promise<ReportMetrics> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return emptyMetrics();
  }

  const orgId = await getActiveOrgIdForUser(supabase, user.id);
  if (!orgId) return emptyMetrics();

  const { data: txRows } = await supabase
    .from("transactions")
    .select(
      "id, amount, date, type, category_id, bucket_id, due_date, installment_id, created_at, metadata, categories(name), distribution_buckets(name)"
    )
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  const transactions = ((txRows ?? []) as TransactionRow[]).filter(
    (transaction) => !isRetroactiveInstallmentBackfill(transaction)
  );

  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const durationMs = endMs - startMs;
  const prevStart = new Date(startMs - durationMs).toISOString().slice(0, 10);
  const prevEnd = new Date(startMs - 86400000).toISOString().slice(0, 10);

  const { data: prevRows } = await supabase
    .from("transactions")
    .select("amount, category_id, type, date, installment_id, created_at, metadata")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .gte("date", prevStart)
    .lte("date", prevEnd)
    .eq("type", "expense");

  const prevTransactions = ((prevRows ?? []) as PrevTransactionRow[]).filter(
    (transaction) => !isRetroactiveInstallmentBackfill(transaction)
  );

  const totalIncome = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const expenses = transactions.filter((transaction) => transaction.type === "expense");
  const totalExpense = expenses.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0);

  const categoryTotals: Record<string, { amount: number; name: string }> = {};
  const previousCategoryTotals: Record<string, number> = {};

  expenses.forEach((transaction) => {
    const key = transaction.category_id ?? "none";
    const name = relationName(transaction.categories, "Sem categoria");

    if (!categoryTotals[key]) {
      categoryTotals[key] = { amount: 0, name };
    }

    categoryTotals[key].amount += Math.abs(Number(transaction.amount));
  });

  prevTransactions.forEach((transaction) => {
    const key = transaction.category_id ?? "none";
    previousCategoryTotals[key] = (previousCategoryTotals[key] ?? 0) + Math.abs(Number(transaction.amount));
  });

  const categoryRanking: CategorySpend[] = Object.entries(categoryTotals)
    .map(([categoryId, summary]) => {
      const previous = previousCategoryTotals[categoryId] ?? 0;
      return {
        category_id: categoryId === "none" ? null : categoryId,
        name: summary.name,
        amount: summary.amount,
        pct: totalExpense > 0 ? (summary.amount / totalExpense) * 100 : 0,
        variation: previous > 0 ? ((summary.amount - previous) / previous) * 100 : 0,
      };
    })
    .sort((left, right) => right.amount - left.amount);

  let distributionId: string | null = null;
  const { data: defaultDistribution } = await supabase
    .from("distributions")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  distributionId = (defaultDistribution as DistributionRow | null)?.id ?? null;

  if (!distributionId) {
    const { data: latestDistribution } = await supabase
      .from("distributions")
      .select("id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    distributionId = (latestDistribution as DistributionRow | null)?.id ?? null;
  }

  let configuredBuckets: DistributionBucketRow[] = [];
  if (distributionId) {
    const { data: bucketRows } = await supabase
      .from("distribution_buckets")
      .select("id, name, percent_bps")
      .eq("distribution_id", distributionId)
      .order("sort_order", { ascending: true });

    configuredBuckets = (bucketRows ?? []) as DistributionBucketRow[];
  }

  const monthStr = `${startDate.slice(0, 7)}-01`;
  const { data: snapshotRow } = await supabase
    .from("month_snapshots")
    .select("base_income")
    .eq("org_id", orgId)
    .eq("month", monthStr)
    .maybeSingle();

  const snapshot = snapshotRow as SnapshotRow | null;
  const baseIncome = snapshot ? Number(snapshot.base_income) : totalIncome;

  const bucketMap: Record<string, BucketUsage> = {};
  configuredBuckets.forEach((bucket) => {
    const budget = baseIncome * (Number(bucket.percent_bps) / 10000);
    bucketMap[bucket.id] = {
      bucket_id: bucket.id,
      name: bucket.name,
      budget,
      spend: 0,
      spend_pct: 0,
    };
  });

  expenses.forEach((transaction) => {
    if (!transaction.bucket_id) return;

    const bucket = bucketMap[transaction.bucket_id];
    if (!bucket) return;

    bucket.spend += Math.abs(Number(transaction.amount));
  });

  Object.values(bucketMap).forEach((bucket) => {
    bucket.spend_pct = bucket.budget > 0 ? (bucket.spend / bucket.budget) * 100 : 0;
  });

  const bucketUsage = Object.values(bucketMap).sort((left, right) => right.spend - left.spend);

  const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
  const groupBy: "day" | "week" | "month" = durationDays <= 31 ? "day" : durationDays <= 90 ? "week" : "month";

  const timeSeriesMap: Record<string, TimeSeriesPoint> = {};

  expenses.forEach((transaction) => {
    const date = new Date(`${transaction.date}T12:00:00`);
    let key: string;
    let label: string;

    if (groupBy === "day") {
      key = transaction.date;
      label = `${date.getDate()}/${date.getMonth() + 1}`;
    } else if (groupBy === "week") {
      const day = date.getDay();
      const shift = date.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(date);
      weekStart.setDate(shift);
      key = weekStart.toISOString().slice(0, 10);
      label = `Sem ${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
    } else {
      key = transaction.date.slice(0, 7);
      const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      label = monthNames[date.getMonth()] ?? key;
    }

    if (!timeSeriesMap[key]) {
      timeSeriesMap[key] = {
        date: key,
        label,
        categories: {},
        total: 0,
      };
    }

    const categoryName = relationName(transaction.categories, "Sem categoria");
    const amount = Math.abs(Number(transaction.amount));
    timeSeriesMap[key].categories[categoryName] = (timeSeriesMap[key].categories[categoryName] ?? 0) + amount;
    timeSeriesMap[key].total += amount;
  });

  const timeSeries = Object.values(timeSeriesMap).sort((left, right) => left.date.localeCompare(right.date));

  const fixedAmount = expenses
    .filter((transaction) => Boolean(transaction.due_date) || Boolean(transaction.installment_id))
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0);

  const variableAmount = Math.max(0, totalExpense - fixedAmount);

  const waterfall: { label: string; value: number; type: "income" | "expense" | "balance" }[] = [
    { label: "Receita", value: totalIncome, type: "income" },
  ];

  bucketUsage.forEach((bucket) => {
    waterfall.push({ label: bucket.name, value: -bucket.spend, type: "expense" });
  });

  const uncategorized = expenses
    .filter((transaction) => !transaction.bucket_id)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0);

  if (uncategorized > 0) {
    waterfall.push({ label: "Sem bucket", value: -uncategorized, type: "expense" });
  }

  waterfall.push({ label: "Sobra", value: totalIncome - totalExpense, type: "balance" });

  const dayTotals: Record<number, number> = {};
  expenses.forEach((transaction) => {
    const day = new Date(`${transaction.date}T12:00:00`).getDay();
    dayTotals[day] = (dayTotals[day] ?? 0) + Math.abs(Number(transaction.amount));
  });

  const heatmap = Array.from({ length: 7 }, (_, day) => ({
    day,
    total: dayTotals[day] ?? 0,
  }));

  return {
    categoryRanking,
    bucketUsage,
    timeSeries,
    fixedVsVariable: {
      fixed: fixedAmount,
      variable: variableAmount,
      income: totalIncome,
    },
    waterfall,
    heatmap,
    totalIncome,
    totalExpense,
  };
}

function emptyMetrics(): ReportMetrics {
  return {
    categoryRanking: [],
    bucketUsage: [],
    timeSeries: [],
    fixedVsVariable: { fixed: 0, variable: 0, income: 0 },
    waterfall: [],
    heatmap: [],
    totalIncome: 0,
    totalExpense: 0,
  };
}


