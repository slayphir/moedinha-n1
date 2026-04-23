import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateAgentRequest } from "@/lib/server/agent-auth";
import {
  applyCreditCardFutureDuePending,
  coerceStatusForFutureDate,
} from "@/lib/transactions/status";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const listQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  type: z.enum(["income", "expense", "transfer"]).optional(),
  account_id: z.string().uuid().optional(),
});

const createBodySchema = z
  .object({
    type: z.enum(["income", "expense", "transfer"]),
    amount: z.number().positive(),
    date: z.string().min(1),
    account_id: z.string().uuid(),
    transfer_account_id: z.string().uuid().nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    description: z.string().nullable().optional(),
    due_date: z.string().nullable().optional(),
    contact_id: z.string().uuid().nullable().optional(),
    contact_payment_direction: z.enum(["paid_by_me", "paid_to_me"]).nullable().optional(),
    tag_names: z.array(z.string().min(1)).max(50).optional(),
    status: z.enum(["pending", "cleared"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "transfer" && !data.transfer_account_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "transfer_account_id e obrigatorio para transferencia",
        path: ["transfer_account_id"],
      });
    }
    if (data.type === "transfer" && data.transfer_account_id === data.account_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Contas origem e destino devem ser diferentes",
        path: ["transfer_account_id"],
      });
    }
  });

async function ensureTagId(admin: SupabaseClient, orgId: string, tagName: string): Promise<string> {
  const trimmed = tagName.trim();
  const { data: existing } = await admin
    .from("tags")
    .select("id")
    .eq("org_id", orgId)
    .eq("name", trimmed)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: inserted, error } = await admin
    .from("tags")
    .insert({ org_id: orgId, name: trimmed })
    .select("id")
    .single();

  if (!error && inserted) return inserted.id;

  const { data: again } = await admin
    .from("tags")
    .select("id")
    .eq("org_id", orgId)
    .eq("name", trimmed)
    .maybeSingle();
  if (again) return again.id;

  throw new Error(error?.message ?? "Falha ao criar tag");
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return auth.response;

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = listQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Query invalida", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { date_from, date_to, limit, type, account_id } = parsed.data;

  let q = auth.ctx.admin
    .from("transactions")
    .select(
      "id, type, status, amount, currency, date, due_date, description, account_id, transfer_account_id, category_id, contact_id, contact_payment_direction, created_at"
    )
    .eq("org_id", auth.ctx.orgId)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .limit(limit);

  if (date_from) q = q.gte("date", date_from);
  if (date_to) q = q.lte("date", date_to);
  if (type) q = q.eq("type", type);
  if (account_id) q = q.eq("account_id", account_id);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ transactions: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados invalidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const { admin, orgId } = auth.ctx;

  const { data: accRow } = await admin
    .from("accounts")
    .select("id, type, is_credit_card")
    .eq("org_id", orgId)
    .eq("id", input.account_id)
    .maybeSingle();
  if (!accRow) {
    return NextResponse.json({ error: "Conta invalida ou de outra organizacao." }, { status: 400 });
  }

  if (input.type === "transfer" && input.transfer_account_id) {
    const { data: acc2 } = await admin
      .from("accounts")
      .select("id")
      .eq("org_id", orgId)
      .eq("id", input.transfer_account_id)
      .maybeSingle();
    if (!acc2) {
      return NextResponse.json({ error: "Conta destino invalida." }, { status: 400 });
    }
  }

  let bucketId: string | null = null;
  if (input.type !== "transfer" && input.category_id) {
    const { data: category } = await admin
      .from("categories")
      .select("default_bucket_id")
      .eq("org_id", orgId)
      .eq("id", input.category_id)
      .maybeSingle();
    if (!category) {
      return NextResponse.json({ error: "Categoria invalida." }, { status: 400 });
    }
    bucketId = category.default_bucket_id ?? null;
  }

  if (input.contact_id) {
    const { data: contact } = await admin
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("id", input.contact_id)
      .maybeSingle();
    if (!contact) {
      return NextResponse.json({ error: "Contato invalido." }, { status: 400 });
    }
  }

  let statusBase: "pending" | "cleared" =
    input.status ?? (input.type === "expense" ? "pending" : "cleared");
  statusBase = applyCreditCardFutureDuePending(
    statusBase,
    input.type,
    input.due_date ?? null,
    accRow
  );
  const status = coerceStatusForFutureDate(input.date, statusBase);

  const { data: inserted, error: insertError } = await admin
    .from("transactions")
    .insert({
      org_id: orgId,
      type: input.type,
      status,
      amount: input.amount,
      currency: "BRL",
      account_id: input.account_id,
      transfer_account_id: input.type === "transfer" ? input.transfer_account_id ?? null : null,
      category_id: input.type === "transfer" ? null : input.category_id ?? null,
      bucket_id: bucketId,
      description: input.description ?? null,
      date: input.date,
      due_date: input.due_date ?? null,
      contact_id: input.contact_id ?? null,
      contact_payment_direction: input.contact_payment_direction ?? null,
      created_by: null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: insertError?.message ?? "Falha ao inserir lancamento" },
      { status: 400 }
    );
  }

  if (input.tag_names?.length) {
    try {
      const tagIds: string[] = [];
      for (const name of input.tag_names) {
        tagIds.push(await ensureTagId(admin, orgId, name));
      }
      const unique = Array.from(new Set(tagIds));
      if (unique.length) {
        const { error: tagErr } = await admin.from("transaction_tags").insert(
          unique.map((tag_id) => ({ transaction_id: inserted.id, tag_id }))
        );
        if (tagErr) {
          return NextResponse.json(
            {
              id: inserted.id,
              warning: `Lancamento criado mas falhou ao aplicar tags: ${tagErr.message}`,
            },
            { status: 201 }
          );
        }
      }
    } catch (e) {
      return NextResponse.json(
        {
          id: inserted.id,
          warning: `Lancamento criado mas tags nao aplicadas: ${e instanceof Error ? e.message : "erro"}`,
        },
        { status: 201 }
      );
    }
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    user_id: null,
    action: "create",
    table_name: "transactions",
    record_id: inserted.id,
    new_data: input as unknown as Record<string, unknown>,
    origin: "API",
  });

  return NextResponse.json({ id: inserted.id }, { status: 201 });
}
