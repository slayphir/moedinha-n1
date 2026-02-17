"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CSVExporter } from "./csv-exporter";
import { CSVImporter } from "./csv-importer";

export type LancamentoRow = {
  id: string;
  type: string;
  status: string;
  amount: number;
  date: string;
  due_date: string | null;
  description: string | null;
  created_at: string;
  account?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
};

const helper = createColumnHelper<LancamentoRow>();

const columns = [
  helper.accessor("date", {
    header: "Data",
    cell: (cell) => formatDate(cell.getValue()),
  }),
  helper.accessor("due_date", {
    header: "Vencimento",
    cell: (cell) => (cell.getValue() ? formatDate(String(cell.getValue())) : "-"),
  }),
  helper.accessor("description", {
    header: "Descricao",
    cell: (cell) => cell.getValue() ?? "-",
  }),
  helper.accessor((row) => row.account?.name, {
    id: "account",
    header: "Conta",
    cell: (cell) => cell.getValue() ?? "-",
  }),
  helper.accessor((row) => row.category?.name, {
    id: "category",
    header: "Categoria",
    cell: (cell) => cell.getValue() ?? "-",
  }),
  helper.accessor("amount", {
    header: "Valor",
    cell: (cell) => {
      const row = cell.row.original;
      const raw = Number(cell.getValue());
      const signedValue = row.type === "expense" ? -Math.abs(raw) : Math.abs(raw);
      const textClass =
        row.type === "income"
          ? "text-emerald-700"
          : row.type === "expense"
            ? "text-rose-700"
            : "text-slate-700";

      return <span className={`font-semibold ${textClass}`}>{formatCurrency(signedValue)}</span>;
    },
  }),
  helper.accessor("status", {
    header: "Status",
    cell: (cell) => String(cell.getValue()),
  }),
];

type Props = {
  initialTransactions: LancamentoRow[];
  totalPages?: number;
  currentPage?: number;
};

export function LancamentosClient({ initialTransactions, totalPages = 1, currentPage = 1 }: Props) {
  const [data] = useState(initialTransactions);
  const [globalFilter, setGlobalFilter] = useState("");
  const router = useRouter();

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`?${params.toString()}`);
  }

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // Manual pagination is handled by parent, so we don't need getPaginationRowModel
    manualPagination: true,
    pageCount: totalPages,
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-3xl">Lançamentos</h1>
        <p className="text-muted-foreground">Controle seus ganhos e gastos com exportação/importação em um clique.</p>
      </div>

      <Card className="border-emerald-500/20 bg-white/90">
        <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Lista</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Buscar..."
              value={globalFilter ?? ""}
              onChange={(event) => setGlobalFilter(event.target.value)}
              className="w-[220px]"
            />
            <CSVExporter />
            <CSVImporter onSuccess={() => router.refresh()} />
            <Button
              variant="default"
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent("financeiro:open-transaction"))}
            >
              Novo
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b bg-muted/60">
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} className="px-4 py-2 text-left font-medium">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhum lançamento encontrado.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-muted/30">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-2">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                Próxima
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
