import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export type AgentAuthContext = {
  admin: SupabaseClient;
  orgId: string;
};

/**
 * Autenticação para integrações (agente de IA, automações).
 * Use o mesmo valor guardado em `api_tokens.token_hash` (como no embed e no KPI por token).
 *
 * Requer `SUPABASE_SERVICE_ROLE_KEY` no servidor para validar o token sem sessão do usuário.
 */
export async function authenticateAgentRequest(
  request: NextRequest
): Promise<{ ok: true; ctx: AgentAuthContext } | { ok: false; response: NextResponse }> {
  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "API do agente indisponivel: defina SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor.",
        },
        { status: 503 }
      ),
    };
  }

  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  const headerToken = request.headers.get("x-agent-token")?.trim();
  const token = bearer || headerToken;

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Token obrigatorio: envie Authorization: Bearer <token> ou header X-Agent-Token (valor igual a api_tokens.token_hash).",
        },
        { status: 401 }
      ),
    };
  }

  const { data: row, error } = await admin
    .from("api_tokens")
    .select("id, org_id, expires_at")
    .eq("token_hash", token)
    .maybeSingle();

  if (error || !row) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Token invalido ou revogado." }, { status: 401 }),
    };
  }

  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Token expirado." }, { status: 401 }),
    };
  }

  await admin.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);

  return {
    ok: true,
    ctx: {
      admin,
      orgId: row.org_id,
    },
  };
}
