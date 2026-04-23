import { describe, it, expect } from "vitest";
import { addDays, format } from "date-fns";
import { coerceStatusForFutureDate } from "./status";

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
