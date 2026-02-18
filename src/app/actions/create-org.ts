"use server";

import { createClient } from "@/lib/supabase/server";
import postgres from "postgres";

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

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL nao definida");
    return { error: "Erro de configuracao do servidor (DATABASE_URL ausente)" };
  }

  const sql = postgres(process.env.DATABASE_URL, {
    ssl: { rejectUnauthorized: false }, // Required for Supabase transaction pooler (port 6543) or direct connection to production
    prepare: false, // Supabase transaction pooler doesn't support prepared statements usually
  });

  try {
    const result = await sql.begin(async (txn: any) => {
      // 1. Create Org
      const [org] = await txn`
        INSERT INTO orgs (name, slug)
        VALUES (${cleanName}, ${normalizedSlug})
        RETURNING id
      `;

      if (!org) throw new Error("Falha ao criar organizacao");

      // 2. Create Member (Admin)
      await txn`
        INSERT INTO org_members (org_id, user_id, role)
        VALUES (${org.id}, ${user.id}, 'admin')
      `;

      // 3. Create Main Account
      await txn`
        INSERT INTO accounts (org_id, name, type, currency, initial_balance)
        VALUES (${org.id}, 'Conta Principal', 'bank', 'BRL', 0)
      `;

      // 4. Create Default Categories
      await txn`
        INSERT INTO categories (org_id, name, type)
        VALUES 
          (${org.id}, 'Salario', 'income'),
          (${org.id}, 'Alimentacao', 'expense'),
          (${org.id}, 'Moradia', 'expense')
      `;

      return { success: true, orgId: org.id };
    });

    console.log("[create-org] Success via direct DB:", result);
    return { success: true };

  } catch (error: any) {
    console.error("[create-org] DB Error:", error);
    if (error.code === "23505") { // Unique violation
      return { error: "Slug ja existe. Tente outro." };
    }
    return { error: "Erro ao criar organizacao: " + (error.message || "Erro desconhecido") };
  } finally {
    await sql.end();
  }
}

function formatDbError(err: any): string {
  // Legacy helper, keeping for compatibility if needed inside try/catch but mostly replaced
  return err.message || "Erro desconhecido";
}
