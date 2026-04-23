"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useFinancialData } from "@/hooks/use-financial-data";

type BucketOption = {
  id: string;
  name: string;
};

const schema = z.object({
  name: z.string().min(1, "Nome e obrigatorio"),
  type: z.enum(["income", "expense", "transfer"]),
  defaultBucketId: z.string().nullable(),
  isCreditorCenter: z.boolean(),
});

export function EditCategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: { id: string; name: string; type: string; default_bucket_id?: string | null; is_creditor_center?: boolean } | null;
}) {
  const [loading, setLoading] = useState(false);
  const [bucketOptions, setBucketOptions] = useState<BucketOption[]>([]);
  const supabase = useMemo(() => createClient(), []);
  const { refetch } = useFinancialData();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", type: "expense", defaultBucketId: null, isCreditorCenter: false },
  });

  const selectedType = form.watch("type");
  const bucketEnabled = selectedType !== "transfer";

  useEffect(() => {
    if (!category) return;
    form.reset({
      name: category.name,
      type: category.type as "income" | "expense" | "transfer",
      defaultBucketId: category.default_bucket_id ?? null,
      isCreditorCenter: category.is_creditor_center ?? false,
    });
  }, [category, form]);

  useEffect(() => {
    async function loadBuckets() {
      if (!open) return;
      const { data, error } = await supabase
        .from("distribution_buckets")
        .select("id, name")
        .order("sort_order", { ascending: true });

      if (error) {
        console.error("Erro ao carregar buckets:", error);
        setBucketOptions([]);
        return;
      }

      setBucketOptions((data ?? []) as BucketOption[]);
    }

    void loadBuckets();
  }, [open, supabase]);

  useEffect(() => {
    if (!bucketEnabled) {
      form.setValue("defaultBucketId", null, { shouldValidate: true });
    }
  }, [bucketEnabled, form]);

  async function onSubmit(data: z.infer<typeof schema>) {
    if (!category) return;
    setLoading(true);
    try {
      const nextBucketId = bucketEnabled ? data.defaultBucketId : null;

      const { error } = await supabase
        .from("categories")
        .update({
          name: data.name,
          type: data.type,
          default_bucket_id: nextBucketId,
          is_creditor_center: data.type !== "transfer" && data.isCreditorCenter,
        })
        .eq("id", category.id);

      if (error) throw error;

      if (nextBucketId) {
        const { error: backfillError } = await supabase
          .from("transactions")
          .update({ bucket_id: nextBucketId })
          .eq("category_id", category.id)
          .is("bucket_id", null)
          .is("deleted_at", null);

        if (backfillError) {
          console.error("Erro ao preencher bucket pendente:", backfillError);
        }
      }

      await refetch();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      alert("Erro ao atualizar categoria");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Categoria</DialogTitle>
          <DialogDescription>Edite nome, tipo e bucket padrao da categoria.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input {...form.register("name")} />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select
              value={form.watch("type")}
              onValueChange={(value: "income" | "expense" | "transfer") => form.setValue("type", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Receita</SelectItem>
                <SelectItem value="expense">Despesa</SelectItem>
                <SelectItem value="transfer">Transferencia</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.watch("type") !== "transfer" && (
            <div className="space-y-2 rounded-md border border-stroke/60 bg-paper/40 p-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isCreditorCenter"
                  checked={form.watch("isCreditorCenter")}
                  onCheckedChange={(checked) => form.setValue("isCreditorCenter", checked === true)}
                />
                <Label htmlFor="isCreditorCenter" className="text-sm font-normal cursor-pointer">
                  Esta pessoa me paga (quando há contato)
                </Label>
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                {form.watch("type") === "income"
                  ? "Com contato, esses lancamentos entram no saldo e no historico de Terceiros, sem inflar o card de Receitas."
                  : "Ex.: parcela no cartao: sem marca = voce paga (despesa); com marca = a pessoa te paga. Isso afeta saldo e Terceiros, nao os cards operacionais."}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label>Bucket padrao</Label>
            <Select
              value={form.watch("defaultBucketId") ?? "none"}
              onValueChange={(value) => form.setValue("defaultBucketId", value === "none" ? null : value)}
              disabled={!bucketEnabled}
            >
              <SelectTrigger>
                <SelectValue placeholder={bucketEnabled ? "Selecione" : "Nao se aplica para transferencia"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem bucket padrao</SelectItem>
                {bucketOptions.map((bucket) => (
                  <SelectItem key={bucket.id} value={bucket.id}>
                    {bucket.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
