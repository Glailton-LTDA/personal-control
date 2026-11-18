import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HealthNotificationSource, FinanceNotificationSource } from "./sources";
import { listHealth, dismissHealth } from "../../lib/health";
import { loadFinanceNotifications } from "../../lib/notifications/finance";
import { useHealthReminderSync } from "../../hooks/useHealth";
vi.mock("../../lib/health", () => ({
  listHealth: vi.fn(),
  dismissHealth: vi.fn(),
}));
vi.mock("../../lib/notifications/finance", () => ({
  loadFinanceNotifications: vi.fn(),
}));
vi.mock("../../hooks/useHealth", () => ({ useHealthReminderSync: vi.fn() }));
let sync;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sync = {
    isSuccess: true,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
  useHealthReminderSync.mockReturnValue(sync);
  listHealth.mockResolvedValue({ rows: [], hasNext: false, total: 0 });
  dismissHealth.mockResolvedValue(undefined);
  loadFinanceNotifications.mockResolvedValue({ reminders: [], hasMore: false });
});
const setup = (Component, extra = {}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } },
  });
  const publish = vi.fn(),
    navigate = vi.fn();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <Component
        user={{ id: "owner" }}
        now={Date.parse("2026-11-18T12:00:00Z")}
        today="2026-11-18"
        publish={publish}
        navigate={navigate}
        client={client}
        {...extra}
      />
    </QueryClientProvider>,
  );
  return {
    client,
    publish,
    navigate,
    invalidate,
    feed: () => publish.mock.calls.at(-1)?.[1],
  };
};
const reminder = (kind, extra = {}) => ({
  id: kind,
  [`${kind}_id`]: `${kind}-id`,
  [kind]: { name: `Synthetic ${kind}` },
  remind_at: "2026-11-18T08:00:00Z",
  ...extra,
});
it.each(["medication", "appointment", "exam"])(
  "normalizes the owner medical %s feed and opens the right record",
  async (kind) => {
    listHealth.mockResolvedValue({
      rows: [reminder(kind)],
      hasNext: false,
      total: 1,
    });
    const state = setup(HealthNotificationSource);
    await waitFor(() => expect(state.feed().items).toHaveLength(1));
    expect(listHealth).toHaveBeenCalledWith("owner", "reminders", {
      page: 0,
      withCount: true,
    });
    state.feed().items[0].onOpen();
    expect(state.navigate).toHaveBeenCalledWith(
      `health/${{ medication: "medications", appointment: "appointments", exam: "exams" }[kind]}/${kind}-id`,
    );
    expect(state.feed().items[0].statusKey).toBe("health.notification_due");
    await state.feed().items[0].onDismiss();
    expect(dismissHealth).toHaveBeenCalledWith("owner", kind);
    expect(state.invalidate).toHaveBeenCalledWith({
      queryKey: ["health", "owner"],
    });
  },
);
it("distinguishes delivered and scheduled medical reminders and preserves fallback titles", async () => {
  listHealth.mockResolvedValue({
    rows: [
      reminder("exam", { delivered_at: "2026-11-18T08:01:00Z" }),
      reminder("appointment", {
        appointment: null,
        remind_at: "2026-11-19T08:00:00Z",
      }),
    ],
    hasNext: false,
  });
  const state = setup(HealthNotificationSource);
  await waitFor(() => expect(state.feed().items).toHaveLength(2));
  expect(state.feed().items[0].statusKey).toBe("health.notification_sent");
  expect(state.feed().items[1]).toMatchObject({
    title: undefined,
    titleKey: "health.appointments",
    statusKey: "health.notification_scheduled",
  });
});
it("fetches another bounded page and keeps the server total stable", async () => {
  listHealth.mockImplementation(async (_u, _kind, { page }) => ({
    rows: [reminder(page ? "appointment" : "medication")],
    hasNext: page === 0,
    total: 2,
  }));
  const state = setup(HealthNotificationSource);
  await waitFor(() => expect(state.feed().hasMore).toBe(true));
  await state.feed().loadMore();
  await waitFor(() => expect(state.feed().items).toHaveLength(2));
  expect(state.feed().count).toBe(2);
  expect(state.feed().hasMore).toBe(false);
  state.feed().refresh();
  expect(sync.refetch).toHaveBeenCalled();
});
it("uses a lower-bound count when the API omits count metadata", async () => {
  listHealth.mockResolvedValue({
    rows: [reminder("exam")],
    hasNext: true,
    total: null,
  });
  const state = setup(HealthNotificationSource);
  await waitFor(() => expect(state.feed().lowerBound).toBe(true));
  expect(state.feed().count).toBe(1);
});
it("does not read reminders until synchronization succeeds and reports sync errors", async () => {
  useHealthReminderSync.mockReturnValue({
    ...sync,
    isSuccess: false,
    isLoading: true,
  });
  const state = setup(HealthNotificationSource);
  expect(state.feed().loading).toBe(true);
  expect(listHealth).not.toHaveBeenCalled();
});
it("reports medical read failures independently of other modules", async () => {
  listHealth.mockRejectedValue(new Error("synthetic backend"));
  const state = setup(HealthNotificationSource);
  await waitFor(() => expect(state.feed().error).toBe(true));
});
it("exposes synchronization failures without pretending that the list is empty", () => {
  useHealthReminderSync.mockReturnValue({
    ...sync,
    isSuccess: false,
    isError: true,
  });
  const state = setup(HealthNotificationSource);
  expect(state.feed().error).toBe(true);
  expect(listHealth).not.toHaveBeenCalled();
});
it.each(["overdue", "today", "upcoming", "invoice_closed"])(
  "normalizes %s finance notifications and preserves month routing",
  async (kind) => {
    loadFinanceNotifications.mockResolvedValue({
      reminders: [
        {
          key: kind,
          kind,
          description: "Synthetic bill",
          dueISO: "2026-11-25",
          closeISO: "2026-11-18",
          cardName: "Synthetic card",
          total: 100,
          amount: 20,
          currency: "USD",
        },
      ],
      hasMore: true,
    });
    const state = setup(FinanceNotificationSource);
    await waitFor(() => expect(state.feed().items).toHaveLength(1));
    expect(loadFinanceNotifications).toHaveBeenCalledWith(
      "owner",
      "2026-11-18",
    );
    expect(state.feed().lowerBound).toBe(true);
    state.feed().items[0].onOpen();
    expect(localStorage.getItem("mf_month_key")).toBe("2026-11");
    expect(state.navigate).toHaveBeenCalledWith(
      kind === "invoice_closed"
        ? "minhasfinancas/cards"
        : "minhasfinancas/transactions",
    );
    expect(state.feed().items[0].amount.value).toBe(
      kind === "invoice_closed" ? 100 : 20,
    );
    state.feed().refresh();
  },
);
it("uses the invoice closing date when no due date exists", async () => {
  loadFinanceNotifications.mockResolvedValue({
    reminders: [
      {
        key: "invoice",
        kind: "invoice_closed",
        closeISO: "2026-11-18",
        cardName: "Synthetic",
      },
    ],
    hasMore: false,
  });
  const state = setup(FinanceNotificationSource);
  await waitFor(() => expect(state.feed().items).toHaveLength(1));
  expect(state.feed().items[0].at).toBe("2026-11-18T12:00:00");
  state.feed().items[0].onOpen();
  expect(localStorage.getItem("mf_month_key")).toBeNull();
});
it("reports financial failures rather than silently clearing the badge", async () => {
  loadFinanceNotifications.mockRejectedValue(new Error("private"));
  const state = setup(FinanceNotificationSource);
  await waitFor(() => expect(state.feed().error).toBe(true));
});
