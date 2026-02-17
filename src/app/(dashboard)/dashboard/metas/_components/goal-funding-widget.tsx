"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { getPendingFunding, executeFunding } from "@/app/actions/funding";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, PiggyBank, ArrowRight } from "lucide-react";
import { useFinancialData } from "@/hooks/use-financial-data";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useOrg } from "@/contexts/org-context";

export function GoalFundingWidget() {
    const { org } = useOrg();
    const { accounts } = useFinancialData();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{ totalIncome: number; fundingPlan: any[] } | null>(null);
    const [open, setOpen] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState<string>("");
    const [executing, setExecuting] = useState(false);

    useEffect(() => {
        if (!org?.id) return;
        getPendingFunding(org.id).then(res => {
            setData(res);
            setLoading(false);
        });
    }, [org?.id]);

    if (loading || !data || data.totalIncome === 0) return null;

    // Filter mainly for "Savings/Goals" buckets (usually implies "Metas" or similar)
    // For now, we take the bucket with "Metas" in name or highest allocation as default? 
    // Actually, let's just show the summary.

    // Find "Metas" bucket or similar
    const goalsBucket = data.fundingPlan.find((b: any) =>
        b.bucketName.toLowerCase().includes("metas") ||
        b.bucketName.toLowerCase().includes("investimentos") ||
        b.bucketName.toLowerCase().includes("poupança")
    );

    if (!goalsBucket || goalsBucket.targetAmount === 0) return null;

    async function handleDistribute() {
        if (!selectedAccount || !org?.id) {
            toast({ variant: "destructive", title: "Selecione uma conta" });
            return;
        }

        setExecuting(true);
        // Execute funding only for the Goals bucket for now
        const result = await executeFunding(
            org.id,
            goalsBucket.targetAmount,
            selectedAccount,
            `Aporte: ${goalsBucket.bucketName}`,
            undefined // goalId
        );

        if (result.error) {
            toast({ variant: "destructive", title: "Erro", description: result.error });
        } else {
            toast({ title: "Sucesso!", description: "Valor separado para suas metas." });
            setOpen(false);
        }
        setExecuting(false);
    }

    return (
        <Card className="bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-background border-indigo-100 dark:border-indigo-900/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                    <PiggyBank className="h-5 w-5" />
                    Automação de Metas
                </CardTitle>
                <CardDescription>
                    Você recebeu <b>{formatCurrency(data.totalIncome)}</b> este mês.
                    Pela sua regra, você deveria separar:
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-end justify-between">
                    <div>
                        <p className="text-sm text-muted-foreground">{goalsBucket.bucketName}</p>
                        <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                            {formatCurrency(goalsBucket.targetAmount)}
                        </p>
                    </div>
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                Separar Agora <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Confirmar Aporte</DialogTitle>
                                <DialogDescription>
                                    Isso criará uma despesa na sua conta, representando a saída do dinheiro "gastável" para suas "Reservas/Metas".
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>Valor a separar</Label>
                                    <div className="text-3xl font-bold text-center">
                                        {formatCurrency(goalsBucket.targetAmount)}
                                    </div>
                                    <p className="text-center text-sm text-muted-foreground">
                                        Referente a {formatCurrency(data.totalIncome)} de receita.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Sair de qual conta?</Label>
                                    <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {accounts.map(acc => (
                                                <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                                <Button onClick={handleDistribute} disabled={executing}>
                                    {executing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Confirmar
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardContent>
        </Card>
    );
}
