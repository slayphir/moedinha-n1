"use client";

import { useState } from "react";
import { RecurringRule } from "@/lib/types/database";
import { formatCurrency } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, CreditCard, Pencil, Trash2, Repeat } from "lucide-react";
import { toggleRecurringRule, deleteRecurringRule } from "@/app/actions/recurring";
import { RecurringRuleDialog } from "./recurring-rule-dialog";
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
import { useToast } from "@/components/ui/use-toast";

interface Props {
    rules: (RecurringRule & { account: { name: string }; category: { name: string } | null })[];
}

export function RecurringRulesClient({ rules }: Props) {
    const { toast } = useToast();
    // Optimistic updates could be added here, but for now relying on server revalidation

    async function handleToggle(id: string, currentStatus: boolean) {
        const result = await toggleRecurringRule(id, !currentStatus);
        if (result.error) {
            toast({ variant: "destructive", title: "Erro", description: result.error });
        }
    }

    async function handleDelete(id: string) {
        const result = await deleteRecurringRule(id);
        if (result.error) {
            toast({ variant: "destructive", title: "Erro", description: result.error });
        } else {
            toast({ title: "Removido", description: "Assinatura removida com sucesso." });
        }
    }

    const frequencyLabel = {
        weekly: "Semanal",
        monthly: "Mensal",
        yearly: "Anual",
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-display font-bold tracking-tight">Assinaturas e Fixos</h2>
                    <p className="text-muted-foreground">
                        Gerencie seus pagamentos recorrentes que serão lançados automaticamente.
                    </p>
                </div>
                <RecurringRuleDialog />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {rules.map((rule) => (
                    <Card key={rule.id} className={!rule.is_active ? "opacity-60" : ""}>
                        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                            <CardTitle className="text-base font-semibold">
                                {rule.description}
                            </CardTitle>
                            <Switch
                                checked={rule.is_active}
                                onCheckedChange={() => handleToggle(rule.id, rule.is_active)}
                            />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(rule.amount)}</div>
                            <p className="text-xs text-muted-foreground mb-4">
                                {frequencyLabel[rule.frequency]}
                            </p>

                            <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <CreditCard className="h-4 w-4" />
                                    <span>{rule.account.name}</span>
                                </div>
                                {rule.category && (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Badge variant="secondary" className="font-normal">
                                            {rule.category.name}
                                        </Badge>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <CalendarIcon className="h-4 w-4" />
                                    <span>Início: {format(parseISO(rule.start_date), "dd/MM/yyyy")}</span>
                                </div>
                            </div>

                            <div className="mt-4 flex justify-end gap-2">
                                <RecurringRuleDialog
                                    rule={rule}
                                    trigger={
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    }
                                />

                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Excluir assinatura?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Isso impedirá que novos lançamentos sejam gerados automaticamente. O histórico não será apagado.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDelete(rule.id)} className="bg-destructive hover:bg-destructive/90">
                                                Excluir
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {rules.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
                    <div className="mb-4 rounded-full bg-muted p-4">
                        <Repeat className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold">Nenhuma assinatura encontrada</h3>
                    <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                        Cadastre seus gastos fixos (Netflix, Aluguel, Internet) e deixe que o sistema lance para você.
                    </p>
                    <RecurringRuleDialog />
                </div>
            )}
        </div>
    );
}
