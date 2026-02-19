import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  org_id: z.string().uuid(),
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.number(),
  date: z.string(),
  account_id: z.string().uuid(),
  transfer_account_id: z.string().uuid().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
    }

    let bucketId: string | null = null;
    if (parsed.data.type !== "transfer" && parsed.data.category_id) {
      const { data: category, error: categoryError } = await supabase
        .from("categories")
        .select("default_bucket_id")
        .eq("org_id", parsed.data.org_id)
        .eq("id", parsed.data.category_id)
        .maybeSingle();

      if (categoryError) {
        return NextResponse.json({ error: categoryError.message }, { status: 400 });
      }

      if (!category) {
        return NextResponse.json({ error: "Categoria invalida" }, { status: 400 });
      }

      bucketId = category.default_bucket_id ?? null;
    }

    const { data, error } = await supabase
      .from("transactions")
      .insert({
        ...parsed.data,
        status: "cleared",
        currency: "BRL",
        bucket_id: bucketId,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: data.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro interno" },
      { status: 500 }
    );
  }
}
