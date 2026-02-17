"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function CreateOrgForm({ userId }: { userId: string }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || slug === toSlug(name)) {
      setSlug(toSlug(value));
    }
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const cleanName = name.trim();
    if (!cleanName) {
      setMessage({ type: "error", text: "Informe um nome para a organizacao." });
      return;
    }

    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    try {
      const normalizedSlug = toSlug(slug || cleanName) || `org-${Date.now().toString(36)}`;

      const { data: org, error: orgError } = await supabase
        .from("orgs")
        .insert({
          name: cleanName,
          slug: normalizedSlug,
        })
        .select("id")
        .single();

      if (orgError) {
        if (orgError.code === "23505") {
          throw new Error("Slug ja existe. Tente um nome diferente para a URL.");
        }
        throw orgError;
      }

      const { error: memberError } = await supabase.from("org_members").insert({
        org_id: org.id,
        user_id: userId,
        role: "admin",
      });

      if (memberError) {
        if (memberError.code === "42501") {
          throw new Error(
            "Permissao insuficiente para vincular o primeiro membro. Rode a migration 00005_org_bootstrap_policy.sql."
          );
        }
        throw memberError;
      }

      await supabase.from("accounts").insert({
        org_id: org.id,
        name: "Conta Principal",
        type: "bank",
        currency: "BRL",
        initial_balance: 0,
      });

      await supabase.from("categories").insert([
        { org_id: org.id, name: "Salario", type: "income" },
        { org_id: org.id, name: "Alimentacao", type: "expense" },
        { org_id: org.id, name: "Moradia", type: "expense" },
      ]);

      setMessage({ type: "success", text: "Organizacao criada. Redirecionando..." });
      window.location.href = "/dashboard";
    } catch (error) {
      const text = error instanceof Error ? error.message : "Erro ao criar organizacao";
      setMessage({ type: "error", text });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome da organizacao</Label>
        <Input
          id="name"
          value={name}
          onChange={(event) => handleNameChange(event.target.value)}
          placeholder="Moedinha N°1 Holding"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">Slug (URL)</Label>
        <Input
          id="slug"
          value={slug}
          onChange={(event) => setSlug(toSlug(event.target.value))}
          placeholder="moedinha-n1-holding"
        />
      </div>
      {message && (
        <div
          className={`rounded p-3 text-sm ${
            message.type === "error" ? "bg-destructive/15 text-destructive" : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {message.text}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Criando..." : "Criar e entrar"}
      </Button>
    </form>
  );
}
