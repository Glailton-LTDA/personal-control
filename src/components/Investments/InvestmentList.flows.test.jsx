import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { createQueryServer } from "../../tests/queryServer";
import InvestmentList from "./InvestmentList";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({ server: null, confirm: true }));
const t = (key) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../../lib/supabase", () => ({
  supabase: { from: (table) => state.server.from(table) },
}));
vi.mock("../../lib/toast", () => ({
  confirmToast: (_message, accept) => (state.confirm ? accept() : undefined),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, getItemKey, estimateSize }) => ({
    getTotalSize: () => count * 100,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: getItemKey(index),
        size: estimateSize(index),
        start: index * 100,
      })),
  }),
}));
const account = {
  id: "a",
  name: "Savings",
  currency: "BRL",
  institution: { name: "Bank" },
  type: { name: "Fund" },
};
function record(id, account_id, date, balance, other = {}) {
  return {
    id,
    account_id,
    record_date: date,
    final_balance: balance,
    yield: 5,
    investment_accounts: account,
    ...other,
  };
}
beforeEach(() => {
  state.server = createQueryServer();
  state.confirm = true;
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("investment_filter_year", "2026");
  localStorage.setItem("investment_filter_month", "1");
  state.server.tables = {
    investment_accounts: [
      account,
      { id: "b", name: "Cash", currency: "USD" },
      { id: "c", name: "Reserve" },
    ],
    investment_records: [
      record("current", "a", "2026-01-20", 120),
      record("earlier", "a", "2026-01-01", 100),
      record("usd", "b", "2026-01-01", 40, {
        investment_accounts: { name: "Cash", currency: "USD" },
      }),
      record("previous", "c", "2025-12-31", 80, {
        investment_accounts: { name: "Reserve" },
      }),
    ],
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function open(extra = {}) {
  const result = render(<InvestmentList user={{ id: "owner" }} {...extra} />);
  await screen.findAllByText("Savings");
  return result.container;
}
it("renders records, groups, latest balances, filters and currency switching", async () => {
  const container = await open();
  expect(container.textContent).toContain("120,00");
  const header =
    container.querySelector(".mobile-group-header") ||
    screen.getAllByText("Bank")[0];
  fireEvent.click(header);
  fireEvent.click(header);
  fireEvent.change(screen.getAllByRole("combobox")[1], {
    target: { value: "0" },
  });
  await waitFor(() =>
    expect(localStorage.getItem("investment_filter_month")).toBe("0"),
  );
  fireEvent.change(screen.getAllByRole("combobox")[0], {
    target: { value: "2025" },
  });
  await waitFor(() =>
    expect(localStorage.getItem("investment_filter_year")).toBe("2025"),
  );
  await screen.findAllByText("Reserve");
  fireEvent.click(screen.getByText("USD"));
  expect(localStorage.getItem("investment_active_currency")).toBe("USD");
});
for (const mobile of [false, true])
  for (const failure of [false, true])
    it(`deletes after confirmation: mobile=${mobile}, failure=${failure}`, async () => {
      vi.spyOn(window, "innerWidth", "get").mockReturnValue(
        mobile ? 390 : 1280,
      );
      const container = await open();
      state.confirm = false;
      fireEvent.click(container.querySelector(".action-btn.danger"));
      expect(state.server.calls.some((x) => x[1] === "delete")).toBe(false);
      state.confirm = true;
      if (failure)
        state.server.failures["investment_records:delete"] = "denied";
      fireEvent.click(container.querySelector(".action-btn.danger"));
      await waitFor(() =>
        expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
          failure
            ? "investments.error_delete_record"
            : "investments.record_deleted",
        ),
      );
      if (!failure)
        expect(
          state.server.tables.investment_records.some(
            (x) => x.id === "current",
          ),
        ).toBe(false);
    });
for (const mode of [
  "success",
  "empty",
  "duplicate",
  "fetch-error",
  "insert-error",
])
  it(`copies preceding December without duplicating accounts: ${mode}`, async () => {
    if (mode === "empty")
      state.server.tables.investment_records =
        state.server.tables.investment_records.filter(
          (x) => x.id !== "previous",
        );
    if (mode === "duplicate")
      state.server.tables.investment_records.push(
        record("already", "c", "2026-01-01", 80),
      );
    await open();
    if (mode === "fetch-error")
      state.server.failures["investment_records:select"] = "denied";
    if (mode === "insert-error")
      state.server.failures["investment_records:insert"] = "denied";
    fireEvent.click(screen.getByTitle("investments.copy_previous"));
    const expected =
      mode === "empty"
        ? "investments.error_no_previous"
        : mode === "duplicate"
          ? "investments.error_already_exists"
          : mode.endsWith("error")
            ? "investments.error_copy_records"
            : "investments.records_copied";
    await waitFor(() =>
      expect(
        mode === "success" ? toast.success : toast.error,
      ).toHaveBeenCalledWith(expected),
    );
    if (mode === "success")
      expect(
        state.server.tables.investment_records.find((x) =>
          x.id.startsWith("created-"),
        ),
      ).toMatchObject({
        account_id: "c",
        user_id: "owner",
        yield: 0,
        final_balance: 80,
        record_date: "2026-01-01",
      });
  });
it("refuses month-copy for the all-months view, masks values and opens editing/creation", async () => {
  const container = await open({ showValues: false });
  expect(container.textContent).toContain("••••••");
  fireEvent.click(container.querySelector(".action-btn:not(.danger)"));
  await screen.findByText("investments.edit_record");
  fireEvent.click(screen.getByText("investments.cancel"));
  fireEvent.click(screen.getByTitle("investments.new_register"));
  await screen.findByText("investments.new_record");
  fireEvent.click(screen.getByText("investments.cancel"));
  fireEvent.change(screen.getAllByRole("combobox")[1], {
    target: { value: "0" },
  });
  expect(
    screen.queryByTitle("investments.copy_previous"),
  ).not.toBeInTheDocument();
});
