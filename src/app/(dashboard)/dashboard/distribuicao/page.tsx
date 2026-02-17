import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DistributionClient } from "./_components/distribution-client";
import { getDistribution, createDefaultDistribution } from "@/app/actions/distribution";

export const revalidate = 0; // Always fresh for settings

export default async function DistributionPage() {
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

  // Fetch existing distribution
  let { data: distribution, error } = await getDistribution(orgId);

  // If no distribution exists, create a default one and refetch
  if (!distribution && !error) {
    await createDefaultDistribution(orgId);
    const retry = await getDistribution(orgId);
    distribution = retry.data;
    error = retry.error;
  }

  if (error || !distribution) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-xl font-semibold text-destructive">Erro ao carregar distribuição</h1>
        <p className="text-muted-foreground">{error || "Não foi possível inicializar os dados."}</p>
      </div>
    );
  }

  return <DistributionClient distribution={distribution} orgId={orgId} />;
}
