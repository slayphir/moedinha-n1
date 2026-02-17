"use client";

import { useState } from "react";
import { createOrganization } from "@/app/actions/create-org";
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

export function CreateOrgForm() {
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

    const result = await createOrganization({ name: cleanName, slug: slug || undefined });

    setLoading(false);

    if (result.error) {
      setMessage({ type: "error", text: result.error });
      return;
    }

    setMessage({ type: "success", text: "Organizacao criada. Redirecionando..." });
    window.location.href = "/dashboard";
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
