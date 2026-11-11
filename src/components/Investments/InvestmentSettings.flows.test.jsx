import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { createQueryServer } from "../../tests/queryServer";
import InvestmentSettings from "./InvestmentSettings";
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
vi.mock("../Trips/CurrencySelector", () => ({
  default: ({ onSelectionChange }) => (
    <select
      aria-label="currency"
      onChange={(e) =>
        onSelectionChange(e.target.value ? [e.target.value] : [])
      }
    >
      <option value="BRL">BRL</option>
      <option value="USD">USD</option>
      <option value="">default</option>
    </select>
  ),
}));
beforeEach(() => {
  state.server = createQueryServer();
  state.confirm = true;
  vi.clearAllMocks();
  state.server.tables = {
    investment_accounts: [
      {
        id: "a",
        name: "Savings",
        color: "#112233",
        currency: "USD",
        institution_id: "i",
        account_type_id: "t",
        institution: { name: "Bank", color: "#112233" },
        type: { name: "Fund" },
      },
      { id: "b", name: "Cash", currency: null },
    ],
    investment_institutions: [{ id: "i", name: "Bank", color: "#112233" }],
    investment_account_types: [{ id: "t", name: "Fund" }],
  };
});
afterEach(cleanup);
const cases = [
  ["accounts", "investment_accounts", "Savings"],
  ["institutions", "investment_institutions", "Bank"],
  ["types", "investment_account_types", "Fund"],
];
async function open(tab) {
  const result = render(<InvestmentSettings user={{ id: "owner" }} />);
  await screen.findByText("Savings");
  fireEvent.click(
    screen.getByText(
      `investments.${tab === "types" ? "account_types" : tab}_tab`,
    ),
  );
  return result.container;
}
for (const [tab, table] of cases)
  for (const edit of [false, true])
    for (const failure of [false, true])
      it(`${tab}: ${edit ? "update" : "create"}, failure=${failure}`, async () => {
        const container = await open(tab);
        if (edit)
          fireEvent.click(container.querySelector(".action-btn:not(.danger)"));
        else fireEvent.click(container.querySelector(".contextual-fab"));
        fireEvent.change(container.querySelector('form input[type="text"]'), {
          target: { value: "Changed" },
        });
        const color = container.querySelector('input[type="color"]');
        if (color) fireEvent.change(color, { target: { value: "#abcdef" } });
        if (tab === "accounts") {
          const selects = container.querySelectorAll("form select");
          fireEvent.change(selects[0], { target: { value: edit ? "" : "i" } });
          fireEvent.change(selects[1], { target: { value: edit ? "" : "t" } });
          fireEvent.change(screen.getByLabelText("currency"), {
            target: { value: edit ? "" : "USD" },
          });
        }
        if (failure)
          state.server.failures[`${table}:${edit ? "update" : "insert"}`] =
            "denied";
        fireEvent.submit(container.querySelector("form"));
        await waitFor(() =>
          expect(
            state.server.calls.some(
              (x) => x[0] === table && x[1] === (edit ? "update" : "insert"),
            ),
          ).toBe(true),
        );
        if (failure) {
          expect(container.querySelector("form")).toBeInTheDocument();
          expect(toast.success).not.toHaveBeenCalled();
        } else {
          await waitFor(() =>
            expect(container.querySelector("form")).not.toBeInTheDocument(),
          );
          expect(
            state.server.tables[table].some((x) => x.name === "Changed"),
          ).toBe(true);
          if (!edit)
            expect(
              state.server.tables[table].find((x) => x.name === "Changed")
                .user_id,
            ).toBe("owner");
        }
      });
for (const [tab, table] of cases)
  it(`${tab}: cancels edit, cancels deletion, handles dependency error then deletes`, async () => {
    const container = await open(tab);
    fireEvent.click(container.querySelector(".action-btn:not(.danger)"));
    fireEvent.click(screen.getByText("investments.cancel"));
    expect(container.querySelector("form")).not.toBeInTheDocument();
    state.confirm = false;
    fireEvent.click(container.querySelector(".action-btn.danger"));
    expect(state.server.calls.some((x) => x[1] === "delete")).toBe(false);
    state.confirm = true;
    state.server.failures[`${table}:delete`] = "referenced";
    fireEvent.click(container.querySelector(".action-btn.danger"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("investments.error_delete_deps"),
    );
    delete state.server.failures[`${table}:delete`];
    const before = state.server.tables[table].length;
    fireEvent.click(container.querySelector(".action-btn.danger"));
    await waitFor(() =>
      expect(state.server.tables[table]).toHaveLength(before - 1),
    );
  });
it("renders empty settings without inventing accounts", async () => {
  state.server.tables = {};
  render(<InvestmentSettings user={{ id: "owner" }} />);
  await screen.findByText("investments.no_accounts");
  expect(state.server.calls.filter((x) => x[1] === "insert")).toEqual([]);
});
