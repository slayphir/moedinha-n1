"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { deleteCategoryBudget, upsertCategoryBudget, upsertCategoryBudgetsBatch } from "@/app/actions/budgets";
import { CreateContactDialog } from "./create-contact-dialog";
import { EditContactDialog } from "./edit-contact-dialog";
import { CreateAccountDialog } from "./create-account-dialog";
import { CreateCategoryDialog } from "./create-category-dialog";
import { CreateTagDialog } from "./create-tag-dialog";
import { EditAccountDialog } from "./edit-account-dialog";
import { EditCategoryDialog } from "./edit-category-dialog";
import { EditTagDialog } from "./edit-tag-dialog";
import { Contact } from "@/hooks/use-financial-data";
import { formatCurrency } from "@/lib/utils";
import { FolderOpen, Pencil, Tag, Users, Wallet, Plus } from "lucide-react";
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

type Props = {
  accounts: AccountRow[];
  categories: { id: string; name: string; type: string; default_bucket_id?: string | null; default_bucket_name?: string | null }[];
  tags: { id: string; name: string }[];
  contacts: Contact[];
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

export function CadastrosClient({
  accounts,
  categories,
  tags,
  contacts,
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

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === "expense"),
    [categories]
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

  function handleTabChange(value: string) {
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    params.set("tab", value);
    setCurrentTab(value);
    router.push(`${pathname}?${params.toString()}`);
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

  function openBudgetAssistant() {
    setAssistantStep(1);
    setBudgetAssistantOpen(true);
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
              <Button size="sm" onClick={() => setCreateCategoryOpen(true)}>
                Nova categoria
              </Button>
            </CardHeader>
            <CardContent>
              {categories.length === 0 ? (
                <p className="text-muted-foreground">Nenhuma categoria.</p>
              ) : (
                <ul className="space-y-2">
                  {categories.map((category) => {
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
                      <div className="flex flex-col">
                        <span className="font-medium">{contact.name}</span>
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
