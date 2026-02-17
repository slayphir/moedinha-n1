"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";

export type CategoryDetail = {
  id: string;
  date: string;
  amount: number;
  description?: string;
  bucket_name?: string;
};

export type CategoryTrend = {
  month: string;
  label: string;
  amount: number;
};

export type CategoryDrilldown = {
  categoryName: string;
  totalSpend: number;
  pctOfTotal: number;
  variationVsPrev: number;
  transactions: CategoryDetail[];
  trend: CategoryTrend[];
};

type BucketRelation = { name: string } | { name: string }[] | null;

type DrilldownTransactionRow = {
  id: string;
  date: string;
  amount: number | string;
  description: string | null;
  distribution_buckets: BucketRelation;
};

type AmountRow = {
  amount: number | string;
};

type TrendRow = {
  date: string;
  amount: number | string;
};

function relationName(relation: BucketRelation): string | undefined {
  if (!relation) return undefined;
  if (Array.isArray(relation)) {
    return relation[0]?.name;
  }
  return relation.name;
}

export async function getCategoryDrilldown(
  categoryId: string | null,
  startDate: string,
  endDate: string
): Promise<CategoryDrilldown | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const orgId = await getActiveOrgIdForUser(supabase, user.id);
  if (!orgId) return null;

  let categoryName = "Sem categoria";
  if (categoryId) {
    const { data: category } = await supabase
      .from("categories")
      .select("name")
      .eq("id", categoryId)
      .single();

    if (category?.name) {
      categoryName = category.name;
    }
  }

  let transactionQuery = supabase
    .from("transactions")
    .select("id, date, amount, description, bucket_id, distribution_buckets(name)")
    .eq("org_id", orgId)
    .eq("type", "expense")
    .is("deleted_at", null)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: false });

  if (categoryId) {
    transactionQuery = transactionQuery.eq("category_id", categoryId);
  } else {
    transactionQuery = transactionQuery.is("category_id", null);
  }

  const { data: transactionRows } = await transactionQuery;
  const transactions: CategoryDetail[] = ((transactionRows ?? []) as DrilldownTransactionRow[]).map((row) => ({
    id: row.id,
    date: row.date,
    amount: Math.abs(Number(row.amount)),
    description: row.description ?? undefined,
    bucket_name: relationName(row.distribution_buckets),
  }));

  const totalSpend = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);

  const { data: totalRows } = await supabase
    .from("transactions")
    .select("amount")
    .eq("org_id", orgId)
    .eq("type", "expense")
    .is("deleted_at", null)
    .gte("date", startDate)
    .lte("date", endDate);

  const totalAll = ((totalRows ?? []) as AmountRow[]).reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
  const pctOfTotal = totalAll > 0 ? (totalSpend / totalAll) * 100 : 0;

  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const durationMs = endMs - startMs;
  const prevStart = new Date(startMs - durationMs).toISOString().slice(0, 10);
  const prevEnd = new Date(startMs - 86400000).toISOString().slice(0, 10);

  let previousQuery = supabase
    .from("transactions")
    .select("amount")
    .eq("org_id", orgId)
    .eq("type", "expense")
    .is("deleted_at", null)
    .gte("date", prevStart)
    .lte("date", prevEnd);

  if (categoryId) {
    previousQuery = previousQuery.eq("category_id", categoryId);
  } else {
    previousQuery = previousQuery.is("category_id", null);
  }

  const { data: previousRows } = await previousQuery;
  const prevTotal = ((previousRows ?? []) as AmountRow[]).reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
  const variationVsPrev = prevTotal > 0 ? ((totalSpend - prevTotal) / prevTotal) * 100 : 0;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const trendStart = sixMonthsAgo.toISOString().slice(0, 10);

  let trendQuery = supabase
    .from("transactions")
    .select("date, amount")
    .eq("org_id", orgId)
    .eq("type", "expense")
    .is("deleted_at", null)
    .gte("date", trendStart)
    .order("date", { ascending: true });

  if (categoryId) {
    trendQuery = trendQuery.eq("category_id", categoryId);
  } else {
    trendQuery = trendQuery.is("category_id", null);
  }

  const { data: trendRows } = await trendQuery;
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const trendMap: Record<string, number> = {};

  ((trendRows ?? []) as TrendRow[]).forEach((row) => {
    const key = row.date.slice(0, 7);
    trendMap[key] = (trendMap[key] ?? 0) + Math.abs(Number(row.amount));
  });

  const trend: CategoryTrend[] = Object.entries(trendMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => {
      const monthIndex = Number.parseInt(month.slice(5, 7), 10) - 1;
      return {
        month,
        label: months[monthIndex] ?? month,
        amount,
      };
    });

  return {
    categoryName,
    totalSpend,
    pctOfTotal,
    variationVsPrev,
    transactions,
    trend,
  };
}


