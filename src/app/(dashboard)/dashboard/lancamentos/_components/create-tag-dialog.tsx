"use client";

import { type FormEvent, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useFinancialData } from "@/hooks/use-financial-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const schema = z.object({
  name: z.string().trim().min(1, "Nome e obrigatorio"),
});

type FormValues = z.infer<typeof schema>;

export type CreatedTag = {
  id: string;
  name: string;
};

export function CreateTagDialog({
  open,
  onOpenChange,
  orgId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId?: string | null;
  onSuccess?: (tag: CreatedTag) => void;
}) {
  const [loading, setLoading] = useState(false);
  const { refetch } = useFinancialData();
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  async function onSubmit(data: FormValues) {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario nao autenticado");

      let resolvedOrgId = orgId ?? null;
      if (!resolvedOrgId) {
        // Fallback para contexts que nao passam org explicitamente.
        const { data: members } = await supabase
          .from("org_members")
          .select("org_id")
          .eq("user_id", user.id)
          .limit(1);
        resolvedOrgId = members?.[0]?.org_id ?? null;
      }
      if (!resolvedOrgId) throw new Error("Organizacao nao encontrada");

      const { data: tag, error } = await supabase
        .from("tags")
        .insert({
          org_id: resolvedOrgId,
          name: data.name,
        })
        .select("id, name")
        .single();

      if (error) throw error;

      if (tag && onSuccess) {
        onSuccess({ id: tag.id, name: tag.name });
      }

      refetch();
      reset({ name: "" });
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      alert("Erro ao criar tag");
    } finally {
      setLoading(false);
    }
  }

  const handleDialogSubmit = (event: FormEvent<HTMLFormElement>) => {
    // Prevent bubbling submit events to the parent transaction form.
    event.stopPropagation();
    void handleSubmit(onSubmit)(event);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Tag</DialogTitle>
          <DialogDescription>
            Crie uma tag para organizar suas transacoes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleDialogSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input placeholder="Ex: Viagem, Reforma, Importante" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando..." : "Criar Tag"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
