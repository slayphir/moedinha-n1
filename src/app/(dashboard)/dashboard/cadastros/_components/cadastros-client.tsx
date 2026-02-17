"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { deleteCategoryBudget, upsertCategoryBudget } from "@/app/actions/budgets";
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
import { AlertTriangle, FolderOpen, Pencil, Tag, Users, Wallet, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  categories: { id: string; name: string; type: string }[];
  tags: { id: string; name: string }[];
  contacts: Contact[];
  initialTab: string;
  budgetMonth: string;
  categoryBudgetMap: Record<string, CategoryBudgetInfo>;
};

export function CadastrosClient({
  accounts,
  categories,
  tags,
  contacts,
  initialTab,
  budgetMonth,
  categoryBudgetMap,
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
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string; type: string } | null>(null);
  const [editingTag, setEditingTag] = useState<{ id: string; name: string } | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetCategory, setBudgetCategory] = useState<{ id: string; name: string } | null>(null);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetThreshold, setBudgetThreshold] = useState("80");

  function handleTabChange(value: string) {
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    params.set("tab", value);
    setCurrentTab(value);
    router.push(`${pathname}?${params.toString()}`);
  }

  function openBudgetDialog(category: { id: string; name: string }) {
    const current = categoryBudgetMap[category.id];
    setBudgetCategory(category);
    setBudgetAmount(current ? String(current.amount) : "");
    setBudgetThreshold(current ? String(current.alert_threshold) : "80");
    setBudgetDialogOpen(true);
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
