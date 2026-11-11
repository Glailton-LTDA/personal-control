import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { createQueryServer } from "../../tests/queryServer";
import InvestmentModal from "./InvestmentModal";
const state = vi.hoisted(() => ({ server: null }));
const t = (key) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../../lib/supabase", () => ({
  supabase: { from: (table) => state.server.from(table) },
}));
const accounts = [
  { id: "a", name: "Savings", currency: "USD", institution: { name: "Bank" } },
  { id: "b", name: "Cash" },
];
beforeEach(() => {
  state.server = createQueryServer();
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);
function open(extra = {}) {
  const onClose = vi.fn(),
    onRefresh = vi.fn();
  const result = render(
    <InvestmentModal
      isOpen
      user={{ id: "owner" }}
      accounts={accounts}
      onClose={onClose}
      onRefresh={onRefresh}
      {...extra}
    />,
  );
  return { ...result, onClose, onRefresh };
}
for (const edit of [false, true])
  for (const failure of [false, true])
    it(`submits monetary values and calculated yield: edit=${edit}, failure=${failure}`, async () => {
      const initialData = edit
        ? {
            id: "record",
            account_id: "b",
            record_date: "2026-02-01",
            initial_balance: 100,
            final_balance: 110,
            yield: 10,
          }
        : undefined;
      const { container, onClose, onRefresh } = open({ initialData });
      const amounts = screen.getAllByPlaceholderText(
        "investments.amount_placeholder",
      );
      if (!edit)
        await waitFor(() =>
          expect(state.server.calls.some((x) => x[1] === "select")).toBe(true),
        );
      fireEvent.change(amounts[0], { target: { value: "10000" } });
      fireEvent.change(amounts[1], { target: { value: "12555" } });
      expect(amounts.map((x) => x.value)).toEqual(["100,00", "125,55"]);
      const operation = edit ? "update" : "insert";
      if (failure)
        state.server.failures[`investment_records:${operation}`] = "denied";
      fireEvent.submit(container.querySelector("form"));
      await waitFor(() =>
        expect(state.server.calls.some((x) => x[1] === operation)).toBe(true),
      );
      const payload = state.server.calls.find((x) => x[1] === operation)[2];
      expect(edit ? payload : payload[0]).toMatchObject({
        initial_balance: 100,
        final_balance: 125.55,
        yield: 25.55,
      });
      if (failure) {
        expect(onClose).not.toHaveBeenCalled();
        expect(onRefresh).not.toHaveBeenCalled();
      } else {
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
        expect(onRefresh).toHaveBeenCalledOnce();
      }
    });
for (const balance of [130.52, null, undefined])
  it(`loads the preceding December balance (${balance}) and allows changing account/date`, async () => {
    sessionStorage.setItem(
      "draft_investment_form",
      JSON.stringify({
        account_id: "a",
        record_date: "2026-01-01",
        initial_balance: "",
        final_balance: "",
        yield: "",
      }),
    );
    state.server.tables.investment_records = [
      {
        id: "prev",
        account_id: "a",
        record_date: "2025-12-31",
        final_balance: balance,
      },
    ];
    const { container } = open();
    const amounts = screen.getAllByPlaceholderText(
      "investments.amount_placeholder",
    );
    await waitFor(() =>
      expect(state.server.calls).toContainEqual([
        "investment_records",
        "gte",
        "record_date",
        "2025-12-01",
      ]),
    );
    if (balance != null)
      await waitFor(() => expect(amounts[0].value).toBe("130,52"));
    else expect(amounts[0].value).toBe("");
    fireEvent.click(screen.getByText("Bank - Savings"));
    fireEvent.change(
      screen.getByPlaceholderText("investments.search_account"),
      { target: { value: "cash" } },
    );
    fireEvent.click(screen.getByText("Cash"));
    await waitFor(() =>
      expect(state.server.calls).toContainEqual([
        "investment_records",
        "eq",
        "account_id",
        "b",
      ]),
    );
    const selects = container.querySelectorAll("select");
    fireEvent.change(selects[0], { target: { value: "1" } });
    fireEvent.change(selects[1], { target: { value: "2025" } });
    await waitFor(() =>
      expect(state.server.calls).toContainEqual([
        "investment_records",
        "gte",
        "record_date",
        "2025-01-01",
      ]),
    );
  });
it("keeps a new record open when previous balance lookup fails and clears an amount", async () => {
  state.server.failures["investment_records:select"] = "denied";
  const { onClose } = open();
  const amounts = screen.getAllByPlaceholderText(
    "investments.amount_placeholder",
  );
  fireEvent.change(amounts[0], { target: { value: "invalid" } });
  expect(amounts[0].value).toBe("");
  fireEvent.click(screen.getByText("investments.cancel"));
  expect(onClose).toHaveBeenCalledOnce();
});
it("does not render a closed dialog or invent an account when none exists", () => {
  const { rerender, container } = open({ isOpen: false, accounts: [] });
  expect(container).toBeEmptyDOMElement();
  rerender(
    <InvestmentModal
      isOpen
      accounts={[]}
      user={{ id: "owner" }}
      onClose={() => {}}
    />,
  );
  expect(
    screen.getByText("investments.no_account_selected"),
  ).toBeInTheDocument();
});
