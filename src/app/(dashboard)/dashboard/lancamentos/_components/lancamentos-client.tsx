"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CSVExporter } from "./csv-exporter";
import { CSVImporter } from "./csv-importer";
import { EditTransactionDialog } from "./edit-transaction-dialog";
import { Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { deleteTransactionsBulk } from "@/app/actions/transactions";

export type LancamentoRow = {
  id: string;
  type: string;
  status: string;
  amount: number;
  date: string;
  due_date: string | null;
  installment_id: string | null;
  description: string | null;
  created_at: string;
  account?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  contact?: { id: string; name: string } | null;
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
  helper.accessor((row) => row.description ?? "", {
    id: "description",
    header: "Descricao",
    cell: (cell) => cell.row.original.description ?? "-",
  }),
  helper.accessor((row) => row.account?.name ?? "", {
    id: "account",
    header: "Conta",
    cell: (cell) => cell.row.original.account?.name ?? "-",
  }),
  helper.accessor((row) => row.category?.name ?? "", {
    id: "category",
    header: "Categoria",
    cell: (cell) => cell.row.original.category?.name ?? "-",
  }),
  helper.accessor((row) => row.contact?.name ?? "", {
    id: "contact",
    header: "Contato",
    cell: (cell) => cell.row.original.contact?.name ?? "-",
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
    cell: (cell) => (
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${cell.getValue() === "cleared" ? "bg-emerald-500" : "bg-yellow-500"}`} />
        <span className="capitalize">{String(cell.getValue() === "cleared" ? "Pago" : "Pendente")}</span>
      </div>
    ),
  }),
  helper.display({
    id: "actions",
    cell: (props) => (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-primary"
        onClick={(e) => {
          e.stopPropagation();
          // @ts-expect-error custom table meta callback.
          props.table.options.meta?.editTransaction(props.row.original);
        }}
      >
        <Pencil className="h-4 w-4" />
      </Button>
    ),
  }),
];

type Props = {
  initialTransactions: LancamentoRow[];
  totalPages?: number;
  currentPage?: number;
  orgId: string;
  focusPendingBucket?: boolean;
  accountOptions: Array<{
    id: string;
    name: string;
    type: "card" | "account";
  }>;
  selectedAccountType: "all" | "card" | "account";
  selectedAccountId: string;
  contactOptions: Array<{ id: string; name: string }>;
  selectedContactId: string;
  searchTerm: string;
  selectedMonth: string;
};

export function LancamentosClient({
  initialTransactions,
  totalPages = 1,
  currentPage = 1,
  orgId,
  focusPendingBucket = false,
  accountOptions,
  selectedAccountType,
  selectedAccountId,
  contactOptions,
  selectedContactId,
  searchTerm,
  selectedMonth,
}: Props) {
  const data = initialTransactions;
  const [searchDraft, setSearchDraft] = useState(searchTerm);
  const [editingTransaction, setEditingTransaction] = useState<LancamentoRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [deletingSelected, setDeletingSelected] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const updateQueryParams = useCallback((mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router]);

  useEffect(() => {
    setSearchDraft(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    const normalizedDraft = searchDraft.trim();
    if (normalizedDraft === searchTerm) return;

    const timeoutId = window.setTimeout(() => {
      updateQueryParams((params) => {
        if (normalizedDraft) {
          params.set("q", normalizedDraft);
        } else {
          params.delete("q");
        }
        params.set("page", "1");
      });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchDraft, searchTerm, updateQueryParams]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;
    updateQueryParams((params) => {
      params.set("page", String(newPage));
    });
  };

  const handleAccountTypeChange = (value: "all" | "card" | "account") => {
    updateQueryParams((params) => {
      if (value === "all") {
        params.delete("accountType");
      } else {
        params.set("accountType", value);
      }
      params.delete("account");
      params.set("page", "1");
    });
  };

  const handleAccountChange = (accountId: string) => {
    updateQueryParams((params) => {
      if (accountId) {
        params.set("account", accountId);
      } else {
        params.delete("account");
      }
      params.set("page", "1");
    });
  };

  const handleMonthChange = (month: string) => {
    updateQueryParams((params) => {
      if (month) {
        params.set("month", month);
      } else {
        params.delete("month");
      }
      params.set("page", "1");
    });
  };

  const handleContactChange = (contactId: string) => {
    updateQueryParams((params) => {
      if (contactId) {
        params.set("contact", contactId);
      } else {
        params.delete("contact");
      }
      params.set("page", "1");
    });
  };

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // Manual pagination is handled by parent, so we don't need getPaginationRowModel
    manualPagination: true,
    pageCount: totalPages,
    meta: {
      editTransaction: (transaction: LancamentoRow) => setEditingTransaction(transaction)
    }
  });

  const visibleRows = table.getRowModel().rows;
  const visibleIds = useMemo(() => visibleRows.map((row) => row.original.id), [visibleRows]);
  const selectedVisibleCount = useMemo(
    () => visibleIds.filter((id) => selectedIds[id]).length,
    [visibleIds, selectedIds]
  );
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const anySelected = Object.values(selectedIds).some(Boolean);
  const visibleAccountOptions =
    selectedAccountType === "all"
      ? accountOptions
      : accountOptions.filter((account) => account.type === selectedAccountType);

  const toggleRowSelection = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (!checked) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      return { ...current, [id]: true };
    });
  };

  const toggleVisibleSelection = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = { ...current };
      for (const id of visibleIds) {
        if (checked) {
          next[id] = true;
        } else {
          delete next[id];
        }
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds({});

  const handleDeleteSelected = async () => {
    const ids = Object.keys(selectedIds).filter((id) => selectedIds[id]);
    if (ids.length === 0) return;

    const confirmDelete = window.confirm(
      `Excluir ${ids.length} lancamento(s) selecionado(s)? Esta acao faz exclusao logica.`
    );
    if (!confirmDelete) return;

    setDeletingSelected(true);
    const result = await deleteTransactionsBulk(orgId, ids);
    setDeletingSelected(false);

    if (result.error) {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: result.error,
      });
      return;
    }

    toast({
      title: "Lancamentos excluidos",
      description: `${result.count ?? ids.length} lancamento(s) removido(s).`,
    });
    clearSelection();
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-3xl">Lançamentos</h1>
        <p className="text-muted-foreground">Controle seus ganhos e gastos com exportação/importação em um clique.</p>
        {focusPendingBucket && (
          <div className="mt-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Exibindo apenas despesas sem bucket. Edite o lancamento e selecione a categoria para aplicar o bucket automaticamente.
          </div>
        )}
      </div>

      <Card className="border-emerald-500/20 bg-white/90">
        <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Lista</CardTitle>
          <div className="flex flex-wrap gap-2">
            <select
              value={selectedAccountType}
              onChange={(event) => handleAccountTypeChange(event.target.value as "all" | "card" | "account")}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Filtrar por tipo de conta"
            >
              <option value="all">Todas (contas + cartoes)</option>
              <option value="account">Somente contas</option>
              <option value="card">Somente cartoes</option>
            </select>
            <select
              value={selectedAccountId}
              onChange={(event) => handleAccountChange(event.target.value)}
              className="h-10 min-w-[220px] rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Filtrar por conta especifica"
            >
              <option value="">Todas as contas</option>
              {visibleAccountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <Input
              placeholder="Buscar..."
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              className="w-[220px]"
            />
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => handleMonthChange(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Filtrar por mes e ano"
            />
            {selectedMonth && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleMonthChange("")}
              >
                Limpar mes
              </Button>
            )}
            <select
              value={selectedContactId}
              onChange={(event) => handleContactChange(event.target.value)}
              className="h-10 min-w-[160px] rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Filtrar por contato"
            >
              <option value="">Todos os contatos</option>
              {contactOptions.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
            <CSVExporter />
            <CSVImporter onSuccess={() => router.refresh()} />
            <Button
              variant="default"
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent("financeiro:open-transaction"))}
            >
              Novo
            </Button>
            {focusPendingBucket && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/dashboard/lancamentos")}
              >
                Ver todos
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              disabled={!anySelected || deletingSelected}
              onClick={handleDeleteSelected}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deletingSelected ? "Excluindo..." : "Excluir selecionados"}
            </Button>
            {anySelected && (
              <Button variant="outline" size="sm" onClick={clearSelection}>
                Limpar selecao
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b bg-muted/60">
                    <th className="w-10 px-4 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(event) => toggleVisibleSelection(event.target.checked)}
                        aria-label="Selecionar linhas visiveis"
                        className="h-4 w-4 rounded border-input"
                      />
                    </th>
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
                    <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhum lançamento encontrado.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedIds[row.original.id])}
                          onChange={(event) => toggleRowSelection(row.original.id, event.target.checked)}
                          aria-label={`Selecionar lancamento ${row.original.id}`}
                          className="h-4 w-4 rounded border-input"
                        />
                      </td>
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

      <EditTransactionDialog
        open={!!editingTransaction}
        onOpenChange={(open) => !open && setEditingTransaction(null)}
        transaction={editingTransaction}
        orgId={orgId}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
