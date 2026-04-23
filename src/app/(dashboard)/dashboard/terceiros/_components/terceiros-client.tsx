"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type { ThirdPartyBalancesResult } from "@/app/actions/third-party-balances";
import { getPaymentReliabilityLabel, getPaymentReliabilityBadgeClass } from "@/lib/payment-reliability";
import { HandCoins, ArrowDownLeft, ArrowUpRight, Users, Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function TerceirosClient({ data }: { data: ThirdPartyBalancesResult }) {
  const { contacts, total_receivable, total_paid_by_me, total_paid_to_me } = data;

  function handleExportCsv() {
    const headers = ["Contato", "Confiabilidade", "Eu paguei por ela", "Ela me pagou", "Saldo (te deve)"];
    const rows = contacts.map((row) => [
      escapeCsvCell(row.contact_name),
      escapeCsvCell(getPaymentReliabilityLabel(row.payment_reliability)),
      row.paid_by_me.toFixed(2),
      row.paid_to_me.toFixed(2),
      row.balance.toFixed(2),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terceiros-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-stroke/80 bg-card">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <CardTitle className="text-base font-semibold leading-snug text-foreground">
              A receber de terceiros
            </CardTitle>
            <HandCoins className="h-5 w-5 shrink-0 text-vault-600" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold tracking-tight text-vault-700">
              {formatCurrency(total_receivable)}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Soma do que cada um te deve (saldo positivo)
            </p>
          </CardContent>
        </Card>
        <Card className="border-stroke/80 bg-card">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <CardTitle className="text-base font-semibold leading-snug text-foreground">
              Eu paguei por terceiros
            </CardTitle>
            <ArrowDownLeft className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold tracking-tight text-destructive">
              {formatCurrency(total_paid_by_me)}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Ex.: parcelas no cartão por outras pessoas
            </p>
          </CardContent>
        </Card>
        <Card className="border-stroke/80 bg-card">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <CardTitle className="text-base font-semibold leading-snug text-foreground">
              Terceiros me pagaram
            </CardTitle>
            <ArrowUpRight className="h-5 w-5 shrink-0 text-vault-600" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold tracking-tight text-vault-700">
              {formatCurrency(total_paid_to_me)}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Valores que já te devolveram
            </p>
          </CardContent>
        </Card>
        <Card className="border-stroke/80 bg-card">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <CardTitle className="text-base font-semibold leading-snug text-foreground">
              Contatos com movimento
            </CardTitle>
            <Users className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold tracking-tight text-foreground">
              {contacts.length}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              <Link href="/dashboard/cadastros?tab=contacts" className="text-vault-600 hover:text-vault-700 hover:underline">
                Cadastros → Contatos
              </Link>
            </p>
          </CardContent>
        </Card>
      </section>

      <Card className="border-stroke/80 bg-card overflow-hidden">
        <CardHeader className="space-y-4 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-xl font-semibold text-foreground">Saldo por contato</CardTitle>
              <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                <li><strong className="font-semibold text-foreground">Ela me pagou</strong> — lançamentos em que você marcou &quot;Ela me pagou&quot; (ou categoria &quot;Esta pessoa me paga&quot;).</li>
                <li><strong className="font-semibold text-foreground">Eu paguei por ela</strong> — o restante (adiantamentos, despesas por ela).</li>
                <li>Saldo = Eu paguei − Ela me pagou. <strong className="text-foreground">Positivo</strong> = te devem; <strong className="text-foreground">negativo</strong> = recebeu a mais.</li>
              </ul>
            </div>
            {contacts.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportCsv} className="shrink-0 gap-2 font-medium" type="button">
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {contacts.length === 0 ? (
            <p className="py-10 text-center text-sm leading-relaxed text-muted-foreground">
              Nenhum contato com lançamentos. Use o campo &quot;Contato&quot; nos lançamentos e defina &quot;Eu paguei por ela&quot; ou &quot;Ela me pagou&quot;.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-stroke/60">
              <table className="w-full min-w-[520px] text-left">
                <thead>
                  <tr className="border-b border-stroke bg-muted/40">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Contato
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Confiabilidade
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Eu paguei por ela
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Ela me pagou
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Saldo (te deve)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke/60">
                  {contacts.map((row) => (
                    <tr key={row.contact_id} className="bg-card hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                          <span className="font-semibold text-foreground">{row.contact_name}</span>
                          <Link
                            href={`/dashboard/lancamentos?contact=${encodeURIComponent(row.contact_id)}`}
                            className="inline-flex items-center gap-1 text-sm text-vault-600 hover:text-vault-700 hover:underline"
                            title="Ver lançamentos deste contato"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Ver lançamentos
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                            getPaymentReliabilityBadgeClass(row.payment_reliability)
                          )}
                        >
                          {getPaymentReliabilityLabel(row.payment_reliability)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-base font-medium text-destructive">
                        {row.paid_by_me > 0 ? formatCurrency(row.paid_by_me) : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-base font-medium text-vault-700">
                        {row.paid_to_me > 0 ? formatCurrency(row.paid_to_me) : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span
                          className={cn(
                            "tabular-nums text-base font-semibold",
                            row.balance > 0 ? "text-destructive" : row.balance < 0 ? "text-vault-700" : "text-muted-foreground"
                          )}
                        >
                          {formatCurrency(row.balance)}
                        </span>
                        <span className="ml-1.5 block text-xs text-muted-foreground sm:inline">
                          {row.balance > 0 && "(te deve)"}
                          {row.balance < 0 && "(recebeu a mais)"}
                        </span>
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
