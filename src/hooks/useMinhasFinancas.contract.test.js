import { beforeEach, afterEach, it, expect, vi } from "vitest";
import * as hooks from "./useMinhasFinancas";
import { createQueryServer } from "../tests/queryServer";
const state = vi.hoisted(() => ({
  server: null,
  profile: null,
  offline: false,
  rpc: vi.fn(),
  client: { invalidateQueries: vi.fn() },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options) => ({
    ...options,
    data:
      options.queryKey[0] === "mf-accounts"
        ? state.server.tables.mf_accounts || []
        : undefined,
  }),
  useInfiniteQuery: (options) => options,
  useMutation: (options) => options,
  useQueryClient: () => state.client,
}));
vi.mock("./mfProfileContext", () => ({
  useMFProfileScope: () => state.profile,
}));
vi.mock("../lib/supabase", () => ({
  supabase: { from: (table) => state.server.from(table), rpc: state.rpc },
}));
vi.mock("../lib/offline/mfOffline", () => {
  const read = async (_table, run, options = {}) => {
    const result = await run();
    if (result.data) {
      let rows = result.data;
      if (options.filter) rows = options.filter(rows);
      if (options.sort) rows = options.sort(rows);
      return { ...result, data: rows };
    }
    return result;
  };
  return {
    mfMutate: ({ run }) => run(),
    mfSelect: read,
    mfSelectAll: read,
    isOffline: () => state.offline,
    assertNoPendingMfWrites: vi.fn(),
  };
});
beforeEach(() => {
  state.server = createQueryServer();
  state.profile = null;
  state.offline = false;
  vi.clearAllMocks();
  state.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  state.client.invalidateQueries.mockResolvedValue();
  vi.useFakeTimers();
});
afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});
const groups = [
  ["MFCategory", "mf_categories"],
  ["MFTag", "mf_tags"],
  ["MFResponsible", "mf_responsibles"],
  ["MFBudget", "mf_budgets"],
  ["MFGoal", "mf_goals"],
  ["MFProfile", "mf_profiles"],
];
for (const [suffix, table] of groups)
  for (const operation of ["Create", "Update", "Delete"])
    for (const failure of [false, true])
      it(`${operation} ${suffix}: database failure=${failure}`, async () => {
        const id = "entity",
          payload = { name: "Synthetic", amount: 10 };
        state.server.tables[table] = [{ id, ...payload }];
        const verb =
          operation === "Create"
            ? "insert"
            : operation === "Update"
              ? "update"
              : "delete";
        if (failure) state.server.failures[`${table}:${verb}`] = "denied";
        const mutation = hooks[`use${operation}${suffix}`]();
        const variables =
          operation === "Create"
            ? payload
            : operation === "Update"
              ? { id, ...payload }
              : id;
        if (failure)
          await expect(mutation.mutationFn(variables)).rejects.toThrow(
            "denied",
          );
        else {
          const result = await mutation.mutationFn(variables);
          expect(result).toEqual(
            operation === "Delete" ? id : expect.objectContaining(payload),
          );
          mutation.onSuccess(result);
          await vi.runAllTimersAsync();
          expect(state.client.invalidateQueries).toHaveBeenCalled();
          const predicate =
            state.client.invalidateQueries.mock.calls[0][0].predicate;
          expect(predicate({ queryKey: ["mf-accounts"] })).toBe(true);
          expect(predicate({ queryKey: ["health"] })).toBe(false);
        }
        expect(state.server.calls).toContainEqual([
          table,
          verb,
          ...(operation === "Delete"
            ? []
            : [operation === "Create" ? payload : payload]),
        ]);
        if (operation !== "Create")
          expect(state.server.calls).toContainEqual([table, "eq", "id", id]);
      });
for (const [suffix] of groups)
  it(`${suffix} create falls back to the original payload if the API returns no row`, async () => {
    state.server.emptyWrites = true;
    const payload = { name: "Synthetic" };
    expect(await hooks[`useCreate${suffix}`]().mutationFn(payload)).toEqual(
      payload,
    );
  });
