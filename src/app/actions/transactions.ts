"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { TransactionType } from "@/lib/types/database";

export type UpdateScope = "single" | "forward" | "all";
export type AmountMode = "installment" | "total";

export type UpdateInput = {
  id: string;
  description?: string;
  amount?: number;
  date?: string;
  status?: "pending" | "cleared";
  category_id?: string | null;
  account_id?: string;
  contact_id?: string | null;
  tags?: string[];
  scope?: UpdateScope;
  installment_id?: string | null;
  amount_mode?: AmountMode;
};

type CreateInput = {
  type: TransactionType;
  amount: number;
  date: string;
  account_id: string;
  transfer_account_id: string | null;
  category_id: string | null;
  description: string | null;
};

export type DeleteInput = {
  scope?: UpdateScope;
  installment_id?: string | null;
};

type SeriesRow = {
  id: string;
  date: string;
  due_date: string | null;
  description: string | null;
};

function hasOwnField<T extends object>(input: T, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function splitAmountByCount(totalAbs: number, count: number): number[] {
  const cents = Math.round(totalAbs * 100);
  const base = Math.floor(cents / count);
  const remainder = cents % count;
  return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

const INSTALLMENT_SUFFIX_REGEX = /\s*\((\d{1,3})\s*\/\s*(\d{1,3})\)\s*$/;

function stripInstallmentSuffix(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(INSTALLMENT_SUFFIX_REGEX, "").trim();
}

function formatDescriptionForSeries(nextDescription: string | undefined, currentDescription: string | null): string | null {
  const normalizedNext = stripInstallmentSuffix(nextDescription);
  const suffixMatch = currentDescription?.match(INSTALLMENT_SUFFIX_REGEX);

  if (!suffixMatch) {
    if (normalizedNext) return normalizedNext;
    return currentDescription ?? null;
  }

  const currentBase = stripInstallmentSuffix(currentDescription);
  const base = normalizedNext || currentBase || "Parcela";
  return `${base} (${suffixMatch[1]}/${suffixMatch[2]})`;
}

async function resolveTargetSeriesRows(params: {
  orgId: string;
  txId: string;
  scope: UpdateScope;
  installmentId: string | null;
}) {
  const { orgId, txId, scope, installmentId } = params;
  const supabase = await createClient();

  const { data: currentTx, error: currentTxError } = await supabase
    .from("transactions")
    .select("id, date, due_date, description")
    .eq("id", txId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single();

  if (currentTxError || !currentTx) {
    return { error: currentTxError?.message ?? "Lancamento nao encontrado" as string };
  }

  if (scope === "single" || !installmentId) {
    return {
      rows: [
        {
          id: currentTx.id,
          date: currentTx.date,
          due_date: currentTx.due_date ?? null,
          description: currentTx.description ?? null,
        },
      ] as SeriesRow[],
    };
  }

  const { data: seriesRows, error: seriesError } = await supabase
    .from("transactions")
    .select("id, date, due_date, description")
    .eq("org_id", orgId)
    .eq("installment_id", installmentId)
    .is("deleted_at", null)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });

  if (seriesError) return { error: seriesError.message as string };

  const rows = (seriesRows ?? []) as SeriesRow[];
  const currentIndex = rows.findIndex((row) => row.id === txId);
  if (currentIndex < 0) {
    return {
      rows: [
        {
          id: currentTx.id,
          date: currentTx.date,
          due_date: currentTx.due_date ?? null,
          description: currentTx.description ?? null,
        },
      ] as SeriesRow[],
    };
  }

  if (scope === "all") return { rows };
  return { rows: rows.slice(currentIndex) };
}

export async function createTransaction(orgId: string, input: CreateInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autorizado" };

  let resolvedBucketId: string | null = null;
  if (input.type !== "transfer" && input.category_id) {
    const { data: category, error: categoryError } = await supabase
      .from("categories")
      .select("default_bucket_id")
      .eq("org_id", orgId)
      .eq("id", input.category_id)
      .maybeSingle();

    if (categoryError) return { error: categoryError.message };
    if (!category) return { error: "Categoria invalida" };
    resolvedBucketId = category.default_bucket_id ?? null;
  }

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      org_id: orgId,
      type: input.type,
      status: "cleared",
      amount: input.amount,
      currency: "BRL",
      account_id: input.account_id,
      transfer_account_id: input.transfer_account_id,
      category_id: input.category_id,
      bucket_id: resolvedBucketId,
      description: input.description,
      date: input.date,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    org_id: orgId,
    user_id: user.id,
    action: "create",
    table_name: "transactions",
    record_id: data.id,
    new_data: input as unknown as Record<string, unknown>,
    origin: "UI",
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/lancamentos");
  revalidatePath("/dashboard/faturas");
  revalidatePath("/dashboard/cartoes/[id]", "page");
  return { data };
}

export async function updateTransaction(orgId: string, input: UpdateInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autorizado" };

  const { data: txMeta, error: txMetaError } = await supabase
    .from("transactions")
    .select("id, type, installment_id")
    .eq("id", input.id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single();

  if (txMetaError || !txMeta) return { error: txMetaError?.message ?? "Lancamento nao encontrado" };

  const scope = input.scope ?? "single";
  const amountMode = input.amount_mode ?? "installment";
  const effectiveInstallmentId = input.installment_id ?? txMeta.installment_id ?? null;
  const isSeriesBulkUpdate = scope !== "single" && Boolean(effectiveInstallmentId);

  if (isSeriesBulkUpdate) {
    const forbiddenFields = ["description", "amount", "date", "status", "account_id", "contact_id"] as const;
    const hasForbiddenField = forbiddenFields.some((field) => hasOwnField(input, field));
    if (hasForbiddenField) {
      return { error: "Na edicao em massa de parcelas, altere somente categoria e adicao de tags." };
    }

    const hasCategoryField = hasOwnField(input, "category_id");
    const hasTagsToAdd = hasOwnField(input, "tags") && Array.isArray(input.tags) && input.tags.length > 0;
    if (!hasCategoryField && !hasTagsToAdd) {
      return { error: "Selecione uma categoria ou pelo menos uma tag para aplicar na serie." };
    }
  }

  const targetRowsResult = await resolveTargetSeriesRows({
    orgId,
    txId: input.id,
    scope,
    installmentId: effectiveInstallmentId,
  });

  if ("error" in targetRowsResult && targetRowsResult.error) return { error: targetRowsResult.error };
  const targetRows = targetRowsResult.rows ?? [];
  if (targetRows.length === 0) return { error: "Nenhum lancamento alvo encontrado" };

  const sign = txMeta.type === "expense" ? -1 : 1;
  const absAmount = input.amount != null ? Math.abs(Number(input.amount)) : null;
  const splitParts =
    absAmount != null && amountMode === "total" && targetRows.length > 1
      ? splitAmountByCount(absAmount, targetRows.length)
      : null;

  let resolvedBucketId: string | null | undefined;
  if (hasOwnField(input, "category_id")) {
    if (txMeta.type === "transfer") {
      resolvedBucketId = null;
    } else if (!input.category_id) {
      resolvedBucketId = null;
    } else {
      const { data: category, error: categoryError } = await supabase
        .from("categories")
        .select("default_bucket_id")
        .eq("org_id", orgId)
        .eq("id", input.category_id)
        .maybeSingle();

      if (categoryError) return { error: categoryError.message };
      if (!category) return { error: "Categoria invalida" };
      resolvedBucketId = category.default_bucket_id ?? null;
    }
  }

  const updatePromises = targetRows.map((targetRow, index) => {
    const patch: Record<string, unknown> = {};

    if (hasOwnField(input, "description")) {
      patch.description = effectiveInstallmentId
        ? formatDescriptionForSeries(input.description, targetRow.description)
        : input.description;
    }
    if (hasOwnField(input, "status")) patch.status = input.status;
    if (hasOwnField(input, "account_id")) patch.account_id = input.account_id;
    if (hasOwnField(input, "contact_id")) patch.contact_id = input.contact_id;
    if (hasOwnField(input, "category_id")) {
      patch.category_id = txMeta.type === "transfer" ? null : input.category_id ?? null;
      patch.bucket_id = resolvedBucketId ?? null;
    }

    if (absAmount != null) {
      const amountValue = splitParts ? splitParts[index] : absAmount;
      patch.amount = amountValue * sign;
    }

    if (targetRows.length === 1 && input.date) {
      patch.date = input.date;
    }

    return supabase
      .from("transactions")
      .update(patch)
      .eq("id", targetRow.id)
      .eq("org_id", orgId);
  });

  const updateResults = await Promise.all(updatePromises);
  const updateError = updateResults.find((result) => result.error)?.error;
  if (updateError) return { error: updateError.message };

  const hasTagsField = hasOwnField(input, "tags");
  const tagsToApply = Array.isArray(input.tags) ? Array.from(new Set(input.tags.filter(Boolean))) : [];

  if (hasTagsField) {
    const targetIds = targetRows.map((row) => row.id);

    if (isSeriesBulkUpdate) {
      if (tagsToApply.length > 0) {
        const { data: existingTagLinks, error: existingTagsError } = await supabase
          .from("transaction_tags")
          .select("transaction_id, tag_id")
          .in("transaction_id", targetIds);

        if (existingTagsError) return { error: existingTagsError.message };

        const existingPairs = new Set(
          (existingTagLinks ?? []).map((row) => `${row.transaction_id}:${row.tag_id}`)
        );
        const tagLinks = targetRows.flatMap((row) =>
          tagsToApply
            .filter((tagId) => !existingPairs.has(`${row.id}:${tagId}`))
            .map((tagId) => ({
              transaction_id: row.id,
              tag_id: tagId,
            }))
        );

        if (tagLinks.length > 0) {
          const { error: insertTagsError } = await supabase.from("transaction_tags").insert(tagLinks);
          if (insertTagsError) return { error: insertTagsError.message };
        }
      }
    } else {
      const { error: clearTagsError } = await supabase
        .from("transaction_tags")
        .delete()
        .in("transaction_id", targetIds);

      if (clearTagsError) return { error: clearTagsError.message };

      if (tagsToApply.length > 0) {
        const tagLinks = targetRows.flatMap((row) =>
          tagsToApply.map((tagId) => ({
            transaction_id: row.id,
            tag_id: tagId,
          }))
        );
        const { error: insertTagsError } = await supabase.from("transaction_tags").insert(tagLinks);
        if (insertTagsError) return { error: insertTagsError.message };
      }
    }
  }

  await supabase.from("audit_logs").insert({
    org_id: orgId,
    user_id: user.id,
    action: "update",
    table_name: "transactions",
    record_id: input.id,
    new_data: {
      ...input,
      target_ids: targetRows.map((row) => row.id),
    } as unknown as Record<string, unknown>,
    origin: "UI",
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/lancamentos");
  revalidatePath("/dashboard/faturas");
  revalidatePath("/dashboard/cartoes/[id]", "page");
  return { success: true };
}

export async function deleteTransaction(orgId: string, id: string, input?: DeleteInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autorizado" };

  const { data: txMeta, error: txMetaError } = await supabase
    .from("transactions")
    .select("id, installment_id")
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single();

  if (txMetaError || !txMeta) return { error: txMetaError?.message ?? "Lancamento nao encontrado" };

  const scope = input?.scope ?? "single";
  const effectiveInstallmentId = input?.installment_id ?? txMeta.installment_id ?? null;

  const targetRowsResult = await resolveTargetSeriesRows({
    orgId,
    txId: id,
    scope,
    installmentId: effectiveInstallmentId,
  });

  if ("error" in targetRowsResult && targetRowsResult.error) return { error: targetRowsResult.error };

  const targetIds = (targetRowsResult.rows ?? []).map((row) => row.id);
  if (targetIds.length === 0) return { error: "Nenhum lancamento alvo encontrado" };

  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", targetIds)
    .eq("org_id", orgId);

  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    org_id: orgId,
    user_id: user.id,
    action: "delete",
    table_name: "transactions",
    record_id: id,
    old_data: { target_ids: targetIds } as unknown as Record<string, unknown>,
    origin: "UI",
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/lancamentos");
  revalidatePath("/dashboard/faturas");
  revalidatePath("/dashboard/cartoes/[id]", "page");
  return { success: true };
}

export async function deleteTransactionsBulk(orgId: string, ids: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autorizado" };

  const uniqueIds = Array.from(new Set((ids ?? []).filter(Boolean)));
  if (uniqueIds.length === 0) return { error: "Nenhum lancamento selecionado" };

  const { data: existingRows, error: existingError } = await supabase
    .from("transactions")
    .select("id")
    .eq("org_id", orgId)
    .in("id", uniqueIds)
    .is("deleted_at", null);

  if (existingError) return { error: existingError.message };

  const targetIds = (existingRows ?? []).map((row) => row.id);
  if (targetIds.length === 0) return { error: "Nenhum lancamento alvo encontrado" };

  const { error: deleteError } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .in("id", targetIds);

  if (deleteError) return { error: deleteError.message };

  await supabase.from("audit_logs").insert({
    org_id: orgId,
    user_id: user.id,
    action: "delete",
    table_name: "transactions",
    old_data: { target_ids: targetIds } as unknown as Record<string, unknown>,
    origin: "UI",
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/lancamentos");
  revalidatePath("/dashboard/faturas");
  revalidatePath("/dashboard/cartoes/[id]", "page");
  return { success: true, count: targetIds.length };
}
