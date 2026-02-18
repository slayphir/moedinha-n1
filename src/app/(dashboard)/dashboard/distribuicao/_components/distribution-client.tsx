"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDistribution, type DistributionWithBuckets } from "@/app/actions/distribution";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  autoBalanceOnEdit,
  bpsToPercent,
  distributionDelta,
  normalizeDistribution,
  percentToBps,
  validateDistributionSum,
  type AutoBalanceStrategy,
} from "@/lib/distribution/validation";
import type { BaseIncomeMode, DistributionEditMode } from "@/lib/types/database";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";

type BucketEdit = {
  id: string;
  name: string;
  percent_bps: number;
  color: string | null;
  icon: string | null;
  sort_order: number;
  is_flexible: boolean;
};

type Props = {
  distribution: DistributionWithBuckets;
  orgId: string;
};

function toBucketEdit(data: DistributionWithBuckets): BucketEdit[] {
  return data.buckets.map((bucket) => ({
    id: bucket.id,
    name: bucket.name,
    percent_bps: bucket.percent_bps,
    color: bucket.color ?? null,
    icon: bucket.icon ?? null,
    sort_order: bucket.sort_order,
    is_flexible: bucket.is_flexible,
  }));
}

export function DistributionClient({ distribution, orgId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(distribution.name);
  const [mode, setMode] = useState<DistributionEditMode>(distribution.mode ?? "auto");
  const [strategy, setStrategy] = useState<AutoBalanceStrategy>("flexible");
  const [baseIncomeMode, setBaseIncomeMode] = useState<BaseIncomeMode>(distribution.base_income_mode ?? "current_month");
  const [plannedIncome, setPlannedIncome] = useState(distribution.planned_income?.toString() ?? "");
  const [buckets, setBuckets] = useState<BucketEdit[]>(toBucketEdit(distribution));

  const totalBps = useMemo(() => buckets.reduce((sum, bucket) => sum + bucket.percent_bps, 0), [buckets]);
  const delta = distributionDelta(buckets);
  const isValid = validateDistributionSum(buckets);
  const canSave = mode === "auto" ? true : isValid;

  function updateBucket(index: number, update: Partial<BucketEdit>) {
    setBuckets((prev) => prev.map((bucket, current) => (current === index ? { ...bucket, ...update } : bucket)));
  }

  function handlePercentChange(index: number, percentValue: number) {
    const safePercent = Math.max(0, Math.min(100, percentValue));
    const newBps = percentToBps(safePercent);

    if (mode === "manual") {
      updateBucket(index, { percent_bps: newBps });
      return;
    }

    const source = buckets.map((bucket) => ({
      id: bucket.id,
      percent_bps: bucket.percent_bps,
      is_flexible: bucket.is_flexible,
    }));

    const balanced = autoBalanceOnEdit(source, buckets[index].id, newBps, strategy);
    setBuckets((prev) =>
      prev.map((bucket) => {
        const next = balanced.find((item) => item.id === bucket.id);
        return next ? { ...bucket, percent_bps: next.percent_bps } : bucket;
      })
    );
  }

  function handleNormalize() {
    setBuckets((prev) => normalizeDistribution(prev));
  }

  function handleAddBucket() {
    if (buckets.length >= 8) {
      toast({
        title: "Limite atingido",
        description: "Voce pode ter no maximo 8 buckets.",
        variant: "destructive",
      });
      return;
    }

    setBuckets((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "Novo Bucket",
        percent_bps: 0,
        color: "#6366f1",
        icon: "circle",
        sort_order: prev.length,
        is_flexible: false,
      },
    ]);
  }

  function handleDeleteBucket(index: number) {
    if (buckets.length <= 2) {
      toast({
        title: "Minimo de 2 buckets",
        description: "Mantenha pelo menos 2 buckets ativos.",
        variant: "destructive",
      });
      return;
    }

    let next = buckets.filter((_, current) => current !== index);
    if (mode === "auto") {
      next = normalizeDistribution(next);
    }

    setBuckets(next.map((bucket, current) => ({ ...bucket, sort_order: current })));
  }

  function handleSave() {
    if (!canSave) {
      toast({
        title: "Distribuicao invalida",
        description: "A soma dos buckets deve totalizar 100%.",
        variant: "destructive",
      });
      return;
    }

    startTransition(async () => {
      const parsedIncome =
        baseIncomeMode === "planned_manual" && plannedIncome.trim().length > 0 ? Number(plannedIncome) : null;

      const result = await saveDistribution(orgId, {
        distribution_id: distribution.id,
        name,
        mode,
        base_income_mode: baseIncomeMode,
        planned_income: Number.isFinite(parsedIncome) ? parsedIncome : null,
        buckets: buckets.map((bucket, index) => ({
          id: bucket.id,
          name: bucket.name,
          percent_bps: bucket.percent_bps,
          color: bucket.color,
          icon: bucket.icon,
          sort_order: index,
          is_flexible: bucket.is_flexible,
        })),
      });

      if (result.error) {
        toast({
          title: "Erro ao salvar",
          description: result.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Distribuicao salva",
        description: "As alteracoes foram aplicadas com sucesso.",
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-stroke/60 bg-gradient-to-r from-vault-950 via-vault-900 to-bronze p-5 text-paper shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-paper/80">Configuracao</p>
            <h1 className="font-display text-3xl">Distribuicao da Receita</h1>
            <p className="mt-1 text-sm text-paper/85">Defina como a renda sera dividida entre buckets.</p>
          </div>
          <div className="flex items-center gap-2">
            {mode === "manual" && (
              <Button
                type="button"
                variant="outline"
                className="border-paper/30 bg-paper/10 text-paper hover:bg-paper/20"
                onClick={handleNormalize}
                disabled={isPending}
              >
                Normalizar
              </Button>
            )}
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleSave}
              disabled={!canSave || isPending}
            >
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Parametros</CardTitle>
          <CardDescription>Configure modo de edicao e base de renda.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="distribution-name">Nome da distribuicao</Label>
            <Input
              id="distribution-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1"
              placeholder="Minha distribuicao"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label>Modo</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "auto" ? "default" : "outline"}
                  onClick={() => setMode("auto")}
                >
                  Auto-balance
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "manual" ? "default" : "outline"}
                  onClick={() => setMode("manual")}
                >
                  Manual
                </Button>
              </div>
            </div>

            {mode === "auto" && (
              <div className="space-y-1">
                <Label>Estrategia</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={strategy === "flexible" ? "default" : "outline"}
                    onClick={() => setStrategy("flexible")}
                  >
                    S1 Flexivel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={strategy === "proportional" ? "default" : "outline"}
                    onClick={() => setStrategy("proportional")}
                  >
                    S2 Proporcional
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="base-income-mode">Base de renda</Label>
            <select
              id="base-income-mode"
              value={baseIncomeMode}
              onChange={(event) => setBaseIncomeMode(event.target.value as BaseIncomeMode)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-surface px-3 text-sm"
            >
              <option value="current_month">Mes atual</option>
              <option value="avg_3m">Media 3 meses</option>
              <option value="avg_6m">Media 6 meses</option>
              <option value="planned_manual">Valor planejado</option>
            </select>
            {baseIncomeMode === "planned_manual" && (
              <CurrencyInput
                value={plannedIncome}
                onChange={(val) => setPlannedIncome(val)}
                placeholder="0,00"
                className="mt-2"
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Buckets</CardTitle>
              <CardDescription>Minimo 2, maximo 8 buckets.</CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={handleAddBucket} disabled={buckets.length >= 8 || isPending}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {buckets.map((bucket, index) => (
            <div key={bucket.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-stroke/60 p-3">
              <div className="min-w-[160px] flex-1">
                <Label className="text-xs">Nome</Label>
                <Input
                  value={bucket.name}
                  onChange={(event) => updateBucket(index, { name: event.target.value })}
                  className="mt-1"
                />
              </div>

              <div className="w-28">
                <Label className="text-xs">Percentual</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={bpsToPercent(bucket.percent_bps).toFixed(2)}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isNaN(value)) {
                      handlePercentChange(index, value);
                    }
                  }}
                  className="mt-1"
                />
              </div>

              {mode === "auto" && (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={bucket.is_flexible}
                    onChange={(event) => updateBucket(index, { is_flexible: event.target.checked })}
                    className="h-4 w-4 rounded border-input"
                  />
                  Flexivel
                </label>
              )}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-ink/50 hover:text-destructive"
                onClick={() => handleDeleteBucket(index)}
                disabled={buckets.length <= 2 || isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stroke/60 pt-3 text-sm">
            <span className="text-ink/80">
              Total: {(totalBps / 100).toFixed(2)}%
              {mode === "manual" && !isValid && (
                <span className="ml-2 text-destructive">
                  {delta > 0 ? `Faltam ${(delta / 100).toFixed(2)}%` : `Sobram ${Math.abs(delta / 100).toFixed(2)}%`}
                </span>
              )}
            </span>
            <Button type="button" variant="outline" onClick={handleAddBucket} disabled={buckets.length >= 8 || isPending}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar
            </Button>
            <Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleSave} disabled={!canSave || isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
