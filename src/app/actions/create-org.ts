"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";

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

export async function createOrganization(input: { name: string; slug?: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autorizado" };

  const cleanName = input.name.trim();
  if (!cleanName) return { error: "Informe um nome para a organizacao." };

  const normalizedSlug = toSlug(input.slug || cleanName) || `org-${Date.now().toString(36)}`;

  const db = createAdminClient() ?? supabase;

  const { data: org, error: orgError } = await db
    .from("orgs")
    .insert({ name: cleanName, slug: normalizedSlug })
    .select("id")
    .single();

  if (orgError) {
    if (orgError.code === "23505") return { error: "Slug ja existe. Tente um nome diferente para a URL." };
    return { error: formatDbError(orgError) };
  }

  const { error: memberError } = await db.from("org_members").insert({
    org_id: org.id,
    user_id: user.id,
    role: "admin",
  });

  if (memberError) {
    if (memberError.code === "42501") {
      return {
        error:
          "Permissao insuficiente para vincular o primeiro membro. Rode a migration 00005_org_bootstrap_policy.sql.",
      };
    }
    return { error: formatDbError(memberError) };
  }

  const { error: accountsError } = await db.from("accounts").insert({
    org_id: org.id,
    name: "Conta Principal",
    type: "bank",
    currency: "BRL",
    initial_balance: 0,
  });

  if (accountsError) return { error: formatDbError(accountsError) };

  const { error: categoriesError } = await db.from("categories").insert([
    { org_id: org.id, name: "Salario", type: "income" },
    { org_id: org.id, name: "Alimentacao", type: "expense" },
    { org_id: org.id, name: "Moradia", type: "expense" },
  ]);

  if (categoriesError) return { error: formatDbError(categoriesError) };

  return { success: true };
}

function formatDbError(err: { code?: string; message?: string; details?: string; hint?: string }): string {
  const code = err?.code;
  const message = err?.message;
  if (code === "42501") {
    return "Permissao negada no banco (RLS). Aplique as migrations de politicas (00002 e 00005) no Supabase.";
  }
  if (code === "42883") {
    return "Funcao de seguranca ausente no banco. Rode as migrations 00001/00002 atualizadas.";
  }
  if (code === "42P01") {
    return "Tabela ausente no banco. Rode as migrations iniciais do Supabase.";
  }
  if (message) {
    const detail = err?.details ? ` Detalhe: ${err.details}` : "";
    const hint = err?.hint ? ` Dica: ${err.hint}` : "";
    return `${message}${detail}${hint}`;
  }
  return "Erro ao criar organizacao";
}
