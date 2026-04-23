import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getThirdPartyBalances } from "@/app/actions/third-party-balances";
import { TerceirosClient } from "./_components/terceiros-client";

export default async function TerceirosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: members } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1);
  if (!members?.length) redirect("/onboarding");

  const result = await getThirdPartyBalances();
  if ("error" in result) {
    return (
      <div className="container py-8">
        <p className="text-destructive">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl space-y-8 py-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Terceiros</h1>
        <p className="mt-1.5 text-base text-muted-foreground">
          Quanto você pagou por cada pessoa, quanto cada uma te pagou e quanto te devem.
        </p>
      </header>
      <TerceirosClient data={result.data} />
    </div>
  );
}
