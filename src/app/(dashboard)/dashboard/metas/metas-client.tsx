"use client";

import { Goal, deleteGoal } from "@/app/actions/goals";
import { ReserveMetrics } from "@/app/actions/reserves";
import { GoalWizard } from "./_components/goal-wizard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { differenceInMonths, parseISO, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Clock, Target, Trash2, TrendingUp, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmergencyDashboard } from "@/app/(dashboard)/dashboard/cofre/_components/emergency-dashboard";
import { PiggyBankCard } from "./_components/piggy-bank-card";
import { BreakPigDialog } from "./_components/break-pig-dialog";

type Props = {
    goals: Goal[];
    reserveMetrics: ReserveMetrics;
};

function PiggyBanksTab({ goals }: { goals: Goal[] }) {
    const [breakGoal, setBreakGoal] = useState<Goal | null>(null);

    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {goals.map(goal => (
                    <PiggyBankCard
                        key={goal.id}
                        goal={goal}
                        onBreak={() => setBreakGoal(goal)}
                    />
                ))}
                {goals.length === 0 && (
                    <div className="col-span-full py-12 text-center border-2 border-dashed border-pink-200 rounded-xl bg-pink-50/30">
                        <div className="mx-auto h-12 w-12 rounded-full bg-pink-100 flex items-center justify-center mb-4 text-3xl">
                            🐷
                        </div>
                        <h3 className="text-lg font-medium text-pink-900">Nenhum cofrinho ativo</h3>
                        <p className="text-pink-600 mt-1 max-w-sm mx-auto mb-6">
                            Que tal criar um cofrinho para aquele sonho menor?
                        </p>
                        <GoalWizard />
                    </div>
                )}
            </div>
            <BreakPigDialog
                goal={breakGoal}
                open={!!breakGoal}
                onOpenChange={(open) => !open && setBreakGoal(null)}
                onSuccess={() => setBreakGoal(null)}
            />
        </div>
    );
}

