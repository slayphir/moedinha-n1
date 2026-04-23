export type CsvImportFormat = "generic" | "nubank";
export type CsvTransactionType = "income" | "expense" | "transfer";

export function normalizeCsvText(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

export function detectCsvImportFormat(args: {
    fileName?: string;
    fields?: string[];
}): CsvImportFormat {
    const normalizedFields = new Set((args.fields ?? []).map(normalizeCsvText).filter(Boolean));
    const hasNubankSignature = ["date", "title", "amount"].every((field) => normalizedFields.has(field));
    const hasExplicitType = normalizedFields.has("type") || normalizedFields.has("tipo");

    if (hasNubankSignature && !hasExplicitType) return "nubank";

    const normalizedFileName = normalizeCsvText(args.fileName ?? "");
    if (normalizedFileName.includes("nubank") && hasNubankSignature) return "nubank";

    return "generic";
}

export function inferCsvTransactionType(
    rawType: string,
    amount: number,
    format: CsvImportFormat
): CsvTransactionType {
    const normalized = normalizeCsvText(rawType);

    if (["income", "receita", "entrada"].includes(normalized)) return "income";
    if (["expense", "despesa", "saida"].includes(normalized)) return "expense";
    if (["transfer", "transferencia"].includes(normalized)) return "transfer";

    if (format === "nubank") {
        return amount < 0 ? "income" : "expense";
    }

    return amount < 0 ? "expense" : "income";
}
