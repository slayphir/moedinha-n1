"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { TransactionType } from "@/lib/types/database";

type CreateInput = {
  type: TransactionType;
  amount: number;
  date: string;
  account_id: string;
  transfer_account_id: string | null;
  category_id: string | null;
  description: string | null;
};

export async function createTransaction(orgId: string, input: CreateInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado" };

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
  return { data };
}
