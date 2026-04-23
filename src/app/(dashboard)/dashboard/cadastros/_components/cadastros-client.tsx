"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { deleteCategoryBudget, upsertCategoryBudget, upsertCategoryBudgetsBatch } from "@/app/actions/budgets";
import { assignBucketToCategoriesBatch } from "@/app/actions/categories";
import {
  generateIncomeRunsForMonth,
  markIncomeRunAsReceived,
  saveIncomeSource,
  toggleIncomeSourceActive,
  updateIncomeRun,
} from "@/app/actions/income-sources";
import { CreateContactDialog } from "./create-contact-dialog";
import { EditContactDialog } from "./edit-contact-dialog";
import { CreateAccountDialog } from "./create-account-dialog";
import { CreateCategoryDialog } from "./create-category-dialog";
import { CreateTagDialog } from "./create-tag-dialog";
import { EditAccountDialog } from "./edit-account-dialog";
import { EditCategoryDialog } from "./edit-category-dialog";
import { EditTagDialog } from "./edit-tag-dialog";
import { Contact } from "@/hooks/use-financial-data";
import { getPaymentReliabilityLabel, getPaymentReliabilityBadgeClass } from "@/lib/payment-reliability";
import { formatCurrency, cn } from "@/lib/utils";
import { CircleDollarSign, FolderOpen, Loader2, Pencil, Plus, Search, Tag, Users, Wallet, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { BudgetCard, CategoryBudgetInfo } from "./budget-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AccountRow = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  is_credit_card?: boolean | null;
  credit_limit?: number | null;
  closing_day?: number | null;
  due_day?: number | null;
};

type IncomeSourceRow = {
  id: string;
  name: string;
  planned_amount: number;
  day_of_month: number;
  account_id: string;
  category_id?: string | null;
  is_active: boolean;
  notes?: string | null;
};

type IncomeRunStatus = "pending" | "received" | "skipped" | "cancelled";

type IncomeRunRow = {
  id: string;
  source_id: string;
  month: string;
  expected_date: string;
  planned_amount: number;
  actual_amount?: number | null;
  status: IncomeRunStatus;
  received_at?: string | null;
  transaction_id?: string | null;
  source_name?: string | null;
};

type Props = {
  accounts: AccountRow[];
  categories: { id: string; name: string; type: string; default_bucket_id?: string | null; default_bucket_name?: string | null; is_creditor_center?: boolean }[];
  buckets: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  contacts: Contact[];
  incomeSources: IncomeSourceRow[];
  incomeRuns: IncomeRunRow[];
  initialTab: string;
  budgetMonth: string;
  categoryBudgetMap: Record<string, CategoryBudgetInfo>;
  monthExpenseByCategory: Record<string, number>;
};

const BUDGET_WIZARD_STEPS = [
  { id: 1, label: "Categorias" },
  { id: 2, label: "Regras" },
  { id: 3, label: "Revisao" },
] as const;

const CATEGORY_BUCKET_WIZARD_STEPS = [
  { id: 1, label: "Categorias" },
  { id: 2, label: "Bucket" },
  { id: 3, label: "Revisao" },
] as const;

function normalizeSearchTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseDecimalInput(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^0-9,.\-]/g, "");
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const sepIndex = Math.max(lastComma, lastDot);

  let normalized: string;
  if (sepIndex === -1) {
    normalized = cleaned.replace(/[^\d\-]/g, "");
  } else {
    const integerPart = cleaned.slice(0, sepIndex).replace(/[^\d\-]/g, "");
    const decimalPart = cleaned.slice(sepIndex + 1).replace(/[^\d]/g, "");
    normalized = `${integerPart}.${decimalPart}`;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function formatDecimalForInput(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function formatYearMonthLabel(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return value;
  const [yearRaw, monthRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1, 12, 0, 0, 0));
}

export function CadastrosClient({
  accounts,
  categories,
  buckets,
  tags,
  contacts,
  incomeSources,
  incomeRuns,
  initialTab,
  budgetMonth,
  categoryBudgetMap,
  monthExpenseByCategory,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const [currentTab, setCurrentTab] = useState(initialTab || "accounts");

  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [createContactOpen, setCreateContactOpen] = useState(false);

  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [editingCategory, setEditingCategory] = useState<{
    id: string;
    name: string;
    type: string;
    default_bucket_id?: string | null;
    default_bucket_name?: string | null;
    is_creditor_center?: boolean;
  } | null>(null);
  const [editingTag, setEditingTag] = useState<{ id: string; name: string } | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetCategory, setBudgetCategory] = useState<{ id: string; name: string } | null>(null);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetThreshold, setBudgetThreshold] = useState("80");
  const [budgetAssistantOpen, setBudgetAssistantOpen] = useState(false);
  const [assistantSaving, setAssistantSaving] = useState(false);
  const [assistantIncludeExisting, setAssistantIncludeExisting] = useState(false);
  const [assistantMode, setAssistantMode] = useState<"spent_factor" | "fixed">("spent_factor");
  const [assistantFactor, setAssistantFactor] = useState("110");
  const [assistantFixedAmount, setAssistantFixedAmount] = useState("");
  const [assistantThreshold, setAssistantThreshold] = useState("80");
  const [assistantSelected, setAssistantSelected] = useState<Record<string, boolean>>({});
  const [assistantStep, setAssistantStep] = useState<1 | 2 | 3>(1);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryBucketWizardOpen, setCategoryBucketWizardOpen] = useState(false);
  const [categoryBucketWizardSaving, setCategoryBucketWizardSaving] = useState(false);
  const [categoryBucketWizardStep, setCategoryBucketWizardStep] = useState<1 | 2 | 3>(1);
  const [categoryBucketWizardSearch, setCategoryBucketWizardSearch] = useState("");
  const [categoryBucketWizardOnlyWithoutBucket, setCategoryBucketWizardOnlyWithoutBucket] = useState(true);
  const [categoryBucketWizardSelected, setCategoryBucketWizardSelected] = useState<Record<string, boolean>>({});
  const [categoryBucketWizardBucketId, setCategoryBucketWizardBucketId] = useState("");
  const [categoryBucketWizardBackfill, setCategoryBucketWizardBackfill] = useState(true);

  const [incomeSourceDialogOpen, setIncomeSourceDialogOpen] = useState(false);
  const [incomeSourceSaving, setIncomeSourceSaving] = useState(false);
  const [editingIncomeSourceId, setEditingIncomeSourceId] = useState<string | null>(null);
  const [incomeSourceName, setIncomeSourceName] = useState("");
  const [incomeSourcePlannedAmount, setIncomeSourcePlannedAmount] = useState("");
  const [incomeSourceDayOfMonth, setIncomeSourceDayOfMonth] = useState("5");
  const [incomeSourceAccountId, setIncomeSourceAccountId] = useState("");
  const [incomeSourceCategoryId, setIncomeSourceCategoryId] = useState("none");
  const [incomeSourceIsActive, setIncomeSourceIsActive] = useState(true);
  const [incomeSourceNotes, setIncomeSourceNotes] = useState("");
  const [incomeRunsGenerating, setIncomeRunsGenerating] = useState(false);
  const [incomeToggleBusyById, setIncomeToggleBusyById] = useState<Record<string, boolean>>({});
  const [incomeRunDialogOpen, setIncomeRunDialogOpen] = useState(false);
  const [selectedIncomeRun, setSelectedIncomeRun] = useState<IncomeRunRow | null>(null);
  const [incomeRunReceivedAmount, setIncomeRunReceivedAmount] = useState("");
  const [incomeRunReceivedDate, setIncomeRunReceivedDate] = useState("");
  const [incomeRunSaving, setIncomeRunSaving] = useState(false);
  const [incomeRunEditDialogOpen, setIncomeRunEditDialogOpen] = useState(false);
  const [editingIncomeRun, setEditingIncomeRun] = useState<IncomeRunRow | null>(null);
  const [incomeRunEditPlannedAmount, setIncomeRunEditPlannedAmount] = useState("");
  const [incomeRunEditExpectedDate, setIncomeRunEditExpectedDate] = useState("");
  const [incomeRunEditStatus, setIncomeRunEditStatus] = useState<"pending" | "skipped" | "cancelled">("pending");
  const [incomeRunEditSaving, setIncomeRunEditSaving] = useState(false);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === "expense"),
    [categories]
  );

  const normalizedCategorySearch = normalizeSearchTerm(categorySearch);
  const filteredCategories = useMemo(
    () =>
      categories.filter((category) => {
        if (!normalizedCategorySearch) return true;
        const normalizedName = normalizeSearchTerm(category.name);
        return normalizedName.includes(normalizedCategorySearch);
      }),
    [categories, normalizedCategorySearch]
  );

  const bucketWizardEligibleCategories = useMemo(
    () => categories.filter((category) => category.type !== "transfer"),
    [categories]
  );
  const normalizedBucketWizardSearch = normalizeSearchTerm(categoryBucketWizardSearch);
  const bucketWizardCategories = useMemo(
    () =>
      bucketWizardEligibleCategories.filter((category) => {
        if (categoryBucketWizardOnlyWithoutBucket && category.default_bucket_id) return false;
        if (!normalizedBucketWizardSearch) return true;
        return normalizeSearchTerm(category.name).includes(normalizedBucketWizardSearch);
      }),
    [
      bucketWizardEligibleCategories,
      categoryBucketWizardOnlyWithoutBucket,
      normalizedBucketWizardSearch,
    ]
  );
  const bucketWizardSelectedCategories = useMemo(
    () => bucketWizardCategories.filter((category) => categoryBucketWizardSelected[category.id]),
    [bucketWizardCategories, categoryBucketWizardSelected]
  );
  const bucketWizardSelectedCount = bucketWizardSelectedCategories.length;
  const allBucketWizardSelected =
    bucketWizardCategories.length > 0 && bucketWizardSelectedCount === bucketWizardCategories.length;
  const selectedWizardBucket = useMemo(
    () => buckets.find((bucket) => bucket.id === categoryBucketWizardBucketId) ?? null,
    [buckets, categoryBucketWizardBucketId]
  );

  const assistantCategories = useMemo(
    () =>
      expenseCategories.filter((category) =>
        assistantIncludeExisting ? true : !categoryBudgetMap[category.id]
      ),
    [expenseCategories, assistantIncludeExisting, categoryBudgetMap]
  );

  const assistantSelectedCategories = useMemo(
    () => assistantCategories.filter((category) => assistantSelected[category.id]),
    [assistantCategories, assistantSelected]
  );

  const accountNameById = useMemo(
    () => Object.fromEntries(accounts.map((account) => [account.id, account.name])),
    [accounts]
  );
  const incomeCategoryOptions = useMemo(
    () => categories.filter((category) => category.type === "income"),
    [categories]
  );
  const incomeSourceById = useMemo(
    () => Object.fromEntries(incomeSources.map((source) => [source.id, source])),
    [incomeSources]
  );
  const incomeMonthInput = budgetMonth.slice(0, 7);
  const incomeMonthLabel = useMemo(() => formatYearMonthLabel(incomeMonthInput), [incomeMonthInput]);
  const pendingIncomeRuns = useMemo(
    () => incomeRuns.filter((run) => run.status === "pending"),
    [incomeRuns]
  );

  function handleTabChange(value: string) {
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    params.set("tab", value);
    setCurrentTab(value);
    router.push(`${pathname}?${params.toString()}`);
  }

  function getTodayIsoDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function openIncomeSourceDialog(source?: IncomeSourceRow) {
    const defaultAccountId = accounts.find((account) => account.is_active)?.id ?? accounts[0]?.id ?? "";
    const hasIncomeCategory =
      !!source?.category_id && incomeCategoryOptions.some((category) => category.id === source.category_id);

    setEditingIncomeSourceId(source?.id ?? null);
    setIncomeSourceName(source?.name ?? "");
    setIncomeSourcePlannedAmount(source ? formatDecimalForInput(Number(source.planned_amount ?? 0)) : "");
    setIncomeSourceDayOfMonth(source ? String(Number(source.day_of_month ?? 1)) : "5");
    setIncomeSourceAccountId(source?.account_id ?? defaultAccountId);
    setIncomeSourceCategoryId(hasIncomeCategory ? (source?.category_id as string) : "none");
    setIncomeSourceIsActive(source?.is_active ?? true);
    setIncomeSourceNotes(source?.notes ?? "");
    setIncomeSourceDialogOpen(true);
  }

  function closeIncomeSourceDialog(open: boolean) {
    setIncomeSourceDialogOpen(open);
    if (!open) {
      setEditingIncomeSourceId(null);
    }
  }

  async function handleSaveIncomeSource() {
    const plannedAmount = parseDecimalInput(incomeSourcePlannedAmount);
    const dayOfMonth = Number(incomeSourceDayOfMonth);
    const name = incomeSourceName.trim();

    if (!name) {
      toast({
        variant: "destructive",
        title: "Nome obrigatorio",
        description: "Informe um nome para a fonte de renda.",
      });
      return;
    }

    if (plannedAmount === null || plannedAmount < 0) {
      toast({
        variant: "destructive",
        title: "Valor invalido",
        description: "Informe um valor planejado valido.",
      });
      return;
    }

    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      toast({
        variant: "destructive",
        title: "Dia invalido",
        description: "Informe um dia entre 1 e 31.",
      });
      return;
    }

    if (!incomeSourceAccountId) {
      toast({
        variant: "destructive",
        title: "Conta obrigatoria",
        description: "Selecione a conta de recebimento.",
      });
      return;
    }

    setIncomeSourceSaving(true);
    try {
      const result = await saveIncomeSource({
        id: editingIncomeSourceId ?? undefined,
        name,
        plannedAmount: Number(plannedAmount.toFixed(4)),
        dayOfMonth,
        accountId: incomeSourceAccountId,
        categoryId: incomeSourceCategoryId === "none" ? null : incomeSourceCategoryId,
        isActive: incomeSourceIsActive,
        notes: incomeSourceNotes.trim() || null,
      });

      if (result.error) {
        toast({
          variant: "destructive",
          title: "Erro ao salvar fonte",
          description: result.error,
        });
        return;
      }

      toast({
        title: editingIncomeSourceId ? "Fonte atualizada" : "Fonte criada",
        description: `${name} foi salva com sucesso.`,
      });
      setIncomeSourceDialogOpen(false);
      setEditingIncomeSourceId(null);
      router.refresh();
    } finally {
      setIncomeSourceSaving(false);
    }
  }

  async function handleToggleIncomeSource(source: IncomeSourceRow) {
    setIncomeToggleBusyById((current) => ({ ...current, [source.id]: true }));
    try {
      const result = await toggleIncomeSourceActive({ id: source.id, isActive: !source.is_active });
      if (result.error) {
        toast({
          variant: "destructive",
          title: "Erro ao atualizar fonte",
          description: result.error,
        });
        return;
      }

      toast({
        title: !source.is_active ? "Fonte ativada" : "Fonte pausada",
        description: source.name,
      });
      router.refresh();
    } finally {
      setIncomeToggleBusyById((current) => ({ ...current, [source.id]: false }));
    }
  }

  async function handleGenerateIncomeRuns() {
    setIncomeRunsGenerating(true);
    try {
      const result = await generateIncomeRunsForMonth({ month: incomeMonthInput });
      if (result.error) {
        toast({
          variant: "destructive",
          title: "Erro ao gerar pre-lancamentos",
          description: result.error,
        });
        return;
      }

      toast({
        title: "Pre-lancamentos atualizados",
        description: `Criados: ${result.created ?? 0} | Atualizados: ${result.updated ?? 0}`,
      });
      router.refresh();
    } finally {
      setIncomeRunsGenerating(false);
    }
  }

  function openIncomeRunDialog(run: IncomeRunRow) {
    setSelectedIncomeRun(run);
    setIncomeRunReceivedAmount(formatDecimalForInput(Number(run.planned_amount ?? 0)));
    setIncomeRunReceivedDate(run.expected_date || getTodayIsoDate());
    setIncomeRunDialogOpen(true);
  }

  function openIncomeRunEditDialog(run: IncomeRunRow) {
    if (run.status === "received") {
      toast({
        variant: "destructive",
        title: "Pre-lancamento bloqueado",
        description: "Itens ja recebidos nao podem ser editados.",
      });
      return;
    }

    setEditingIncomeRun(run);
    setIncomeRunEditPlannedAmount(formatDecimalForInput(Number(run.planned_amount ?? 0)));
    setIncomeRunEditExpectedDate(run.expected_date || getTodayIsoDate());
    setIncomeRunEditStatus(run.status === "pending" || run.status === "skipped" || run.status === "cancelled" ? run.status : "pending");
    setIncomeRunEditDialogOpen(true);
  }

  async function handleMarkIncomeRunAsReceived() {
    if (!selectedIncomeRun) return;

    const amount = parseDecimalInput(incomeRunReceivedAmount);
    if (amount === null || amount <= 0) {
      toast({
        variant: "destructive",
        title: "Valor invalido",
        description: "Informe um valor recebido maior que zero.",
      });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(incomeRunReceivedDate)) {
      toast({
        variant: "destructive",
        title: "Data invalida",
        description: "Informe a data de recebimento no formato correto.",
      });
      return;
    }

    setIncomeRunSaving(true);
    try {
      const result = await markIncomeRunAsReceived({
        runId: selectedIncomeRun.id,
        receivedAmount: Number(amount.toFixed(4)),
        receivedDate: incomeRunReceivedDate,
      });

      if (result.error) {
        toast({
          variant: "destructive",
          title: "Erro ao confirmar recebimento",
          description: result.error,
        });
        return;
      }

      toast({
        title: "Recebimento confirmado",
        description: "Lancamento de receita criado com sucesso.",
      });
      setIncomeRunDialogOpen(false);
      setSelectedIncomeRun(null);
      router.refresh();
    } finally {
      setIncomeRunSaving(false);
    }
  }

  async function handleSaveIncomeRunEdit() {
    if (!editingIncomeRun) return;

    const amount = parseDecimalInput(incomeRunEditPlannedAmount);
    if (amount === null || amount < 0) {
      toast({
        variant: "destructive",
        title: "Valor invalido",
        description: "Informe um valor planejado valido.",
      });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(incomeRunEditExpectedDate)) {
      toast({
        variant: "destructive",
        title: "Data invalida",
        description: "Informe a data prevista no formato correto.",
      });
      return;
    }

    setIncomeRunEditSaving(true);
    try {
      const result = await updateIncomeRun({
        runId: editingIncomeRun.id,
        plannedAmount: Number(amount.toFixed(4)),
        expectedDate: incomeRunEditExpectedDate,
        status: incomeRunEditStatus,
      });

      if (result.error) {
        toast({
          variant: "destructive",
          title: "Erro ao editar pre-lancamento",
          description: result.error,
        });
        return;
      }

      toast({
        title: "Pre-lancamento atualizado",
        description: "As alteracoes foram salvas.",
      });
      setIncomeRunEditDialogOpen(false);
      setEditingIncomeRun(null);
      router.refresh();
    } finally {
      setIncomeRunEditSaving(false);
    }
  }

  function handleMonthInputChange(value: string) {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) return;

    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    params.set("month", value);
    params.set("tab", currentTab);
    router.push(`${pathname}?${params.toString()}`);
  }

  function renderIncomeRunStatus(status: IncomeRunStatus) {
    switch (status) {
      case "received":
        return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Recebido</Badge>;
      case "pending":
        return <Badge variant="secondary">Pendente</Badge>;
      case "skipped":
        return <Badge variant="outline">Ignorado</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  useEffect(() => {
    if (!budgetAssistantOpen) return;

    setAssistantSelected((current) => {
      const next: Record<string, boolean> = {};
      for (const category of assistantCategories) {
        next[category.id] = current[category.id] ?? true;
      }
      return next;
    });
  }, [budgetAssistantOpen, assistantCategories]);

  useEffect(() => {
    if (!categoryBucketWizardOpen) return;

    setCategoryBucketWizardSelected((current) => {
      const next: Record<string, boolean> = {};
      for (const category of bucketWizardCategories) {
        next[category.id] = current[category.id] ?? true;
      }
      return next;
    });
  }, [categoryBucketWizardOpen, bucketWizardCategories]);

  function openBudgetAssistant() {
    setAssistantStep(1);
    setBudgetAssistantOpen(true);
  }

  function openCategoryBucketWizard() {
    setCategoryBucketWizardStep(1);
    setCategoryBucketWizardSearch("");
    setCategoryBucketWizardOnlyWithoutBucket(true);
    setCategoryBucketWizardBucketId("");
    setCategoryBucketWizardBackfill(true);
    setCategoryBucketWizardOpen(true);
  }

  function toggleBucketWizardCategory(categoryId: string, checked: boolean) {
    setCategoryBucketWizardSelected((current) => ({
      ...current,
      [categoryId]: checked,
    }));
  }

  function setAllBucketWizardSelection(checked: boolean) {
    const next: Record<string, boolean> = {};
    for (const category of bucketWizardCategories) {
      next[category.id] = checked;
    }
    setCategoryBucketWizardSelected(next);
  }

  function handleCategoryBucketWizardNextStep() {
    if (categoryBucketWizardStep === 1) {
      if (bucketWizardSelectedCount === 0) {
        toast({
          variant: "destructive",
          title: "Nenhuma categoria selecionada",
          description: "Marque pelo menos uma categoria para continuar.",
        });
        return;
      }
      setCategoryBucketWizardStep(2);
      return;
    }

    if (!categoryBucketWizardBucketId) {
      toast({
        variant: "destructive",
        title: "Bucket obrigatorio",
        description: "Selecione um bucket para aplicar nas categorias.",
      });
      return;
    }

    setCategoryBucketWizardStep(3);
  }

  function handleCategoryBucketWizardPrevStep() {
    if (categoryBucketWizardStep === 3) {
      setCategoryBucketWizardStep(2);
      return;
    }
    if (categoryBucketWizardStep === 2) {
      setCategoryBucketWizardStep(1);
    }
  }

  async function handleApplyCategoryBucketWizard() {
    if (bucketWizardSelectedCount === 0) {
      toast({
        variant: "destructive",
        title: "Nenhuma categoria selecionada",
        description: "Marque pelo menos uma categoria para aplicar o wizard.",
      });
      return;
    }

    if (!categoryBucketWizardBucketId) {
      toast({
        variant: "destructive",
        title: "Bucket obrigatorio",
        description: "Selecione um bucket para continuar.",
      });
      return;
    }

    setCategoryBucketWizardSaving(true);
    try {
      const result = await assignBucketToCategoriesBatch({
        categoryIds: bucketWizardSelectedCategories.map((category) => category.id),
        bucketId: categoryBucketWizardBucketId,
        applyToExistingTransactions: categoryBucketWizardBackfill,
      });

      if (result.error) {
        toast({
          variant: "destructive",
          title: "Erro ao aplicar bucket em lote",
          description: result.error,
        });
        return;
      }

      toast({
        title: "Buckets aplicados",
        description: `${result.updatedCategories ?? bucketWizardSelectedCount} categorias atualizadas${
          categoryBucketWizardBackfill ? ` | ${result.updatedTransactions ?? 0} lancamentos ajustados` : ""
        }.`,
      });

      setCategoryBucketWizardOpen(false);
      setCategoryBucketWizardStep(1);
      router.refresh();
    } finally {
      setCategoryBucketWizardSaving(false);
    }
  }

  function toggleAssistantCategory(categoryId: string, checked: boolean) {
    setAssistantSelected((current) => ({
      ...current,
      [categoryId]: checked,
    }));
  }

  function setAllAssistantSelection(checked: boolean) {
    const next: Record<string, boolean> = {};
    for (const category of assistantCategories) {
      next[category.id] = checked;
    }
    setAssistantSelected(next);
  }

  function computeAssistantAmount(categoryId: string) {
    if (assistantMode === "fixed") {
      const fixed = Number(assistantFixedAmount);
      return Number.isFinite(fixed) ? Math.round(fixed * 100) / 100 : 0;
    }

    const spent = Number(monthExpenseByCategory[categoryId] ?? 0);
    const factor = Number(assistantFactor);
    if (!Number.isFinite(spent) || !Number.isFinite(factor)) return 0;
    return Math.round(((spent * factor) / 100) * 100) / 100;
  }

  const assistantThresholdValue = Number(assistantThreshold);
  const assistantThresholdValid =
    Number.isFinite(assistantThresholdValue) &&
    assistantThresholdValue >= 0 &&
    assistantThresholdValue <= 100;
  const assistantFactorValue = Number(assistantFactor);
  const assistantFixedAmountValue = Number(assistantFixedAmount);
  const assistantConfigValid =
    assistantMode === "spent_factor"
      ? Number.isFinite(assistantFactorValue) && assistantFactorValue > 0
      : Number.isFinite(assistantFixedAmountValue) && assistantFixedAmountValue > 0;

  const assistantPreviewRows = assistantSelectedCategories.map((category) => {
    const amount = computeAssistantAmount(category.id);
    const currentBudget = categoryBudgetMap[category.id];
    const spent = Number(monthExpenseByCategory[category.id] ?? 0);
    return {
      category,
      amount,
      spent,
      currentBudget,
      valid: Number.isFinite(amount) && amount > 0,
    };
  });

  const assistantValidItems = assistantPreviewRows
    .filter((row) => row.valid)
    .map((row) => ({
      categoryId: row.category.id,
      amount: row.amount,
      alertThreshold: assistantThresholdValue,
    }));
  const assistantSkippedCount = assistantSelectedCategories.length - assistantValidItems.length;
  const assistantTotalSuggested = assistantValidItems.reduce((sum, row) => sum + row.amount, 0);

  function handleAssistantNextStep() {
    if (assistantStep === 1) {
      if (assistantSelectedCategories.length === 0) {
        toast({
          variant: "destructive",
          title: "Nenhuma categoria selecionada",
          description: "Marque pelo menos uma categoria para continuar.",
        });
        return;
      }
      setAssistantStep(2);
      return;
    }

    if (!assistantThresholdValid) {
      toast({
        variant: "destructive",
        title: "Threshold invalido",
        description: "O alerta deve ficar entre 0 e 100.",
      });
      return;
    }

    if (!assistantConfigValid) {
      toast({
        variant: "destructive",
        title: "Configuracao invalida",
        description:
          assistantMode === "spent_factor"
            ? "Informe um fator maior que zero."
            : "Informe um valor fixo maior que zero.",
      });
      return;
    }

    setAssistantStep(3);
  }

  function handleAssistantPrevStep() {
    if (assistantStep === 3) {
      setAssistantStep(2);
      return;
    }
    if (assistantStep === 2) {
      setAssistantStep(1);
    }
  }

  async function handleApplyBudgetAssistant() {
    if (!assistantThresholdValid) {
      toast({
        variant: "destructive",
        title: "Threshold invalido",
        description: "O alerta deve ficar entre 0 e 100.",
      });
      return;
    }

    if (!assistantConfigValid) {
      toast({
        variant: "destructive",
        title: "Configuracao invalida",
        description:
          assistantMode === "spent_factor"
            ? "Informe um fator maior que zero."
            : "Informe um valor fixo maior que zero.",
      });
      return;
    }

    if (assistantSelectedCategories.length === 0) {
      toast({
        variant: "destructive",
        title: "Nenhuma categoria selecionada",
        description: "Marque pelo menos uma categoria para aplicar o assistente.",
      });
      return;
    }

    if (assistantValidItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Sem valores validos",
        description:
          assistantMode === "spent_factor"
            ? "Nao houve gasto no periodo para sugerir limites. Use modo de valor fixo."
            : "Informe um valor fixo maior que zero.",
      });
      return;
    }

    setAssistantSaving(true);
    try {
      const result = await upsertCategoryBudgetsBatch({
        month: budgetMonth,
        items: assistantValidItems,
      });

      if (result.error) {
        toast({
          variant: "destructive",
          title: "Erro ao aplicar assistente",
          description: result.error,
        });
        return;
      }

      toast({
        title: "Orcamentos atualizados",
        description:
          assistantSkippedCount > 0
            ? `${result.count ?? assistantValidItems.length} categorias salvas (${assistantSkippedCount} ignoradas por valor zero).`
            : `${result.count ?? assistantValidItems.length} categorias salvas com sucesso.`,
      });
      setBudgetAssistantOpen(false);
      setAssistantStep(1);
      router.refresh();
    } finally {
      setAssistantSaving(false);
    }
  }

  function openBudgetDialogFromCard(budget: CategoryBudgetInfo) {
    setBudgetCategory({ id: budget.categoryId, name: budget.categoryName });
    setBudgetAmount(String(budget.amount));
    setBudgetThreshold(String(budget.alert_threshold));
    setBudgetDialogOpen(true);
  }

  async function handleSaveBudget() {
    if (!budgetCategory) return;

    setBudgetSaving(true);
    try {
      const result = await upsertCategoryBudget({
        categoryId: budgetCategory.id,
        month: budgetMonth,
        amount: Number(budgetAmount),
        alertThreshold: Number(budgetThreshold),
      });

      if (result.error) {
        toast({ variant: "destructive", title: "Erro ao salvar limite", description: result.error });
        return;
      }

      toast({ title: "Limite salvo", description: `Categoria ${budgetCategory.name} atualizada.` });
      setBudgetDialogOpen(false);
      router.refresh();
    } finally {
      setBudgetSaving(false);
    }
  }

  async function handleDeleteBudget() {
    if (!budgetCategory) return;

    setBudgetSaving(true);
    try {
      const result = await deleteCategoryBudget({ categoryId: budgetCategory.id, month: budgetMonth });
      if (result.error) {
        toast({ variant: "destructive", title: "Erro ao remover limite", description: result.error });
        return;
      }

      toast({ title: "Limite removido", description: `Categoria ${budgetCategory.name} sem limite neste mes.` });
      setBudgetDialogOpen(false);
      router.refresh();
    } finally {
      setBudgetSaving(false);
    }
  }

  const activeBudgets = Object.values(categoryBudgetMap).sort((a, b) => b.usage_pct - a.usage_pct);
  const assistantSelectedCount = assistantSelectedCategories.length;
  const allAssistantSelected = assistantCategories.length > 0 && assistantSelectedCount === assistantCategories.length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Cadastros & Configurações</h1>

      <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full flex h-auto p-1">
          <TabsTrigger value="accounts" className="flex-1">Contas</TabsTrigger>
          <TabsTrigger value="categories" className="flex-1">Categorias</TabsTrigger>
          <TabsTrigger value="budgets" className="flex-1">Orçamentos</TabsTrigger>
          <TabsTrigger value="income" className="flex-1">Rendas</TabsTrigger>
          <TabsTrigger value="tags" className="flex-1">Tags</TabsTrigger>
          <TabsTrigger value="contacts" className="flex-1">Contatos</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Contas e Cartoes
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/faturas">Ver faturas</Link>
                </Button>
                <Button size="sm" onClick={() => setCreateAccountOpen(true)}>
                  Nova conta
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
                <p className="text-muted-foreground">Nenhuma conta. Crie uma para comecar.</p>
              ) : (
                <ul className="space-y-2">
                  {accounts.map((account) => {
                    const isCredit = Boolean(account.is_credit_card) || account.type === "credit_card";
                    return (
                      <li key={account.id} className="flex items-center justify-between rounded border p-3">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{account.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {account.type} - {account.is_active ? "Ativa" : "Inativa"}
                          </span>
                          {isCredit && (
                            <span className="text-xs text-muted-foreground">
                              Limite {formatCurrency(Number(account.credit_limit ?? 0))}
                              {account.closing_day ? ` | Fecha dia ${account.closing_day}` : ""}
                              {account.due_day ? ` | Vence dia ${account.due_day}` : ""}
                            </span>
                          )}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setEditingAccount(account)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                Categorias
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={openCategoryBucketWizard}>
                  <WandSparkles className="mr-2 h-4 w-4" />
                  Wizard de bucket
                </Button>
                <Button size="sm" onClick={() => setCreateCategoryOpen(true)}>
                  Nova categoria
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={categorySearch}
                    onChange={(event) => setCategorySearch(event.target.value)}
                    placeholder="Buscar categoria"
                    className="pl-9"
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {filteredCategories.length} de {categories.length} categorias
                </span>
              </div>

              {categories.length === 0 ? (
                <p className="text-muted-foreground">Nenhuma categoria.</p>
              ) : filteredCategories.length === 0 ? (
                <p className="text-muted-foreground">Nenhuma categoria encontrada para essa busca.</p>
              ) : (
                <ul className="space-y-2">
                  {filteredCategories.map((category) => {
                    return (
                      <li
                        key={category.id}
                        className="flex items-center justify-between rounded border p-3"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{category.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {category.type === "income" ? "Receita" : category.type === "expense" ? "Despesa" : "Transferencia"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Bucket padrao: {category.default_bucket_name ?? "Nao definido"}
                            {category.is_creditor_center && " • Esta pessoa me paga"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => setEditingCategory(category)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budgets" className="mt-4">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium">Orçamentos de {budgetMonth.slice(0, 7)}</h2>
                <p className="text-sm text-muted-foreground">Defina limites para controlar seus gastos.</p>
              </div>
              <Button type="button" variant="outline" onClick={openBudgetAssistant}>
                Wizard de orcamento
              </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {activeBudgets.map(budget => (
                <BudgetCard key={budget.id} budget={budget} onEdit={openBudgetDialogFromCard} />
              ))}

              <Card className="flex flex-col items-center justify-center p-6 border-dashed border-2 hover:bg-slate-50 cursor-pointer text-muted-foreground hover:text-primary transition-colors h-full min-h-[160px]"
                onClick={() => {
                  setBudgetCategory(null);
                  setBudgetAmount("");
                  setBudgetDialogOpen(true);
                }}
              >
                <div className="rounded-full bg-slate-100 p-3 mb-2">
                  <Plus className="h-6 w-6" />
                </div>
                <span className="font-medium">Novo Orçamento</span>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="income" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CircleDollarSign className="h-5 w-5" />
                  Fontes de renda
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => openIncomeSourceDialog()}
                  disabled={accounts.length === 0}
                >
                  Nova fonte
                </Button>
              </CardHeader>
              <CardContent>
                {accounts.length === 0 ? (
                  <p className="text-muted-foreground">Crie uma conta antes de cadastrar fontes de renda.</p>
                ) : incomeSources.length === 0 ? (
                  <p className="text-muted-foreground">Nenhuma fonte de renda cadastrada.</p>
                ) : (
                  <ul className="space-y-2">
                    {incomeSources.map((source) => (
                      <li key={source.id} className="flex items-center justify-between rounded border p-3">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{source.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatCurrency(Number(source.planned_amount ?? 0))} | Dia {source.day_of_month} | Conta: {accountNameById[source.account_id] ?? "Nao encontrada"}
                          </span>
                          {source.notes ? (
                            <span className="text-xs text-muted-foreground">{source.notes}</span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {source.is_active ? (
                            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Ativa</Badge>
                          ) : (
                            <Badge variant="outline">Pausada</Badge>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleIncomeSource(source)}
                            disabled={Boolean(incomeToggleBusyById[source.id])}
                          >
                            {incomeToggleBusyById[source.id] ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : source.is_active ? (
                              "Pausar"
                            ) : (
                              "Ativar"
                            )}
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => openIncomeSourceDialog(source)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CircleDollarSign className="h-5 w-5" />
                  Pre-lancamentos ({incomeMonthLabel})
                </CardTitle>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    type="month"
                    value={incomeMonthInput}
                    onChange={(event) => handleMonthInputChange(event.target.value)}
                    className="w-full sm:w-40"
                  />
                  <Button type="button" variant="outline" onClick={handleGenerateIncomeRuns} disabled={incomeRunsGenerating}>
                    {incomeRunsGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Gerando...
                      </>
                    ) : (
                      "Gerar pre-lancamentos"
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {incomeRuns.length === 0 ? (
                  <p className="text-muted-foreground">
                    Nenhum pre-lancamento para este mes. Clique em Gerar pre-lancamentos.
                  </p>
                ) : (
                  <>
                    <div className="mb-3 text-xs text-muted-foreground">
                      Pendentes: {pendingIncomeRuns.length} de {incomeRuns.length}
                    </div>
                    <ul className="space-y-2">
                      {incomeRuns.map((run) => {
                        const source = incomeSourceById[run.source_id];
                        const sourceName = run.source_name ?? source?.name ?? "Fonte removida";
                        const receivedAmount = run.actual_amount !== null && run.actual_amount !== undefined
                          ? Number(run.actual_amount)
                          : null;

                        return (
                          <li key={run.id} className="flex items-center justify-between rounded border p-3">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{sourceName}</span>
                              <span className="text-xs text-muted-foreground">
                                Previsto em {run.expected_date} | Planejado {formatCurrency(Number(run.planned_amount ?? 0))}
                              </span>
                              {receivedAmount !== null ? (
                                <span className="text-xs text-muted-foreground">
                                  Recebido: {formatCurrency(receivedAmount)}
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                              {renderIncomeRunStatus(run.status)}
                              {run.status !== "received" ? (
                                <Button type="button" size="sm" variant="outline" onClick={() => openIncomeRunEditDialog(run)}>
                                  Editar
                                </Button>
                              ) : null}
                              {run.status === "pending" ? (
                                <Button type="button" size="sm" onClick={() => openIncomeRunDialog(run)}>
                                  Marcar recebido
                                </Button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tags" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Tags
              </CardTitle>
              <Button size="sm" onClick={() => setCreateTagOpen(true)}>
                Nova tag
              </Button>
            </CardHeader>
            <CardContent>
              {tags.length === 0 ? (
                <p className="text-muted-foreground">Nenhuma tag.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <li key={tag.id} className="flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-sm">
                      <span>{tag.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 w-4 p-0 hover:bg-transparent"
                        onClick={() => setEditingTag(tag)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Contatos (Credores/Devedores)
              </CardTitle>
              <Button size="sm" onClick={() => setCreateContactOpen(true)}>
                Novo contato
              </Button>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="text-muted-foreground">Nenhum contato cadastrado.</p>
              ) : (
                <ul className="space-y-2">
                  {contacts.map((contact) => (
                    <li key={contact.id} className="flex items-center justify-between rounded border p-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{contact.name}</span>
                          {contact.payment_reliability && (
                            <span
                              className={cn(
                                "inline-flex rounded border px-2 py-0.5 text-xs font-medium",
                                getPaymentReliabilityBadgeClass(contact.payment_reliability)
                              )}
                            >
                              {getPaymentReliabilityLabel(contact.payment_reliability)}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {contact.relationship || "Outro"}
                          {contact.phone ? ` - ${contact.phone}` : ""}
                        </span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setEditingContact(contact)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CreateAccountDialog open={createAccountOpen} onOpenChange={setCreateAccountOpen} onSuccess={() => window.location.reload()} />
      <CreateCategoryDialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen} onSuccess={() => window.location.reload()} />
      <CreateTagDialog open={createTagOpen} onOpenChange={setCreateTagOpen} onSuccess={() => window.location.reload()} />
      <CreateContactDialog open={createContactOpen} onOpenChange={setCreateContactOpen} onSuccess={() => window.location.reload()} />

      <EditAccountDialog
        open={!!editingAccount}
        onOpenChange={(open) => !open && setEditingAccount(null)}
        account={editingAccount}
      />
      <EditCategoryDialog
        open={!!editingCategory}
        onOpenChange={(open) => !open && setEditingCategory(null)}
        category={editingCategory}
      />
      <EditTagDialog open={!!editingTag} onOpenChange={(open) => !open && setEditingTag(null)} tag={editingTag} />
      <EditContactDialog
        open={!!editingContact}
        onOpenChange={(open) => !open && setEditingContact(null)}
        contact={editingContact}
        onSuccess={() => window.location.reload()}
      />

      <Dialog open={incomeSourceDialogOpen} onOpenChange={closeIncomeSourceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingIncomeSourceId ? "Editar fonte de renda" : "Nova fonte de renda"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={incomeSourceName}
                onChange={(event) => setIncomeSourceName(event.target.value)}
                placeholder="Ex.: Salario CLT"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Valor planejado (R$)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={incomeSourcePlannedAmount}
                  onChange={(event) => setIncomeSourcePlannedAmount(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Dia previsto</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  step="1"
                  value={incomeSourceDayOfMonth}
                  onChange={(event) => setIncomeSourceDayOfMonth(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Conta de recebimento</Label>
              <Select value={incomeSourceAccountId} onValueChange={setIncomeSourceAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Categoria de receita (opcional)</Label>
              <Select value={incomeSourceCategoryId} onValueChange={setIncomeSourceCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {incomeCategoryOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Observacoes (opcional)</Label>
              <Input
                value={incomeSourceNotes}
                onChange={(event) => setIncomeSourceNotes(event.target.value)}
                placeholder="Ex.: bonus trimestral pode variar"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={incomeSourceIsActive}
                onCheckedChange={(checked) => setIncomeSourceIsActive(Boolean(checked))}
              />
              Fonte ativa
            </label>
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setIncomeSourceDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveIncomeSource}
              disabled={incomeSourceSaving || accounts.length === 0}
            >
              {incomeSourceSaving ? "Salvando..." : "Salvar fonte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={incomeRunDialogOpen}
        onOpenChange={(open) => {
          setIncomeRunDialogOpen(open);
          if (!open) setSelectedIncomeRun(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar recebimento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded border border-muted bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              Fonte: <span className="font-medium text-foreground">{selectedIncomeRun?.source_name ?? incomeSourceById[selectedIncomeRun?.source_id ?? ""]?.name ?? "-"}</span>
            </div>

            <div className="space-y-2">
              <Label>Valor recebido (R$)</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={incomeRunReceivedAmount}
                onChange={(event) => setIncomeRunReceivedAmount(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Data de recebimento</Label>
              <Input
                type="date"
                value={incomeRunReceivedDate}
                onChange={(event) => setIncomeRunReceivedDate(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setIncomeRunDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleMarkIncomeRunAsReceived} disabled={incomeRunSaving || !selectedIncomeRun}>
              {incomeRunSaving ? "Confirmando..." : "Marcar recebido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={incomeRunEditDialogOpen}
        onOpenChange={(open) => {
          setIncomeRunEditDialogOpen(open);
          if (!open) setEditingIncomeRun(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar pre-lancamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded border border-muted bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              Fonte: <span className="font-medium text-foreground">{editingIncomeRun?.source_name ?? incomeSourceById[editingIncomeRun?.source_id ?? ""]?.name ?? "-"}</span>
            </div>

            <div className="space-y-2">
              <Label>Valor planejado (R$)</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={incomeRunEditPlannedAmount}
                onChange={(event) => setIncomeRunEditPlannedAmount(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Data prevista</Label>
              <Input
                type="date"
                value={incomeRunEditExpectedDate}
                onChange={(event) => setIncomeRunEditExpectedDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={incomeRunEditStatus}
                onValueChange={(value) => {
                  if (value === "pending" || value === "skipped" || value === "cancelled") {
                    setIncomeRunEditStatus(value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="skipped">Ignorado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setIncomeRunEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSaveIncomeRunEdit} disabled={incomeRunEditSaving || !editingIncomeRun}>
              {incomeRunEditSaving ? "Salvando..." : "Salvar alteracoes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={categoryBucketWizardOpen}
        onOpenChange={(open) => {
          setCategoryBucketWizardOpen(open);
          if (!open) {
            setCategoryBucketWizardStep(1);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Wizard de bucket em lote</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {CATEGORY_BUCKET_WIZARD_STEPS.map((step) => {
                const active = step.id === categoryBucketWizardStep;
                const done = step.id < categoryBucketWizardStep;
                return (
                  <div
                    key={step.id}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : done
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-muted text-muted-foreground"
                    }`}
                  >
                    {step.id}. {step.label}
                  </div>
                );
              })}
            </div>

            {categoryBucketWizardStep === 1 ? (
              <>
                <div className="flex flex-col gap-2 rounded border border-muted p-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={categoryBucketWizardOnlyWithoutBucket}
                      onCheckedChange={(checked) => setCategoryBucketWizardOnlyWithoutBucket(Boolean(checked))}
                    />
                    Mostrar somente categorias sem bucket
                  </label>

                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setAllBucketWizardSelection(true)}>
                      Marcar todas
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setAllBucketWizardSelection(false)}>
                      Limpar
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={categoryBucketWizardSearch}
                    onChange={(event) => setCategoryBucketWizardSearch(event.target.value)}
                    placeholder="Buscar categorias no wizard"
                    className="pl-9"
                  />
                </div>

                <div className="max-h-72 overflow-y-auto rounded border">
                  {bucketWizardCategories.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      Nenhuma categoria elegivel para este filtro.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {bucketWizardCategories.map((category) => (
                        <label key={category.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3 text-sm">
                          <Checkbox
                            checked={Boolean(categoryBucketWizardSelected[category.id])}
                            onCheckedChange={(checked) => toggleBucketWizardCategory(category.id, Boolean(checked))}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">{category.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {category.type === "income" ? "Receita" : "Despesa"}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            Atual: {category.default_bucket_name ?? "-"}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded border border-muted bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Selecionadas: {bucketWizardSelectedCount}
                  {bucketWizardCategories.length > 0 ? ` de ${bucketWizardCategories.length}` : ""}
                  {allBucketWizardSelected ? " (todas)" : ""}
                </div>
              </>
            ) : null}

            {categoryBucketWizardStep === 2 ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Bucket para aplicar</Label>
                  <Select
                    value={categoryBucketWizardBucketId}
                    onValueChange={(value) => setCategoryBucketWizardBucketId(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um bucket" />
                    </SelectTrigger>
                    <SelectContent>
                      {buckets.map((bucket) => (
                        <SelectItem key={bucket.id} value={bucket.id}>
                          {bucket.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={categoryBucketWizardBackfill}
                    onCheckedChange={(checked) => setCategoryBucketWizardBackfill(Boolean(checked))}
                  />
                  Aplicar tambem em lancamentos existentes sem bucket
                </label>

                <div className="rounded border border-muted bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Categorias selecionadas: {bucketWizardSelectedCount}
                </div>
              </div>
            ) : null}

            {categoryBucketWizardStep === 3 ? (
              <>
                <div className="max-h-72 overflow-y-auto rounded border">
                  {bucketWizardSelectedCategories.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      Nenhuma categoria selecionada.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {bucketWizardSelectedCategories.map((category) => (
                        <div key={category.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 p-3 text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium">{category.name}</span>
                            <span className="text-xs text-muted-foreground">
                              Atual: {category.default_bucket_name ?? "-"}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">Novo: {selectedWizardBucket?.name ?? "-"}</span>
                          <span className="text-xs text-emerald-700">Pronto</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded border border-muted bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Aplicar em: {bucketWizardSelectedCount} categorias | Bucket: {selectedWizardBucket?.name ?? "-"}
                  {categoryBucketWizardBackfill ? " | Backfill de lancamentos ativo" : ""}
                </div>
              </>
            ) : null}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setCategoryBucketWizardOpen(false)}>
              Cancelar
            </Button>
            <div className="flex items-center gap-2">
              {categoryBucketWizardStep > 1 ? (
                <Button type="button" variant="outline" onClick={handleCategoryBucketWizardPrevStep}>
                  Voltar
                </Button>
              ) : null}
              {categoryBucketWizardStep < 3 ? (
                <Button type="button" onClick={handleCategoryBucketWizardNextStep}>
                  Proximo
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleApplyCategoryBucketWizard}
                  disabled={categoryBucketWizardSaving || !categoryBucketWizardBucketId || bucketWizardSelectedCount === 0}
                >
                  {categoryBucketWizardSaving ? "Aplicando..." : "Aplicar wizard"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={budgetAssistantOpen}
        onOpenChange={(open) => {
          setBudgetAssistantOpen(open);
          if (!open) {
            setAssistantStep(1);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Wizard de orcamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {BUDGET_WIZARD_STEPS.map((step) => {
                const active = step.id === assistantStep;
                const done = step.id < assistantStep;
                return (
                  <div
                    key={step.id}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : done
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-muted text-muted-foreground"
                    }`}
                  >
                    {step.id}. {step.label}
                  </div>
                );
              })}
            </div>

            {assistantStep === 1 ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-muted p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={assistantIncludeExisting}
                      onCheckedChange={(checked) => setAssistantIncludeExisting(Boolean(checked))}
                    />
                    Incluir categorias que ja possuem orcamento
                  </label>

                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setAllAssistantSelection(true)}>
                      Marcar todas
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setAllAssistantSelection(false)}>
                      Limpar
                    </Button>
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto rounded border">
                  {assistantCategories.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      Nenhuma categoria elegivel para o wizard neste filtro.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {assistantCategories.map((category) => {
                        const currentBudget = categoryBudgetMap[category.id];
                        const spent = Number(monthExpenseByCategory[category.id] ?? 0);

                        return (
                          <label key={category.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3 text-sm">
                            <Checkbox
                              checked={Boolean(assistantSelected[category.id])}
                              onCheckedChange={(checked) => toggleAssistantCategory(category.id, Boolean(checked))}
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">{category.name}</span>
                              <span className="text-xs text-muted-foreground">
                                Gasto mes: {formatCurrency(spent)}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              Atual: {currentBudget ? formatCurrency(currentBudget.amount) : "-"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded border border-muted bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Mes de referencia: {budgetMonth.slice(0, 7)} | Selecionadas: {assistantSelectedCount}
                  {assistantCategories.length > 0 ? ` de ${assistantCategories.length}` : ""}
                  {allAssistantSelected ? " (todas)" : ""}
                </div>
              </>
            ) : null}

            {assistantStep === 2 ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Modo de sugestao</Label>
                    <Select
                      value={assistantMode}
                      onValueChange={(value) => {
                        if (value === "spent_factor" || value === "fixed") {
                          setAssistantMode(value);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spent_factor">Gasto do mes x fator</SelectItem>
                        <SelectItem value="fixed">Valor fixo para todas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Alerta em (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="1"
                      value={assistantThreshold}
                      onChange={(event) => setAssistantThreshold(event.target.value)}
                    />
                  </div>

                  {assistantMode === "spent_factor" ? (
                    <div className="space-y-2 md:col-span-2">
                      <Label>Fator de ajuste (%)</Label>
                      <Input
                        type="number"
                        min={1}
                        step="1"
                        value={assistantFactor}
                        onChange={(event) => setAssistantFactor(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Exemplo: 110% cria orcamento com 10% acima do gasto do mes.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 md:col-span-2">
                      <Label>Valor fixo (R$)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={assistantFixedAmount}
                        onChange={(event) => setAssistantFixedAmount(event.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="rounded border border-muted bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Categorias selecionadas: {assistantSelectedCount}
                </div>
              </>
            ) : null}

            {assistantStep === 3 ? (
              <>
                <div className="max-h-72 overflow-y-auto rounded border">
                  {assistantPreviewRows.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      Nenhuma categoria selecionada.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {assistantPreviewRows.map((row) => (
                        <div key={row.category.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 p-3 text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium">{row.category.name}</span>
                            <span className="text-xs text-muted-foreground">
                              Gasto mes: {formatCurrency(row.spent)}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            Atual: {row.currentBudget ? formatCurrency(row.currentBudget.amount) : "-"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Novo: {row.amount > 0 ? formatCurrency(row.amount) : "-"}
                          </span>
                          {row.valid ? (
                            <span className="text-xs text-emerald-700">Pronto</span>
                          ) : (
                            <span className="text-xs text-amber-700">Sem valor</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded border border-muted bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Mes: {budgetMonth.slice(0, 7)} | Aplicar em: {assistantValidItems.length} categorias
                  {assistantSkippedCount > 0 ? ` | Ignoradas: ${assistantSkippedCount}` : ""}
                  {assistantValidItems.length > 0 ? ` | Total sugerido: ${formatCurrency(assistantTotalSuggested)}` : ""}
                </div>
              </>
            ) : null}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setBudgetAssistantOpen(false)}>
              Cancelar
            </Button>
            <div className="flex items-center gap-2">
              {assistantStep > 1 ? (
                <Button type="button" variant="outline" onClick={handleAssistantPrevStep}>
                  Voltar
                </Button>
              ) : null}
              {assistantStep < 3 ? (
                <Button type="button" onClick={handleAssistantNextStep}>
                  Proximo
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleApplyBudgetAssistant}
                  disabled={assistantSaving || !assistantThresholdValid || !assistantConfigValid || assistantValidItems.length === 0}
                >
                  {assistantSaving ? "Aplicando..." : "Aplicar wizard"}
                </Button>
              )}
              </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Limite da categoria</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!budgetCategory || !budgetCategory.id ? (
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select onValueChange={(val) => {
                  const cat = categories.find(c => c.id === val);
                  if (cat) setBudgetCategory(cat);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.filter(c => c.type === 'expense').map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Categoria: <span className="font-medium text-foreground">{budgetCategory?.name ?? "-"}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label>Limite mensal (R$)</Label>
              <Input type="number" min={0} step="0.01" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Alerta em (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="1"
                value={budgetThreshold}
                onChange={(e) => setBudgetThreshold(e.target.value)}
              />
            </div>

            <div className="rounded border border-muted bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Mes de referencia: {budgetMonth.slice(0, 7)}
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <Button type="button" variant="destructive" onClick={handleDeleteBudget} disabled={budgetSaving || !budgetCategory}>
              Remover limite
            </Button>
            <Button type="button" onClick={handleSaveBudget} disabled={budgetSaving || !budgetCategory}>
              {budgetSaving ? "Salvando..." : "Salvar limite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
