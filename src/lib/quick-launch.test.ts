import { describe, expect, it } from "vitest";
import { parseQuickCommand } from "./quick-launch";

describe("parseQuickCommand", () => {
  it("classifies sale keywords as income", () => {
    const draft = parseQuickCommand("nova venda 120");
    expect(draft).toEqual({
      amount: 120,
      description: "venda",
      type: "income",
    });
  });

  it("keeps expense as default when no income keyword is present", () => {
    const draft = parseQuickCommand("add 120 mercado");
    expect(draft).toEqual({
      amount: 120,
      description: "mercado",
      type: "expense",
    });
  });
});
