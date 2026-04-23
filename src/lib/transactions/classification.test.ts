import { describe, it, expect } from "vitest";
import {
  signedAmount,
  isReceita,
  isDespesa,
  sumReceitas,
  sumDespesas,
} from "./classification";

const creditorIds = new Set<string>(["cat-creditor"]);

describe("classification", () => {
  describe("signedAmount", () => {
    it("income without contact returns positive", () => {
      expect(signedAmount({ type: "income", amount: 100 }, creditorIds)).toBe(100);
      expect(signedAmount({ type: "income", amount: -50 }, creditorIds)).toBe(50);
    });
    it("expense without contact returns negative", () => {
      expect(signedAmount({ type: "expense", amount: 100 }, creditorIds)).toBe(-100);
    });
    it("contact + creditor category returns positive", () => {
      expect(
        signedAmount(
          { type: "expense", amount: 100, contact_id: "c1", category_id: "cat-creditor" },
          creditorIds
        )
      ).toBe(100);
    });
    it("contact + non-creditor category returns negative", () => {
      expect(
        signedAmount(
          { type: "expense", amount: 100, contact_id: "c1", category_id: "other" },
          creditorIds
        )
      ).toBe(-100);
    });
  });

  describe("isReceita", () => {
    it("type income is receita", () => {
      expect(isReceita({ type: "income", amount: 10 }, creditorIds)).toBe(true);
    });
    it("contact + creditor category without income type is not receita", () => {
      expect(
        isReceita(
          { type: "expense", amount: 10, contact_id: "c1", category_id: "cat-creditor", category_type: "expense" },
          creditorIds
        )
      ).toBe(false);
    });
    it("contact + other category is not receita", () => {
      expect(
        isReceita(
          { type: "expense", amount: 10, contact_id: "c1", category_id: "other", category_type: "expense" },
          creditorIds
        )
      ).toBe(false);
    });
    it("contact + contact_payment_direction paid_to_me does not virar receita por si só", () => {
      expect(
        isReceita(
          { type: "expense", amount: 10, contact_id: "c1", category_id: "other", category_type: "expense", contact_payment_direction: "paid_to_me" },
          creditorIds
        )
      ).toBe(false);
    });
    it("income com categoria de despesa e excluida da receita", () => {
      expect(
        isReceita(
          { type: "income", amount: 10, contact_id: "c1", category_id: "other", category_type: "expense", contact_payment_direction: "paid_to_me" },
          creditorIds
        )
      ).toBe(false);
    });
  });

  describe("sumReceitas", () => {
    it("sums only receita transactions", () => {
      const tx = [
        { type: "income" as const, amount: 100, contact_id: null, category_id: null, category_type: null },
        { type: "expense" as const, amount: 50, contact_id: "c1", category_id: "cat-creditor", category_type: "expense" },
        { type: "income" as const, amount: 30, contact_id: "c1", category_id: "other", category_type: "expense" },
      ];
      expect(sumReceitas(tx, creditorIds)).toBe(100);
    });
  });

  describe("isDespesa", () => {
    it("expense without contact is despesa", () => {
      expect(isDespesa({ type: "expense", amount: 10 }, creditorIds)).toBe(true);
    });
    it("contact + non-creditor without settlement hint is despesa", () => {
      expect(
        isDespesa(
          { type: "expense", amount: 10, contact_id: "c1", category_id: "other", category_type: "expense" },
          creditorIds
        )
      ).toBe(true);
    });
    it("contact + creditor category vira fluxo de terceiros, nao despesa operacional", () => {
      expect(
        isDespesa(
          { type: "expense", amount: 10, contact_id: "c1", category_id: "cat-creditor", category_type: "expense" },
          creditorIds
        )
      ).toBe(false);
    });
    it("expense com categoria de receita e excluida da despesa", () => {
      expect(
        isDespesa(
          { type: "expense", amount: 10, contact_id: "c1", category_id: "cat-creditor", category_type: "income", contact_payment_direction: "paid_by_me" },
          creditorIds
        )
      ).toBe(false);
    });
  });

  describe("sumDespesas", () => {
    it("sums only despesa transactions", () => {
      const tx = [
        { type: "expense" as const, amount: 50, contact_id: null, category_id: null, category_type: null },
        { type: "expense" as const, amount: 30, contact_id: "c1", category_id: "other", category_type: "expense" },
        { type: "expense" as const, amount: 20, contact_id: "c1", category_id: "cat-creditor", category_type: "expense", contact_payment_direction: "paid_by_me" },
        { type: "income" as const, amount: 100, contact_id: null, category_id: null, category_type: null },
      ];
      expect(sumDespesas(tx, creditorIds)).toBe(80);
    });
  });
});
