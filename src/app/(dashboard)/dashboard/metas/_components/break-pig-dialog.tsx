"use client";

import { Goal, updateGoal } from "@/app/actions/goals";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import confetti from "canvas-confetti";

interface BreakPigDialogProps {
    goal: Goal | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function BreakPigDialog({ goal, open, onOpenChange, onSuccess }: BreakPigDialogProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);

    if (!goal) return null;

    async function handleBreak() {
        setLoading(true);
        try {
            const result = await updateGoal({
                id: goal!.id, // Non-null assertion safe because of check above
                status: 'completed',
                current_amount: goal!.target_amount || goal!.current_amount // Assume full if broken? Or keep current? Let's keep current unless it matches target. Actually, user might just want to close it.
            });

            if (result.error) {
                toast({
                    variant: "destructive",
                    title: "Erro ao quebrar o porquinho",
                    description: result.error,
                });
            } else {
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 }
                });

                toast({
                    title: "Oink! Porquinho quebrado!",
                    description: `Você completou o objetivo ${goal?.name}.`,
                });
                onSuccess();
                onOpenChange(false);
            }
        } catch (error) {
            console.error(error);
            toast({
                variant: "destructive",
                title: "Erro inesperado",
                description: "Tente novamente.",
            });
        } finally {
            setLoading(false);
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Quebrar o Porquinho?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Isso marcará o cofrinho "{goal.name}" como concluído.
                        {goal.current_amount < (goal.target_amount || 0) && (
                            <p className="mt-2 text-amber-600 font-medium">
                                Atenção: Você ainda não atingiu a meta de R$ {goal.target_amount}.
                            </p>
                        )}
                        <p className="mt-2">
                            Tem certeza que deseja usar esse dinheiro agora?
                        </p>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>Ainda não</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            handleBreak();
                        }}
                        disabled={loading}
                        className="bg-pink-600 hover:bg-pink-700 text-white"
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Quebrar e Usar!
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
