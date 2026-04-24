/**
 * Classificação central de transações.
 *
 * `signedAmount` representa o fluxo de caixa real.
 * `isReceita` / `isDespesa` alimentam cards e relatórios operacionais.
 */

export type TxForClassification = {
  type: string;
  amount: number | string | null;
  contact_id?: string | null;
  category_id?: string | null;
  category_type?: string | null;
  /** 'paid_to_me' = ela me pagou (receita), 'paid_by_me' = eu paguei por ela (despesa). Null = usar categoria. */
  contact_payment_direction?: string | null;
};

type TxWithCategoryId = {
  category_id?: string | null;
};

export function attachCategoryType<T extends TxWithCategoryId>(
  transactions: T[],
  categoryTypeById: ReadonlyMap<string, string>
): Array<T & { category_type: string | null }> {
  return transactions.map((transaction) => ({
    ...transaction,
    category_type: transaction.category_id ? categoryTypeById.get(transaction.category_id) ?? null : null,
  }));
}

/** True quando o lançamento com contato conta como "ela me pagou" (receita). */
function isContactPaysMe(tx: TxForClassification, contactPaysMeCategoryIds: Set<string>): boolean {
  if (!tx.contact_id) return false;
  if (tx.contact_payment_direction === "paid_to_me") return true;
  if (tx.contact_payment_direction === "paid_by_me") return false;
  return Boolean(tx.category_id && contactPaysMeCategoryIds.has(tx.category_id));
}

function isThirdPartySettlement(tx: TxForClassification, contactPaysMeCategoryIds: Set<string>): boolean {
  if (!tx.contact_id) return false;
  if (tx.contact_payment_direction === "paid_to_me" || tx.contact_payment_direction === "paid_by_me") {
    return true;
  }
  return Boolean(tx.category_id && contactPaysMeCategoryIds.has(tx.category_id));
}

/**
 * Valor com sinal para saldo: positivo = entra no caixa, negativo = sai.
 */
export function signedAmount(tx: TxForClassification, contactPaysMeCategoryIds: Set<string>): number {
  const raw = Number(tx.amount ?? 0);
  const abs = Math.abs(raw);
  if (tx.contact_id) {
    return isContactPaysMe(tx, contactPaysMeCategoryIds) ? abs : -abs;
  }
  if (tx.type === "income") return abs;
  if (tx.type === "expense") return -abs;
  return 0;
}

/**
 * Conta como receita operacional.
 *
 * O saldo continua usando `signedAmount`, mas os cards de receita/despesa usam
 * o `type` do lancamento como fonte de verdade. `category_type` protege contra
 * dados historicos inconsistentes gerados por regras antigas.
 */
export function isReceita(tx: TxForClassification, _contactPaysMeCategoryIds: Set<string>): boolean {
  const contactPaysMeCategoryIds = _contactPaysMeCategoryIds;
  if (isThirdPartySettlement(tx, contactPaysMeCategoryIds)) return false;
  if (tx.type !== "income") return false;
  return tx.category_type !== "expense";
}

/**
 * Conta como despesa operacional.
 */
export function isDespesa(tx: TxForClassification, _contactPaysMeCategoryIds: Set<string>): boolean {
  const contactPaysMeCategoryIds = _contactPaysMeCategoryIds;
  if (isThirdPartySettlement(tx, contactPaysMeCategoryIds)) return false;
  if (tx.type !== "expense") return false;
  return tx.category_type !== "income";
}

/**
 * Soma de receitas (valor absoluto) de uma lista.
 */
export function sumReceitas(
  transactions: TxForClassification[],
  contactPaysMeCategoryIds: Set<string>
): number {
  return transactions
    .filter((t) => isReceita(t, contactPaysMeCategoryIds))
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
}

/**
 * Soma de despesas (valor absoluto) de uma lista.
 */
export function sumDespesas(
  transactions: TxForClassification[],
  contactPaysMeCategoryIds: Set<string>
): number {
  return transactions
    .filter((t) => isDespesa(t, contactPaysMeCategoryIds))
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
}

/**
 * Soma valores de despesa para previsto por vencimento (`due_date` / à vista).
 * Inclui acertos com terceiros e centro credor, que `sumDespesas` deixa de fora.
 */
export function sumDespesasCompromissosForecast(transactions: TxForClassification[]): number {
  return transactions
    .filter((t) => t.type === "expense" && t.category_type !== "income")
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
}
