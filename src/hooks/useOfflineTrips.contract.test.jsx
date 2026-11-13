import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as hooks from "./useOfflineTrips";
import { db } from "../lib/offline/db";
const remote = vi.hoisted(() => ({
  mode: "offline",
  value: null,
  calls: [],
  enqueue: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("../lib/offline/db", async (original) => ({
  ...(await original()),
  generateUUID: () => "created-id",
}));
vi.mock("../lib/offline/SyncEngine", () => ({
  SyncEngine: class {
    constructor() {
      this.isOnline = remote.mode !== "offline";
    }
    enqueue(...args) {
      return remote.enqueue(...args);
    }
    destroy() {
      remote.destroy();
    }
  },
}));
vi.mock("../lib/supabase", () => ({
  supabase: {
    from: (table) => {
      const q = {};
      for (const method of [
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "order",
        "single",
      ])
        q[method] = vi.fn((...args) => {
          remote.calls.push([table, method, ...args]);
          return q;
        });
      q.then = (resolve, reject) =>
        remote.mode === "throw"
          ? Promise.reject(new Error("Synthetic network failure")).then(
              resolve,
              reject,
            )
          : Promise.resolve({
              data: remote.value,
              error:
                remote.mode === "error"
                  ? { message: "Synthetic API failure" }
                  : null,
            }).then(resolve, reject);
      return q;
    },
  },
}));
let client;
const mount = (hook, ...args) =>
  renderHook(() => hook(...args), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
beforeEach(async () => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  remote.mode = "offline";
  remote.value = null;
  remote.calls = [];
  remote.enqueue.mockReset();
  remote.destroy.mockReset();
  for (const name of [
    "trips",
    "trip_expenses",
    "trip_itinerary",
    "trip_categories",
    "trip_checklists",
    "trip_checklist_items",
    "trip_shares",
    "sync_queue",
  ])
    await db[name].clear();
  vi.spyOn(navigator, "onLine", "get").mockImplementation(
    () => remote.mode !== "offline",
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
});
const entities = [
  [
    "Trip",
    "trips",
    { title: "Trip", start_date: "2026-01-01", end_date: "2026-01-03" },
  ],
  [
    "Expense",
    "trip_expenses",
    {
      description: "Expense",
      amount: 12,
      currency: "BRL",
      date: "2026-01-01",
      paid_by: "Test",
    },
  ],
  ["ItineraryItem", "trip_itinerary", { day: 1, activity: "Visit" }],
  ["Category", "trip_categories", "Category"],
  ["Checklist", "trip_checklists", { title: "Checklist" }],
  [
    "ChecklistItem",
    "trip_checklist_items",
    { checklist_id: "checklist", task: "Item" },
  ],
  ["Share", "trip_shares", { shared_with_email: "synthetic@example.test" }],
];
describe("trip offline write contracts", () => {
  for (const [name, table, payload] of entities) {
    for (const mode of ["offline", "success", "error", "throw", "empty"])
      it(`${name} preserves a newly created row when ${mode}`, async () => {
        remote.mode = mode;
        remote.value =
          mode === "success" ? { id: "created-id", server_marker: true } : null;
        const { result } = mount(
          hooks[`useOfflineCreate${name}`],
          "owner",
          "trip",
        );
        let row;
        await act(async () => {
          row = await result.current.mutateAsync(payload);
        });
        expect(row.id).toEqual(expect.any(String));
        expect(await db[table].get(row.id)).toBeDefined();
        if (["offline", "error", "throw"].includes(mode))
          expect(remote.enqueue).toHaveBeenCalledWith(
            table,
            row.id,
            "insert",
            expect.objectContaining({ id: row.id }),
          );
        else expect(remote.enqueue).not.toHaveBeenCalled();
        expect(remote.destroy).toHaveBeenCalledOnce();
      });
    if (name !== "Share")
      for (const mode of ["offline", "success", "error", "throw", "empty"])
        it(`${name} updates an existing row when ${mode}`, async () => {
          remote.mode = mode;
          remote.value =
            mode === "success" ? { id: "existing", server_marker: true } : null;
          await db[table].put({
            id: "existing",
            user_id: "owner",
            trip_id: "trip",
            checklist_id: "checklist",
            title: "Old",
          });
          const { result } = mount(
            hooks[`useOfflineUpdate${name}`],
            "owner",
            "trip",
          );
          await act(async () => {
            await result.current.mutateAsync({
              id: "existing",
              name: "Updated",
              title: "Updated",
              amount: 22,
            });
          });
          const row = await db[table].get("existing");
          expect(row.id).toBe("existing");
          if (mode === "success") expect(row.server_marker).toBe(true);
          if (["offline", "error", "throw"].includes(mode))
            expect(remote.enqueue).toHaveBeenCalledWith(
              table,
              "existing",
              "update",
              expect.objectContaining({ id: "existing" }),
            );
          else expect(remote.enqueue).not.toHaveBeenCalled();
          expect(remote.destroy).toHaveBeenCalledOnce();
        });
    for (const mode of ["offline", "success", "error", "throw"])
      it(`${name} deletes locally and handles ${mode}`, async () => {
        remote.mode = mode;
        await db[table].put({
          id: "delete-me",
          trip_id: "trip",
          user_id: "owner",
        });
        const { result } = mount(
          hooks[`useOfflineDelete${name}`],
          "owner",
          "trip",
        );
        await act(async () => {
          await result.current.mutateAsync("delete-me");
        });
        expect(await db[table].get("delete-me")).toBeUndefined();
        if (mode === "success") expect(remote.enqueue).not.toHaveBeenCalled();
        else
          expect(remote.enqueue).toHaveBeenCalledWith(
            table,
            "delete-me",
            "delete",
          );
        expect(remote.destroy).toHaveBeenCalledOnce();
      });
  }
});
const reads = [
  [
    "useOfflineTrips",
    "trips",
    ["owner"],
    { id: "row", user_id: "owner", title: "Trip", start_date: "2026-01-01" },
  ],
  [
    "useOfflineExpenses",
    "trip_expenses",
    ["trip"],
    { id: "row", trip_id: "trip", date: "2026-01-01" },
  ],
  [
    "useOfflineItinerary",
    "trip_itinerary",
    ["trip"],
    { id: "row", trip_id: "trip", day: 1 },
  ],
  [
    "useOfflineCategories",
    "trip_categories",
    ["owner"],
    { id: "row", user_id: "owner", name: "Category" },
  ],
  [
    "useOfflineChecklists",
    "trip_checklists",
    ["trip"],
    { id: "row", trip_id: "trip", title: "Checklist", items: [] },
  ],
  [
    "useOfflineChecklistItems",
    "trip_checklist_items",
    ["checklist"],
    { id: "row", checklist_id: "checklist", task: "Item" },
  ],
  [
    "useOfflineShares",
    "trip_shares",
    ["trip"],
    { id: "row", trip_id: "trip", shared_with_email: "synthetic@example.test" },
  ],
];
describe("trip reads and local fallback", () => {
  for (const [name, table, args, row] of reads)
    for (const mode of ["offline", "success", "error", "throw", "empty"])
      it(`${name} returns the expected collection when ${mode}`, async () => {
        remote.mode = mode;
        remote.value = mode === "success" ? [row] : null;
        await db[table].put(row);
        const { result } = mount(hooks[name], ...args);
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data.map((r) => r.id)).toEqual(
          mode === "empty" ? [] : ["row"],
        );
        if (mode === "offline") expect(remote.calls).toHaveLength(0);
      });
  it("invalidates trip caches for relevant events and unregisters its listener", async () => {
    const spy = vi.spyOn(client, "invalidateQueries");
    const view = mount(hooks.useOfflineTrips, "owner");
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    act(() =>
      window.dispatchEvent(
        new CustomEvent("database-synced", { detail: { source: "mf" } }),
      ),
    );
    expect(spy).not.toHaveBeenCalled();
    act(() =>
      window.dispatchEvent(
        new CustomEvent("database-synced", { detail: { source: "trips" } }),
      ),
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["offline_trips"] });
    view.unmount();
    spy.mockClear();
    act(() => window.dispatchEvent(new CustomEvent("database-synced")));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("trip RLS payloads", () => {
  it("online checklist insert sends user_id and only server columns", async () => {
    remote.mode = "success";
    remote.value = { id: "created-id" };
    const { result } = mount(hooks.useOfflineCreateChecklist, "owner", "trip");
    await act(async () => {
      await result.current.mutateAsync({ title: "Checklist" });
    });
    const insert = remote.calls.find(
      ([table, method]) => table === "trip_checklists" && method === "insert",
    );
    expect(insert).toBeTruthy();
    expect(insert[2][0]).toEqual(
      expect.objectContaining({
        id: "created-id",
        trip_id: "trip",
        user_id: "owner",
        title: "Checklist",
      }),
    );
    expect(insert[2][0]).not.toHaveProperty("description");
    expect(insert[2][0]).not.toHaveProperty("is_template");
  });

  it("offline checklist queue keeps user_id and drops unknown columns", async () => {
    remote.mode = "offline";
    const { result } = mount(hooks.useOfflineCreateChecklist, "owner", "trip");
    await act(async () => {
      await result.current.mutateAsync({ title: "Checklist" });
    });
    expect(remote.enqueue).toHaveBeenCalledWith(
      "trip_checklists",
      "created-id",
      "insert",
      expect.objectContaining({
        id: "created-id",
        trip_id: "trip",
        user_id: "owner",
        title: "Checklist",
      }),
    );
    const queued = remote.enqueue.mock.calls[0][3];
    expect(queued).not.toHaveProperty("description");
    expect(queued).not.toHaveProperty("is_template");
  });

  it("offline itinerary queue keeps user_id", async () => {
    remote.mode = "offline";
    const { result } = mount(
      hooks.useOfflineCreateItineraryItem,
      "owner",
      "trip",
    );
    await act(async () => {
      await result.current.mutateAsync({ day: 1, activity: "Visit", coordinates: [20,10],
        completed: true, needs_booking: true, is_booked: true, order_index: 3,
        lat: 10, lng: 20, km_multiplier: 2, transportation: 'drive' });
    });
    expect(remote.enqueue).toHaveBeenCalledWith(
      "trip_itinerary",
      "created-id",
      "insert",
      expect.objectContaining({
        id: "created-id",
        trip_id: "trip",
        user_id: "owner",
        coordinates: [20,10], completed: true, needs_booking: true, is_booked: true, order_index: 3,
      }),
    );
    const queued = remote.enqueue.mock.calls[0][3];
    expect(Object.keys(queued).sort()).toEqual([
      'id','trip_id','user_id','day','time','activity','location','notes','coordinates',
      'completed','needs_booking','is_booked','order_index','created_at','updated_at',
    ].sort());
    expect(await db.trip_itinerary.get('created-id')).toMatchObject(queued);
  });
});
