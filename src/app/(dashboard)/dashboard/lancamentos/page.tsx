import { createClient } from "@/lib/supabase/server";
import { toISODateLocal } from "@/lib/utils";
import { redirect } from "next/navigation";
import { LancamentosClient, type LancamentoRow } from "./_components/lancamentos-client";

type AccountFilterType = "all" | "card" | "account";

type AccountFilterOption = {
  id: string;
  name: string;
  type: string;
  is_credit_card: boolean | null;
};

function normalizePage(value: string | string[] | undefined) {
  if (typeof value !== "string") return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.trunc(parsed);
}

function normalizeAccountType(value: string | string[] | undefined): AccountFilterType {
  if (value === "card" || value === "account") return value;
  return "all";
}

function normalizeSearch(value: string | string[] | undefined) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeMonth(value: string | string[] | undefined) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed) ? trimmed : "";
}

function toMonthRange(monthKey: string) {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const start = toISODateLocal(new Date(year, month - 1, 1));
  const end = toISODateLocal(new Date(year, month, 0));
  return { start, end };
}

function isCreditCardAccount(account: Pick<AccountFilterOption, "is_credit_card" | "type">) {
  return Boolean(account.is_credit_card) || account.type === "credit_card";
}

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

  const requestedPage = normalizePage(searchParams?.page);
  const focusPendingBucket = typeof searchParams?.focus === "string" && searchParams.focus === "pending-bucket";
  const selectedAccountType = normalizeAccountType(searchParams?.accountType);
  const searchTerm = normalizeSearch(searchParams?.q);
  const selectedMonth = normalizeMonth(searchParams?.month);
  const rawSelectedAccountId = typeof searchParams?.account === "string" ? searchParams.account : "";
  const pageSize = 20;
  const monthRange = selectedMonth ? toMonthRange(selectedMonth) : null;

  const { data: accountRows } = await supabase
    .from("accounts")
    .select("id, name, type, is_credit_card")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("name");

  const accountOptions = (accountRows ?? []) as AccountFilterOption[];
  const accountIdSet = new Set(accountOptions.map((account) => account.id));
  const selectedAccountId = accountIdSet.has(rawSelectedAccountId) ? rawSelectedAccountId : "";

  let filteredAccountIds: string[] | null = null;
  if (selectedAccountId) {
    filteredAccountIds = [selectedAccountId];
  } else if (selectedAccountType === "card") {
    filteredAccountIds = accountOptions.filter((account) => isCreditCardAccount(account)).map((account) => account.id);
  } else if (selectedAccountType === "account") {
    filteredAccountIds = accountOptions.filter((account) => !isCreditCardAccount(account)).map((account) => account.id);
  }
  const forceEmptyResult = Boolean(filteredAccountIds && filteredAccountIds.length === 0);

  // Get total count
  let count = 0;
  if (!forceEmptyResult) {
    let countQuery = supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("deleted_at", null);

    if (focusPendingBucket) {
      countQuery = countQuery.eq("type", "expense").is("bucket_id", null);
    }
    if (filteredAccountIds) {
      countQuery = countQuery.in("account_id", filteredAccountIds);
    }
    if (searchTerm) {
      countQuery = countQuery.ilike("description", `%${searchTerm}%`);
    }
    if (monthRange) {
      countQuery = countQuery.gte("date", monthRange.start).lte("date", monthRange.end);
    }

    const countResult = await countQuery;
    count = countResult.count ?? 0;
  }

  const totalPages = count ? Math.ceil(count / pageSize) : 1;
  const page = Math.min(requestedPage, totalPages);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let transactions: {
    id: string;
    type: string;
    status: string;
    amount: number;
    date: string;
    due_date: string | null;
    installment_id: string | null;
    description: string | null;
    created_at: string;
    account: { id: string; name: string } | { id: string; name: string }[] | null;
    category: { id: string; name: string } | { id: string; name: string }[] | null;
  }[] | null = [];

  if (!forceEmptyResult) {
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
    if (filteredAccountIds) {
      txQuery = txQuery.in("account_id", filteredAccountIds);
    }
    if (searchTerm) {
      txQuery = txQuery.ilike("description", `%${searchTerm}%`);
    }
    if (monthRange) {
      txQuery = txQuery.gte("date", monthRange.start).lte("date", monthRange.end);
    }

    const txResult = await txQuery.range(from, to);
    transactions = txResult.data;

    if (txResult.error) {
      console.error("Error fetching transactions list:", txResult.error);
    }
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
      accountOptions={accountOptions.map((account) => ({
        id: account.id,
        name: account.name,
        type: isCreditCardAccount(account) ? "card" : "account",
      }))}
      selectedAccountType={selectedAccountType}
      selectedAccountId={selectedAccountId}
      searchTerm={searchTerm}
      selectedMonth={selectedMonth}
    />
  );
}
