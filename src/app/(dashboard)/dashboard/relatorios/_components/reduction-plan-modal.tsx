"use client";

import { useState, useTransition } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import {
    Scissors,
    ArrowDown,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Sparkles,
} from "lucide-react";
import {
    generateReductionPlan,
    type ReductionPlan,
} from "@/app/actions/reduction-plan";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    startDate: string;
    endDate: string;
}

const difficultyConfig = {
    easy: {
        icon: CheckCircle2,
        label: "Fácil",
        color: "text-emerald-600 bg-emerald-50 border-emerald-200",
        badge: "bg-emerald-100 text-emerald-700",
    },
    medium: {
        icon: AlertTriangle,
        label: "Médio",
        color: "text-amber-600 bg-amber-50 border-amber-200",
        badge: "bg-amber-100 text-amber-700",
    },
    hard: {
        icon: XCircle,
        label: "Difícil",
        color: "text-red-600 bg-red-50 border-red-200",
        badge: "bg-red-100 text-red-700",
    },
};

export function ReductionPlanModal({
    open,
    onOpenChange,
    startDate,
    endDate,
}: Props) {
    const [plan, setPlan] = useState<ReductionPlan | null>(null);
    const [isPending, startTransition] = useTransition();
    const [loaded, setLoaded] = useState(false);

    if (open && !loaded && !isPending) {
        setLoaded(true);
        startTransition(async () => {
            const result = await generateReductionPlan(startDate, endDate);
            setPlan(result);
        });
    }

    if (!open && loaded) {
        setLoaded(false);
        setPlan(null);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Scissors className="h-5 w-5" />
                        Plano de Redução
                    </DialogTitle>
                </DialogHeader>

                {isPending ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-vault-600 border-t-transparent" />
                    </div>
                ) : plan ? (
                    <div className="space-y-5">
                        {/* Summary */}
                        <div className="grid grid-cols-3 gap-3">
                            <Card>
                                <CardContent className="pt-4 pb-3 text-center">
                                    <p className="text-xs text-muted-foreground">Gasto Atual</p>
                                    <p className="text-lg font-bold text-red-500">
                                        {formatCurrency(plan.total_current)}
                                    </p>
                                </CardContent>
                            </Card>
                            <Card className="border-emerald-200 bg-emerald-50/50">
                                <CardContent className="pt-4 pb-3 text-center">
                                    <p className="text-xs text-muted-foreground">Meta Reduzida</p>
                                    <p className="text-lg font-bold text-emerald-600">
                                        {formatCurrency(plan.total_target)}
                                    </p>
                                </CardContent>
                            </Card>
                            <Card className="border-vault-200 bg-vault-50/30">
                                <CardContent className="pt-4 pb-3 text-center">
                                    <p className="text-xs text-muted-foreground">Economia</p>
                                    <p className="text-lg font-bold text-vault-700 flex items-center justify-center gap-1">
                                        <ArrowDown className="h-4 w-4" />
                                        {formatCurrency(plan.total_saving)} ({plan.saving_pct.toFixed(0)}%)
                                    </p>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Category suggestions */}
                        <div>
                            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                                <Sparkles className="h-4 w-4" />
                                Sugestões por Categoria
                            </h3>
                            <div className="space-y-3">
                                {plan.suggestions.map((sug) => {
                                    const cfg = difficultyConfig[sug.difficulty];
                                    const Icon = cfg.icon;
                                    return (
                                        <div
                                            key={sug.category_id ?? "none"}
                                            className={`rounded-lg border p-4 ${cfg.color}`}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Icon className="h-4 w-4" />
                                                    <span className="font-semibold">{sug.category_name}</span>
                                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>
                                                        {cfg.label}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold">
                                                        {formatCurrency(sug.current_spend)} → {formatCurrency(sug.suggested_target)}
                                                    </p>
                                                    <p className="text-xs">
                                                        Economia: {formatCurrency(sug.saving)}
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="mt-2 text-xs opacity-80">{sug.tip}</p>

                                            {/* Visual bar */}
                                            <div className="mt-2 flex items-center gap-2">
                                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/50">
                                                    <div
                                                        className="h-full rounded-full bg-current opacity-60"
                                                        style={{
                                                            width: `${(sug.suggested_target / sug.current_spend) * 100}%`,
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-xs font-medium">
                                                    -{((sug.saving / sug.current_spend) * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {plan.suggestions.length === 0 && (
                            <p className="py-8 text-center text-muted-foreground">
                                Nenhuma despesa encontrada no período para gerar sugestões.
                            </p>
                        )}
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
