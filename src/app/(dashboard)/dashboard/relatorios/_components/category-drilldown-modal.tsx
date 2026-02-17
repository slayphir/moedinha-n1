"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Search,
  TrendingUp,
} from "lucide-react";
import { getCategoryDrilldown, type CategoryDrilldown } from "@/app/actions/drilldown";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string | null;
  categoryName: string;
  startDate: string;
  endDate: string;
}

export function CategoryDrilldownModal({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  startDate,
  endDate,
}: Props) {
  const [data, setData] = useState<CategoryDrilldown | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) {
      setData(null);
      setSearch("");
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getCategoryDrilldown(categoryId, startDate, endDate)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, categoryId, startDate, endDate]);

  const filteredTransactions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!data?.transactions?.length) return [];

    if (!normalizedSearch) return data.transactions;

    return data.transactions.filter((transaction) => {
      const description = (transaction.description ?? "").toLowerCase();
      return description.includes(normalizedSearch) || transaction.date.includes(normalizedSearch);
    });
  }, [data?.transactions, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <TrendingUp className="h-5 w-5" />
            {categoryName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-vault-600 border-t-transparent" />
          </div>
        ) : data ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pb-3 pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Total no periodo</p>
                  <p className="text-lg font-bold text-red-500">{formatCurrency(data.totalSpend)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pb-3 pt-4 text-center">
                  <p className="text-xs text-muted-foreground">% do total</p>
                  <p className="text-lg font-bold">{data.pctOfTotal.toFixed(1)}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pb-3 pt-4 text-center">
                  <p className="text-xs text-muted-foreground">vs periodo anterior</p>
                  <p
                    className={`flex items-center justify-center gap-1 text-lg font-bold ${
                      data.variationVsPrev > 0
                        ? "text-red-500"
                        : data.variationVsPrev < 0
                          ? "text-emerald-600"
                          : ""
                    }`}
                  >
                    {data.variationVsPrev > 0 ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : data.variationVsPrev < 0 ? (
                      <ArrowDownRight className="h-4 w-4" />
                    ) : null}
                    {data.variationVsPrev > 0 ? "+" : ""}
                    {data.variationVsPrev.toFixed(0)}%
                  </p>
                </CardContent>
              </Card>
            </div>

            {data.trend.length > 1 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Tendencia (6 meses)</h3>
                <div className="h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(value) => `R$${(value / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Line type="monotone" dataKey="amount" stroke="#C5473A" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground">Transacoes ({data.transactions.length})</h3>
                <div className="relative ml-auto">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-7 w-40 pl-7 text-xs"
                  />
                </div>
              </div>
              <div className="max-h-[240px] overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Descricao</th>
                      <th className="px-3 py-2 text-left">Bucket</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredTransactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2 text-muted-foreground">{transaction.date}</td>
                        <td className="px-3 py-2">{transaction.description || "-"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{transaction.bucket_name || "-"}</td>
                        <td className="px-3 py-2 text-right font-medium text-red-500">
                          {formatCurrency(transaction.amount)}
                        </td>
                      </tr>
                    ))}
                    {filteredTransactions.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                          Nenhuma transacao encontrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem dados para o periodo selecionado.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
