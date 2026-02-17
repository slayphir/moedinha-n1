"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { ShieldAlert, ShieldCheck, Wallet } from "lucide-react";
import { ReserveMetrics, updateEmergencyGoalTarget } from "@/app/actions/reserves";
import { useToast } from "@/components/ui/use-toast";

export function EmergencyDashboard({ metrics }: { metrics: ReserveMetrics }) {
    const { totalAccumulated, targetAmount, progressPercentage, monthsCovered, liquidityBreakdown } = metrics;
    const [editOpen, setEditOpen] = useState(false);
    const [goalTarget, setGoalTarget] = useState(String(targetAmount || 0));
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        setGoalTarget(String(targetAmount || 0));
    }, [targetAmount]);

    async function handleSaveTarget() {
        const parsed = Number(goalTarget);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            toast({
                variant: "destructive",
                title: "Valor invalido",
                description: "Informe um valor maior que zero.",
            });
            return;
        }

        setSaving(true);
        const result = await updateEmergencyGoalTarget({
            goalId: metrics.goalId,
            targetAmount: parsed,
        });
        setSaving(false);

        if (result.error) {
            toast({
                variant: "destructive",
                title: "Nao foi possivel atualizar",
                description: result.error,
            });
            return;
        }

        toast({
            title: "Meta atualizada",
            description: "O valor alvo da reserva foi atualizado.",
        });
        setEditOpen(false);
        router.refresh();
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight">Reserva de Emergencia</h2>
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                            Editar meta
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[420px]">
                        <DialogHeader>
                            <DialogTitle>Editar meta da reserva</DialogTitle>
                            <DialogDescription>
                                Ajuste o valor alvo para o seu fundo de emergencia.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground" htmlFor="reserve-goal-target">
                                Valor alvo (R$)
                            </label>
                            <Input
                                id="reserve-goal-target"
                                type="number"
                                min={0}
                                step="0.01"
                                value={goalTarget}
                                onChange={(event) => setGoalTarget(event.target.value)}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" onClick={handleSaveTarget} disabled={saving}>
                                {saving ? "Salvando..." : "Salvar"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Acumulado</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(totalAccumulated)}</div>
                        <p className="text-xs text-muted-foreground">
                            {progressPercentage.toFixed(1)}% do objetivo
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Cobertura Estimada</CardTitle>
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{monthsCovered.toFixed(1)} meses</div>
                        <p className="text-xs text-muted-foreground">
                            Baseado na meta de {formatCurrency(targetAmount)}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Liquidez Imediata</CardTitle>
                        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(liquidityBreakdown.immediate || 0)}</div>
                        <p className="text-xs text-muted-foreground">Disponivel para saque hoje</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-medium">Progresso da Meta</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span>{formatCurrency(totalAccumulated)}</span>
                        <span className="text-muted-foreground">{formatCurrency(targetAmount)}</span>
                    </div>
                    <Progress value={progressPercentage} className="h-2" />
                    <p className="text-xs text-muted-foreground pt-2">
                        Voce atingiu <strong>{progressPercentage.toFixed(0)}%</strong> da sua reserva ideal.
                    </p>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Composicao por Liquidez</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {Object.entries(liquidityBreakdown).map(([type, amount]) => (
                                <div key={type} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className={`h-2 w-2 rounded-full ${type === "immediate" ? "bg-emerald-500" : "bg-blue-500"}`}
                                        />
                                        <span className="capitalize text-sm">{type === "immediate" ? "Imediata" : type}</span>
                                    </div>
                                    <span className="font-medium text-sm">{formatCurrency(amount)}</span>
                                </div>
                            ))}
                            {Object.keys(liquidityBreakdown).length === 0 && (
                                <p className="text-sm text-muted-foreground">Nenhuma conta vinculada a reserva.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

