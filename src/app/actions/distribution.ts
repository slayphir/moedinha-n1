"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { validateDistributionSum } from "@/lib/distribution/validation";
import type { BaseIncomeMode, DistributionEditMode } from "@/lib/types/database";
import type { DistributionBucket } from "@/lib/types/database";

export interface DistributionWithBuckets {
  id: string;
  org_id: string;
  name: string;
  is_default: boolean;
  mode: DistributionEditMode;
  base_income_mode: BaseIncomeMode;
  planned_income: number | null;
  buckets: DistributionBucket[];
}

export async function getDistribution(orgId: string): Promise<{
  data?: DistributionWithBuckets;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado" };

  const { data: dist, error: distError } = await supabase
    .from("distributions")
    .select("*")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (distError) return { error: distError.message };
  if (!dist) {
    const { data: anyDist } = await supabase
      .from("distributions")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!anyDist) {
      return { data: undefined };
    }
    const { data: buckets } = await supabase
      .from("distribution_buckets")
      .select("*")
      .eq("distribution_id", anyDist.id)
      .order("sort_order", { ascending: true });
    return {
      data: {
        ...anyDist,
        buckets: (buckets ?? []) as DistributionBucket[],
      } as DistributionWithBuckets,
    };
  }

  const { data: buckets, error: buckError } = await supabase
    .from("distribution_buckets")
    .select("*")
    .eq("distribution_id", dist.id)
    .order("sort_order", { ascending: true });

  if (buckError) return { error: buckError.message };
  return {
    data: {
      ...dist,
      buckets: (buckets ?? []) as DistributionBucket[],
    } as DistributionWithBuckets,
  };
}

export type SaveDistributionInput = {
  distribution_id: string;
  name: string;
  mode: DistributionEditMode;
  base_income_mode: BaseIncomeMode;
  planned_income: number | null;
  buckets: { id: string; name: string; percent_bps: number; color: string | null; icon: string | null; sort_order: number; is_flexible: boolean }[];
};

export async function saveDistribution(
  orgId: string,
  input: SaveDistributionInput
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado" };

  if (!validateDistributionSum(input.buckets)) {
    return { error: "A soma dos percentuais deve ser 100%. Ajuste ou use Normalizar." };
  }

  if (input.buckets.length < 2 || input.buckets.length > 8) {
    return { error: "É necessário entre 2 e 8 buckets." };
  }

  const { error: distError } = await supabase
    .from("distributions")
    .update({
      name: input.name,
      mode: input.mode,
      base_income_mode: input.base_income_mode,
      planned_income: input.planned_income,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.distribution_id)
    .eq("org_id", orgId);

  if (distError) return { error: distError.message };

  // 1. Identify buckets to delete (present in DB but not in input)
  const { data: currentBuckets } = await supabase
    .from("distribution_buckets")
    .select("id")
    .eq("distribution_id", input.distribution_id);

  const currentIds = new Set(currentBuckets?.map((b) => b.id) ?? []);
  const inputIds = new Set(input.buckets.map((b) => b.id));
  const toDelete = Array.from(currentIds).filter((id) => !inputIds.has(id));

  if (toDelete.length > 0) {
    const { error: delError } = await supabase.from("distribution_buckets").delete().in("id", toDelete);
    if (delError) return { error: delError.message };
  }

  // 2. Upsert all input buckets
  const upsertData = input.buckets.map((b) => ({
    id: b.id,
    distribution_id: input.distribution_id,
    name: b.name,
    percent_bps: b.percent_bps,
    color: b.color,
    icon: b.icon,
    sort_order: b.sort_order,
    is_flexible: b.is_flexible,
  }));

  const { error: upsertError } = await supabase.from("distribution_buckets").upsert(upsertData);
  if (upsertError) return { error: upsertError.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/distribuicao");
  return {};
}

export async function createDefaultDistribution(orgId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado" };

  const { data: existing } = await supabase
    .from("distributions")
    .select("id")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();
  if (existing) return { error: "Já existe uma distribuição." };

  const { data: dist, error: distError } = await supabase
    .from("distributions")
    .insert({
      org_id: orgId,
      name: "Padrão 50/30/20",
      is_default: true,
      mode: "auto",
      base_income_mode: "current_month",
      planned_income: null,
    })
    .select("id")
    .single();

  if (distError) return { error: distError.message };
  if (!dist) return { error: "Falha ao criar distribuição." };

  const buckets = [
    { name: "Necessidades", percent_bps: 5000, color: "#2E9F62", icon: "home", sort_order: 0, is_flexible: false },
    { name: "Desejos", percent_bps: 3000, color: "#F1C31E", icon: "gift", sort_order: 1, is_flexible: true },
    { name: "Metas", percent_bps: 2000, color: "#4D79AE", icon: "target", sort_order: 2, is_flexible: false },
  ];
  const { error: buckError } = await supabase.from("distribution_buckets").insert(
    buckets.map((b) => ({ distribution_id: dist.id, ...b }))
  );
  if (buckError) return { error: buckError.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/distribuicao");
  return {};
}
