import { createClient } from "@/lib/supabase/server";
import { EmbedDashboard } from "./_components/embed-dashboard";

type Props = { searchParams: Promise<{ token?: string }> };

export default async function EmbedPage({ searchParams }: Props) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted-foreground">Token de embed ausente.</p>
      </div>
    );
  }
  const supabase = await createClient();
  const { data: apiToken } = await supabase
    .from("api_tokens")
    .select("org_id")
    .eq("token_hash", token)
    .single();
  if (!apiToken) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted-foreground">Token inválido.</p>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background p-4">
      <EmbedDashboard orgId={apiToken.org_id} />
    </div>
  );
}
