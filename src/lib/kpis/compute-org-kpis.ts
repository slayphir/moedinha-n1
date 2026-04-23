import type { SupabaseClient } from "@supabase/supabase-js";
import { isRetroactiveInstallmentBackfill } from "@/lib/transactions/retroactive";
import { attachCategoryType, signedAmount, sumReceitas, sumDespesas } from "@/lib/transactions/classification";

export type OrgKpisSnapshot = {
  saldo_orbita: number;
  receitas_mes: number;
  despesas_mes: number;
  resultado_mes: number;
};

/**
 * KPIs do mês corrente + saldo agregado (mesma lógica do endpoint `/api/kpis`).
 */
export async function computeOrgKpisSnapshot(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgKpisSnapshot> {
  const now = new Date();
  const monthStart = now.toISOString().slice(0, 7) + "-01";

  const { data: categoryRows } = await supabase
    .from("categories")
    .select("id, type, is_creditor_center")
    .eq("org_id", orgId);
  const contactPaysMeCategoryIds = new Set(
    (categoryRows ?? []).filter((c) => c.is_creditor_center).map((c) => c.id)
  );
  const categoryTypeById = new Map((categoryRows ?? []).map((c) => [c.id, c.type]));

  const { data: tx } = await supabase
    .from("transactions")
    .select("amount, type, contact_id, category_id, contact_payment_direction")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .gte("date", monthStart);

  const txWithCategoryType = attachCategoryType(tx ?? [], categoryTypeById);
  const receitas = sumReceitas(txWithCategoryType, contactPaysMeCategoryIds);
  const despesas = sumDespesas(txWithCategoryType, contactPaysMeCategoryIds);

  const { data: accounts } = await supabase
    .from("accounts")
    .select("initial_balance")
    .eq("org_id", orgId)
    .eq("is_active", true);

  const { data: allTx } = await supabase
    .from("transactions")
    .select(
      "amount, type, status, date, installment_id, created_at, metadata, contact_id, category_id, contact_payment_direction"
    )
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .in("status", ["cleared", "reconciled"])
    .lte("date", now.toISOString().slice(0, 10));
  const balanceTx = (allTx ?? []).filter((row) => !isRetroactiveInstallmentBackfill(row));

  const initialBalanceTotal = accounts?.reduce((s, a) => s + Number(a.initial_balance), 0) ?? 0;
  const saldoOrbita =
    initialBalanceTotal +
    balanceTx.reduce((s, t) => s + signedAmount(t, contactPaysMeCategoryIds), 0);

  return {
    saldo_orbita: saldoOrbita,
    receitas_mes: receitas,
    despesas_mes: despesas,
    resultado_mes: receitas - despesas,
  };
}
