"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";

export type AssignBucketBatchInput = {
  categoryIds: string[];
  bucketId: string;
  applyToExistingTransactions?: boolean;
};

export async function assignBucketToCategoriesBatch(
  input: AssignBucketBatchInput
): Promise<{ error?: string; updatedCategories?: number; updatedTransactions?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nao autorizado" };

  const orgId = await getActiveOrgIdForUser(supabase, user.id);
  if (!orgId) return { error: "Organizacao nao encontrada" };

  const bucketId = input.bucketId?.trim();
  if (!bucketId) return { error: "Selecione um bucket valido." };

  const dedupedIds = Array.from(new Set((input.categoryIds ?? []).filter(Boolean)));
  if (dedupedIds.length === 0) {
    return { error: "Nenhuma categoria selecionada." };
  }

  const { data: bucketRow, error: bucketError } = await supabase
    .from("distribution_buckets")
    .select("id, distribution_id")
    .eq("id", bucketId)
    .maybeSingle();

  if (bucketError) return { error: bucketError.message };
  if (!bucketRow) return { error: "Bucket nao encontrado." };

  const { data: distributionRow, error: distributionError } = await supabase
    .from("distributions")
    .select("id")
    .eq("id", bucketRow.distribution_id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (distributionError) return { error: distributionError.message };
  if (!distributionRow) {
    return { error: "Bucket invalido para a organizacao atual." };
  }

  const { data: categoryRows, error: categoriesError } = await supabase
    .from("categories")
    .select("id, type")
    .eq("org_id", orgId)
    .in("id", dedupedIds);

  if (categoriesError) return { error: categoriesError.message };

  const eligibleCategoryIds = (categoryRows ?? [])
    .filter((row) => row.type !== "transfer")
    .map((row) => row.id);

  if (eligibleCategoryIds.length === 0) {
    return { error: "Nenhuma categoria elegivel para bucket (transferencia nao aceita bucket)." };
  }

  const { data: updatedCategoriesRows, error: updateCategoriesError } = await supabase
    .from("categories")
    .update({ default_bucket_id: bucketId })
    .in("id", eligibleCategoryIds)
    .select("id");

  if (updateCategoriesError) return { error: updateCategoriesError.message };

  let updatedTransactions = 0;
  if (input.applyToExistingTransactions) {
    const { data: updatedTransactionsRows, error: updateTransactionsError } = await supabase
      .from("transactions")
      .update({ bucket_id: bucketId })
      .eq("org_id", orgId)
      .in("category_id", eligibleCategoryIds)
      .is("bucket_id", null)
      .is("deleted_at", null)
      .select("id");

    if (updateTransactionsError) return { error: updateTransactionsError.message };
    updatedTransactions = updatedTransactionsRows?.length ?? 0;
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cadastros");

  return {
    updatedCategories: updatedCategoriesRows?.length ?? eligibleCategoryIds.length,
    updatedTransactions,
  };
}
