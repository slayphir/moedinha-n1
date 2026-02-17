"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";

export type ReductionSuggestion = {
  category_id: string | null;
  category_name: string;
  current_spend: number;
  suggested_target: number;
  saving: number;
  difficulty: "easy" | "medium" | "hard";
  tip: string;
};

export type ReductionPlan = {
  total_current: number;
  total_target: number;
  total_saving: number;
  saving_pct: number;
  suggestions: ReductionSuggestion[];
};

type NameRelation = { name: string } | { name: string }[] | null;

type ExpenseRow = {
  amount: number | string;
  category_id: string | null;
  categories: NameRelation;
  due_date: string | null;
  installment_id: string | null;
};

function relationName(value: NameRelation, fallback: string): string {
  if (!value) return fallback;
  if (Array.isArray(value)) {
    return value[0]?.name ?? fallback;
  }
  return value.name ?? fallback;
}

export async function generateReductionPlan(
  startDate: string,
  endDate: string,
  targetSavingPct?: number
): Promise<ReductionPlan> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return emptyPlan();

  const orgId = await getActiveOrgIdForUser(supabase, user.id);
  if (!orgId) return emptyPlan();

  const savePct = targetSavingPct ?? 15;

  const { data: txRows } = await supabase
    .from("transactions")
    .select("amount, category_id, categories(name), due_date, installment_id")
    .eq("org_id", orgId)
    .eq("type", "expense")
    .is("deleted_at", null)
    .gte("date", startDate)
    .lte("date", endDate);

  const expenses = (txRows ?? []) as ExpenseRow[];
  const categoryMap: Record<string, { name: string; amount: number; isFixed: boolean }> = {};

  expenses.forEach((row) => {
    const key = row.category_id ?? "none";
    const name = relationName(row.categories, "Sem categoria");
    const isFixedLike = Boolean(row.due_date) || Boolean(row.installment_id);

    if (!categoryMap[key]) {
      categoryMap[key] = { name, amount: 0, isFixed: true };
    }

    categoryMap[key].amount += Math.abs(Number(row.amount));

    if (!isFixedLike) {
      categoryMap[key].isFixed = false;
    }
  });

  const totalCurrent = Object.values(categoryMap).reduce((sum, category) => sum + category.amount, 0);

  const sortedCategories = Object.entries(categoryMap).sort(([, left], [, right]) => right.amount - left.amount);

  const suggestions: ReductionSuggestion[] = sortedCategories.map(([id, category]) => {
    let reductionPct: number;
    let difficulty: "easy" | "medium" | "hard";
    let tip: string;

    if (category.isFixed) {
      reductionPct = 5;
      difficulty = "hard";
      tip = "Custos recorrentes exigem renegociacao ou troca de contrato para reduzir.";
    } else if (totalCurrent > 0 && category.amount / totalCurrent > 0.15) {
      reductionPct = 20;
      difficulty = "medium";
      tip = "Categoria com peso alto. Defina limite semanal e acompanhe as compras.";
    } else {
      reductionPct = 10;
      difficulty = "easy";
      tip = "Ajustes de rotina podem gerar economia sem grande impacto no dia a dia.";
    }

    const suggestedTarget = category.amount * (1 - reductionPct / 100);
    const saving = category.amount - suggestedTarget;

    return {
      category_id: id === "none" ? null : id,
      category_name: category.name,
      current_spend: category.amount,
      suggested_target: suggestedTarget,
      saving,
      difficulty,
      tip,
    };
  });

  const totalSaving = suggestions.reduce((sum, suggestion) => sum + suggestion.saving, 0);
  const totalTarget = totalCurrent - totalSaving;

  return {
    total_current: totalCurrent,
    total_target: totalTarget,
    total_saving: totalSaving,
    saving_pct: totalCurrent > 0 ? (totalSaving / totalCurrent) * 100 : savePct,
    suggestions,
  };
}

function emptyPlan(): ReductionPlan {
  return {
    total_current: 0,
    total_target: 0,
    total_saving: 0,
    saving_pct: 0,
    suggestions: [],
  };
}


