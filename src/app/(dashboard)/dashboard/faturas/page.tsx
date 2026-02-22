import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, toISODateLocal, toISOYearMonthLocal } from "@/lib/utils";
import { redirect } from "next/navigation";
import Link from "next/link";
import { EmptyInvoiceState } from "./_components/empty-invoice-state";
import { NewCardButton } from "./_components/new-card-button";
import { PayInvoiceButton } from "./_components/pay-invoice-button";
import { isRetroactiveInstallmentBackfill } from "@/lib/transactions/retroactive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CardAccount = {
  id: string;
  name: string;
  type: string;
  is_credit_card: boolean | null;
  credit_limit: number | null;
  closing_day: number | null;
  due_day: number | null;
};

type TxRow = {
  id: string;
  date: string;
  due_date: string | null;
  description: string | null;
  amount: number;
  status: string;
  type: "expense" | "income" | "transfer";
  installment_id: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

type PendingLimitRow = {
  amount: number;
  type: "expense" | "income" | "transfer";
  status: string;
  date: string;
  installment_id: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function toIsoDate(year: number, monthIndex: number, day: number) {
  const safeDay = Math.min(day, daysInMonth(year, monthIndex));
  return toISODateLocal(new Date(year, monthIndex, safeDay));
}

function computeFallbackDueDate(dateStr: string, closingDay?: number | null, dueDay?: number | null) {
  const txDate = new Date(`${dateStr}T12:00:00`);
  const txDay = txDate.getDate();

  if (!dueDay) return dateStr;

  let monthOffset = 0;
  const hasClosingDay = Boolean(closingDay && closingDay >= 1 && closingDay <= 31);
  if (hasClosingDay) {
    if (txDay > Number(closingDay)) {
      monthOffset += 1;
    }
    if (dueDay <= Number(closingDay)) {
      monthOffset += 1;
    }
  } else if (txDay > dueDay) {
    monthOffset = 1;
  }

  let target = new Date(txDate.getFullYear(), txDate.getMonth() + monthOffset, 1);
  let dueIso = toIsoDate(target.getFullYear(), target.getMonth(), dueDay);

  let safety = 0;
  while (dueIso < dateStr && safety < 24) {
    target = new Date(target.getFullYear(), target.getMonth() + 1, 1);
    dueIso = toIsoDate(target.getFullYear(), target.getMonth(), dueDay);
    safety += 1;
  }

  return dueIso;
}

function isDueDateInvalid(txDate: string, dueDate: string | null): boolean {
  if (!dueDate) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return true;
  // Credit card invoices should not mature before the transaction date.
  return dueDate < txDate;
}

export default async function FaturasPage({
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

  const { data: cardRows } = await supabase
    .from("accounts")
    .select("id, name, type, is_credit_card, credit_limit, closing_day, due_day")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .or("is_credit_card.eq.true,type.eq.credit_card")
    .order("name");

  const cards = (cardRows ?? []) as CardAccount[];
  const selectedCardParam = typeof searchParams.card === "string" ? searchParams.card : "";
  const selectedMonthParam = typeof searchParams.month === "string" ? searchParams.month : "";
  const currentMonth = toISOYearMonthLocal(new Date());
  const selectedMonth = /^\d{4}-\d{2}$/.test(selectedMonthParam) ? selectedMonthParam : currentMonth;

  if (cards.length === 0) {
    return <EmptyInvoiceState />;
  }

  const selectedCard = cards.find((card) => card.id === selectedCardParam) ?? cards[0];

  const monthDate = new Date(`${selectedMonth}-01T12:00:00`);
  const monthStart = toISODateLocal(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
  const monthEnd = toISODateLocal(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));
  const rangeStart = toISODateLocal(new Date(monthDate.getFullYear(), monthDate.getMonth() - 2, 1));
  const rangeEnd = toISODateLocal(new Date(monthDate.getFullYear(), monthDate.getMonth() + 2, 0));

  const baseSelect = "id, date, due_date, description, amount, status, type, installment_id, created_at, metadata";
  const [dueMonthResult, dateRangeResult] = await Promise.all([
    supabase
      .from("transactions")
      .select(baseSelect)
      .eq("org_id", orgId)
      .eq("account_id", selectedCard.id)
      .eq("type", "expense")
      .is("deleted_at", null)
      .gte("due_date", monthStart)
      .lte("due_date", monthEnd)
      .order("date", { ascending: false }),
    supabase
      .from("transactions")
      .select(baseSelect)
      .eq("org_id", orgId)
      .eq("account_id", selectedCard.id)
      .eq("type", "expense")
      .is("deleted_at", null)
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .order("date", { ascending: false }),
  ]);

  if (dueMonthResult.error || dateRangeResult.error) {
    console.error("Erro ao buscar fatura por vencimento:", dueMonthResult.error ?? dateRangeResult.error);
  }

  const mergedRows = new Map<string, TxRow>();
  for (const row of (dueMonthResult.data ?? []) as TxRow[]) {
    mergedRows.set(row.id, row);
  }
  for (const row of (dateRangeResult.data ?? []) as TxRow[]) {
    if (!mergedRows.has(row.id)) {
      mergedRows.set(row.id, row);
    }
  }

  const allRows = Array.from(mergedRows.values()).filter((row) => !isRetroactiveInstallmentBackfill(row));
  const invoiceRows = allRows
    .map((row) => {
      const dueDate = isDueDateInvalid(row.date, row.due_date)
        ? computeFallbackDueDate(row.date, selectedCard.closing_day ?? null, selectedCard.due_day ?? null)
        : row.due_date;
      return {
        ...row,
        due_date: dueDate,
      };
    })
    .filter((row) => row.due_date?.slice(0, 7) === selectedMonth)
    .sort((left, right) => right.date.localeCompare(left.date));

  const totalAmount = invoiceRows.reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
  const pendingAmount = invoiceRows
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
  const pendingCount = invoiceRows.filter((row) => row.status === "pending").length;

  const { data: pendingLimitRows } = await supabase
    .from("transactions")
    .select("amount, type, status, date, installment_id, created_at, metadata")
    .eq("org_id", orgId)
    .eq("account_id", selectedCard.id)
    .eq("type", "expense")
    .eq("status", "pending")
    .is("deleted_at", null);

  const committedLimit = ((pendingLimitRows ?? []) as PendingLimitRow[])
    .filter((row) => !isRetroactiveInstallmentBackfill(row))
    .reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);

  const creditLimit = Number(selectedCard.credit_limit ?? 0);
  const usagePct = creditLimit > 0 ? (committedLimit / creditLimit) * 100 : 0;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Faturas</h1>
          <p className="text-sm text-muted-foreground">Acompanhe fechamento, vencimento e total por cartao.</p>
        </div>
        <form className="flex flex-wrap items-end gap-2" method="get">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Cartao</label>
            <select name="card" defaultValue={selectedCard.id} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Mes da fatura</label>
            <input
              type="month"
              name="month"
              defaultValue={selectedMonth}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm">
              Atualizar
            </Button>
            <NewCardButton />
          </div>
        </form>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total da fatura</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rose-700">{formatCurrency(-Math.abs(totalAmount))}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Em aberto</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-700">{formatCurrency(-Math.abs(pendingAmount))}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Uso do limite</CardTitle>
          </CardHeader>
          <CardContent>
            {creditLimit > 0 ? (
              <div className="space-y-1">
                <p className="text-2xl font-bold">{usagePct.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(committedLimit)} de {formatCurrency(creditLimit)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Limite nao configurado para este cartao.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {selectedCard.name} - fatura {selectedMonth}
            {selectedCard.closing_day ? ` | fechamento dia ${selectedCard.closing_day}` : ""}
            {selectedCard.due_day ? ` | vencimento dia ${selectedCard.due_day}` : ""}
          </CardTitle>
          <div className="flex items-center gap-2">
            <PayInvoiceButton
              accountId={selectedCard.id}
              invoiceMonth={selectedMonth}
              pendingAmount={pendingAmount}
              pendingCount={pendingCount}
            />
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/cartoes/${selectedCard.id}?month=${selectedMonth}`}>
                Ver Detalhes Completos
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {invoiceRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum lancamento encontrado para esta fatura.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Vencimento</th>
                    <th className="px-3 py-2 text-left">Descricao</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2">{row.date}</td>
                      <td className="px-3 py-2">{row.due_date ?? "-"}</td>
                      <td className="px-3 py-2">{row.description ?? "-"}</td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2 text-right font-medium text-rose-700">
                        {formatCurrency(-Math.abs(Number(row.amount)))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