export function MetasClient({ goals, reserveMetrics }: Props) {
    const { toast } = useToast();
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Filter out emergency fund and piggy banks from general list
    const displaysGoals = goals.filter(g => g.type !== 'emergency_fund' && g.type !== 'piggy_bank');

    async function handleDelete(id: string) {
        setDeletingId(id);
        const result = await deleteGoal(id);
        setDeletingId(null);

        if (result.error) {
            toast({
                variant: "destructive",
                title: "Erro ao excluir",
                description: result.error,
            });
        } else {
            toast({
                title: "Meta excluída",
                description: "A meta foi removida com sucesso.",
            });
        }
    }

    function calculateInsights(goal: Goal) {
        if (!goal.target_amount || !goal.target_date) return null;

        const targetDate = parseISO(goal.target_date);
        const today = new Date();
        const monthsLeft = differenceInMonths(targetDate, today);
        const amountLeft = goal.target_amount - goal.current_amount;

        if (amountLeft <= 0) return { status: "completed", message: "Meta atingida!", monthlyNeeded: 0 };

        // Se o prazo já passou
        if (monthsLeft <= 0) return { status: "late", message: "Prazo expirado", monthlyNeeded: amountLeft, monthsLeft };

        const monthlyNeeded = amountLeft / monthsLeft;

        return {
            status: "active",
            monthsLeft,
            amountLeft,
            monthlyNeeded,
        };
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-display text-3xl font-bold text-ink">Metas & Objetivos</h1>
                    <p className="text-muted-foreground">Planeje, acompanhe e realize seus sonhos.</p>
                </div>
                {/* GoalWizard is here for generic goals. Emergency fund controlled separately? Or via wizard? */}
                {/* For now, keep wizard generic. */}
                <GoalWizard />
            </div>

            <Tabs defaultValue="emergency" className="w-full">
                <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
                    <TabsTrigger value="emergency">Reserva de Emergência</TabsTrigger>
                    <TabsTrigger value="piggy">Cofrinhos</TabsTrigger>
                    <TabsTrigger value="goals">Outros Objetivos</TabsTrigger>
                </TabsList>

                <TabsContent value="emergency" className="mt-6">
                    <EmergencyDashboard metrics={reserveMetrics} />
                </TabsContent>

                <TabsContent value="piggy" className="mt-6">
                    <PiggyBanksTab goals={goals.filter(g => g.type === 'piggy_bank' && g.status === 'active')} />
                </TabsContent>

                <TabsContent value="goals" className="mt-6">
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {displaysGoals.map((goal) => {
                            const insights = calculateInsights(goal);
                            const progress = goal.target_amount ? Math.min(100, (goal.current_amount / goal.target_amount) * 100) : 0;

                            return (
                                <Card key={goal.id} className="relative overflow-hidden border-t-4 border-t-vault-700 hover:shadow-md transition-shadow">
                                    <CardHeader className="pb-2">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                                    {goal.type === 'emergency_fund' ? "Reserva" :
                                                        goal.type === 'debt' ? "Dívida" :
                                                            goal.type === 'savings' ? "Investimento" : "Compra"}
                                                </p>
                                                <CardTitle className="mt-1 text-lg">{goal.name}</CardTitle>
                                            </div>
                                            <div className="bg-vault-100 text-vault-800 p-2 rounded-full">
                                                <Target className="h-5 w-5" />
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="mt-2 space-y-4">
                                            {/* Progress Bar */}
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-sm">
                                                    <span className="font-medium">{formatCurrency(goal.current_amount)}</span>
                                                    <span className="text-muted-foreground">de {goal.target_amount ? formatCurrency(goal.target_amount) : "Indefinido"}</span>
                                                </div>
                                                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-vault-600 to-vault-500 transition-all"
                                                        style={{ width: `${progress}%` }}
                                                    />
                                                </div>
                                                <p className="text-right text-xs font-medium text-vault-700">{progress.toFixed(0)}% concluído</p>
                                            </div>

                                            {/* Insights Section */}
                                            {insights && insights.status !== 'completed' && (
                                                <div className="rounded-md bg-slate-50 p-3 text-sm border border-slate-100">
                                                    <div className="flex items-center gap-2 mb-2 text-slate-700">
                                                        <Clock className="h-4 w-4" />
                                                        <span>Prazo: {format(parseISO(goal.target_date!), "dd/MM/yyyy")}</span>
                                                    </div>

                                                    {(insights.monthsLeft ?? 0) > 0 ? (
                                                        <div className="flex items-center gap-2 text-amber-700">
                                                            <TrendingUp className="h-4 w-4" />
                                                            <span className="font-medium">
                                                                Guardar {formatCurrency(insights.monthlyNeeded)}/mês
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-destructive">
                                                            <AlertTriangle className="h-4 w-4" />
                                                            <span className="font-medium">Prazo expirado!</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {insights?.status === 'completed' && (
                                                <div className="rounded-md bg-green-50 p-3 text-sm border border-green-100 text-green-700 flex items-center gap-2">
                                                    <CheckCircle2 className="h-5 w-5" />
                                                    <span className="font-medium">Meta alcançada! Parabéns!</span>
                                                </div>
                                            )}

                                            {/* Actions */}
                                            <div className="flex justify-end gap-2 pt-2">
                                                <GoalWizard
                                                    goal={goal}
                                                    trigger={
                                                        <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-primary">
                                                            <Pencil className="mr-1 h-3 w-3" />
                                                            Editar
                                                        </Button>
                                                    }
                                                />
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 px-2">
                                                            <Trash2 className="h-4 w-4 mr-1" />
                                                            Excluir
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Excluir meta?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Isso removerá a meta "{goal.name}" do seu painel. O histórico de transações não será afetado.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDelete(goal.id)} className="bg-destructive hover:bg-destructive/90">
                                                                Excluir
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}

                        {displaysGoals.length === 0 && (
                            <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                                    <Target className="h-6 w-6 text-slate-400" />
                                </div>
                                <h3 className="text-lg font-medium text-slate-900">Nenhuma meta criada</h3>
                                <p className="text-slate-500 mt-1 max-w-sm mx-auto mb-6">Comece definindo um objetivo financeiro, como uma viagem, reserva de emergência ou compra de um bem.</p>
                                <GoalWizard />
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
