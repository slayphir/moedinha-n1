import { computeOrgKpisSnapshot } from "@/lib/kpis/compute-org-kpis";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("org_id");
  const token = request.nextUrl.searchParams.get("token");
  if (!orgId) {
    return NextResponse.json({ error: "org_id obrigatório" }, { status: 400 });
  }
  const supabase = await createClient();

  if (token) {
    const { data: apiToken } = await supabase
      .from("api_tokens")
      .select("org_id")
      .eq("token_hash", token)
      .single();
    if (!apiToken || apiToken.org_id !== orgId) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const { data: members } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("org_id", orgId);
    if (!members?.length) {
      return NextResponse.json({ error: "Sem acesso à organização" }, { status: 403 });
    }
  }

  const snapshot = await computeOrgKpisSnapshot(supabase, orgId);
  return NextResponse.json(snapshot);
}
