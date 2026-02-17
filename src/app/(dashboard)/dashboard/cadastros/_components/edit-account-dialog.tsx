"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFinancialData } from "@/hooks/use-financial-data";

const schema = z.object({
  name: z.string().min(1, "Nome e obrigatorio"),
  type: z.string().default("checking"),
  isActive: z.boolean().default(true),
  isCreditCard: z.boolean().default(false),
  creditLimit: z.coerce.number().min(0).optional(),
  closingDay: z.coerce.number().min(1).max(31).optional(),
  dueDay: z.coerce.number().min(1).max(31).optional(),
});

type EditableAccount = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  is_credit_card?: boolean | null;
  credit_limit?: number | null;
  closing_day?: number | null;
  due_day?: number | null;
};

export function EditAccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: EditableAccount | null;
}) {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const { refetch } = useFinancialData();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      type: "checking",
      isActive: true,
      isCreditCard: false,
      creditLimit: 0,
      closingDay: undefined,
      dueDay: undefined,
    },
  });

  const isCreditCard = form.watch("isCreditCard");

  useEffect(() => {
    if (!account) return;

    form.reset({
      name: account.name,
      type: account.type,
      isActive: account.is_active,
      isCreditCard: Boolean(account.is_credit_card) || account.type === "credit_card",
      creditLimit: Number(account.credit_limit ?? 0),
      closingDay: account.closing_day ?? undefined,
      dueDay: account.due_day ?? undefined,
    });
  }, [account, form]);

  async function onSubmit(data: z.infer<typeof schema>) {
    if (!account) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("accounts")
        .update({
          name: data.name,
          type: data.type,
          is_active: data.isActive,
          is_credit_card: data.isCreditCard,
          credit_limit: data.isCreditCard ? Number(data.creditLimit ?? 0) : 0,
          closing_day: data.isCreditCard ? data.closingDay ?? null : null,
          due_day: data.isCreditCard ? data.dueDay ?? null : null,
        })
        .eq("id", account.id);

      if (error) throw error;

      await refetch();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      alert("Erro ao atualizar conta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Conta</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input {...form.register("name")} placeholder="Ex: Banco Nu" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(value) => {
                  form.setValue("type", value);
                  if (value === "credit_card") form.setValue("isCreditCard", true);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Corrente</SelectItem>
                  <SelectItem value="savings">Poupanca</SelectItem>
                  <SelectItem value="investment">Investimento</SelectItem>
                  <SelectItem value="cash">Dinheiro</SelectItem>
                  <SelectItem value="credit_card">Cartao de Credito</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Checkbox
                id="isActive"
                checked={form.watch("isActive")}
                onCheckedChange={(checked) => form.setValue("isActive", Boolean(checked))}
              />
              <Label htmlFor="isActive">Conta ativa</Label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="isCreditCard"
              checked={isCreditCard}
              onCheckedChange={(checked) => form.setValue("isCreditCard", Boolean(checked))}
            />
            <Label htmlFor="isCreditCard">Conta de cartao de credito</Label>
          </div>

          {isCreditCard && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/20">
              <div className="space-y-2">
                <Label>Limite do cartao</Label>
                <Input type="number" min={0} step="0.01" {...form.register("creditLimit")} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dia fechamento</Label>
                  <Input type="number" min={1} max={31} {...form.register("closingDay")} />
                </div>
                <div className="space-y-2">
                  <Label>Dia vencimento</Label>
                  <Input type="number" min={1} max={31} {...form.register("dueDay")} />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