for (const [name, table] of [
  ["useCreateAccount", "mf_accounts"],
  ["useCreateTransfer", "mf_transactions"],
  ["useCreateMFGroup", "mf_account_groups"],
  ["useUpdateAccount", "mf_accounts"],
  ["useUpdateMFGroup", "mf_account_groups"],
])
  for (const failure of [false, true])
    it(`${name} runs online adapter with error propagation=${failure}`, async () => {
      const update = name.includes("Update");
      state.server.tables[table] = [{ id: "entity" }];
      if (failure)
        state.server.failures[`${table}:${update ? "update" : "insert"}`] =
          "denied";
      const variables = update
        ? { id: "entity", name: "Synthetic" }
        : { name: "Synthetic" };
      const mutation = hooks[name]();
      if (failure)
        await expect(mutation.mutationFn(variables)).rejects.toThrow("denied");
      else
        expect(await mutation.mutationFn(variables)).toMatchObject({
          name: "Synthetic",
        });
    });
const queries = [
  ["useMFAccountTypes", "mf_account_types"],
  ["useMFCategories", "mf_categories"],
  ["useMFTags", "mf_tags"],
  ["useMFResponsibles", "mf_responsibles"],
  ["useMFGroups", "mf_account_groups"],
  ["useMFProfiles", "mf_profiles"],
  ["useMFGoals", "mf_goals"],
  ["useMFBudgets", "mf_budgets"],
  ["useMFGoalContributions", "mf_goal_contributions"],
  ["useMFSavedReports", "mf_saved_reports"],
];
for (const [name, table] of queries)
  it(`${name} supports missing identity, data, empty rows and server errors`, async () => {
    expect(hooks[name](null).enabled).toBe(false);
    state.server.tables[table] = [
      {
        id: "second",
        name: "Zulu",
        sort_order: 2,
        created_at: "2026-01-01",
        period_start: "2026-01-01",
      },
      {
        id: "first",
        name: "Alpha",
        sort_order: 1,
        created_at: "2026-02-01",
        period_start: "2026-02-01",
      },
    ];
    const query = hooks[name]({ id: "owner" });
    expect(query.enabled).toBe(true);
    expect(await query.queryFn()).toHaveLength(2);
    state.server.tables[table] = [];
    expect(await query.queryFn()).toEqual([]);
    state.server.failures[`${table}:select`] = "denied";
    await expect(query.queryFn()).rejects.toThrow("denied");
  });
it("clears other main responsibles before setting the requested main responsible", async () => {
  state.server.tables.mf_responsibles = [
    { id: "old", is_main: true },
    { id: "new", is_main: false },
  ];
  const mutation = hooks.useUpdateMFResponsible();
  expect(await mutation.mutationFn({ id: "new", is_main: true })).toMatchObject(
    { id: "new", is_main: true },
  );
  expect(
    state.server.tables.mf_responsibles.find((x) => x.id === "old").is_main,
  ).toBe(false);
  state.server.failures["mf_responsibles:update"] = "denied";
  await expect(
    mutation.mutationFn({ id: "new", is_main: true }),
  ).rejects.toThrow("denied");
});
const accountRows = [
  {
    id: "a",
    profile_id: "personal",
    name: "Bank",
    type: "CONTA",
    currency: "BRL",
    initial_balance: 100,
  },
  {
    id: "b",
    profile_id: "business",
    name: "Company",
    type: "CONTA",
    currency: "USD",
    initial_balance: 200,
  },
];
const transactionRows = [
  {
    id: "income",
    account_id: "a",
    payment_date: "2026-01-01",
    type: "RECEITA",
    status: "PAGO",
    amount: 50,
  },
  {
    id: "expense",
    account_id: "a",
    payment_date: "2026-01-02",
    type: "DESPESA",
    status: "PAGO",
    amount: 20,
  },
  {
    id: "transfer",
    account_id: "a",
    transfer_account_id: "b",
    payment_date: "2026-01-03",
    type: "TRANSFERENCIA",
    status: "PAGO",
    amount: 10,
  },
  {
    id: "pending",
    account_id: "b",
    payment_date: "2026-01-04",
    type: "DESPESA",
    status: "PENDENTE",
    amount: 500,
  },
  {
    id: "future",
    account_id: "a",
    payment_date: "2099-01-01",
    type: "DESPESA",
    status: "PAGO",
    amount: 999,
  },
];
for (const profile of [null, "personal", "empty"])
  for (const name of ["useMFBudgets", "useMFGoals"])
    it(`${name} profile scope ${profile} includes only matching or unbound records`, async () => {
      state.profile = profile;
      state.server.tables.mf_accounts = accountRows;
      const table = name === "useMFGoals" ? "mf_goals" : "mf_budgets";
      state.server.tables[table] = [
        { id: "global", account_id: null },
        { id: "mine", account_id: "a" },
        { id: "other", account_id: "b" },
      ];
      expect(
        (await hooks[name]({ id: "owner" }).queryFn()).map((x) => x.id).sort(),
      ).toEqual(
        profile === null
          ? ["global", "mine", "other"]
          : profile === "empty"
            ? ["global"]
            : ["global", "mine"],
      );
    });
