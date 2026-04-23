import { describe, expect, it } from "vitest";
import { detectCsvImportFormat, inferCsvTransactionType, normalizeCsvText } from "./csv-import";

describe("csv-import", () => {
    it("normalizes headers with accents and spaces", () => {
        expect(normalizeCsvText("  Descrição  ")).toBe("descricao");
    });

    it("detects nubank layout from header signature", () => {
        expect(
            detectCsvImportFormat({
                fileName: "Nubank_2026-03-10.csv",
                fields: ["date", "title", "amount"],
            })
        ).toBe("nubank");
    });

    it("keeps generic format when explicit type column exists", () => {
        expect(
            detectCsvImportFormat({
                fileName: "qualquer.csv",
                fields: ["date", "title", "amount", "type"],
            })
        ).toBe("generic");
    });

    it("infers nubank positive amounts as expense", () => {
        expect(inferCsvTransactionType("", 59, "nubank")).toBe("expense");
    });

    it("infers nubank negative amounts as income", () => {
        expect(inferCsvTransactionType("", -2247.07, "nubank")).toBe("income");
    });

    it("keeps explicit types over inferred sign", () => {
        expect(inferCsvTransactionType("transferencia", 100, "nubank")).toBe("transfer");
        expect(inferCsvTransactionType("receita", 100, "generic")).toBe("income");
        expect(inferCsvTransactionType("despesa", -100, "nubank")).toBe("expense");
    });

    it("preserves generic sign inference", () => {
        expect(inferCsvTransactionType("", -10, "generic")).toBe("expense");
        expect(inferCsvTransactionType("", 10, "generic")).toBe("income");
    });
});
