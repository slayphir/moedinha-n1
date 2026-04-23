import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { startOfMonth, endOfMonth, subDays } from "date-fns";
import { buildGamification, type GamificationTx } from "@/lib/gamification";
import { attachCategoryType, sumReceitas, sumDespesas } from "@/lib/transactions/classification";
import { CofreClient } from "./cofre-client";

export default async function CofrePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: members } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1);
  const orgId = members?.[0]?.org_id;
  if (!orgId) redirect("/onboarding");

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const ninetyDaysAgo = subDays(now, 90);

  const { data: categoryRows } = await supabase
    .from("categories")
    .select("id, type, is_creditor_center")
    .eq("org_id", orgId);
  const contactPaysMeCategoryIds = new Set((categoryRows ?? []).filter((c) => c.is_creditor_center).map((c) => c.id));
  const categoryTypeById = new Map((categoryRows ?? []).map((c) => [c.id, c.type]));

  const { data: txList } = await supabase
    .from("transactions")
    .select("id, amount, date, type, category_id, contact_id, contact_payment_direction, deleted_at")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .gte("date", ninetyDaysAgo.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  const tx = attachCategoryType(
    (txList ?? []).filter((t) => !t.deleted_at),
    categoryTypeById
  );
  const monthTx = tx.filter(
    (t) => t.date >= monthStart.toISOString().slice(0, 10) && t.date <= monthEnd.toISOString().slice(0, 10)
  );
  const receitasMes = sumReceitas(monthTx, contactPaysMeCategoryIds);
  const despesasMes = sumDespesas(monthTx, contactPaysMeCategoryIds);

  const gamificationTx: GamificationTx[] = tx.map((item) => ({
    date: item.date,
    type: item.type,
    amount: Number(item.amount),
    categoryId: item.category_id ?? null,
  }));

  const monthTxGamification: GamificationTx[] = monthTx.map((item) => ({
    date: item.date,
    type: item.type,
    amount: Number(item.amount),
    categoryId: item.category_id ?? null,
  }));

  const gamification = buildGamification({
    transactions: gamificationTx,
    monthTransactions: monthTxGamification,
    monthIncome: receitasMes,
    monthExpense: despesasMes,
    now,
  });

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-display text-2xl text-ink">Cofre</h1>
        <p className="mt-1 text-sm text-ink/70">
          Conquistas, missões e progresso da sua jornada financeira.
        </p>
      </section>
      <CofreClient gamification={gamification} />
    </div>
  );
}