for (const scope of [null, [], ["a"], ["a", "b", "a"]])
  it(`computes account balances once per transfer for scope ${JSON.stringify(scope)}`, async () => {
    state.server.tables.mf_accounts = accountRows;
    state.server.tables.mf_transactions = transactionRows;
    const result = await hooks
      .useMFAccountBalances({ id: "owner" }, scope)
      .queryFn();
    expect(result).toEqual(
      scope?.length === 0
        ? {}
        : scope?.length === 1
          ? { a: 120 }
          : { a: 120, b: 210 },
    );
  });
for (const profile of [null, "personal", "empty"])
  for (const range of [
    null,
    { from: "2026-01-02" },
    { to: "2026-01-02" },
    { from: "2026-01-01", to: "2026-01-03" },
  ])
    it(`limits transactions by profile=${profile}, range=${JSON.stringify(range)}`, async () => {
      state.profile = profile;
      state.server.tables.mf_accounts = accountRows;
      state.server.tables.mf_transactions = transactionRows;
      const result = await hooks
        .useMFAllTransactions({ id: "owner" }, null, range)
        .queryFn();
      expect(
        result.every(
          (x) =>
            (!profile || (profile === "personal" && x.account_id === "a")) &&
            (!range?.from || x.payment_date >= range.from) &&
            (!range?.to || x.payment_date <= range.to),
        ),
      ).toBe(true);
      if (profile === "empty") expect(result).toEqual([]);
    });
for (const offline of [false, true])
  for (const accountId of [null, "a"])
    it(`statement uses server aggregate or local fallback: offline=${offline}, account=${accountId}`, async () => {
      state.offline = offline;
      state.server.tables.mf_accounts = accountRows;
      state.server.tables.mf_transactions = transactionRows;
      state.rpc.mockResolvedValueOnce({
        data: { groups: [{ date: "2026-01-01", balance: 150 }], opening: 100 },
        error: null,
      });
      const result = await hooks
        .useMFStatement({ id: "owner" }, "2026-01", accountId)
        .queryFn();
      expect(result.scopedAccounts).toHaveLength(accountId ? 1 : 2);
      if (!offline) {
        expect(result.groups).toEqual([{ date: "2026-01-01", balance: 150 }]);
        expect(result.opening).toBe(100);
      } else expect(result.groups.length).toBeGreaterThan(0);
    });
