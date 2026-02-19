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
    .order("created_at", { ascending: true }) // Ensure consistent order
    .limit(1);
  const orgId = members?.[0]?.org_id;
  if (!orgId) redirect("/onboarding");

  const page = Number(searchParams?.page) || 1;
  const focusPendingBucket = typeof searchParams?.focus === "string" && searchParams.focus === "pending-bucket";
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Get total count
  let countQuery = supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("deleted_at", null);

  if (focusPendingBucket) {
    countQuery = countQuery.eq("type", "expense").is("bucket_id", null);
  }

  const { count } = await countQuery;

  const totalPages = count ? Math.ceil(count / pageSize) : 1;

  let txQuery = supabase
    .from("transactions")
    .select(`
      id, type, status, amount, date, due_date, installment_id, description, created_at, bucket_id,
      account:accounts!transactions_account_id_fkey(id, name),
      category:categories(id, name)
    `)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("date", { ascending: false });

  if (focusPendingBucket) {
    txQuery = txQuery.eq("type", "expense").is("bucket_id", null);
  }

  const { data: transactions, error: transactionsError } = await txQuery.range(from, to);

  if (transactionsError) {
    console.error("Error fetching transactions list:", transactionsError);
  }

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
      installment_id: t.installment_id ?? null,
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
      orgId={orgId}
      focusPendingBucket={focusPendingBucket}
    />
  );
}
