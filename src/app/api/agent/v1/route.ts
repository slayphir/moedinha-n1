import { NextResponse } from "next/server";

/**
 * Descoberta da API do agente (JSON). Autenticação não é obrigatória aqui.
 */
export async function GET() {
  return NextResponse.json({
    name: "Moedinha Agent API",
    version: 1,
    auth: {
      bearer: "Authorization: Bearer <api_tokens.token_hash>",
      header: "Optional: X-Agent-Token com o mesmo valor.",
      note:
        "Crie um token na tabela api_tokens (painel/admin) e use SUPABASE_SERVICE_ROLE_KEY no servidor Next para validação.",
    },
    endpoints: {
      "GET /api/agent/v1/summary": "KPIs do mês + saldo (orbita)",
      "GET /api/agent/v1/accounts": "Contas da organização ligada ao token",
      "GET /api/agent/v1/categories": "Categorias",
      "GET /api/agent/v1/contacts": "Contatos",
      "GET /api/agent/v1/tags": "Tags",
      "GET /api/agent/v1/transactions": "Lista lançamentos (query: date_from, date_to, limit, type, account_id)",
      "POST /api/agent/v1/transactions":
        "Cria lançamento (JSON); despesa default pending; cartão + due_date futuro permanece pending",
    },
  });
}
