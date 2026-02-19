import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isRetroactiveInstallmentBackfill } from "@/lib/transactions/retroactive";

function signedAmount(tx: { type: string; amount: number | string | null }) {
  const raw = Number(tx.amount ?? 0);
  const abs = Math.abs(raw);

  if (tx.type === "income") return abs;
  if (tx.type === "expense") return -abs;
  return 0;
}

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
  const { data: orgSettings } = await supabase
    .from("orgs")
    .select("balance_start_date")
    .eq("id", orgId)
    .maybeSingle();
  const balanceStartIso =
    typeof orgSettings?.balance_start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(orgSettings.balance_start_date)
      ? orgSettings.balance_start_date
      : null;

  const { data: tx } = await supabase
    .from("transactions")
    .select("amount, type")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .gte("date", monthStart);

  const receitas = (tx ?? []).filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const despesas = (tx ?? []).filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const { data: accounts } = await supabase
    .from("accounts")
    .select("initial_balance")
    .eq("org_id", orgId)
    .eq("is_active", true);
  let allTxQuery = supabase
    .from("transactions")
    .select("amount, type, date, installment_id, created_at, metadata")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .in("status", ["cleared", "reconciled"])
    .lte("date", now.toISOString().slice(0, 10));

  if (balanceStartIso) {
    allTxQuery = allTxQuery.gte("date", balanceStartIso);
  }

  const { data: allTx } = await allTxQuery;
  const initialBalanceTotal = accounts?.reduce((s, a) => s + Number(a.initial_balance), 0) ?? 0;
  const balanceTx = (allTx ?? []).filter((tx) => !isRetroactiveInstallmentBackfill(tx));
  const saldoOrbita =
    initialBalanceTotal +
    balanceTx.reduce((s, t) => s + signedAmount(t), 0);

  return NextResponse.json({
    saldo_orbita: saldoOrbita,
    receitas_mes: receitas,
    despesas_mes: despesas,
    resultado_mes: receitas - despesas,
  });
}
