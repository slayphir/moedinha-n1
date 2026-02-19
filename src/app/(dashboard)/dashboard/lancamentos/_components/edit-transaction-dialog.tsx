"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CurrencyInput } from "@/components/ui/currency-input";
import { useToast } from "@/components/ui/use-toast";
import { useFinancialData } from "@/hooks/use-financial-data";
import { updateTransaction, deleteTransaction, type UpdateInput } from "@/app/actions/transactions";
import type { LancamentoRow } from "./lancamentos-client";
import { TagSelector } from "./tag-selector";

const schema = z.object({
  description: z.string().default(""),
  amount: z.coerce.number().min(0.01, "Valor deve ser maior que zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data invalida"),
  accountId: z.string().min(1, "Conta e obrigatoria"),
  categoryId: z.string().nullable(),
  status: z.enum(["pending", "cleared"]),
  tags: z.array(z.string()).default([]),
  scope: z.enum(["single", "forward", "all"]).default("single"),
  amountMode: z.enum(["installment", "total"]).default("installment"),
});

type FormValues = z.infer<typeof schema>;

interface EditTransactionDialogProps {
  transaction: LancamentoRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  orgId: string;
}

function parseInstallmentMeta(description: string | null): { index: number; total: number } | null {
  if (!description) return null;
  const match = description.match(/\((\d{1,3})\s*\/\s*(\d{1,3})\)/);
  if (!match) return null;
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < 2) return null;
  return { index, total };
}

function stripInstallmentSuffix(description: string | null): string {
  if (!description) return "";
  return description.replace(/\s*\(\d{1,3}\s*\/\s*\d{1,3}\)\s*$/, "").trim();
}

