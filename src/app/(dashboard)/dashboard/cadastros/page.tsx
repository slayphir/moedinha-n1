import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CadastrosClient } from "./_components/cadastros-client";
import { endOfMonth, startOfMonth } from "date-fns";

export default async function CadastrosPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
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

  const tab = typeof searchParams.tab === "string" ? searchParams.tab : "accounts";
  const monthParam = typeof searchParams.month === "string" ? searchParams.month : "";
  const monthBase = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? new Date(`${monthParam}-01T12:00:00`) : new Date();
  const monthStart = startOfMonth(monthBase);
  const monthEnd = endOfMonth(monthBase);
  const budgetMonth = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-01`;

  const [accounts, categories, tags, contacts, budgets, txMonth] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, type, is_active, is_credit_card, credit_limit, closing_day, due_day")
      .eq("org_id", orgId)
      .order("name"),
    supabase.from("categories").select("id, name, type").eq("org_id", orgId).order("name"),
    supabase.from("tags").select("id, name").eq("org_id", orgId).order("name"),
    supabase.from("contacts").select("*").eq("org_id", orgId).order("name"),
    supabase
      .from("budgets")
      .select("id, category_id, amount, alert_threshold")
      .eq("org_id", orgId)
      .eq("month", budgetMonth),
    supabase
      .from("transactions")
      .select("category_id, amount")
      .eq("org_id", orgId)
      .eq("type", "expense")
      .is("deleted_at", null)
      .gte("date", monthStart.toISOString().slice(0, 10))
      .lte("date", monthEnd.toISOString().slice(0, 10)),
  ]);

  const spentByCategory: Record<string, number> = {};
  (txMonth.data ?? []).forEach((row) => {
    if (!row.category_id) return;
    spentByCategory[row.category_id] = (spentByCategory[row.category_id] ?? 0) + Math.abs(Number(row.amount));
  });

  const budgetMap: Record<
    string,
    {
      id: string;
      categoryId: string;
      categoryName: string;
      amount: number;
      alert_threshold: number;
      spent: number;
      usage_pct: number;
      near_limit: boolean;
      over_limit: boolean;
    }
  > = {};

  (budgets.data ?? []).forEach((row) => {
    const amount = Number(row.amount);
    const spent = spentByCategory[row.category_id] ?? 0;
    const usage = amount > 0 ? (spent / amount) * 100 : 0;
    const threshold = Number(row.alert_threshold ?? 80);
    const cat = categories.data?.find(c => c.id === row.category_id);
    budgetMap[row.category_id] = {
      id: row.id,
      categoryId: row.category_id,
      categoryName: cat?.name ?? "Desconhecida",
      amount,
      alert_threshold: threshold,
      spent,
      usage_pct: usage,
      near_limit: usage >= threshold && usage < 100,
      over_limit: usage >= 100,
    };
  });

  return (
    <CadastrosClient
      accounts={accounts.data ?? []}
      categories={categories.data ?? []}
      tags={tags.data ?? []}
      contacts={contacts.data ?? []}
      initialTab={tab}
      budgetMonth={budgetMonth}
      categoryBudgetMap={budgetMap}
    />
  );
}
