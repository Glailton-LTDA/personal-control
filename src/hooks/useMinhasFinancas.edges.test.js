import { it, expect, vi } from "vitest";
import * as finance from "./useMinhasFinancas";
vi.mock("../lib/supabase", () => ({ supabase: { from: vi.fn() } }));
vi.mock("../lib/offline/mfOffline", () => ({
  mfSelect: vi.fn(),
  mfSelectAll: vi.fn(),
  mfMutate: vi.fn(),
}));
for (const [value, expected] of [
  [null, 0],
  ["", 0],
  [NaN, 0],
  [Infinity, 0],
  [-Infinity, 0],
  ["nonsense", 0],
  ["R$ 1.234,56", 1234.56],
  ["1234.56", 1234.56],
  [12.5, 12.5],
  ["  ", 0],
])
  it(`parses monetary input ${String(value)} without propagating nonfinite values`, () => {
    expect(finance.parseMoney(value)).toBe(expected);
  });
for (const value of [null, undefined, "bad", "2026", "2026-00-00"])
  it(`rejects incomplete month-end dates ${value}`, () => {
    expect(finance.isMonthEndISO(value)).toBe(false);
  });
it("preserves absent/invalid invoice anchors and validates purchase date inputs", () => {
  expect(finance.addInvoiceCloseMonths({}, null, 1)).toBe(null);
  expect(finance.addInvoiceCloseMonths({}, "bad", 1)).toBe("bad");
  expect(finance.invoiceCloseForPurchaseDate(null, "2026-01-01")).toBe(null);
  expect(finance.invoiceCloseForPurchaseDate({}, null)).toBe(null);
  expect(finance.invoiceCloseForPurchaseDate({}, "bad")).toBe(null);
  expect(finance.cardInvoiceDueISO(null, null)).toBe(null);
  expect(finance.cardInvoiceDueISO({}, "bad")).toBe("bad");
  expect(finance.cardExpenseMonth(null, null)).toBe("");
  expect(finance.cardExpenseMonth({ payment_date: "2026-01-02" }, {})).toBe(
    "2026-01",
  );
});
it("uses month-end semantics without a configured card closing day", () => {
  expect(finance.addInvoiceCloseMonths({}, "2026-02-28", 1)).toBe("2026-03-31");
  expect(finance.addInvoiceCloseMonths({}, "2026-02-15", 1)).toBe("2026-03-15");
  expect(finance.invoiceCloseForPurchaseDate({}, "2026-01-02")).toBe(
    "2025-12-31",
  );
  expect(finance.cardCloseForMonth(null, "2026-02")).toBe("2026-02-01");
});
it("advances weekly/yearly series across calendar boundaries", () => {
  expect(finance.shiftRecurrenceDate("2026-12-29", "WEEKLY", 1)).toBe(
    "2027-01-05",
  );
  expect(finance.shiftRecurrenceDate("2024-02-29", "YEARLY", 1)).toBe(
    "2025-02-28",
  );
  expect(finance.addMonthsISO("2026-01", 1)).toBe("2026-02-01");
});
for (const code of [null, 17, "invalid", "ZZZ"])
  it(`uses safe display fallbacks for currency ${code}`, () => {
    expect(finance.currencyFlag(code)).toBe("💰");
    expect(finance.currencyLabel(code, "invalid_locale")).toBe(code);
    expect(finance.currencyName(code, "invalid_locale")).toBe(code);
  });
