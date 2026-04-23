import { isAfter, parseISO, startOfDay } from "date-fns";

import type { TransactionType } from "@/lib/types/database";

export type TransactionStatus = "pending" | "cleared" | "reconciled" | "cancelled";

export function isCreditCardAccount(account: {
    type?: string | null;
    is_credit_card?: boolean | null;
}): boolean {
    return account.type === "credit_card" || account.is_credit_card === true;
}

/**
 * Despesa no cartão com data de vencimento (fatura) no futuro permanece pending
 * até o pagamento pela tela de Faturas — mesmo que o CSV diga "cleared" ou o usuário marque "pago".
 */
export function applyCreditCardFutureDuePending(
    proposed: "pending" | "cleared",
    transactionType: TransactionType,
    dueDate: string | null | undefined,
    account: { type?: string | null; is_credit_card?: boolean | null }
): "pending" | "cleared" {
    if (transactionType !== "expense" || !isCreditCardAccount(account)) return proposed;
    const txDue = safeParseDate(dueDate?.trim() ?? "");
    if (!txDue) return proposed;
    const dueDay = startOfDay(txDue);
    const today = startOfDay(new Date());
    if (isAfter(dueDay, today)) return "pending";
    return proposed;
}

/** CSV / imports: regra cartão + vencimento, depois coerção de data futura. */
export function finalizeTransactionStatusForImportRow(
    transactionDate: string,
    rowStatus: "pending" | "cleared",
    transactionType: TransactionType,
    dueDate: string | null,
    account: { type?: string | null; is_credit_card?: boolean | null }
): "pending" | "cleared" {
    const adjusted = applyCreditCardFutureDuePending(rowStatus, transactionType, dueDate, account);
    return coerceStatusForFutureDate(transactionDate, adjusted);
}

function safeParseDate(value: string): Date | null {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    const parsed = parseISO(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Regra anti-inconsistência:
 * - Se date está no futuro, status não pode ser cleared/reconciled.
 * - Se já foi pago, o usuário deve usar a data real do pagamento (hoje ou passado).
 */
export function coerceStatusForFutureDate(
    date: string,
    status: "pending" | "cleared",
    now?: Date
): "pending" | "cleared";
export function coerceStatusForFutureDate(
    date: string,
    status: TransactionStatus,
    now?: Date
): TransactionStatus;
export function coerceStatusForFutureDate(
    date: string,
    status: TransactionStatus,
    now: Date = new Date()
): TransactionStatus {
    const txDate = safeParseDate(date);
    if (!txDate) return status;

    const today = startOfDay(now);
    const txDay = startOfDay(txDate);

    if (isAfter(txDay, today) && (status === "cleared" || status === "reconciled")) {
        return "pending";
    }
    return status;
}
