import { describe, it, expect } from "vitest";
import {
  goalAccountIds,
  goalBalanceKnown,
  goalLinkedBalance,
} from "./goalAccounts";
describe("full linked account balances", () => {
  it("preserves legacy accounts and canonical empty arrays", () => {
    expect(goalAccountIds({ account_id: "a" })).toEqual(["a"]);
    expect(goalAccountIds({ account_id: "a", account_ids: [] })).toEqual([]);
    expect(goalAccountIds(null)).toEqual([]);
  });
  it("deduplicates accounts and sums 5000 + 3000 without partial allocation", () => {
    const goal = { account_ids: ["a", "b", "a"], initial_amount: 10000 };
    expect(goalLinkedBalance(goal, { a: 5000, b: 3000 })).toBe(8000);
    expect(goalAccountIds(goal)).toEqual(["a", "b"]);
  });
  it("does not show partial amounts when any linked balance is unavailable", () => {
    const goal = { account_ids: ["a", "b"] };
    expect(goalBalanceKnown(goal, { a: 5000 })).toBe(false);
    expect(goalBalanceKnown(goal, { a: 5000, b: null })).toBe(false);
    expect(goalBalanceKnown(goal, { a: 5000, b: NaN })).toBe(false);
    expect(goalBalanceKnown(goal, { a: 5000, b: 0 })).toBe(true);
    expect(goalBalanceKnown({}, {})).toBe(true);
  });
  it("adds in integer cents and preserves negative account balances", () => {
    expect(
      goalLinkedBalance({ account_ids: ["a", "b"] }, { a: 0.1, b: 0.2 }),
    ).toBe(0.3);
    expect(
      goalLinkedBalance({ account_ids: ["a", "b"] }, { a: 100, b: -30 }),
    ).toBe(70);
  });
  it("refuses sums outside the exact cent range", () => {
    expect(goalBalanceKnown({ account_ids: ["a"] }, { a: Infinity })).toBe(
      false,
    );
    expect(
      goalBalanceKnown(
        { account_ids: ["a", "b"] },
        { a: 90071992547409, b: 90071992547409 },
      ),
    ).toBe(false);
  });
});
