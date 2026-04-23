import { isAfter, parseISO, startOfDay } from "date-fns";

export type TransactionStatus = "pending" | "cleared" | "reconciled" | "cancelled";

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
