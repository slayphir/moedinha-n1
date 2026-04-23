import { authenticateAgentRequest } from "@/lib/server/agent-auth";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.ctx.admin
    .from("contacts")
    .select("id, name, payment_reliability")
    .eq("org_id", auth.ctx.orgId)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ contacts: data ?? [] });
}