export function EditTransactionDialog({
  transaction,
  open,
  onOpenChange,
  onSuccess,
  orgId,
}: EditTransactionDialogProps) {
  const { accounts, categories, refetch } = useFinancialData();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: "",
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      accountId: "",
      categoryId: null,
      status: "pending",
      tags: [],
      scope: "single",
      amountMode: "installment",
    },
  });

  const {
    reset,
    setValue,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = form;

  const installmentMeta = useMemo(
    () => parseInstallmentMeta(transaction?.description ?? null),
    [transaction?.description]
  );
  const hasInstallmentSeries = Boolean(transaction?.installment_id) && Boolean(installmentMeta);
  const amountMode = watch("amountMode");
  const scope = watch("scope");
  const isSeriesMassEdit = hasInstallmentSeries && scope !== "single";
  const selectedCategoryId = watch("categoryId");
  const amountLabel = hasInstallmentSeries
    ? amountMode === "total"
      ? "Valor da compra"
      : "Valor da parcela"
    : "Valor";

  const isExpense = transaction?.type === "expense";
  const typeLabel = isExpense ? "Despesa" : transaction?.type === "income" ? "Receita" : "Transferencia";
  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId),
    [categories, selectedCategoryId]
  );

  useEffect(() => {
    if (transaction && open) {
      if (deleteConfirmOpen) setDeleteConfirmOpen(false);
      reset({
        description: hasInstallmentSeries
          ? stripInstallmentSuffix(transaction.description ?? null)
          : transaction.description || "",
        amount: Math.abs(transaction.amount),
        date: transaction.date,
        accountId: transaction.account?.id || "",
        categoryId: transaction.category?.id || null,
        status: transaction.status as "pending" | "cleared",
        tags: [],
        scope: "single",
        amountMode: "installment",
      });
    }
  }, [transaction, open, reset, deleteConfirmOpen, hasInstallmentSeries]);

  async function onSubmit(data: FormValues) {
    if (!transaction) return;
    setLoading(true);

    const tagsToSubmit = Array.from(new Set((data.tags ?? []).filter(Boolean)));
    const payload: UpdateInput = {
      id: transaction.id,
      scope: hasInstallmentSeries ? data.scope : "single",
      installment_id: hasInstallmentSeries ? transaction.installment_id : null,
    };

    if (isSeriesMassEdit) {
      payload.category_id = data.categoryId;
      if (tagsToSubmit.length > 0) payload.tags = tagsToSubmit;
    } else {
      payload.description = data.description;
      payload.amount = data.amount;
      payload.date = data.date;
      payload.status = data.status;
      payload.account_id = data.accountId;
      payload.category_id = data.categoryId;
      payload.amount_mode = hasInstallmentSeries ? data.amountMode : "installment";
      if (tagsToSubmit.length > 0) payload.tags = tagsToSubmit;
    }

    const result = await updateTransaction(orgId, payload);

    setLoading(false);

    if (result.error) {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar",
        description: result.error,
      });
      return;
    }

    toast({ title: "Lancamento atualizado" });
    onSuccess();
    onOpenChange(false);
    refetch();
  }

  async function handleDeleteInstallment() {
    if (!transaction?.installment_id) return;
    const confirmDelete = window.confirm("Excluir todo o parcelamento? Esta acao faz exclusao logica em todas as parcelas.");
    if (!confirmDelete) return;

    setLoading(true);
    const result = await deleteTransaction(orgId, transaction.id, {
      scope: "all",
      installment_id: transaction.installment_id,
    });
    setLoading(false);

    if (result.error) {
      toast({
        variant: "destructive",
        title: "Erro ao excluir parcelamento",
        description: result.error,
      });
      return;
    }

    toast({ title: "Parcelamento excluido" });
    onSuccess();
    onOpenChange(false);
    refetch();
  }

  async function handleDelete() {
    if (!transaction) return;
    setLoading(true);

    const result = await deleteTransaction(orgId, transaction.id, {
      scope: hasInstallmentSeries ? scope : "single",
      installment_id: hasInstallmentSeries ? transaction.installment_id : null,
    });

    setLoading(false);
    if (result.error) {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: result.error,
      });
      return;
    }

    toast({ title: "Lancamento excluido" });
    onSuccess();
    onOpenChange(false);
    refetch();
  }

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-[560px]">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Editar {typeLabel}</DialogTitle>
          <DialogDescription>Faca alteracoes no lancamento selecionado.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex max-h-[calc(90vh-72px)] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-2">
          {hasInstallmentSeries && installmentMeta && (
            <div className="space-y-3 rounded-md border border-stroke bg-paper/60 p-3">
              <p className="text-xs text-muted-foreground">
                Parcela {installmentMeta.index}/{installmentMeta.total} de uma serie.
              </p>

              <div className="space-y-2">
                <Label>Aplicar alteracoes em</Label>
                <Select value={scope} onValueChange={(value: "single" | "forward" | "all") => setValue("scope", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Somente esta parcela</SelectItem>
                    <SelectItem value="forward">Esta e proximas</SelectItem>
                    <SelectItem value="all">Todas as parcelas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {scope === "single" ? (
                <>
                  <div className="space-y-2">
                    <Label>Valor informado</Label>
                    <Tabs
                      value={amountMode}
                      onValueChange={(value) => {
                        if (value === "installment" || value === "total") {
                          setValue("amountMode", value);
                        }
                      }}
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="installment">Valor da parcela</TabsTrigger>
                        <TabsTrigger value="total">Valor da compra</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Ao informar total da compra, o sistema redistribui as parcelas automaticamente.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Modo em massa: altere apenas categoria e adicione tags para o parcelamento.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Descricao</Label>
            <Input {...form.register("description")} placeholder="Ex: Mercado" disabled={isSeriesMassEdit} />
            {isSeriesMassEdit && (
              <p className="text-xs text-muted-foreground">
                Descricao travada no modo em massa para evitar alteracoes indevidas na serie.
              </p>
            )}
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          {!isSeriesMassEdit && (
            <div className={`grid gap-4 ${hasInstallmentSeries ? "grid-cols-1" : "grid-cols-2"}`}>
              <div className="space-y-2">
                <Label>{amountLabel}</Label>
                <Controller
                  control={control}
                  name="amount"
                  render={({ field: { value, onChange } }) => (
                    <CurrencyInput value={value} onChange={onChange} className="font-semibold" />
                  )}
                />
                {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
                {hasInstallmentSeries && (
                  <p className="text-xs text-muted-foreground">
                    {amountMode === "total"
                      ? "O sistema recalcula as parcelas no escopo escolhido com base no total da compra."
                      : "O sistema aplica este valor em cada parcela do escopo escolhido."}
                  </p>
                )}
              </div>

              {!hasInstallmentSeries && (
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" {...form.register("date")} />
                  {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
                </div>
              )}
            </div>
          )}

          {isSeriesMassEdit ? (
            transaction.type !== "transfer" ? (
              <div className="space-y-2">
                <Label>Categoria (aplicar em massa)</Label>
                <Select value={watch("categoryId") || "none"} onValueChange={(val) => setValue("categoryId", val === "none" ? null : val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {categories
                      .filter((category) => category.type === transaction.type)
                      .map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {selectedCategoryId
                    ? selectedCategory?.default_bucket_id
                      ? "Bucket sera aplicado automaticamente com base na categoria."
                      : "Categoria sem bucket padrao. Configure em Cadastros > Categorias."
                    : "Sem categoria selecionada, o lancamento ficara sem bucket."}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Transferencias nao possuem categoria. Neste modo, voce pode apenas adicionar tags em massa.
              </p>
            )
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Conta</Label>
                <Select value={watch("accountId")} onValueChange={(val) => setValue("accountId", val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {transaction.type !== "transfer" && (
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select
                    value={watch("categoryId") || "none"}
                    onValueChange={(val) => setValue("categoryId", val === "none" ? null : val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {categories
                        .filter((category) => category.type === transaction.type)
                        .map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {selectedCategoryId
                      ? selectedCategory?.default_bucket_id
                        ? "Bucket sera aplicado automaticamente com base na categoria."
                        : "Categoria sem bucket padrao. Configure em Cadastros > Categorias."
                      : "Sem categoria selecionada, o lancamento ficara sem bucket."}
                  </p>
                </div>
              )}
            </div>
          )}

          {!isSeriesMassEdit && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={watch("status")} onValueChange={(val: "pending" | "cleared") => setValue("status", val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente (Agendado)</SelectItem>
                  <SelectItem value="cleared">Realizado (Pago/Recebido)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>{isSeriesMassEdit ? "Tags para adicionar" : "Tags"}</Label>
            <TagSelector value={watch("tags")} onChange={(val) => setValue("tags", val)} />
            {isSeriesMassEdit && (
              <p className="text-xs text-muted-foreground">
                As tags selecionadas serao adicionadas nas parcelas do escopo escolhido, sem remover tags existentes.
              </p>
            )}
          </div>
          </div>

          <DialogFooter className="gap-2 border-t border-stroke/60 bg-background px-6 py-4 sm:justify-between">
            {deleteConfirmOpen ? (
              <div className="flex w-full flex-col gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium text-destructive">Tem certeza?</span>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteConfirmOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sim, excluir"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </Button>
                {hasInstallmentSeries && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={handleDeleteInstallment}
                    disabled={loading}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir parcelamento
                  </Button>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Salvar alteracoes"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
