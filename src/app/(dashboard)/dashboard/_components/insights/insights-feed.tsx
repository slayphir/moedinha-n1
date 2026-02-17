"use client";

import { useTransition } from "react";
import { AlertCircle, ArrowUpRight, CheckCircle, RefreshCcw, TrendingUp, X } from "lucide-react";
import { Insight, dismissInsight, refreshInsights } from "@/app/actions/insights";
import { Button } from "@/components/ui/button";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

type Props = {
    insights: Insight[];
};

const insightVariants = cva(
    "relative flex items-start gap-4 rounded-lg border p-4 transition-all hover:shadow-md",
    {
        variants: {
            severity: {
                info: "bg-blue-50/50 border-blue-100 text-blue-900",
                warn: "bg-amber-50/50 border-amber-100 text-amber-900",
                critical: "bg-red-50/50 border-red-100 text-red-900",
            },
            type: {
                spending_spike: "",
                goal_risk: "",
                new_recurrence: "",
                budget_overflow: "",
                opportunity: "",
            }
        },
        defaultVariants: {
            severity: "info",
        },
    }
);

const iconMap = {
    spending_spike: TrendingUp,
    goal_risk: AlertCircle,
    new_recurrence: RefreshCcw,
    budget_overflow: AlertCircle,
    opportunity: CheckCircle,
};

export function InsightsFeed({ insights }: Props) {
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    function handleDismiss(id: string) {
        startTransition(async () => {
            await dismissInsight(id);
            toast({ description: "Insight arquivado." });
        });
    }

    function handleRefresh() {
        startTransition(async () => {
            await refreshInsights();
            toast({ description: "Insights atualizados." });
        });
    }

    if (insights.length === 0) {
        return (
            <div className="rounded-xl border border-dashed p-8 text-center bg-slate-50/50">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 mb-3">
                    <CheckCircle className="h-5 w-5 text-slate-400" />
                </div>
                <h3 className="text-sm font-medium text-slate-900">Tudo tranquilo!</h3>
                <p className="text-xs text-slate-500 mt-1 mb-4">Nenhum alerta ou risco detectado.</p>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isPending}>
                    {isPending ? <RefreshCcw className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCcw className="mr-2 h-3 w-3" />}
                    Verificar agora
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight">Insights & Alertas</h2>
                <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isPending}>
                    <RefreshCcw className={cn("h-4 w-4 text-slate-400", isPending && "animate-spin")} />
                </Button>
            </div>

            <div className="grid gap-3">
                {insights.map((insight) => {
                    const Icon = iconMap[insight.type as keyof typeof iconMap] || AlertCircle;

                    return (
                        <div
                            key={insight.id}
                            className={cn(insightVariants({ severity: insight.severity }))}
                        >
                            <div className={`mt-0.5 rounded-full p-1.5 ${insight.severity === 'critical' ? 'bg-red-100 text-red-600' :
                                    insight.severity === 'warn' ? 'bg-amber-100 text-amber-600' :
                                        'bg-blue-100 text-blue-600'
                                }`}>
                                <Icon className="h-4 w-4" />
                            </div>

                            <div className="flex-1 space-y-1">
                                <h4 className="text-sm font-semibold leading-none">
                                    {insight.title}
                                </h4>
                                <p className="text-sm opacity-90 leading-relaxed">
                                    {insight.message}
                                </p>
                                {insight.metadata?.increase_pct && (
                                    <div className="flex items-center gap-1 text-xs font-medium mt-2 opacity-80">
                                        <ArrowUpRight className="h-3 w-3" />
                                        Aumento significativo
                                    </div>
                                )}
                            </div>

                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 -mr-2 -mt-2 opacity-50 hover:opacity-100"
                                onClick={() => handleDismiss(insight.id)}
                            >
                                <X className="h-4 w-4" />
                                <span className="sr-only">Dismiss</span>
                            </Button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