it("resolves custom account icons and absent account types", () => {
  expect(finance.accountTypeInfo("Custom", [{ name: "Custom" }])).toEqual({
    builtin: false,
    label: "Custom",
    icon: "💳",
  });
  expect(
    finance.accountTypeInfo("Custom", [{ name: "Custom", icon: "⭐" }]).icon,
  ).toBe("⭐");
  expect(finance.accountTypeInfo(null)).toEqual({
    builtin: false,
    label: "",
    icon: "🏷️",
  });
});
it("orders partial installment records deterministically", () => {
  const rows = [
    { id: "b", payment_date: "2026-01-01" },
    { id: "a", payment_date: "2026-01-01" },
    {},
  ];
  expect(finance.orderSeries(rows)).toEqual([{}, rows[1], rows[0]]);
  expect(finance.orderSeries()).toEqual([]);
  expect(finance.mfInstallmentSuffix({ installments_total: 3 })).toBe(" ?/3");
});
const baseBudget = { period_start: "2026-01-01", period_end: "2026-01-31" };
const baseTx = {
  id: "tx",
  type: "DESPESA",
  status: "PAGO",
  account_id: "a",
  category_id: "child",
  payment_date: "2026-01-15",
  amount: 25,
};
for (const [patch, expected] of [
  [{}, 25],
  [{ type: "RECEITA" }, 0],
  [{ status: "CANCELADO" }, 0],
  [{ payment_date: "2025-12-31" }, 0],
  [{ payment_date: "2026-02-01" }, 0],
  [{ amount: -5 }, -5],
  [{ amount: null }, 0],
])
  it(`budget spending handles ${JSON.stringify(patch)}`, () => {
    expect(
      finance.budgetSpent({
        budget: baseBudget,
        transactions: [{ ...baseTx, ...patch }],
        accountsById: {},
        tagIdsByTx: {},
        currency: "BRL",
      }),
    ).toBe(expected);
  });
for (const [budget, expected] of [
  [{ account_id: "b" }, 0],
  [{ account_id: "a" }, 25],
  [{ tag_id: "food" }, 0],
  [{ tag_id: "travel" }, 25],
  [{ category_id: "parent" }, 25],
  [{ category_id: "child" }, 25],
  [{ category_id: "other" }, 0],
])
  it(`enforces budget scope ${JSON.stringify(budget)}`, () => {
    expect(
      finance.budgetSpent({
        budget: { ...baseBudget, ...budget },
        transactions: [baseTx],
        accountsById: {},
        tagIdsByTx: { tx: ["travel"] },
        categoriesById: { child: { parent_id: "parent" } },
        currency: "all",
      }),
    ).toBe(expected);
  });
it("excludes a missing subcategory and foreign currency from a scoped budget", () => {
  const params = {
    budget: { ...baseBudget, category_id: "parent" },
    transactions: [baseTx],
    accountsById: { a: { currency: "USD" } },
    tagIdsByTx: {},
  };
  expect(finance.budgetSpent({ ...params, currency: "BRL" })).toBe(0);
  expect(finance.budgetSpent({ ...params, currency: "USD" })).toBe(0);
});
for (const currency of [undefined, "all", "BRL", "USD"])
  it(`computes income-percentage budget with currency ${currency}`, () => {
    const transactions = [
      { ...baseTx, type: "RECEITA", amount: 100 },
      { ...baseTx, id: "usd", account_id: "b", type: "RECEITA", amount: 200 },
      {
        ...baseTx,
        id: "cancelled",
        type: "RECEITA",
        status: "CANCELADO",
        amount: 999,
      },
      {
        ...baseTx,
        id: "old",
        type: "RECEITA",
        payment_date: "2025-12-01",
        amount: 999,
      },
      baseTx,
    ];
    expect(
      finance.budgetLimit({
        budget: { ...baseBudget, mode: "PERCENT", percent_of_income: 10 },
        transactions,
        accountsById: { b: { currency: "USD" } },
        currency,
      }),
    ).toBe(currency === "BRL" ? 10 : currency === "USD" ? 20 : 30);
  });
it("clamps goal withdrawals to zero and uses linked account balances when configured", () => {
  expect(
    finance.goalCurrentAmount(
      { id: "goal", initial_amount: 10 },
      [
        { goal_id: "goal", kind: "WITHDRAW", amount: 20 },
        { goal_id: "other", amount: 100 },
      ],
      0,
    ),
  ).toBe(0);
  expect(
    finance.goalCurrentAmount(
      { id: "goal" },
      [
        { goal_id: "goal", kind: "DEPOSIT", amount: 5 },
        { goal_id: "goal", kind: "DEPOSIT", amount: null },
      ],
      0,
    ),
  ).toBe(5);
  expect(finance.goalCurrentAmount({ account_id: "a" }, [], undefined)).toBe(0);
  expect(finance.goalCurrentAmount({ account_id: "a" }, [], 25)).toBe(25);
});
