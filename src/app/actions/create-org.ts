"use server";

import { createClient } from "@/lib/supabase/server";

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

async function logDebug(step: string, data: Record<string, unknown>) {
  try {
    await fetch("http://127.0.0.1:7242/ingest/b8bb874d-5da7-44c6-89e4-c57717707beb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: "create-org.ts", message: step, data, timestamp: Date.now() }),
    });
  } catch {
    /* noop */
  }
}

export async function createOrganization(input: { name: string; slug?: string }) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (!user) {
    await logDebug("createOrg_noUser", { hasUser: false, userError: userError?.message });
    return { error: "Nao autorizado" };
  }
  await logDebug("createOrg_hasUser", { userId: user.id, hasUser: true });

  const cleanName = input.name.trim();
  if (!cleanName) return { error: "Informe um nome para a organizacao." };

  const normalizedSlug = toSlug(input.slug || cleanName) || `org-${Date.now().toString(36)}`;

  const { data: org, error: orgError } = await supabase
    .from("orgs")
    .insert({ name: cleanName, slug: normalizedSlug })
    .select("id")
    .single();

  if (orgError) {
    await logDebug("createOrg_orgsInsert_fail", {
      step: "orgs_insert",
      code: orgError.code,
      message: orgError.message,
    });
    if (orgError.code === "23505") return { error: "Slug ja existe. Tente um nome diferente para a URL." };
    return { error: formatDbError(orgError) };
  }

  const { error: memberError } = await supabase.from("org_members").insert({
    org_id: org.id,
    user_id: user.id,
    role: "admin",
  });

  if (memberError) {
    await logDebug("createOrg_orgMembersInsert_fail", {
      step: "org_members_insert",
      code: memberError.code,
      message: memberError.message,
    });
    if (memberError.code === "42501") {
      return {
        error:
          "Permissao insuficiente para vincular o primeiro membro. Rode a migration 00005_org_bootstrap_policy.sql.",
      };
    }
    return { error: formatDbError(memberError) };
  }

  const { error: accountsError } = await supabase.from("accounts").insert({
    org_id: org.id,
    name: "Conta Principal",
    type: "bank",
    currency: "BRL",
    initial_balance: 0,
  });

  if (accountsError) return { error: formatDbError(accountsError) };

  const { error: categoriesError } = await supabase.from("categories").insert([
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
