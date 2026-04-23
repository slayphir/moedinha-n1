import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isRetroactiveInstallmentBackfill } from "@/lib/transactions/retroactive";
import { attachCategoryType, signedAmount, sumReceitas, sumDespesas } from "@/lib/transactions/classification";

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("org_id");
  const token = request.nextUrl.searchParams.get("token");
  if (!orgId) {
    return NextResponse.json({ error: "org_id obrigatório" }, { status: 400 });
  }
  const supabase = await createClient();

  if (token) {
    const { data: apiToken } = await supabase
      .from("api_tokens")
      .select("org_id")
      .eq("token_hash", token)
      .single();
    if (!apiToken || apiToken.org_id !== orgId) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const { data: members } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("org_id", orgId);
    if (!members?.length) {
      return NextResponse.json({ error: "Sem acesso à organização" }, { status: 403 });
    }
  }

  const now = new Date();
  const monthStart = now.toISOString().slice(0, 7) + "-01";

  const { data: categoryRows } = await supabase
    .from("categories")
    .select("id, type, is_creditor_center")
    .eq("org_id", orgId);
  const contactPaysMeCategoryIds = new Set((categoryRows ?? []).filter((c) => c.is_creditor_center).map((c) => c.id));
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
  // Saldo sempre considera todo o histórico até hoje (não usa balance_start_date),
  // para o saldo do mês anterior não "cair" ao lançar movimentações no mês atual.
  const { data: allTx } = await supabase
    .from("transactions")
    .select("amount, type, status, date, installment_id, created_at, metadata, contact_id, category_id, contact_payment_direction")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .in("status", ["cleared", "reconciled"])
    .lte("date", now.toISOString().slice(0, 10));
  const balanceTx = (allTx ?? []).filter((tx) => !isRetroactiveInstallmentBackfill(tx));

  const initialBalanceTotal = accounts?.reduce((s, a) => s + Number(a.initial_balance), 0) ?? 0;
  const saldoOrbita = initialBalanceTotal + balanceTx.reduce((s, t) => s + signedAmount(t, contactPaysMeCategoryIds), 0);

  return NextResponse.json({
    saldo_orbita: saldoOrbita,
    receitas_mes: receitas,
    despesas_mes: despesas,
    resultado_mes: receitas - despesas,
  });
}
