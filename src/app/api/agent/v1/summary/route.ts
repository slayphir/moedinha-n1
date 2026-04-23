import { computeOrgKpisSnapshot } from "@/lib/kpis/compute-org-kpis";
import { authenticateAgentRequest } from "@/lib/server/agent-auth";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await authenticateAgentRequest(request);
  if (!auth.ok) return auth.response;

  const snapshot = await computeOrgKpisSnapshot(auth.ctx.admin, auth.ctx.orgId);
  return NextResponse.json(snapshot);
}
