import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrgProvider } from "@/contexts/org-context";
import { DashboardShell } from "./_components/shell";
import type { Org } from "@/lib/types/database";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: members } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id);
  if (!members?.length) redirect("/onboarding");

  const orgId = members[0].org_id;
  const { data: org } = await supabase
    .from("orgs")
    .select("*")
    .eq("id", orgId)
    .single();

  return (
    <OrgProvider initialOrg={org as Org | null} initialOrgId={orgId}>
      <Suspense>
        <DashboardShell user={user}>{children}</DashboardShell>
      </Suspense>
    </OrgProvider>
  );
}
