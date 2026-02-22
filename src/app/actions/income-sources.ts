"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";

type OrgSession = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  userId: string;
};

function parseMonthStart(input: string): Date | null {
  const value = input.trim();
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [yearRaw, monthRaw] = value.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
    return new Date(year, month - 1, 1, 12, 0, 0, 0);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [yearRaw, monthRaw] = value.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
    return new Date(year, month - 1, 1, 12, 0, 0, 0);
  }

  return null;
}

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampDay(year: number, monthIndex: number, day: number): number {
  const maxDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.max(1, Math.min(day, maxDay));
}

async function getOrgSession(): Promise<{ data?: OrgSession; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nao autorizado" };
  const orgId = await getActiveOrgIdForUser(supabase, user.id);
  if (!orgId) return { error: "Organizacao nao encontrada" };

  return { data: { supabase, orgId, userId: user.id } };
}

export type SaveIncomeSourceInput = {
  id?: string;
  name: string;
  plannedAmount: number;
  dayOfMonth: number;
  accountId: string;
  categoryId?: string | null;
  isActive?: boolean;
  notes?: string | null;
};

export async function saveIncomeSource(input: SaveIncomeSourceInput): Promise<{ error?: string; id?: string }> {
  const orgSession = await getOrgSession();
  if (!orgSession.data) return { error: orgSession.error };

  const { supabase, orgId } = orgSession.data;
  const name = input.name.trim();
  const plannedAmount = Number(input.plannedAmount);
  const dayOfMonth = Number(input.dayOfMonth);
  const categoryId = input.categoryId ?? null;

  if (!name) return { error: "Informe o nome da fonte de renda." };
  if (!Number.isFinite(plannedAmount) || plannedAmount < 0) return { error: "Valor planejado invalido." };
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return { error: "Dia invalido." };
  if (!input.accountId) return { error: "Conta de recebimento obrigatoria." };

  const { data: accountRow, error: accountError } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", input.accountId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (accountError) return { error: accountError.message };
  if (!accountRow?.id) return { error: "Conta de recebimento invalida para a organizacao atual." };

  if (categoryId) {
    const { data: categoryRow, error: categoryError } = await supabase
      .from("categories")
      .select("id, type")
      .eq("id", categoryId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (categoryError) return { error: categoryError.message };
    if (!categoryRow?.id) return { error: "Categoria invalida para a organizacao atual." };
    if (categoryRow.type !== "income") return { error: "A categoria da fonte precisa ser do tipo receita." };
  }

  const payload = {
    org_id: orgId,
    name,
    planned_amount: plannedAmount,
    day_of_month: dayOfMonth,
    account_id: input.accountId,
    category_id: categoryId,
    is_active: input.isActive ?? true,
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("income_sources")
      .update(payload)
      .eq("id", input.id)
      .eq("org_id", orgId)
      .select("id")
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data?.id) return { error: "Fonte de renda nao encontrada." };

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/cadastros");
    return { id: data.id };
  }

  const { data, error } = await supabase
    .from("income_sources")
    .insert(payload)
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cadastros");
  return { id: data.id };
}