it("falls back to local statement on RPC error and propagates local data failure", async () => {
  state.server.tables.mf_accounts = accountRows;
  state.server.tables.mf_transactions = transactionRows;
  state.rpc.mockResolvedValue({ error: new Error("unavailable") });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = await hooks
    .useMFStatement({ id: "owner" }, "2026-01", "a", "BRL")
    .queryFn();
  expect(result.scopedAccounts.map((x) => x.id)).toEqual(["a"]);
  state.server.failures["mf_transactions:select"] = "denied";
  await expect(
    hooks.useMFStatement({ id: "owner" }, "2026-01").queryFn(),
  ).rejects.toThrow("denied");
  vi.restoreAllMocks();
});
it("collects valid tag links, ignores incomplete links and counts tag usage", async () => {
  state.server.tables.mf_transaction_tags = [
    { transaction_id: "a", tag_id: "food" },
    { transaction_id: "a", tag_id: "travel" },
    { transaction_id: "b", tag_id: "food" },
    { transaction_id: "a", tag_id: null },
    { transaction_id: null, tag_id: "food" },
  ];
  expect(
    await hooks.useMFRecentTagLinks({ id: "owner" }, ["a", "b"]).queryFn(),
  ).toEqual({ a: ["food", "travel"], b: ["food"] });
  expect(await hooks.useMFTagUsage({ id: "owner" }).queryFn()).toEqual({
    counts: { food: 3, travel: 1 },
  });
  expect(hooks.useMFRecentTagLinks(null).enabled).toBe(false);
});
for (const data of [
  null,
  { rows: [{ id: "a" }], total: "5", amounts: { BRL: 10 }, years: [2026] },
])
  it(`normalizes paginated tag RPC data: ${JSON.stringify(data)}`, async () => {
    state.rpc.mockResolvedValue({ data, error: null });
    const result = await hooks
      .useMFTagTransactions({ id: "owner" }, "tag", {
        page: 2,
        pageSize: 10,
        search: " term ",
        from: "2026-01-01",
        to: "2026-01-31",
      })
      .queryFn();
    expect(state.rpc).toHaveBeenCalledWith("mf_tag_transactions", {
      p_tag_id: "tag",
      p_from: "2026-01-01",
      p_to: "2026-01-31",
      p_search: "term",
      p_limit: 10,
      p_offset: 20,
    });
    expect(result).toEqual(
      data
        ? { ...data, total: 5 }
        : { rows: [], total: 0, amounts: {}, years: [] },
    );
  });
const ledger = [
  ...transactionRows
    .filter((x) => x.id !== "future")
    .map((x) => ({
      ...x,
      description: x.id === "expense" ? "Dinner" : "Other",
      category_id: x.id === "expense" ? "food" : "misc",
    })),
  {
    id: "cancelled",
    account_id: "a",
    payment_date: "2026-01-05",
    type: "DESPESA",
    status: "CANCELADO",
    amount: 999,
    description: "Cancelled",
  },
  {
    id: "unknown",
    account_id: "a",
    payment_date: "2026-01-05",
    type: "OTHER",
    status: "PAGO",
    amount: 999,
    description: "Other",
  },
];
for (const [filters, ids] of [
  [{}, ["income", "expense", "transfer", "pending", "cancelled", "unknown"]],
  [{ status: "PENDENTE" }, ["pending"]],
  [{ type: "RECEITA" }, ["income"]],
  [{ accountId: "b" }, ["pending"]],
  [{ currency: "USD" }, ["pending"]],
  [{ currency: "EUR" }, []],
  [{ currency: "USD", accountId: "a" }, []],
  [{ categoryIds: ["food"] }, ["expense"]],
  [{ tagId: "food" }, ["expense"]],
  [{ tagId: "missing" }, []],
  [{ search: "Dinner" }, ["expense"]],
  [{ search: "20" }, ["expense"]],
])
  for (const offline of [false, true])
    it(`filters ledger online/offline=${offline}: ${JSON.stringify(filters)}`, async () => {
      state.offline = offline;
      state.server.tables.mf_accounts = accountRows;
      state.server.tables.mf_transactions = ledger;
      state.server.tables.mf_transaction_tags = [
        { transaction_id: "expense", tag_id: "food" },
        { transaction_id: "expense", tag_id: "travel" },
        { transaction_id: "outside", tag_id: "other" },
      ];
      const query = hooks.useMFLancamentos({ id: "owner" }, "2026-01", filters);
      const result = await query.queryFn({});
      expect(result.rows.map((x) => x.id)).toEqual(ids);
      expect(result.total).toBe(ids.length);
      expect(result.totals.despesas.BRL || 0).toBe(
        ids.includes("expense") ? 20 : 0,
      );
      if (ids.includes("expense"))
        expect(result.tagIdsByTx.expense).toEqual(["food", "travel"]);
      expect(query.getNextPageParam(result)).toBeUndefined();
    });
