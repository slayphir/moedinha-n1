import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LancamentosClient, type LancamentoRow } from "./_components/lancamentos-client";

export default async function LancamentosPage({
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

  const page = Number(searchParams?.page) || 1;
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Get total count
  const { count } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("deleted_at", null);

  const totalPages = count ? Math.ceil(count / pageSize) : 1;

  const { data: transactions } = await supabase
    .from("transactions")
    .select(`
      id, type, status, amount, date, due_date, description, created_at,
      account:accounts(id, name),
      category:categories(id, name)
    `)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .range(from, to);

  const rows: LancamentoRow[] = (transactions ?? []).map((t) => {
    const acc = Array.isArray(t.account) ? t.account[0] ?? null : t.account ?? null;
    const cat = Array.isArray(t.category) ? t.category[0] ?? null : t.category ?? null;
    return {
      id: t.id,
      type: t.type,
      status: t.status,
      amount: Number(t.amount),
      date: t.date,
      due_date: t.due_date ?? null,
      description: t.description ?? null,
      created_at: t.created_at,
      account: acc as LancamentoRow["account"],
      category: cat as LancamentoRow["category"],
    };
  });

  return (
    <LancamentosClient
      initialTransactions={rows}
      totalPages={totalPages}
      currentPage={page}
    />
  );
}
