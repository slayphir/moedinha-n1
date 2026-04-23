"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrgIdForUser } from "@/lib/active-org";

export type ContactBalanceRow = {
  contact_id: string;
  contact_name: string;
  /** Nível de confiabilidade no pagamento (on_time, sometimes_late, often_late, stopped_paying, unknown). */
  payment_reliability: string | null;
  /** Total que eu paguei por esta pessoa (ex.: parcelas no cartão). */
  paid_by_me: number;
  /** Total que esta pessoa me pagou (devolveu). */
  paid_to_me: number;
  /** Saldo: positivo = ela me deve; negativo = recebi a mais. */
  balance: number;
};

export type ThirdPartyBalancesResult = {
  contacts: ContactBalanceRow[];
  /** Total a receber de terceiros (soma dos saldos positivos). */
  total_receivable: number;
  /** Total que eu paguei por terceiros (todas as despesas com contato). */
  total_paid_by_me: number;
  /** Total que terceiros me pagaram. */
  total_paid_to_me: number;
};

/**
 * Calcula por contato: quanto você pagou por cada um, quanto cada um te pagou, e o saldo (quanto te devem).
 * Usado na página "Terceiros" para administrar e mensurar valores nas mãos de terceiros.
 */
export async function getThirdPartyBalances(): Promise<
  { data: ThirdPartyBalancesResult } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autorizado" };

  const orgId = await getActiveOrgIdForUser(supabase, user.id);
  if (!orgId) return { error: "Organização não encontrada" };

  const { data: contactPaysMeCategories } = await supabase
    .from("categories")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_creditor_center", true);
  const contactPaysMeIds = new Set((contactPaysMeCategories ?? []).map((c) => c.id));

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, payment_reliability")
    .eq("org_id", orgId)
    .order("name");

  if (!contacts?.length) {
    return {
      data: {
        contacts: [],
        total_receivable: 0,
        total_paid_by_me: 0,
        total_paid_to_me: 0,
      },
    };
  }

  const { data: txList } = await supabase
    .from("transactions")
    .select("id, contact_id, category_id, contact_payment_direction, amount, type, status")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .not("contact_id", "is", null)
    .in("status", ["cleared", "reconciled"]);

  const byContact: Record<
    string,
    { paid_by_me: number; paid_to_me: number }
  > = {};
  for (const c of contacts) {
    byContact[c.id] = { paid_by_me: 0, paid_to_me: 0 };
  }

  for (const tx of txList ?? []) {
    const cid = tx.contact_id as string;
    if (!cid || !byContact[cid]) continue;
    const abs = Math.abs(Number(tx.amount ?? 0));
    const dir = (tx as { contact_payment_direction?: string | null }).contact_payment_direction;
    const isPaysMe =
      dir === "paid_to_me" || (dir == null && tx.category_id && contactPaysMeIds.has(tx.category_id));
    if (isPaysMe) {
      byContact[cid].paid_to_me += abs;
    } else {
      byContact[cid].paid_by_me += abs;
    }
  }

  const contactsResult: ContactBalanceRow[] = contacts.map((c) => {
    const { paid_by_me, paid_to_me } = byContact[c.id] ?? { paid_by_me: 0, paid_to_me: 0 };
    const balance = paid_by_me - paid_to_me;
    return {
      contact_id: c.id,
      contact_name: c.name,
      payment_reliability: (c as { payment_reliability?: string | null }).payment_reliability ?? null,
      paid_by_me,
      paid_to_me,
      balance,
    };
  });

  const withMovement = contactsResult.filter((r) => r.paid_by_me > 0 || r.paid_to_me > 0);
  const total_paid_by_me = withMovement.reduce((s, r) => s + r.paid_by_me, 0);
  const total_paid_to_me = withMovement.reduce((s, r) => s + r.paid_to_me, 0);
  const total_receivable = withMovement.reduce((s, r) => s + (r.balance > 0 ? r.balance : 0), 0);

  return {
    data: {
      contacts: withMovement.sort((a, b) => b.balance - a.balance),
      total_receivable,
      total_paid_by_me,
      total_paid_to_me,
    },
  };
}
