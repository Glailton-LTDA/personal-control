import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { createQueryServer } from "../../tests/queryServer";
import InvestmentDashboard from "./InvestmentDashboard";
const state = vi.hoisted(() => ({ server: null }));
const t = (key) => key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t, i18n: { language: "pt-BR" } }),
}));
vi.mock("../../lib/supabase", () => ({
  supabase: { from: (table) => state.server.from(table) },
}));
// Chart adapter exposes the domain series while leaving aggregation in the real component.
vi.mock("recharts", () => {
  const wrap = ({ children }) => <div>{children}</div>;
  const series = ({ data, children }) => (
    <div>
      <output data-testid="series">{JSON.stringify(data)}</output>
      {children}
    </div>
  );
  return {
    ResponsiveContainer: wrap,
    AreaChart: series,
    BarChart: series,
    PieChart: wrap,
    Pie: series,
    Area: wrap,
    Bar: wrap,
    Cell: () => null,
    Legend: () => null,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
  };
});
const account = {
  name: "Savings",
  color: "#112233",
  institution: { name: "Bank" },
  type: { name: "Fund" },
};
const records = [
  {
    id: "old",
    account_id: "a",
    record_date: "2025-12-01",
    yield: 10,
    final_balance: 100,
    investment_accounts: account,
  },
  {
    id: "jan1",
    account_id: "a",
    record_date: "2026-01-01",
    yield: 2,
    final_balance: 102,
    investment_accounts: account,
  },
  {
    id: "jan2",
    account_id: "a",
    record_date: "2026-01-20",
    yield: 3,
    final_balance: 105,
    investment_accounts: account,
  },
  {
    id: "earlier",
    account_id: "a",
    record_date: "2026-01-10",
    yield: 1,
    final_balance: 103,
    investment_accounts: account,
  },
  {
    id: "feb",
    account_id: "a",
    record_date: "2026-02-01",
    yield: 5,
    final_balance: 110,
    investment_accounts: account,
  },
  {
    id: "other",
    account_id: "b",
    record_date: "2026-01-01",
    yield: -1,
    final_balance: 40,
    investment_accounts: { name: "Cash" },
  },
  {
    id: "future",
    account_id: "a",
    record_date: "2027-01-01",
    yield: 1000,
    final_balance: 2000,
    investment_accounts: account,
  },
];
beforeEach(() => {
  state.server = createQueryServer();
  state.server.tables.investment_records = records;
  localStorage.clear();
  localStorage.setItem("investment_dashboard_year", "2026");
  localStorage.setItem("investment_dashboard_month", "all");
});
afterEach(cleanup);
function series() {
  return screen.getAllByTestId("series").map((e) => JSON.parse(e.textContent));
}
it("sums yield but uses only latest balances per account and month", async () => {
  const toggle = vi.fn();
  render(
    <InvestmentDashboard user={{ id: "owner" }} onToggleValues={toggle} />,
  );
  await waitFor(() =>
    expect(screen.getByTestId("summary-card-total-balance")).toHaveTextContent(
      "150,00",
    ),
  );
  const monthly = series().find((a) => a.length === 12);
  expect(monthly[0]).toMatchObject({ yield: 5, balance: 145 });
  expect(monthly[1]).toMatchObject({ yield: 5, balance: 110 });
  expect(
    series().some((a) =>
      a.some((x) => x.name === "Sem Tipo" && x.value === -1),
    ),
  ).toBe(true);
  fireEvent.change(screen.getAllByRole("combobox")[0], {
    target: { value: "1" },
  });
  await waitFor(() =>
    expect(screen.getByTestId("summary-card-total-balance")).toHaveTextContent(
      "145,00",
    ),
  );
  expect(localStorage.getItem("investment_dashboard_month")).toBe("1");
  fireEvent.click(screen.getByTitle("finances.hide_values"));
  expect(toggle).toHaveBeenCalledOnce();
  fireEvent.change(screen.getAllByRole("combobox")[1], {
    target: { value: "2025" },
  });
  await waitFor(() =>
    expect(localStorage.getItem("investment_dashboard_year")).toBe("2025"),
  );
  await waitFor(() =>
    expect(screen.getByTestId("summary-card-total-balance")).toHaveTextContent(
      "0,00",
    ),
  );
});
it("masks values and renders empty results without leaking amounts", async () => {
  state.server.tables.investment_records = [];
  render(
    <InvestmentDashboard
      user={{ id: "owner" }}
      showValues={false}
      onToggleValues={() => {}}
    />,
  );
  await screen.findByTitle("finances.show_values");
  expect(screen.getByTestId("summary-card-total-balance")).toHaveTextContent(
    "••",
  );
  expect(
    series()
      .find((a) => a.length === 12)
      .every((x) => x.balance === 0 && x.yield === 0),
  ).toBe(true);
});
it("keeps an empty summary when the API rejects the read", async () => {
  state.server.failures["investment_records:select"] = "denied";
  render(<InvestmentDashboard user={{ id: "owner" }} />);
  await waitFor(() =>
    expect(state.server.calls.some((x) => x[1] === "order")).toBe(true),
  );
  expect(screen.getByTestId("summary-card-total-balance")).toHaveTextContent(
    "0,00",
  );
});
