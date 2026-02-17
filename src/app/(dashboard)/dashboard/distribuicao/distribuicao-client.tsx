"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  validateDistributionSum,
  normalizeDistribution,
  autoBalanceOnEdit,
  distributionDelta,
  bpsToPercent,
  percentToBps,
  type AutoBalanceStrategy,
} from "@/lib/distribution/validation";
import { getDistribution, saveDistribution, createDefaultDistribution, type DistributionWithBuckets } from "@/app/actions/distribution";
import type { BaseIncomeMode, DistributionEditMode } from "@/lib/types/database";
import { Loader2, Percent, Plus, Scale, Trash2 } from "lucide-react";

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)
  );
}

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
  orgId: string;
  initialData?: DistributionWithBuckets | null;
};

export function DistribuicaoClient({ orgId, initialData }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [distribution, setDistribution] = useState<DistributionWithBuckets | null>(initialData ?? null);
  const [buckets, setBuckets] = useState<BucketEdit[]>(
    (initialData?.buckets ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      percent_bps: b.percent_bps,
      color: b.color ?? null,
      icon: b.icon ?? null,
      sort_order: b.sort_order,
      is_flexible: b.is_flexible,
    }))
  );
  const [mode, setMode] = useState<DistributionEditMode>(initialData?.mode ?? "auto");
  const [strategy, setStrategy] = useState<AutoBalanceStrategy>("flexible");
  const [name, setName] = useState(initialData?.name ?? "Minha distribuição");
  const [baseIncomeMode, setBaseIncomeMode] = useState<BaseIncomeMode>(initialData?.base_income_mode ?? "current_month");
  const [plannedIncome, setPlannedIncome] = useState<string>(initialData?.planned_income?.toString() ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const delta = distributionDelta(buckets);
  const isValid = validateDistributionSum(buckets);
  const canSave = mode === "auto" ? true : isValid;

  function handleCreateDefault() {
    startTransition(async () => {
      const res = await createDefaultDistribution(orgId);
      if (res.error) {
        setSaveError(res.error);
        return;
      }
      const { data } = await getDistribution(orgId);
      if (data) {
        setDistribution(data);
        setBuckets(
          data.buckets.map((b) => ({
            id: b.id,
            name: b.name,
            percent_bps: b.percent_bps,
            color: b.color ?? null,
            icon: b.icon ?? null,
            sort_order: b.sort_order,
            is_flexible: b.is_flexible,
          }))
        );
        setMode(data.mode);
        setName(data.name);
        setBaseIncomeMode(data.base_income_mode);
        setPlannedIncome(data.planned_income?.toString() ?? "");
      }
      router.refresh();
    });
  }

  function handlePercentChange(index: number, valuePercent: number) {
    const bps = Math.max(0, Math.min(10000, percentToBps(valuePercent)));
    if (mode === "auto") {
      const next = autoBalanceOnEdit(
        buckets.map((b) => ({ id: b.id, percent_bps: b.percent_bps, is_flexible: b.is_flexible })),
        buckets[index].id,
        bps,
        strategy
      );
      setBuckets((prev) =>
        prev.map((p) => {
          const n = next.find((x) => x.id === p.id);
          return { ...p, percent_bps: n ? n.percent_bps : p.percent_bps };
        })
      );
    } else {
      setBuckets((prev) => prev.map((p, i) => (i === index ? { ...p, percent_bps: bps } : p)));
    }
  }

  function handleNormalize() {
    setBuckets((prev) => normalizeDistribution(prev));
  }

  function handleAddBucket() {
    if (buckets.length >= 8) return;
    const newItem: BucketEdit = {
      id: uuidv4(),
      name: "Novo Bucket",
      percent_bps: 0,
      color: "#6366f1",
      icon: "circle",
      sort_order: buckets.length,
      is_flexible: false,
    };
    setBuckets([...buckets, newItem]);
  }

  function handleRemoveBucket(index: number) {
    if (buckets.length <= 2) return;
    const newBuckets = buckets.filter((_, i) => i !== index);
    setBuckets(newBuckets);
  }

  async function handleSave() {
    if (!distribution || !canSave) return;
    setSaveError(null);
    setSaveSuccess(false);
    startTransition(async () => {
      const res = await saveDistribution(orgId, {
        distribution_id: distribution.id,
        name,
        mode,
        base_income_mode: baseIncomeMode,
        planned_income: baseIncomeMode === "planned_manual" && plannedIncome ? parseFloat(plannedIncome) : null,
        buckets: buckets.map((b) => ({
          id: b.id,
          name: b.name,
          percent_bps: b.percent_bps,
          color: b.color,
          icon: b.icon,
          sort_order: b.sort_order,
          is_flexible: b.is_flexible,
        })),
      });
      if (res.error) setSaveError(res.error);
      else {
        setSaveSuccess(true);
        router.refresh();
      }
    });
  }

  if (!distribution) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nenhuma distribuição</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-ink/70">
            Crie uma distribuição padrão (50% Necessidades, 30% Desejos, 20% Metas) para começar.
          </p>
          <Button onClick={handleCreateDefault} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
            Criar distribuição padrão (50/30/20)
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="Minha distribuição" />
          </div>
          <div className="flex flex-wrap gap-4">
            <div>
              <Label>Modo</Label>
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  variant={mode === "auto" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("auto")}
                >
                  Auto-balance
                </Button>
                <Button
                  type="button"
                  variant={mode === "manual" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("manual")}
                >
                  Manual
                </Button>
              </div>
            </div>
            {mode === "auto" && (
              <div>
                <Label>Estratégia</Label>
                <div className="mt-1 flex gap-2">
                  <Button
                    type="button"
                    variant={strategy === "flexible" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStrategy("flexible")}
                  >
                    S1 Flexível
                  </Button>
                  <Button
                    type="button"
                    variant={strategy === "proportional" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStrategy("proportional")}
                  >
                    S2 Proporcional
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div>
            <Label>Base de renda</Label>
            <select
              value={baseIncomeMode}
              onChange={(e) => setBaseIncomeMode(e.target.value as BaseIncomeMode)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-surface px-3 text-sm"
            >
              <option value="current_month">Mês atual</option>
              <option value="avg_3m">Média 3 meses</option>
              <option value="avg_6m">Média 6 meses</option>
              <option value="planned_manual">Valor planejado</option>
            </select>
            {baseIncomeMode === "planned_manual" && (
              <Input
                type="number"
                step="0.01"
                value={plannedIncome}
                onChange={(e) => setPlannedIncome(e.target.value)}
                placeholder="R$"
                className="mt-2"
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5" />
              Buckets
            </CardTitle>
            {mode === "manual" && (
              <div className="flex items-center gap-2">
                {delta !== 0 && (
                  <span className={delta > 0 ? "text-ink/80" : "text-bronze"}>
                    {delta > 0 ? `Faltam ${(delta / 100).toFixed(2)}%` : `Sobram ${(-delta / 100).toFixed(2)}%`}
                  </span>
                )}
                <Button type="button" variant="outline" size="sm" onClick={handleNormalize}>
                  Normalizar para 100%
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {buckets.map((b, i) => (
            <div key={b.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-stroke/60 p-3">
              <div className="min-w-[120px] flex-1">
                <Label className="text-xs">Nome</Label>
                <Input
                  value={b.name}
                  onChange={(e) => setBuckets((prev) => prev.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))}
                  className="mt-0.5"
                />
              </div>
              <div className="w-24">
                <Label className="text-xs">%</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={bpsToPercent(b.percent_bps).toFixed(2)}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v)) handlePercentChange(i, v);
                  }}
                  className="mt-0.5"
                />
              </div>
              {mode === "auto" && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`flex-${b.id}`}
                    checked={b.is_flexible}
                    onChange={(e) =>
                      setBuckets((prev) => prev.map((p, j) => (j === i ? { ...p, is_flexible: e.target.checked } : p)))
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor={`flex-${b.id}`} className="text-xs">
                    Flexível
                  </Label>
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mb-0.5 h-9 w-9 text-ink/50 hover:text-destructive"
                onClick={() => handleRemoveBucket(i)}
                disabled={buckets.length <= 2}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {buckets.length < 8 && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed"
              onClick={handleAddBucket}
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Bucket
            </Button>
          )}

          <div className="flex items-center justify-between border-t border-stroke/60 pt-4">
            <p className="text-sm text-ink/70">
              Total: {(buckets.reduce((s, b) => s + b.percent_bps, 0) / 100).toFixed(2)}%
              {!isValid && mode === "manual" && " — ajuste para 100% para salvar."}
            </p>
            <Button onClick={handleSave} disabled={!canSave || isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </div>
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          {saveSuccess && <p className="text-sm text-vault-700">Salvo com sucesso.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
