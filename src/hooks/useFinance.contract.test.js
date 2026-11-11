import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import * as hooks from "./useFinance";
const state = vi.hoisted(() => ({
  client: null,
  rows: [],
  error: null,
  calls: [],
  failAt: 0,
  n: 0,
}));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original()),
  useQuery: (options) => options,
  useMutation: (options) => options,
  useQueryClient: () => state.client,
}));
vi.mock("../lib/supabase", () => ({
  supabase: {
    from: (table) => {
      const q = {};
      for (const method of [
        "select",
        "eq",
        "neq",
        "gte",
        "lte",
        "order",
        "insert",
        "update",
        "delete",
        "maybeSingle",
      ])
        q[method] = (...args) => {
          state.calls.push([table, method, ...args]);
          return q;
        };
      q.then = (resolve, reject) => {
        state.n++;
        return Promise.resolve({
          data: state.rows,
          error:
            state.error ||
            (state.failAt === state.n
              ? { message: "Synthetic failure" }
              : null),
        }).then(resolve, reject);
      };
      return q;
    },
  },
}));
beforeEach(() => {
  state.client = new QueryClient();
  state.rows = [];
  state.error = null;
  state.calls = [];
  state.n = 0;
  state.failAt = 0;
});
afterEach(() => state.client.clear());
const tx = {
  id: "tx",
  user_id: "owner",
  type: "expense",
  payment_date: "2024-02-29",
  amount: 20,
  status: "PENDENTE",
};
describe("legacy finance query contracts", () => {
  it("does not query an absent identity", async () => {
    const query = hooks.useFinances({});
    expect(query.enabled).toBe(false);
    expect(await query.queryFn()).toEqual([]);
    expect(state.calls).toEqual([]);
  });
  for (const [filters, start, end] of [
    [{ month: 1, year: 2024 }, "2024-02-01", "2024-02-29"],
    [{ month: 1, year: 2025 }, "2025-02-01", "2025-02-28"],
    [{ month: 0, year: 2025 }, "2025-01-01", "2025-01-31"],
    [{ isGeneral: true, year: 2026 }, "2026-01-01", "2026-12-31"],
  ])
    it(`bounds dates for ${JSON.stringify(filters)}`, async () => {
      state.rows = [tx];
      expect(
        await hooks
          .useFinances({ userId: "owner", type: "expense", ...filters })
          .queryFn(),
      ).toEqual([tx]);
      expect(state.calls).toContainEqual([
        "finances",
        "eq",
        "user_id",
        "owner",
      ]);
      expect(state.calls).toContainEqual([
        "finances",
        "gte",
        "payment_date",
        start,
      ]);
      expect(state.calls).toContainEqual([
        "finances",
        "lte",
        "payment_date",
        end,
      ]);
    });
  it("allows a no-month query and propagates server failure", async () => {
    state.rows = null;
    expect(
      await hooks.useFinances({ userId: "owner", month: null }).queryFn(),
    ).toEqual([]);
    expect(state.calls.some((x) => x[1] === "gte")).toBe(false);
    state.error = new Error("denied");
    await expect(
      hooks.useFinances({ userId: "owner" }).queryFn(),
    ).rejects.toThrow("denied");
  });
  for (const name of [
    "useFinanceCategories",
    "useFinanceResponsibles",
    "useNotificationSettings",
  ])
    it(`${name} handles data, empty results and failure`, async () => {
      const query = hooks[name]();
      state.rows =
        name === "useNotificationSettings"
          ? { recipient_email: "synthetic@example.test" }
          : [{ id: "a" }];
      expect(await query.queryFn()).toEqual(state.rows);
      state.rows = null;
      expect(await query.queryFn()).toEqual(
        name === "useNotificationSettings" ? null : [],
      );
      state.error = new Error("denied");
      await expect(query.queryFn()).rejects.toThrow("denied");
    });
});
describe("optimistic finance transaction cache", () => {
  const cases = [
    [{ userId: "owner", type: "expense", year: 2024, month: 1 }, true],
    [{ userId: "other" }, false],
    [{ type: "income" }, false],
    [{ year: 2025 }, false],
    [{ year: 2024, month: 0 }, false],
    [{ isGeneral: true, year: 2024 }, true],
    [{ isGeneral: true, year: 2025 }, false],
    [{}, true],
    [{ month: null }, true],
  ];
  for (const [filters, matches] of cases)
    it(`create applies only to matching cache ${JSON.stringify(filters)}`, async () => {
      const key = ["finances", filters];
      state.client.setQueryData(key, [{ ...tx, id: "keep" }]);
      state.client.setQueryData(["finances", "not-an-array"], {});
      const mutation = hooks.useCreateTransaction();
      const context = await mutation.onMutate(tx);
      expect(state.client.getQueryData(key)).toHaveLength(matches ? 2 : 1);
      const saved = { ...tx, id: "saved" };
      mutation.onSuccess(saved, tx, context);
      expect(
        state.client
          .getQueryData(key)
          .some((x) => x.id === context.optimisticId),
      ).toBe(false);
      mutation.onError(new Error("failed"), tx, context);
      expect(state.client.getQueryData(key)).toEqual([{ ...tx, id: "keep" }]);
      mutation.onError(new Error("failed"), tx, undefined);
      mutation.onSettled();
    });
  it("handles a transaction without a date and a cache without filters", async () => {
    state.client.setQueryData(["finances"], []);
    const m = hooks.useCreateTransaction();
    const ctx = await m.onMutate({ user_id: "owner" });
    expect(state.client.getQueryData(["finances"])).toHaveLength(1);
    m.onSuccess({ ...tx, id: "server" }, tx, ctx);
  });
  for (const exists of [true, false])
    for (const matches of [true, false])
      it(`update cache transition exists=${exists}, matches=${matches}`, async () => {
        const key = [
          "finances",
          { userId: "owner", type: "expense", year: 2024, month: 1 },
        ];
        const initial = exists
          ? [tx, { ...tx, id: "keep" }]
          : [{ ...tx, id: "keep" }];
        state.client.setQueryData(key, initial);
        state.client.setQueryData(["finances", "bad"], {});
        const value = {
          ...tx,
          type: matches ? "expense" : "income",
          amount: 99,
        };
        const m = hooks.useUpdateTransaction();
        const ctx = await m.onMutate(value);
        expect(state.client.getQueryData(key).some((x) => x.id === "tx")).toBe(
          matches,
        );
        m.onSuccess(value);
        expect(
          state.client.getQueryData(key).filter((x) => x.id === "tx"),
        ).toHaveLength(matches ? 1 : 0);
        m.onError(new Error("rollback"), value, ctx);
        expect(state.client.getQueryData(key)).toEqual(initial);
        m.onError(null, value, null);
        m.onSettled();
      });
  it.each(["useDeleteTransaction", "useMarkAsPaid"])(
    "%s rolls back failed optimistic writes",
    async (name) => {
      const key = ["finances", {}];
      state.client.setQueryData(key, [tx, { ...tx, id: "other" }]);
      state.client.setQueryData(["finances", "bad"], {});
      const m = hooks[name]();
      const ctx = await m.onMutate("tx");
      const next = state.client.getQueryData(key);
      if (name === "useDeleteTransaction")
        expect(next.map((x) => x.id)).toEqual(["other"]);
      else expect(next[0].status).toBe("PAGO");
      m.onError(new Error("rollback"), "tx", ctx);
      expect(state.client.getQueryData(key)).toEqual([
        tx,
        { ...tx, id: "other" },
      ]);
      m.onError(null, "tx", undefined);
      m.onSettled();
    },
  );
});
const mutations = [
  ["useCreateTransaction", tx],
  ["useUpdateTransaction", tx],
  ["useDeleteTransaction", "tx"],
  ["useMarkAsPaid", "tx"],
  ["useCreateCategory", { name: "Category" }],
  ["useDeleteCategory", "category"],
  ["useCreateResponsible", { name: "Person" }],
  ["useDeleteResponsible", "person"],
  ["useSetMainResponsible", "person"],
];
describe("finance writes and failure propagation", () => {
  for (const [name, payload] of mutations)
    for (const fail of [false, true])
      it(`${name} ${fail ? "rejects errors" : "returns server result"}`, async () => {
        state.rows = [tx];
        state.error = fail ? new Error("denied") : null;
        const m = hooks[name]();
        if (fail) await expect(m.mutationFn(payload)).rejects.toThrow("denied");
        else {
          expect(await m.mutationFn(payload)).toBeDefined();
          m.onSuccess?.(tx, payload, { optimisticId: "optimistic" });
          m.onSettled?.();
        }
      });
  it("does not mark another responsible main when resetting the first group fails", async () => {
    state.failAt = 1;
    await expect(
      hooks.useSetMainResponsible().mutationFn("person"),
    ).rejects.toMatchObject({ message: "Synthetic failure" });
    expect(state.calls.filter((x) => x[1] === "update")).toHaveLength(1);
  });
  it("reports failure when marking the target responsible fails", async () => {
    state.failAt = 2;
    await expect(
      hooks.useSetMainResponsible().mutationFn("person"),
    ).rejects.toMatchObject({ message: "Synthetic failure" });
  });
  it("clamps copied payment dates to February and clears old identity metadata", async () => {
    state.rows = [
      {
        ...tx,
        payment_date: "2024-01-31",
        created_at: "old",
        email_sent: true,
      },
    ];
    const m = hooks.useCopyMonthTransactions();
    expect(
      await m.mutationFn({
        prevMonth: 0,
        prevYear: 2024,
        selectedMonth: 1,
        selectedYear: 2024,
      }),
    ).toBe(1);
    const rows = state.calls.find((x) => x[1] === "insert")[2];
    expect(rows[0]).toMatchObject({
      payment_date: "2024-02-29",
      status: "PENDENTE",
    });
    expect(rows[0]).not.toHaveProperty("id");
    expect(rows[0]).not.toHaveProperty("email_sent");
    m.onSuccess();
  });
  it.each([null, []])("rejects copying an empty source month", async (rows) => {
    state.rows = rows;
    await expect(
      hooks.useCopyMonthTransactions().mutationFn({
        prevMonth: 11,
        prevYear: 2025,
        selectedMonth: 0,
        selectedYear: 2026,
      }),
    ).rejects.toThrow();
  });
  it.each([1, 2])(
    "propagates a month-copy failure at request %s",
    async (failAt) => {
      state.rows = [tx];
      state.failAt = failAt;
      await expect(
        hooks.useCopyMonthTransactions().mutationFn({
          prevMonth: 1,
          prevYear: 2024,
          selectedMonth: 2,
          selectedYear: 2024,
        }),
      ).rejects.toMatchObject({ message: "Synthetic failure" });
    },
  );
});