it("paginates an offline ledger without losing full-filter totals", async () => {
  state.offline = true;
  state.server.tables.mf_accounts = accountRows;
  state.server.tables.mf_transactions = ledger;
  const query = hooks.useMFLancamentos({ id: "owner" }, "2026-01", {
    pageSize: 2,
  });
  const first = await query.queryFn({ pageParam: 0 });
  expect(first.rows.map((x) => x.id)).toEqual(["income", "expense"]);
  expect(first.total).toBe(6);
  expect(first.nextOffset).toBe(2);
  expect(query.getNextPageParam(first)).toBe(2);
  const last = await query.queryFn({ pageParam: 4 });
  expect(last.rows.map((x) => x.id)).toEqual(["cancelled", "unknown"]);
  expect(last.nextOffset).toBe(null);
});
for (const profile of [null, "personal", "empty"])
  it(`budget window includes only period/profile rows and their tags: ${profile}`, async () => {
    vi.setSystemTime(new Date("2026-01-20T12:00:00Z"));
    state.profile = profile;
    state.server.tables.mf_accounts = accountRows;
    state.server.tables.mf_transactions = [
      ...transactionRows,
      { id: "before", account_id: "a", payment_date: "2025-10-01" },
    ];
    state.server.tables.mf_transaction_tags = [
      { transaction_id: "income", tag_id: "one" },
      { transaction_id: "income", tag_id: "two" },
      { transaction_id: "before", tag_id: "old" },
    ];
    const result = await hooks.useMFBudgetWindow({ id: "owner" }, 2).queryFn();
    expect(result.transactions.map((x) => x.id)).toEqual(
      profile === "empty"
        ? []
        : profile === "personal"
          ? ["income", "expense", "transfer"]
          : ["income", "expense", "transfer", "pending"],
    );
    expect(result.tagIdsByTx).toEqual(
      profile === "empty" ? {} : { income: ["one", "two"] },
    );
  });
for (const table of ["mf_accounts", "mf_transactions", "mf_transaction_tags"])
  it(`propagates ${table} failure in the budget window`, async () => {
    state.profile = "personal";
    state.server.tables.mf_accounts = accountRows;
    state.server.failures[`${table}:select`] = "denied";
    await expect(
      hooks.useMFBudgetWindow({ id: "owner" }).queryFn(),
    ).rejects.toThrow("denied");
  });
for (const name of [
  "useMFReminderRows",
  "useMFSuggestionRows",
  "useMFSeriesRows",
  "useMFAccountTransactions",
])
  it(`${name} disables incomplete queries and propagates read failure`, async () => {
    const query = hooks[name](null);
    expect(query.enabled).toBe(false);
    state.server.failures["mf_transactions:select"] = "denied";
    await expect(hooks[name]({ id: "owner" }, "a").queryFn()).rejects.toThrow(
      "denied",
    );
  });
it("keeps account-scoped transaction history restricted to source or destination", async () => {
  state.server.tables.mf_transactions = [
    ...transactionRows,
    { id: "foreign", account_id: "foreign", payment_date: "2026-01-01" },
  ];
  const result = await hooks
    .useMFAccountTransactions({ id: "owner" }, "b", null)
    .queryFn();
  expect(result.map((x) => x.id)).toEqual(["pending", "transfer"]);
});
