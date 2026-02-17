import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default async function CartoesPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const { data: members } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).limit(1);
    const orgId = members?.[0]?.org_id;
    if (!orgId) redirect("/onboarding");

    const { data: accounts } = await supabase
        .from("accounts")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_credit_card", true)
        .eq("is_active", true)
        .order("name");

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Meus Cartões</h1>
                <p className="text-muted-foreground">Gerencie suas faturas e limites.</p>
            </div>

            {(!accounts || accounts.length === 0) ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-10 space-y-4">
                        <CreditCard className="h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">Nenhum cartão de crédito cadastrado.</p>
                        <Button asChild>
                            <Link href="/dashboard/cadastros?tab=accounts">Cadastrar Cartão</Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {accounts.map(account => (
                        <Card key={account.id} className="hover:border-primary/50 transition-all">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    {account.name}
                                </CardTitle>
                                <CreditCard className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatCurrency(account.credit_limit || 0)}</div>
                                <p className="text-xs text-muted-foreground">
                                    Limite Total
                                </p>
                                <div className="mt-4 flex flex-col gap-1 text-xs">
                                    <div className="flex justify-between">
                                        <span>Fechamento:</span>
                                        <span className="font-medium">Dia {account.closing_day || "-"}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Vencimento:</span>
                                        <span className="font-medium">Dia {account.due_day || "-"}</span>
                                    </div>
                                </div>
                                <Button asChild className="w-full mt-4" size="sm" variant="outline">
                                    <Link href={`/dashboard/cartoes/${account.id}`}>
                                        Ver Fatura <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