export async function toggleIncomeSourceActive(input: { id: string; isActive: boolean }): Promise<{ error?: string }> {
  const orgSession = await getOrgSession();
  if (!orgSession.data) return { error: orgSession.error };

  const { supabase, orgId } = orgSession.data;
  const { error } = await supabase
    .from("income_sources")
    .update({ is_active: input.isActive, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cadastros");
  return {};
}

export async function generateIncomeRunsForMonth(input: {
  month: string;
}): Promise<{ error?: string; created?: number; updated?: number }> {
  const orgSession = await getOrgSession();
  if (!orgSession.data) return { error: orgSession.error };

  const { supabase, orgId } = orgSession.data;
  const monthDate = parseMonthStart(input.month);
  if (!monthDate) return { error: "Mes invalido." };

  const monthIso = toIsoDate(monthDate);

  const { data: sources, error: sourceError } = await supabase
    .from("income_sources")
    .select("id, planned_amount, day_of_month")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("name");

  if (sourceError) return { error: sourceError.message };
  if (!sources?.length) return { created: 0, updated: 0 };

  const sourceIds = sources.map((source) => source.id);
  const { data: existingRuns, error: existingError } = await supabase
    .from("income_source_runs")
    .select("id, source_id, status")
    .eq("org_id", orgId)
    .eq("month", monthIso)
    .in("source_id", sourceIds);

  if (existingError) return { error: existingError.message };
  const existingBySource = new Map((existingRuns ?? []).map((run) => [run.source_id, run]));

  const createRows: Array<{
    org_id: string;
    source_id: string;
    month: string;
    expected_date: string;
    planned_amount: number;
  }> = [];
  const pendingUpdateRows: Array<{
    id: string;
    expected_date: string;
    planned_amount: number;
    updated_at: string;
  }> = [];

  for (const source of sources) {
    const safeDay = clampDay(monthDate.getFullYear(), monthDate.getMonth(), Number(source.day_of_month));
    const expectedDate = toIsoDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), safeDay, 12, 0, 0, 0));
    const existing = existingBySource.get(source.id);

    if (!existing) {
      createRows.push({
        org_id: orgId,
        source_id: source.id,
        month: monthIso,
        expected_date: expectedDate,
        planned_amount: Number(source.planned_amount),
      });
      continue;
    }

    if (existing.status === "pending") {
      pendingUpdateRows.push({
        id: existing.id,
        expected_date: expectedDate,
        planned_amount: Number(source.planned_amount),
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (createRows.length > 0) {
    const { error: createError } = await supabase.from("income_source_runs").insert(createRows);
    if (createError) return { error: createError.message };
  }

  for (const row of pendingUpdateRows) {
    const { error: updateError } = await supabase
      .from("income_source_runs")
      .update({
        expected_date: row.expected_date,
        planned_amount: row.planned_amount,
        updated_at: row.updated_at,
      })
      .eq("id", row.id)
      .eq("org_id", orgId);

    if (updateError) return { error: updateError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cadastros");
  return { created: createRows.length, updated: pendingUpdateRows.length };
}

type RunRelation = {
  id: string;
  name: string;
  account_id: string;
  category_id: string | null;
};

function relationOne(
  relation: RunRelation | RunRelation[] | null | undefined
): RunRelation | null {
  if (!relation) return null;
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation;
}

export async function markIncomeRunAsReceived(input: {
  runId: string;
  receivedAmount: number;
  receivedDate: string;
}): Promise<{ error?: string; transactionId?: string }> {
  const orgSession = await getOrgSession();
  if (!orgSession.data) return { error: orgSession.error };

  const { supabase, orgId, userId } = orgSession.data;
  const receivedAmount = Number(input.receivedAmount);
  if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) {
    return { error: "Valor recebido invalido." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receivedDate)) {
    return { error: "Data de recebimento invalida." };
  }

  const { data: run, error: runError } = await supabase
    .from("income_source_runs")
    .select("id, source_id, planned_amount, status, income_sources(id, name, account_id, category_id)")
    .eq("id", input.runId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (runError) return { error: runError.message };
  if (!run) return { error: "Pre-lancamento nao encontrado." };
  if (run.status === "received") return { error: "Este pre-lancamento ja foi recebido." };

  const source = relationOne(run.income_sources as RunRelation | RunRelation[] | null | undefined);
  if (!source?.account_id) {
    return { error: "Fonte sem conta de destino. Edite a fonte de renda e tente novamente." };
  }

  const description = `Recebimento: ${source.name}`;
  const metadata = {
    income_source_id: source.id,
    income_run_id: run.id,
    planned_amount: Number(run.planned_amount),
  };

  const { data: txRow, error: txError } = await supabase
    .from("transactions")
    .insert({
      org_id: orgId,
      type: "income",
      status: "cleared",
      amount: receivedAmount,
      account_id: source.account_id,
      category_id: source.category_id,
      description,
      date: input.receivedDate,
      metadata,
      created_by: userId,
    })
    .select("id")
    .single();

  if (txError) return { error: txError.message };

  const { error: updateRunError } = await supabase
    .from("income_source_runs")
    .update({
      status: "received",
      actual_amount: receivedAmount,
      received_at: new Date().toISOString(),
      transaction_id: txRow.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("org_id", orgId);

  if (updateRunError) return { error: updateRunError.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cadastros");
  revalidatePath("/dashboard/lancamentos");
  return { transactionId: txRow.id };
}

export async function updateIncomeRun(input: {
  runId: string;
  plannedAmount: number;
  expectedDate: string;
  status: "pending" | "skipped" | "cancelled";
}): Promise<{ error?: string }> {
  const orgSession = await getOrgSession();
  if (!orgSession.data) return { error: orgSession.error };

  const { supabase, orgId } = orgSession.data;
  const plannedAmount = Number(input.plannedAmount);
  const expectedDate = input.expectedDate.trim();

  if (!Number.isFinite(plannedAmount) || plannedAmount < 0) {
    return { error: "Valor planejado invalido." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) {
    return { error: "Data prevista invalida." };
  }

  if (!["pending", "skipped", "cancelled"].includes(input.status)) {
    return { error: "Status invalido para pre-lancamento." };
  }

  const { data: run, error: runError } = await supabase
    .from("income_source_runs")
    .select("id, status, transaction_id")
    .eq("id", input.runId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (runError) return { error: runError.message };
  if (!run) return { error: "Pre-lancamento nao encontrado." };
  if (run.status === "received" || run.transaction_id) {
    return { error: "Nao e possivel editar um pre-lancamento ja recebido." };
  }

  const { error: updateError } = await supabase
    .from("income_source_runs")
    .update({
      planned_amount: plannedAmount,
      expected_date: expectedDate,
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.runId)
    .eq("org_id", orgId);

  if (updateError) return { error: updateError.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cadastros");
  return {};
}
