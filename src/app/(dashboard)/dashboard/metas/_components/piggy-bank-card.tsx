"use client";

import { Goal } from "@/app/actions/goals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { PiggyBank, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress"; // Re-using our wrapper or shadcn/ui one
// We'll need a BreakPigDialog later, for now just the card structure
// import { BreakPigDialog } from "./break-pig-dialog";

interface PiggyBankCardProps {
    goal: Goal;
    onBreak: (goal: Goal) => void;
}

export function PiggyBankCard({ goal, onBreak }: PiggyBankCardProps) {
    const progress = goal.target_amount ? Math.min(100, (goal.current_amount / goal.target_amount) * 100) : 0;
    const isFull = progress >= 100;

    return (
        <Card className="relative overflow-hidden border-2 border-pink-200 bg-pink-50/30 hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-pink-100 opacity-50 blur-xl" />

            <CardHeader className="pb-2">
                <div className="flex justify-between items-start z-10">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-pink-600">
                            Cofrinho
                        </p>
                        <CardTitle className="mt-1 text-lg text-pink-900">{goal.name}</CardTitle>
                    </div>
                    <div className="bg-pink-100 text-pink-600 p-2 rounded-full ring-2 ring-pink-50">
                        <PiggyBank className="h-6 w-6" />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="z-10 relative">
                <div className="mt-2 space-y-4">
                    <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="font-bold text-pink-700">{formatCurrency(goal.current_amount)}</span>
                            <span className="text-pink-400">meta: {goal.target_amount ? formatCurrency(goal.target_amount) : "∞"}</span>
                        </div>
                        <Progress value={progress} className="h-3 bg-pink-100 [&>div]:bg-pink-500" />
                        <p className="text-right text-xs font-medium text-pink-600">{progress.toFixed(0)}% cheio</p>
                    </div>

                    <div className="pt-2">
                        <Button
                            className="w-full bg-pink-600 hover:bg-pink-700 text-white gap-2 group"
                            onClick={() => onBreak(goal)}
                            variant={isFull ? "default" : "secondary"}
                        >
                            <Hammer className="h-4 w-4 transition-transform group-hover:rotate-45" />
                            {isFull ? "Quebrar o Porquinho!" : "Quebrar Agora"}
                        </Button>
                        {!isFull && (
                            <p className="text-[10px] text-center text-muted-foreground mt-2">
                                Ainda não atingiu a meta, mas você pode quebrar se precisar.
                            </p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
