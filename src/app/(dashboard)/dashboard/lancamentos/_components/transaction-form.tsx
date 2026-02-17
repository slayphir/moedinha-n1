"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addMonths, parseISO } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { transactionSchema, type TransactionFormValues } from "@/lib/validators/transaction";
import { useFinancialData } from "@/hooks/use-financial-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { CreateAccountDialog } from "./create-account-dialog";
import { CreateCategoryDialog } from "./create-category-dialog";
import { TagSelector } from "./tag-selector";
import { ContactSelector } from "./contact-selector";
import type { QuickTransactionDraft } from "@/lib/quick-launch";
import { trackQuickValidationError } from "@/lib/quick-log-metrics";

type TxType = TransactionFormValues["type"];
type Frequency = NonNullable<TransactionFormValues["frequency"]>;

interface TransactionInsert {
  org_id: string;
  type: TxType;
  status: "pending" | "cleared";
  amount: number;
  account_id: string;
  transfer_account_id: string | null;
  category_id: string | null;
  contact_id?: string | null;
  description: string | null;
  date: string;
  due_date?: string | null;
  created_by: string;
}

export interface QuickSaveResult {
  insertedIds: string[];
  orgId: string;
  ttlMs: number;
  clicks: number;
  autoCategorized: boolean;
  manualCategoryCorrection: boolean;
}

const LAST_ACCOUNT_KEY = "moedinha_n1_last_account_id";
const ACCOUNT_CATEGORY_MEMORY_KEY = "moedinha_n1_account_category_memory";
const DESCRIPTION_CATEGORY_MEMORY_KEY = "moedinha_n1_description_category_memory";

const QUICK_TEMPLATES: Array<{ label: string; amount: number; description: string; type: TxType }> = [
  { label: "Cafe 12", amount: 12, description: "Cafe", type: "expense" },
  { label: "Almoco 35", amount: 35, description: "Almoco", type: "expense" },
  { label: "Mercado 120", amount: 120, description: "Mercado", type: "expense" },
  { label: "Uber 25", amount: 25, description: "Uber", type: "expense" },
];

const CATEGORY_HINTS: Array<{ keywords: string[]; categoryTerms: string[] }> = [
  { keywords: ["uber", "99", "taxi", "combustivel", "posto"], categoryTerms: ["transporte", "mobilidade", "combustivel"] },
  { keywords: ["ifood", "restaurante", "lanchonete", "padaria", "mercado", "supermercado", "cafe"], categoryTerms: ["alimentacao", "mercado", "comida"] },
  { keywords: ["internet", "vivo", "tim", "claro", "energia", "luz", "agua"], categoryTerms: ["moradia", "contas", "servicos", "fixas"] },
  { keywords: ["farmacia", "droga", "saude", "medico", "hospital"], categoryTerms: ["saude", "farmacia"] },
  { keywords: ["cinema", "netflix", "spotify", "lazer", "show"], categoryTerms: ["lazer", "entretenimento"] },
];

const defaultValues: TransactionFormValues = {
  description: "",
  amount: 0,
  type: "expense",
  accountId: "",
  categoryId: null,
  date: new Date().toISOString().slice(0, 10),
  dueDate: null,
  isPaid: true,
  isInstallment: false,
  installments: 2,
  isRecurring: false,
  frequency: "monthly",
  endDate: null,
  tags: [],
  interestAmount: 0,
  fineAmount: 0,
  transferAccountId: null,
  contactId: null,
};

function splitAmount(total: number, count: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents % count;
  return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

function clampDay(year: number, monthIndex: number, day: number) {
  const maxDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.max(1, Math.min(day, maxDay));
}

function toIsoDate(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, clampDay(year, monthIndex, day)).toISOString().slice(0, 10);
}

