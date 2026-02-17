import type { TransactionType } from "@/lib/types/database";

export type QuickTransactionDraft = {
  amount?: number;
  description?: string;
  type?: TransactionType;
};

function parseAmountToken(token: string): number | null {
  const normalized = token.replace(",", ".").replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value === 0) return null;
  return Math.abs(value);
}

export function parseQuickCommand(input: string): QuickTransactionDraft | null {
  const raw = input.trim();
  if (!raw) return null;

  const normalized = raw.toLowerCase();
  const startsAsQuick =
    normalized.startsWith("add ") ||
    normalized.startsWith("novo ") ||
    normalized.startsWith("nova ") ||
    normalized.startsWith("lancar ") ||
    normalized.startsWith("lançar ");

  const tokens = raw.split(/\s+/);
  let amountTokenIndex = -1;
  let amount: number | null = null;

  for (let index = 0; index < tokens.length; index += 1) {
    const parsed = parseAmountToken(tokens[index]);
    if (parsed !== null) {
      amountTokenIndex = index;
      amount = parsed;
      break;
    }
  }

  if (amount === null) return null;
  if (!startsAsQuick && amountTokenIndex > 0) return null;

  const descriptionTokens = tokens.filter((_, index) => index !== amountTokenIndex);
  const description = descriptionTokens
    .join(" ")
    .replace(/^(add|novo|nova|lancar|lançar)\s+/i, "")
    .trim();

  const type: TransactionType =
    /\b(receita|entrada|ganho|salario|salário)\b/i.test(raw) ? "income" : "expense";

  return {
    amount,
    description,
    type,
  };
}

