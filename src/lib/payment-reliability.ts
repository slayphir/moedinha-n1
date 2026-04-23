/** Valores armazenados em contacts.payment_reliability */
export const PAYMENT_RELIABILITY_VALUES = [
  { value: "on_time", label: "Paga em dia" },
  { value: "sometimes_late", label: "Atrasa às vezes" },
  { value: "often_late", label: "Atrasa com frequência" },
  { value: "stopped_paying", label: "Deixou de pagar" },
  { value: "unknown", label: "Não definido" },
] as const;

export type PaymentReliabilityKey = (typeof PAYMENT_RELIABILITY_VALUES)[number]["value"];

export function getPaymentReliabilityLabel(value: string | null | undefined): string {
  if (!value) return "Não definido";
  const found = PAYMENT_RELIABILITY_VALUES.find((o) => o.value === value);
  return found?.label ?? value;
}

/** Cor/classe para badge na página Terceiros */
export function getPaymentReliabilityBadgeClass(value: string | null | undefined): string {
  switch (value) {
    case "on_time":
      return "bg-vault-700/15 text-vault-800 border-vault-700/30";
    case "sometimes_late":
      return "bg-bronze/15 text-bronze border-bronze/30";
    case "often_late":
      return "bg-orange-500/15 text-orange-700 border-orange-500/30";
    case "stopped_paying":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "bg-ink/10 text-ink/70 border-stroke";
  }
}
