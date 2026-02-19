"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";
import { revalidatePath } from "next/cache";

export type UpsertBudgetInput = {
  categoryId: string;
  month: string; // YYYY-MM-01
  amount: number;
  alertThreshold: number; // percentual (0-100)
};

export type UpsertBudgetBatchInput = {
  month: string; // YYYY-MM-01
  items: Array<{
    categoryId: string;
    amount: number;
    alertThreshold: number; // percentual (0-100)
  }>;
};

async function getOrgIdFromSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, orgId: null as string | null, error: "Nao autorizado" };

  const orgId = await getActiveOrgIdForUser(supabase, user.id);
  if (!orgId) {
    return { supabase, orgId: null as string | null, error: "Organizacao nao encontrada" };
  }

  return { supabase, orgId, error: null as string | null };
}

export async function upsertCategoryBudget(input: UpsertBudgetInput): Promise<{ error?: string }> {
  const { supabase, orgId, error } = await getOrgIdFromSession();
  if (error || !orgId) return { error: error ?? "Organizacao nao encontrada" };

  const amount = Number(input.amount);
  const alertThreshold = Number(input.alertThreshold);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Informe um limite valido maior que zero." };
  }
  if (!Number.isFinite(alertThreshold) || alertThreshold < 0 || alertThreshold > 100) {
    return { error: "Threshold deve estar entre 0 e 100." };
  }

  const { error: upsertError } = await supabase.from("budgets").upsert(
    {
      org_id: orgId,
      category_id: input.categoryId,
      month: input.month,
      amount,
      alert_threshold: alertThreshold,
    },
    { onConflict: "org_id,category_id,month" }
  );

  if (upsertError) return { error: upsertError.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cadastros");
  return {};
}

export async function upsertCategoryBudgetsBatch(input: UpsertBudgetBatchInput): Promise<{ error?: string; count?: number }> {
  const { supabase, orgId, error } = await getOrgIdFromSession();
  if (error || !orgId) return { error: error ?? "Organizacao nao encontrada" };

  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { error: "Nenhum item informado." };
  }

  const deduped = new Map<string, { amount: number; alertThreshold: number }>();
  for (const item of input.items) {
    if (!item?.categoryId) continue;
    deduped.set(item.categoryId, {
      amount: Number(item.amount),
      alertThreshold: Number(item.alertThreshold),
    });
  }

  if (deduped.size === 0) {
    return { error: "Nenhuma categoria valida para salvar." };
  }

  const rows: Array<{
    org_id: string;
    category_id: string;
    month: string;
    amount: number;
    alert_threshold: number;
  }> = [];

  for (const [categoryId, values] of deduped.entries()) {
    if (!Number.isFinite(values.amount) || values.amount <= 0) {
      return { error: `Valor invalido para categoria ${categoryId}.` };
    }
    if (!Number.isFinite(values.alertThreshold) || values.alertThreshold < 0 || values.alertThreshold > 100) {
      return { error: `Threshold invalido para categoria ${categoryId}.` };
    }

    rows.push({
      org_id: orgId,
      category_id: categoryId,
      month: input.month,
      amount: values.amount,
      alert_threshold: values.alertThreshold,
    });
  }

  const { error: upsertError } = await supabase.from("budgets").upsert(rows, {
    onConflict: "org_id,category_id,month",
  });

  if (upsertError) return { error: upsertError.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cadastros");
  return { count: rows.length };
}

export async function deleteCategoryBudget(input: {
  categoryId: string;
  month: string;
}): Promise<{ error?: string }> {
  const { supabase, orgId, error } = await getOrgIdFromSession();
  if (error || !orgId) return { error: error ?? "Organizacao nao encontrada" };

  const { error: deleteError } = await supabase
    .from("budgets")
    .delete()
    .eq("org_id", orgId)
    .eq("category_id", input.categoryId)
    .eq("month", input.month);

  if (deleteError) return { error: deleteError.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cadastros");
  return {};
}

export async function getBudgetOverview(orgId: string, monthStr: string) {
  const supabase = await createClient();

  const monthBase = new Date(`${monthStr}-01T12:00:00`);
  const monthStart = monthBase.toISOString().slice(0, 8) + "01";
  // Approx end of month for filter
  const nextMonth = new Date(monthBase);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthEnd = nextMonth.toISOString().slice(0, 10);

  const [budgets, categories, txMonth] = await Promise.all([
    supabase
      .from("budgets")
      .select("id, category_id, amount, alert_threshold")
      .eq("org_id", orgId)
      .eq("month", monthStart),
    supabase.from("categories").select("id, name, type").eq("org_id", orgId).order("name"),
    supabase
      .from("transactions")
      .select("category_id, amount")
      .eq("org_id", orgId)
      .eq("type", "expense")
      .is("deleted_at", null)
      .gte("date", monthStart)
      .lt("date", monthEnd), // lt next month start
  ]);

  const spentByCategory: Record<string, number> = {};
  (txMonth.data ?? []).forEach((row) => {
    if (!row.category_id) return;
    spentByCategory[row.category_id] = (spentByCategory[row.category_id] ?? 0) + Math.abs(Number(row.amount));
  });

  // Combine all categories with their budgets (or lack thereof)
  // Actually, user might want to see ONLY defined budgets, or ALL categories to add budgets.
  // Let's return a list of defined budgets + a list of categories without budgets could be useful for UI.

  type BudgetOverviewRow = {
    id: string;
    categoryId: string;
    categoryName: string;
    amount: number;
    alert_threshold: number;
    spent: number;
    usage_pct: number;
    near_limit: boolean;
    over_limit: boolean;
  };

  const budgetMap: Record<string, BudgetOverviewRow> = {};

  (budgets.data ?? []).forEach((row) => {
    const cat = categories.data?.find(c => c.id === row.category_id);
    const amount = Number(row.amount);
    const spent = spentByCategory[row.category_id] ?? 0;
    const usage = amount > 0 ? (spent / amount) * 100 : 0;
    const threshold = Number(row.alert_threshold ?? 80);

    budgetMap[row.category_id] = {
      id: row.id,
      categoryId: row.category_id,
      categoryName: cat?.name ?? "Desconhecida",
      amount,
      alert_threshold: threshold,
      spent,
      usage_pct: usage,
      near_limit: usage >= threshold && usage < 100,
      over_limit: usage >= 100,
    };
  });

  return {
    budgets: Object.values(budgetMap),
    categories: categories.data ?? []
  };
}
