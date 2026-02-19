"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFinancialData } from "@/hooks/use-financial-data";

type BucketOption = {
  id: string;
  name: string;
};

const schema = z.object({
  name: z.string().min(1, "Nome e obrigatorio"),
  type: z.enum(["income", "expense", "transfer"]),
  defaultBucketId: z.string().nullable(),
});

export function CreateCategoryDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (id: string) => void;
  defaultType?: "income" | "expense" | "transfer";
}) {
  const [loading, setLoading] = useState(false);
  const [bucketOptions, setBucketOptions] = useState<BucketOption[]>([]);
  const supabase = useMemo(() => createClient(), []);
  const { refetch } = useFinancialData();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: defaultType || "expense",
      name: "",
      defaultBucketId: null,
    },
  });

  const selectedType = form.watch("type");
  const bucketEnabled = selectedType !== "transfer";

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
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const { data: members } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).limit(1);
      const orgId = members?.[0]?.org_id;

      if (!orgId) throw new Error("No organization found");

      const { data: newCat, error } = await supabase
        .from("categories")
        .insert({
          name: data.name,
          type: data.type,
          org_id: orgId,
          default_bucket_id: bucketEnabled ? data.defaultBucketId : null,
        })
        .select("id")
        .single();

      if (error) throw error;

      await refetch();
      onSuccess(newCat.id);
      onOpenChange(false);
      form.reset();
    } catch (e) {
      console.error(e);
      alert("Erro ao criar categoria");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Categoria</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input {...form.register("name")} placeholder="Ex: Criptomoedas" />
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
              {loading ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