function computeCreditCardDueDate(
  txDateIso: string,
  closingDay: number | null | undefined,
  dueDay: number | null | undefined
): string | null {
  if (!dueDay || dueDay < 1 || dueDay > 31) return null;

  const txDate = new Date(`${txDateIso}T12:00:00`);
  let monthOffset = 0;

  if (closingDay && closingDay >= 1 && closingDay <= 31) {
    if (txDate.getDate() > closingDay) {
      monthOffset = 1;
    }
  } else if (txDate.getDate() > dueDay) {
    monthOffset = 1;
  }

  const target = new Date(txDate.getFullYear(), txDate.getMonth() + monthOffset, 1);
  return toIsoDate(target.getFullYear(), target.getMonth(), dueDay);
}

function asFrequency(value: string): Frequency {
  if (value === "daily" || value === "weekly" || value === "monthly" || value === "yearly") return value;
  return "monthly";
}

function asType(value: string): TxType {
  if (value === "income" || value === "expense" || value === "transfer") return value;
  return "expense";
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function safeReadMap(key: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function safeWriteMap(key: string, value: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getMerchantToken(description: string): string {
  const words = normalizeText(description).split(/\s+/).filter(Boolean);
  return words.slice(0, 2).join(" ");
}

function findCategoryByTerms(
  categories: Array<{ id: string; name: string; type: string }>,
  type: TxType,
  terms: string[]
): string | null {
  const allowed = categories.filter((category) => category.type === type);
  for (const term of terms) {
    const match = allowed.find((category) => normalizeText(category.name).includes(normalizeText(term)));
    if (match) return match.id;
  }
  return null;
}

function suggestCategoryFromDescription(
  description: string,
  categories: Array<{ id: string; name: string; type: string }>,
  type: TxType
): string | null {
  const normalizedDescription = normalizeText(description);
  if (!normalizedDescription) return null;

  for (const hint of CATEGORY_HINTS) {
    if (hint.keywords.some((keyword) => normalizedDescription.includes(keyword))) {
      return findCategoryByTerms(categories, type, hint.categoryTerms);
    }
  }
  return null;
}

function buildAccountCategoryKey(accountId: string, type: TxType): string {
  return `${accountId}:${type}`;
}

export function TransactionForm({
  onSuccess,
  initialDraft,
}: {
  onSuccess?: (result: QuickSaveResult) => void;
  initialDraft?: QuickTransactionDraft | null;
}) {
  const { accounts, categories, refetch } = useFinancialData();
  const [loading, setLoading] = useState(false);
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [accountCategoryMemory, setAccountCategoryMemory] = useState<Record<string, string>>({});
  const [descriptionCategoryMemory, setDescriptionCategoryMemory] = useState<Record<string, string>>({});
  const [categoryManuallyTouched, setCategoryManuallyTouched] = useState(false);
  const [autoCategorized, setAutoCategorized] = useState(false);
  const [manualCategoryCorrection, setManualCategoryCorrection] = useState(false);

  const supabase = createClient();
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const clicksRef = useRef<number>(0);
  const autoSuggestedCategoryRef = useRef<string | null>(null);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    getValues,
    formState: { errors },
  } = form;
  const amountRegister = register("amount");

  const type = watch("type");
  const sourceAccountId = watch("accountId");
  const txDate = watch("date");
  const isInstallment = watch("isInstallment");
  const isRecurring = watch("isRecurring");
  const descriptionValue = watch("description") ?? "";
  const selectedCategoryId = watch("categoryId");
  const selectedDueDate = watch("dueDate");

  const selectedAccount = useMemo(
    () => accounts.find((item) => item.id === sourceAccountId),
    [accounts, sourceAccountId]
  );
  const selectedAccountIsCreditCard = Boolean(selectedAccount?.is_credit_card) || selectedAccount?.type === "credit_card";
  const suggestedDueDate = selectedAccountIsCreditCard
    ? computeCreditCardDueDate(txDate, selectedAccount?.closing_day, selectedAccount?.due_day)
    : null;

  const accountOptions = accounts.filter((account) => account.id !== sourceAccountId);
  const categoriesForType = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type]
  );

  useEffect(() => {
    setAccountCategoryMemory(safeReadMap(ACCOUNT_CATEGORY_MEMORY_KEY));
    setDescriptionCategoryMemory(safeReadMap(DESCRIPTION_CATEGORY_MEMORY_KEY));
  }, []);

  useEffect(() => {
    startedAtRef.current = Date.now();
    clicksRef.current = 0;
    setTimeout(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    }, 0);
  }, []);

  useEffect(() => {
    if (accounts.length === 0) return;
    const current = getValues("accountId");
    if (current) return;

    const lastAccount = typeof window !== "undefined" ? window.localStorage.getItem(LAST_ACCOUNT_KEY) : null;
    const fallback = accounts.find((account) => account.id === lastAccount)?.id ?? accounts[0].id;
    setValue("accountId", fallback, { shouldValidate: true });
  }, [accounts, getValues, setValue]);

  useEffect(() => {
    if (!initialDraft) return;
    if (initialDraft.type) setValue("type", initialDraft.type);
    if (initialDraft.amount && initialDraft.amount > 0) setValue("amount", initialDraft.amount, { shouldValidate: true });
    if (initialDraft.description) {
      setValue("description", initialDraft.description);
      setShowDetails(true);
    }
    setTimeout(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    }, 0);
  }, [initialDraft, setValue]);

  useEffect(() => {
    if (type === "transfer") {
      setValue("categoryId", null);
      return;
    }

    if (categoryManuallyTouched) return;
    if (!sourceAccountId) return;

    const memoryKey = buildAccountCategoryKey(sourceAccountId, type);
    const fromAccountMemory = accountCategoryMemory[memoryKey];
    if (fromAccountMemory && categoriesForType.some((category) => category.id === fromAccountMemory)) {
      setValue("categoryId", fromAccountMemory, { shouldValidate: true });
      autoSuggestedCategoryRef.current = fromAccountMemory;
      setAutoCategorized(true);
    }
  }, [type, sourceAccountId, categoryManuallyTouched, accountCategoryMemory, categoriesForType, setValue]);

  useEffect(() => {
    if (type === "transfer") return;
    if (categoryManuallyTouched) return;
    if (!descriptionValue.trim()) return;

    const merchantToken = getMerchantToken(descriptionValue);
    const fromDescriptionMemory = descriptionCategoryMemory[merchantToken];
    const fromKeywordSuggestion =
      suggestCategoryFromDescription(descriptionValue, categories, type) ?? null;

    const suggestion =
      (fromDescriptionMemory && categoriesForType.some((category) => category.id === fromDescriptionMemory)
        ? fromDescriptionMemory
        : null) ?? fromKeywordSuggestion;

    if (!suggestion) return;
    if (suggestion === selectedCategoryId) return;

    setValue("categoryId", suggestion, { shouldValidate: true });
    autoSuggestedCategoryRef.current = suggestion;
    setAutoCategorized(true);
  }, [
    type,
    categoryManuallyTouched,
    descriptionValue,
    descriptionCategoryMemory,
    categories,
    categoriesForType,
    selectedCategoryId,
    setValue,
  ]);

  const onInvalid = () => {
    trackQuickValidationError();
  };

  async function onSubmit(data: TransactionFormValues) {
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario nao autenticado");

      const account = accounts.find((item) => item.id === data.accountId);
      if (!account) throw new Error("Conta de origem invalida");

      const status = data.isPaid ? "cleared" : "pending";
      const description = data.description?.trim() || null;
      const computedDueDate =
        data.type === "expense" && selectedAccountIsCreditCard
          ? computeCreditCardDueDate(data.date, account.closing_day, account.due_day)
          : null;
      const resolvedDueDate = data.type === "expense" ? data.dueDate || computedDueDate : null;

      const basePayload: Omit<TransactionInsert, "amount" | "description" | "date"> = {
        org_id: account.org_id,
        type: data.type,
        status,
        account_id: data.accountId,
        transfer_account_id: data.type === "transfer" ? data.transferAccountId ?? null : null,
        category_id: data.type === "transfer" ? null : data.categoryId ?? null,
        contact_id: data.contactId ?? null,
        created_by: user.id,
      };

      let rows: TransactionInsert[] = [];

      if (data.type === "expense" && data.isInstallment && data.installments && data.installments > 1) {
        const parts = splitAmount(data.amount, data.installments);
        const startDate = parseISO(data.date);
        const dueDateBase = resolvedDueDate ? parseISO(resolvedDueDate) : null;
        rows = parts.map((value, index) => ({
          ...basePayload,
          amount: value,
          description: description ? `${description} (${index + 1}/${data.installments})` : `Parcela ${index + 1}/${data.installments}`,
          date: addMonths(startDate, index).toISOString().slice(0, 10),
          due_date: dueDateBase ? addMonths(dueDateBase, index).toISOString().slice(0, 10) : null,
        }));
      } else {
        rows = [
          {
            ...basePayload,
            amount: data.amount,
            description,
            date: data.date,
            due_date: resolvedDueDate,
          },
        ];
      }

      const firstRow = rows[0];
      if (firstRow) {
        const { data: duplicate } = await supabase
          .from("transactions")
          .select("id, description, date")
          .eq("org_id", firstRow.org_id)
          .eq("account_id", firstRow.account_id)
          .eq("type", firstRow.type)
          .eq("amount", firstRow.amount)
          .eq("date", firstRow.date)
          .is("deleted_at", null)
          .limit(1);

        if (duplicate && duplicate.length > 0) {
          const shouldContinue = window.confirm(
            "Possivel duplicado detectado para o mesmo valor/conta/data. Deseja salvar mesmo assim?"
          );
          if (!shouldContinue) return;
        }
      }

      const { data: inserted, error: txError } = await supabase
        .from("transactions")
        .insert(rows)
        .select("id");

      if (txError) throw txError;

      if (data.tags && data.tags.length > 0 && inserted && inserted.length > 0) {
        const tagLinks = inserted.flatMap((transaction) =>
          data.tags!.map((tagId) => ({
            transaction_id: transaction.id,
            tag_id: tagId,
          }))
        );

        const { error: tagsError } = await supabase.from("transaction_tags").insert(tagLinks);
        if (tagsError) throw tagsError;
      }

      if (data.isRecurring && data.frequency && data.type !== "transfer") {
        const seedDate = parseISO(data.date);
        const frequency = data.frequency;

        const { error: recurringError } = await supabase.from("recurring_rules").insert({
          org_id: account.org_id,
          description: description ?? "Lancamento recorrente",
          amount: data.amount,
          account_id: data.accountId,
          category_id: data.categoryId ?? null,
          frequency,
          day_of_month: frequency === "monthly" ? seedDate.getDate() : null,
          day_of_week: frequency === "weekly" ? seedDate.getDay() : null,
          start_date: data.date,
          end_date: data.endDate || null,
          is_active: true,
        });

        if (recurringError) throw recurringError;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_ACCOUNT_KEY, data.accountId);
      }

      if (data.type !== "transfer" && data.categoryId) {
        const accountKey = buildAccountCategoryKey(data.accountId, data.type);
        const nextAccountMemory = { ...accountCategoryMemory, [accountKey]: data.categoryId };
        setAccountCategoryMemory(nextAccountMemory);
        safeWriteMap(ACCOUNT_CATEGORY_MEMORY_KEY, nextAccountMemory);

        const merchantToken = getMerchantToken(description ?? "");
        if (merchantToken) {
          const nextDescriptionMemory = { ...descriptionCategoryMemory, [merchantToken]: data.categoryId };
          setDescriptionCategoryMemory(nextDescriptionMemory);
          safeWriteMap(DESCRIPTION_CATEGORY_MEMORY_KEY, nextDescriptionMemory);
        }
      }

      const now = new Date().toISOString().slice(0, 10);
      const ttlMs = Date.now() - startedAtRef.current;
      const clicks = Math.max(1, clicksRef.current);

      const insertedIds = inserted?.map((row) => row.id) ?? [];
      onSuccess?.({
        insertedIds,
        orgId: account.org_id,
        ttlMs,
        clicks,
        autoCategorized,
        manualCategoryCorrection,
      });

      reset({
        ...defaultValues,
        date: now,
        dueDate: null,
        accountId: data.accountId,
        type: data.type,
        categoryId: data.type === "transfer" ? null : data.categoryId ?? null,
      });

      setCategoryManuallyTouched(false);
      setAutoCategorized(false);
      setManualCategoryCorrection(false);
      autoSuggestedCategoryRef.current = null;
      startedAtRef.current = Date.now();
      clicksRef.current = 0;

      setTimeout(() => {
        amountInputRef.current?.focus();
        amountInputRef.current?.select();
      }, 0);

      refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao salvar lancamento";
      alert(`Erro ao salvar transacao: ${message}`);
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const handleInteraction = (event: React.PointerEvent<HTMLFormElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, [role='combobox'], [role='option']")) {
      clicksRef.current += 1;
    }
  };

  const applyTemplate = (template: { amount: number; description: string; type: TxType }) => {
    setValue("type", template.type, { shouldValidate: true });
    setValue("amount", template.amount, { shouldValidate: true });
    setValue("description", template.description);
    setCategoryManuallyTouched(false);
  };

  const handleInstallmentQuick = (installments: number) => {
    if (installments <= 1) {
      setValue("isInstallment", false);
      setValue("installments", null);
      return;
    }
    setValue("isInstallment", true);
    setValue("installments", installments);
  };

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit, onInvalid)} onPointerDown={handleInteraction} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Tabs
              value={type}
              onValueChange={(value) => {
                const nextType = asType(value);
                setValue("type", nextType, { shouldValidate: true });
                setCategoryManuallyTouched(false);
                if (nextType !== "transfer") setValue("transferAccountId", null);
              }}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="expense">Despesa</TabsTrigger>
                <TabsTrigger value="income">Receita</TabsTrigger>
                <TabsTrigger value="transfer">Transferencia</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-2">
            <Label>{type === "transfer" ? "Conta origem" : "Conta/Cartao"}</Label>
            <Select
              value={watch("accountId") || undefined}
              onValueChange={(value) => {
                if (value === "new") {
                  setNewAccountOpen(true);
                  return;
                }
                setValue("accountId", value, { shouldValidate: true });
                setCategoryManuallyTouched(false);
                if (watch("transferAccountId") === value) setValue("transferAccountId", null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
                <SelectItem value="new" className="mt-1 border-t pt-1 font-semibold text-primary">
                  + Nova conta
                </SelectItem>
              </SelectContent>
            </Select>
            {errors.accountId && <p className="text-xs text-destructive">{errors.accountId.message}</p>}
          </div>
        </div>

        {type === "transfer" && (
          <div className="space-y-2">
            <Label>Conta destino</Label>
            <Select
              value={watch("transferAccountId") || undefined}
              onValueChange={(value) => setValue("transferAccountId", value, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {accountOptions.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.transferAccountId && <p className="text-xs text-destructive">{errors.transferAccountId.message}</p>}
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <div className="space-y-2">
            <Label>Valor</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              autoFocus
              placeholder="0.00"
              {...amountRegister}
              ref={(node) => {
                amountRegister.ref(node);
                amountInputRef.current = node;
              }}
              className="h-12 text-2xl font-semibold"
            />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>
          <Button type="submit" className="h-12 px-5" disabled={loading}>
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>

        {type !== "transfer" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Categoria</Label>
              {autoCategorized && !categoryManuallyTouched && (
                <span className="inline-flex items-center gap-1 rounded-full bg-vault-700/15 px-2 py-0.5 text-xs text-vault-700">
                  <Sparkles className="h-3 w-3" />
                  sugestao automatica
                </span>
              )}
            </div>
            <Select
              value={watch("categoryId") || undefined}
              onValueChange={(value) => {
                if (value === "new") {
                  setNewCategoryOpen(true);
                  return;
                }
                if (autoSuggestedCategoryRef.current && autoSuggestedCategoryRef.current !== value) {
                  setManualCategoryCorrection(true);
                }
                setCategoryManuallyTouched(true);
                setValue("categoryId", value, { shouldValidate: true });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione ou use a sugestao" />
              </SelectTrigger>
              <SelectContent>
                {categoriesForType.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
                <SelectItem value="new" className="mt-1 border-t pt-1 font-semibold text-primary">
                  + Nova categoria
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Atalhos rapidos</Label>
          <div className="flex flex-wrap gap-2">
            {QUICK_TEMPLATES.map((template) => (
              <Button
                key={template.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyTemplate(template)}
              >
                {template.label}
              </Button>
            ))}
          </div>
        </div>

        {type === "expense" && (
          <div className="space-y-2">
            <Label>Parcelamento rapido</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={!isInstallment ? "default" : "outline"} size="sm" onClick={() => handleInstallmentQuick(1)}>
                A vista
              </Button>
              <Button type="button" variant={watch("installments") === 3 ? "default" : "outline"} size="sm" onClick={() => handleInstallmentQuick(3)}>
                3x
              </Button>
              <Button type="button" variant={watch("installments") === 6 ? "default" : "outline"} size="sm" onClick={() => handleInstallmentQuick(6)}>
                6x
              </Button>
              <Button type="button" variant={watch("installments") === 12 ? "default" : "outline"} size="sm" onClick={() => handleInstallmentQuick(12)}>
                12x
              </Button>
            </div>
            {errors.installments && <p className="text-xs text-destructive">{errors.installments.message}</p>}
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          className="w-full justify-between border border-stroke"
          onClick={() => setShowDetails((open) => !open)}
        >
          Mais detalhes (opcional)
          {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>

        {showDetails && (
          <div className="space-y-4 rounded-lg border border-stroke bg-paper/70 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" {...register("date")} />
                {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <label className="flex h-10 items-center gap-2 rounded-md border border-stroke px-3 text-sm">
                  <input type="checkbox" {...register("isPaid")} className="h-4 w-4 rounded border-input" />
                  Ja foi pago
                </label>
              </div>
            </div>

            {type === "expense" && (
              <div className="space-y-2">
                <Label>Vencimento (fatura)</Label>
                <Input type="date" {...register("dueDate")} />
                {!selectedDueDate && suggestedDueDate && (
                  <p className="text-xs text-muted-foreground">
                    Sugerido para este cartao: {suggestedDueDate}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Descricao</Label>
              <Input placeholder="Ex: Mercado, Uber, Salario" {...register("description")} />
            </div>

            <div className="space-y-2">
              <Label>Contato (opcional)</Label>
              <ContactSelector value={watch("contactId")} onChange={(id) => setValue("contactId", id)} />
            </div>

            <div className="space-y-2">
              <Label>Tags (opcional)</Label>
              <TagSelector value={watch("tags") || []} onChange={(tags) => setValue("tags", tags)} />
            </div>

            {type !== "transfer" && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...register("isRecurring")} className="h-4 w-4 rounded border-input" />
                  Tornar recorrente
                </label>
                {isRecurring && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Frequencia</Label>
                      <Select
                        value={watch("frequency") ?? "monthly"}
                        onValueChange={(value) => setValue("frequency", asFrequency(value), { shouldValidate: true })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Diaria</SelectItem>
                          <SelectItem value="weekly">Semanal</SelectItem>
                          <SelectItem value="monthly">Mensal</SelectItem>
                          <SelectItem value="yearly">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Fim (opcional)</Label>
                      <Input type="date" {...register("endDate")} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </form>

      <CreateAccountDialog
        open={newAccountOpen}
        onOpenChange={setNewAccountOpen}
        onSuccess={(id) => setValue("accountId", id, { shouldValidate: true })}
      />
      <CreateCategoryDialog
        open={newCategoryOpen}
        onOpenChange={setNewCategoryOpen}
        onSuccess={(id) => setValue("categoryId", id, { shouldValidate: true })}
        defaultType={type === "transfer" ? "expense" : type}
      />
    </>
  );
}
