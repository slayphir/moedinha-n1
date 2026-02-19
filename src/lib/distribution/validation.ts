/**
 * Validação e ajuste de distribuição em basis points (100% = 10000).
 * 2–8 buckets; soma obrigatória 10000.
 */

const TOTAL_BPS = 10000;

export interface BucketInput {
  id: string;
  percent_bps: number;
  is_flexible?: boolean;
}

/**
 * Valida se a soma dos percent_bps dos buckets é exatamente 10000.
 */
export function validateDistributionSum(buckets: { percent_bps: number }[]): boolean {
  const total = buckets.reduce((s, b) => s + b.percent_bps, 0);
  return total === TOTAL_BPS;
}

/**
 * Retorna a diferença em basis points (10000 - soma).
 * Positivo = faltam; negativo = sobram.
 */
export function distributionDelta(buckets: { percent_bps: number }[]): number {
  const total = buckets.reduce((s, b) => s + b.percent_bps, 0);
  return TOTAL_BPS - total;
}

/**
 * Normaliza buckets para soma = 10000 (modo manual).
 * Distribui proporcionalmente; último bucket recebe o ajuste de arredondamento.
 */
export function normalizeDistribution<T extends { percent_bps: number }>(buckets: T[]): T[] {
  if (buckets.length === 0) return buckets;
  const total = buckets.reduce((s, b) => s + b.percent_bps, 0);
  if (total === 0) return buckets;

  const factor = TOTAL_BPS / total;
  const result = buckets.map((b, i) => ({
    ...b,
    percent_bps: i < buckets.length - 1
      ? Math.round(b.percent_bps * factor)
      : 0, // será preenchido abaixo
  }));

  const sumExceptLast = result.slice(0, -1).reduce((s, b) => s + b.percent_bps, 0);
  result[result.length - 1] = {
    ...result[result.length - 1],
    percent_bps: TOTAL_BPS - sumExceptLast,
  };

  return result as T[];
}

export type AutoBalanceStrategy = "flexible" | "proportional";

/**
 * Ao editar um bucket para newBps, redistribui o delta nos demais.
 * - flexible (S1): só o bucket com is_flexible recebe o delta.
 * - proportional (S2): delta distribuído proporcionalmente entre os outros.
 * Garante soma = 10000 com ajuste no último bucket se necessário.
 */
export function autoBalanceOnEdit(
  buckets: BucketInput[],
  editedId: string,
  newBps: number,
  strategy: AutoBalanceStrategy
): BucketInput[] {
  if (strategy === "flexible") {
    const editedExists = buckets.some((bucket) => bucket.id === editedId);
    if (!editedExists) return buckets.map((bucket) => ({ ...bucket }));

    const clampedEdited = Math.max(0, Math.min(TOTAL_BPS, newBps));
    const flexibleTarget =
      buckets.find((bucket) => bucket.id !== editedId && bucket.is_flexible) ??
      buckets.find((bucket) => bucket.id !== editedId);

    if (!flexibleTarget) {
      return buckets.map((bucket) =>
        bucket.id === editedId ? { ...bucket, percent_bps: clampedEdited } : { ...bucket }
      );
    }

    const fixedSum = buckets
      .filter((bucket) => bucket.id !== editedId && bucket.id !== flexibleTarget.id)
      .reduce((sum, bucket) => sum + bucket.percent_bps, 0);

    let nextEdited = clampedEdited;
    let nextFlexible = TOTAL_BPS - fixedSum - nextEdited;

    if (nextFlexible < 0) {
      nextFlexible = 0;
      nextEdited = TOTAL_BPS - fixedSum;
    } else if (nextFlexible > TOTAL_BPS) {
      nextFlexible = TOTAL_BPS;
      nextEdited = TOTAL_BPS - fixedSum - nextFlexible;
    }

    nextEdited = Math.max(0, Math.min(TOTAL_BPS, nextEdited));
    nextFlexible = Math.max(0, Math.min(TOTAL_BPS, nextFlexible));

    return buckets.map((bucket) => {
      if (bucket.id === editedId) return { ...bucket, percent_bps: nextEdited };
      if (bucket.id === flexibleTarget.id) return { ...bucket, percent_bps: nextFlexible };
      return { ...bucket };
    });
  }

  const others = buckets.filter((b) => b.id !== editedId);
  const sumOthers = others.reduce((s, b) => s + b.percent_bps, 0);
  const delta = TOTAL_BPS - (sumOthers + newBps);

  const result = buckets.map((b) => {
    if (b.id === editedId) {
      return { ...b, percent_bps: Math.max(0, Math.min(TOTAL_BPS, newBps)) };
    }
    return { ...b };
  });

  if (others.length === 0) {
    return result;
  }

  const totalOther = sumOthers;
  others.forEach((o) => {
    const idx = result.findIndex((b) => b.id === o.id);
    if (idx !== -1 && totalOther > 0) {
      result[idx].percent_bps = Math.round(o.percent_bps + (o.percent_bps / totalOther) * delta);
    }
  });

  // Ajuste de arredondamento no último bucket para soma exata
  const currentSum = result.reduce((s, b) => s + b.percent_bps, 0);
  const diff = TOTAL_BPS - currentSum;
  if (diff !== 0 && result.length > 0) {
    const lastIdx = result.length - 1;
    result[lastIdx].percent_bps = Math.max(0, result[lastIdx].percent_bps + diff);
  }

  return result;
}

/**
 * Converte percentual (0–100) para basis points (0–10000).
 */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

/**
 * Converte basis points para percentual com 2 decimais (para exibição).
 */
export function bpsToPercent(bps: number): number {
  return Math.round(bps) / 100;
}
