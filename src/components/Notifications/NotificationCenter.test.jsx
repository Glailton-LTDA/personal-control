import React, { useEffect } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NotificationCenter from "./NotificationCenter";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, args) => (args?.count != null ? `${key}:${args.count}` : key),
    i18n: { language: "en" },
  }),
}));
let health, finance, trip;
const item = (id, extra = {}) => ({
  id,
  title: `Synthetic ${id}`,
  at: "2026-11-18T08:00:00Z",
  statusKey: "status.synthetic",
  onOpen: vi.fn(),
  ...extra,
});
const feed = (items) => ({ items, count: items.length, refresh: vi.fn() });
function Source({ publish, id, value }) {
  useEffect(() => publish(id, value), [publish, id, value]);
  return null;
}
const sources = [
  {
    id: "health",
    labelKey: "module.health",
    Source: (props) => <Source {...props} id="health" value={health} />,
  },
  {
    id: "minhasfinancas",
    labelKey: "module.finance",
    Source: (props) => (
      <Source {...props} id="minhasfinancas" value={finance} />
    ),
  },
  {
    id: "trips",
    labelKey: "module.trips",
    Source: (props) => <Source {...props} id="trips" value={trip} />,
  },
];
const setup = (props = {}) => {
  const client = new QueryClient();
  const navigate = vi.fn();
  const root = render(
    <QueryClientProvider client={client}>
      <NotificationCenter
        sources={sources}
        modules={["health", "minhasfinancas"]}
        user={{ id: "owner" }}
        navigate={navigate}
        {...props}
      />
    </QueryClientProvider>,
  );
  return root;
};
const open = () => {
  const button = screen.getByRole("button", { name: "notifications.title" });
  button.focus();
  fireEvent.click(button);
};
beforeEach(() => {
  vi.clearAllMocks();
  health = feed([item("health")]);
  finance = feed([
    item("finance", {
      amount: { value: 100, currency: "USD" },
      dateOnly: true,
    }),
  ]);
  trip = feed([item("trip")]);
});
it("combines module feeds in a single toolbar bell, filters, opens a record and restores focus", () => {
  setup();
  expect(screen.getByLabelText("notifications.count:2")).toHaveTextContent("2");
  open();
  expect(screen.getByText("Synthetic health")).toBeVisible();
  expect(screen.getByText("Synthetic finance")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "module.health" }));
  expect(screen.queryByText("Synthetic finance")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "notifications.open" }));
  expect(health.items[0].onOpen).toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByTestId("global-notifications-bell")).toHaveFocus();
});
it("accepts a third module through the registry without changing the common panel", () => {
  setup({ modules: ["trips"] });
  open();
  expect(screen.getByText("Synthetic trip")).toBeVisible();
  expect(screen.queryByText("Synthetic health")).not.toBeInTheDocument();
});
it("masks monetary values and does not leak a currency amount in hidden mode", () => {
  setup({ showValues: false });
  open();
  expect(screen.getByText("•••")).toBeVisible();
  expect(screen.queryByText("$100.00")).not.toBeInTheDocument();
});
it("isolates errors by source and supports retry, empty lists and loading", () => {
  health = { ...health, error: true };
  finance = { ...finance, items: [] };
  setup();
  open();
  const section = within(screen.getByRole("region", { name: "module.health" }));
  fireEvent.click(section.getByRole("button", { name: "notifications.retry" }));
  expect(health.refresh).toHaveBeenCalled();
  expect(screen.getByText("notifications.empty")).toBeVisible();
});
it("shows a lower-bound badge and exposes load-more without claiming an exact total", () => {
  health = { ...health, lowerBound: true, hasMore: true, loadMore: vi.fn() };
  finance = { ...finance, moreInModule: true };
  setup();
  expect(screen.getByLabelText("notifications.count_more:2")).toHaveTextContent(
    "2+",
  );
  open();
  fireEvent.click(
    screen.getByRole("button", { name: "notifications.load_more" }),
  );
  expect(health.loadMore).toHaveBeenCalled();
  expect(screen.getByText("notifications.more_in_module")).toBeVisible();
});
it("caps large counts, supports title fallbacks, and displays loading safely", () => {
  health = {
    ...health,
    count: 150,
    items: [item("fallback", { title: null, titleKey: "synthetic.title" })],
  };
  setup();
  expect(screen.getByText("99+")).toBeVisible();
  open();
  expect(screen.getByText("synthetic.title")).toBeVisible();
});
it("does not show a partial count while a provider is still loading", () => {
  health = { ...health, loading: true };
  setup();
  expect(
    screen.queryByLabelText("notifications.count:2"),
  ).not.toBeInTheDocument();
  open();
  expect(screen.getByRole("status")).toHaveTextContent("notifications.loading");
});
it("keeps failed dismissals visible and retries without raw backend errors", async () => {
  const action = vi
    .fn()
    .mockRejectedValueOnce(new Error("private backend"))
    .mockResolvedValue(undefined);
  health = feed([item("dismiss", { onDismiss: action })]);
  setup();
  open();
  fireEvent.click(
    screen.getByRole("button", { name: "notifications.dismiss" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "notifications.action_error",
  );
  expect(screen.getByText("Synthetic dismiss")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "notifications.dismiss" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});
it("can refresh and close with Escape or the close button", () => {
  setup();
  open();
  const section = within(screen.getByRole("region", { name: "module.health" }));
  fireEvent.click(
    section.getByRole("button", { name: "notifications.refresh" }),
  );
  expect(health.refresh).toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  open();
  fireEvent.click(screen.getByRole("button", { name: "notifications.close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("handles no enabled modules and no authenticated user", () => {
  const root = setup({ modules: [] });
  open();
  expect(screen.getByText("notifications.empty")).toBeVisible();
  root.unmount();
  setup({ user: null });
  expect(
    screen.queryByTestId("global-notifications-bell"),
  ).not.toBeInTheDocument();
});

it("includes every registered source by default even when it is not present in the menu", () => {
  setup({ modules: undefined });
  expect(screen.getByLabelText("notifications.count:3")).toHaveTextContent("3");
  open();
  expect(screen.getByText("Synthetic trip")).toBeVisible();
});
