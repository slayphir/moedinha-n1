import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, format } from "date-fns";
import {
    applyCreditCardFutureDuePending,
    coerceStatusForFutureDate,
    finalizeTransactionStatusForImportRow,
} from "./status";

describe("coerceStatusForFutureDate", () => {
    const now = new Date("2026-06-15T12:00:00");

    it("date amanhã + status cleared => pending", () => {
        const tomorrow = format(addDays(now, 1), "yyyy-MM-dd");
        expect(coerceStatusForFutureDate(tomorrow, "cleared", now)).toBe("pending");
    });

    it("date hoje + status cleared => cleared", () => {
        const today = format(now, "yyyy-MM-dd");
        expect(coerceStatusForFutureDate(today, "cleared", now)).toBe("cleared");
    });

    it("date passado + status cleared => cleared", () => {
        const past = format(addDays(now, -1), "yyyy-MM-dd");
        expect(coerceStatusForFutureDate(past, "cleared", now)).toBe("cleared");
    });

    it("date amanhã + status pending => pending", () => {
        const tomorrow = format(addDays(now, 1), "yyyy-MM-dd");
        expect(coerceStatusForFutureDate(tomorrow, "pending", now)).toBe("pending");
    });
});

describe("applyCreditCardFutureDuePending", () => {
    const card = { type: "credit_card" as const, is_credit_card: true };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-15T12:00:00"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("expense card + due next month + cleared => pending", () => {
        expect(
            applyCreditCardFutureDuePending("cleared", "expense", "2026-07-10", card)
        ).toBe("pending");
    });

    it("expense card + due yesterday + cleared => cleared", () => {
        expect(
            applyCreditCardFutureDuePending("cleared", "expense", "2026-06-14", card)
        ).toBe("cleared");
    });

    it("income ignores due date", () => {
        expect(
            applyCreditCardFutureDuePending("cleared", "income", "2026-12-01", card)
        ).toBe("cleared");
    });
});

describe("finalizeTransactionStatusForImportRow (CSV)", () => {
    const card = { type: "credit_card" as const };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-15T12:00:00"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("import cleared + card + due future => pending", () => {
        expect(
            finalizeTransactionStatusForImportRow(
                "2026-06-10",
                "cleared",
                "expense",
                "2026-07-01",
                card
            )
        ).toBe("pending");
    });

    it("import still applies future transaction date rule after card rule", () => {
        expect(
            finalizeTransactionStatusForImportRow(
                "2026-08-01",
                "cleared",
                "expense",
                "2026-07-01",
                card
            )
        ).toBe("pending");
    });
});
