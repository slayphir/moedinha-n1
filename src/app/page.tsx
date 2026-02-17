import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./_components/login-form";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: members } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1);
    const orgId = members?.[0]?.org_id;
    if (orgId) redirect("/dashboard");
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
            Moedinha N°1
          </h1>
          <p className="mt-2 text-muted-foreground md:text-xl">
            Gestão financeira absoluta. Controle cada centavo do seu império.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
