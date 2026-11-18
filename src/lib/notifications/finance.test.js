import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../supabase", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient(
      "https://notifications.test",
      "synthetic-public-key",
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: state.fetch },
      },
    ),
  };
});
import { loadFinanceNotifications, financeCandidateBounds } from "./finance";
const TODAY = "2026-11-18";
let accounts, transactions, aggregates, settings, invoices, fail;
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
beforeEach(() => {
  vi.clearAllMocks();
  accounts = [
    {
      id: "account",
      name: "Synthetic account",
      account_type: "CORRENTE",
      currency: "BRL",
    },
  ];
  transactions = [];
  aggregates = [];
  settings = [];
  invoices = [];
  fail = null;
  state.fetch.mockImplementation(async (raw) => {
    const url = new URL(raw);
    const table = url.pathname.split("/").at(-1);
    if (table === fail) return response({ message: "synthetic failure" }, 500);
    const rows =
      {
        mf_accounts: accounts,
        mf_transactions: transactions,
        mf_card_cycle_totals: aggregates,
        mf_card_settings: settings,
        mf_invoices: invoices,
      }[table] || [];
    const start = Number(url.searchParams.get("offset") || 0),
      limit = Number(url.searchParams.get("limit") || 200);
    return response(rows.slice(start, start + limit));
  });
});
const bill = (extra = {}) => ({
  id: "bill",
  account_id: "account",
  status: "PENDENTE",
  type: "DESPESA",
  description: "Synthetic bill",
  payment_date: TODAY,
  amount: 50,
  ...extra,
});
const card = () => {
  accounts.push({
    id: "card",
    name: "Synthetic card",
    account_type: "CARTAO",
    currency: "BRL",
    closing_day: 18,
    due_day: 25,
  });
  aggregates = [
    {
      card_id: "card",
      firstDate: "2026-11-01",
      pool: 0,
      months: {},
      closes: { [TODAY]: { total: 100, refunds: 0 } },
      payments: {},
    },
  ];
};
describe("global finance notification data", () => {
  it("requires a session owner before any request", async () => {
    await expect(loadFinanceNotifications(null, TODAY)).rejects.toThrow(
      "auth_required",
    );
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("retains existing exact reminder windows and per-account currencies", async () => {
    accounts.push({
      id: "usd",
      name: "International",
      account_type: "CORRENTE",
      currency: "USD",
    });
    transactions = [
      bill(),
      bill({ id: "soon", account_id: "usd", payment_date: "2026-11-21" }),
      bill({ id: "late", payment_date: "2026-11-15" }),
      bill({ id: "outside", payment_date: "2026-11-20" }),
      bill({ id: "paid", status: "PAGO" }),
      bill({ id: "transfer", type: "TRANSFERENCIA" }),
      bill({ id: "foreign", account_id: "not-visible" }),
    ];
    const data = await loadFinanceNotifications("owner", TODAY);
    expect(data.reminders.map((row) => row.kind)).toEqual([
      "overdue",
      "today",
      "upcoming",
    ]);
    expect(data.reminders.at(-1).currency).toBe("USD");
    expect(data.hasMore).toBe(false);
    for (const call of state.fetch.mock.calls) {
      const url = new URL(call[0]);
      expect(url.searchParams.get("user_id")).toBe("eq.owner");
      expect(url.searchParams.get("select")).not.toContain("*");
      expect(url.searchParams.get("limit")).toBe("200");
    }
    const query = new URL(
      state.fetch.mock.calls.find((call) =>
        String(call[0]).includes("mf_transactions"),
      )[0],
    );
    expect(query.searchParams.get("status")).toBe("eq.PENDENTE");
    expect(query.searchParams.get("or")).toContain(
      "due_date.in.(2026-11-15,2026-11-18,2026-11-21)",
    );
  });
  it("pages candidates within a hard cap and reports a lower-bound count rather than silently truncating", async () => {
    transactions = Array.from({ length: 2000 }, (_, i) =>
      bill({ id: `bill-${i}` }),
    );
    const data = await loadFinanceNotifications("owner", TODAY);
    expect(data.reminders).toHaveLength(50);
    expect(data.hasMore).toBe(true);
    expect(
      state.fetch.mock.calls.filter((call) =>
        String(call[0]).includes("mf_transactions"),
      ),
    ).toHaveLength(10);
  });
  it("includes chosen invoice closes, including a business-day due date", () => {
    const filter = financeCandidateBounds(
      [{ account_type: "CARTAO", due_day: 20, due_business_days: true }],
      "2026-11-23",
    );
    expect(filter).toContain("invoice_close.in.(");
    expect(filter).toContain("2026-11-01");
    expect(financeCandidateBounds([], TODAY)).not.toContain(
      "invoice_close.in.",
    );
  });
  it("uses authoritative cycle aggregates and the existing invoice engine for closing alerts", async () => {
    card();
    const data = await loadFinanceNotifications("owner", TODAY);
    expect(data.reminders).toHaveLength(1);
    expect(data.reminders[0]).toMatchObject({
      kind: "invoice_closed",
      cardId: "card",
      total: 100,
      closeISO: TODAY,
    });
    expect(
      state.fetch.mock.calls.some((call) =>
        String(call[0]).includes("/rpc/mf_card_cycle_totals"),
      ),
    ).toBe(true);
    for (const call of state.fetch.mock.calls.filter((call) =>
      /mf_(card_settings|invoices)/.test(String(call[0])),
    )) {
      const url = new URL(call[0]);
      expect(url.searchParams.get("user_id")).toBe("eq.owner");
      expect(url.searchParams.get("select")).not.toContain("*");
    }
  });
  it("does not announce an invoice already paid manually", async () => {
    card();
    invoices = [
      {
        id: "official",
        card_id: "card",
        close_date: TODAY,
        total: 100,
        total_source: "manual",
        paid_total: 100,
        status: "PAID",
      },
    ];
    const data = await loadFinanceNotifications("owner", TODAY);
    expect(data.reminders).toHaveLength(0);
  });
  it.each([
    "mf_accounts",
    "mf_transactions",
    "mf_card_settings",
    "mf_card_cycle_totals",
    "mf_invoices",
  ])(
    "surfaces a %s failure instead of showing an empty success",
    async (table) => {
      card();
      fail = table;
      await expect(
        loadFinanceNotifications("owner", TODAY),
      ).rejects.toBeTruthy();
    },
  );
  it("does not invent a zero invoice balance when aggregates are missing", async () => {
    card();
    aggregates = [];
    await expect(loadFinanceNotifications("owner", TODAY)).rejects.toThrow(
      "notification_aggregates_missing",
    );
  });
});
