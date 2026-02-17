import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrgSettingsForm } from "./_components/org-settings-form";
import { ProfileSettingsForm } from "./_components/profile-settings-form";
import { TelegramSettingsForm } from "./_components/telegram-settings-form";
import { redirect } from "next/navigation";

export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: member } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!member) redirect("/onboarding");

  const { data: org } = await supabase
    .from("orgs")
    .select("*")
    .eq("id", member.org_id)
    .single();

  if (!org) return <div>Organização não encontrada</div>;

  return (
    <div className="space-y-6 container py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie suas preferências e dados da conta.</p>
      </div>

      <Tabs defaultValue="org" className="space-y-4">
        <TabsList>
          <TabsTrigger value="org">Organização</TabsTrigger>
          <TabsTrigger value="profile">Meu Perfil</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
        </TabsList>

        <TabsContent value="org" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="md:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Dados da Organização</CardTitle>
                  <CardDescription>
                    Informações sobre o seu espaço de trabalho financeiro.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <OrgSettingsForm
                    initialName={org.name}
                    orgId={org.id}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Seu Perfil</CardTitle>
              <CardDescription>
                Como você aparece para outros usuários.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileSettingsForm
                initialName={user.user_metadata.full_name || ""}
                email={user.email || ""}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <TelegramSettingsForm initialConfig={org.telegram_config} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
