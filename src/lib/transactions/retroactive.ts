export type RetroactiveInstallmentCandidate = {
  type?: string | null;
  date?: string | null;
  installment_id?: string | null;
  created_at?: string | null;
  metadata?: unknown;
};

function hasExcludeFromCashBalanceFlag(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>).exclude_from_cash_balance === true;
}

export function isRetroactiveInstallmentBackfill(tx: RetroactiveInstallmentCandidate): boolean {
  const txType = tx.type ?? "expense";
  if (txType !== "expense") return false;
  if (!tx.installment_id) return false;

  if (hasExcludeFromCashBalanceFlag(tx.metadata)) return true;

  if (!tx.date || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) return false;
  if (!tx.created_at || tx.created_at.length < 10) return false;

  const createdMonth = tx.created_at.slice(0, 7);
  const txMonth = tx.date.slice(0, 7);
  return txMonth < createdMonth;
}
