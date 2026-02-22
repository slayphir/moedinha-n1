import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ReportsClient } from "./_components/reports-client";
import { getReportMetrics } from "@/app/actions/reports";
import { getFinancialProjection } from "@/app/actions/projections";
import { startOfMonth, endOfMonth } from "date-fns";
import { toISODateLocal } from "@/lib/utils";

export const revalidate = 60;

function parseDateParam(value?: string): Date | null {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsedLocal = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsedLocal.getTime()) ? null : parsedLocal;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: members } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1);
  const orgId = members?.[0]?.org_id;
  if (!orgId) redirect("/onboarding");

  // Filter Logic
  const now = new Date();
  const startParam = typeof searchParams.start === "string" ? searchParams.start : undefined;
  const endParam = typeof searchParams.end === "string" ? searchParams.end : undefined;

  // Use query params if available, otherwise default to current month
  const startDate = parseDateParam(startParam) ?? startOfMonth(now);
  const endDate = parseDateParam(endParam) ?? endOfMonth(now);

  const startStr = toISODateLocal(startDate);
  const endStr = toISODateLocal(endDate);

  const metrics = await getReportMetrics(startStr, endStr);
  const projection = await getFinancialProjection(90);

  return (
    <ReportsClient
      metrics={metrics}
      projection={projection.data ?? []}
      startDate={startStr}
      endDate={endStr}
    />
  );
}
