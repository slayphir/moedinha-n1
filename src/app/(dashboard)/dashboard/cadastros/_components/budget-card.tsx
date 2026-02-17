"use client";

import { formatCurrency } from "@/lib/utils";
import { AlertTriangle, Pencil, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type CategoryBudgetInfo = {
    id: string; // Budget ID
    categoryId: string;
    categoryName: string;
    amount: number;
    alert_threshold: number;
    spent: number;
    usage_pct: number;
    near_limit: boolean;
    over_limit: boolean;
};

type Props = {
    budget: CategoryBudgetInfo;
    onEdit: (budget: CategoryBudgetInfo) => void;
};

export function BudgetCard({ budget, onEdit }: Props) {
    const statusColor = budget.over_limit
        ? "bg-red-500"
        : budget.near_limit
            ? "bg-amber-500"
            : "bg-emerald-500";

    const borderColor = budget.over_limit
        ? "border-red-200"
        : budget.near_limit
            ? "border-amber-200"
            : "border-slate-200";

    const bgColor = budget.over_limit
        ? "bg-red-50"
        : budget.near_limit
            ? "bg-amber-50"
            : "bg-white";

    return (
        <Card className={`border-2 ${borderColor} ${bgColor} shadow-sm`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <span className="p-2 bg-white rounded-full border border-slate-100">
                        <Wallet className="h-4 w-4 text-slate-500" />
                    </span>
                    {budget.categoryName}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => onEdit(budget)} className="h-8 w-8">
                    <Pencil className="h-3 w-3" />
                </Button>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between text-2xl font-bold tracking-tight">
                            {formatCurrency(budget.spent)}
                            <span className="text-muted-foreground text-sm font-normal self-end mb-1">
                                / {formatCurrency(budget.amount)}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {budget.over_limit ? (
                                <span className="text-red-600 font-medium flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> Excedido em {formatCurrency(budget.spent - budget.amount)}
                                </span>
                            ) : (
                                <span>Restam {formatCurrency(budget.amount - budget.spent)}</span>
                            )}
                        </p>
                    </div>

                    <div className="space-y-1">
                        <Progress value={Math.min(budget.usage_pct, 100)} className="h-2" indicatorClassName={statusColor} />
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>0%</span>
                            <span className={budget.usage_pct > 100 ? "text-red-600 font-bold" : ""}>
                                {budget.usage_pct.toFixed(0)}%
                            </span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
