import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateOrgForm } from "./_components/create-org-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: members } = await supabase
    .from("org_members")
    .select("org_id, orgs(id, name, slug)")
    .eq("user_id", user.id);
  if (members?.length) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-xl font-semibold">Criar organização</h1>
        <p className="text-muted-foreground">
          Crie sua primeira organização (workspace) para começar.
        </p>
        <CreateOrgForm userId={user.id} />
      </div>
    </div>
  );
}
