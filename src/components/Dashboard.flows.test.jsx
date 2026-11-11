import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import Dashboard from "./Dashboard";
import { createQueryServer } from "../tests/queryServer";
const state = vi.hoisted(() => ({
  path: "launchpad",
  server: null,
  navigate: vi.fn(),
  logout: vi.fn(),
}));
const t = (key) => key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t, i18n: { language: "pt-BR" } }),
}));
vi.mock("../hooks/useRouter", async (original) => ({
  ...(await original()),
  useRouter: () => ({ currentPath: state.path, navigate: state.navigate }),
}));
vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: { signOut: state.logout },
    from: (table) => state.server.from(table),
  },
}));
vi.mock("./Health/HealthGuide", () => ({
  default: (props) => (
    <output data-testid="module">
      Health {props.screen}:{props.detailId}
    </output>
  ),
}));
vi.mock("./Finance/FinanceList", () => ({
  default: ({ onEdit, onToggleValues }) => (
    <div data-testid="module">
      Finance list
      <button onClick={() => onEdit({ id: "transaction" })}>
        Edit transaction
      </button>
      <button onClick={onToggleValues}>Toggle finance values</button>
    </div>
  ),
}));
vi.mock("./Finance/SummaryDashboard", () => ({
  default: ({ onToggleValues }) => (
    <div data-testid="module">
      Finance summary
      <button onClick={onToggleValues}>Toggle summary values</button>
    </div>
  ),
}));
vi.mock("./Finance/FinanceSettings", () => ({
  default: () => <div data-testid="module">Finance settings</div>,
}));
vi.mock("./Finance/TransactionModal", () => ({
  default: ({ isOpen, onClose, onRefresh }) =>
    isOpen ? (
      <div role="dialog">
        <button onClick={onClose}>Close transaction</button>
        <button
          onClick={() => {
            onRefresh();
            onClose();
          }}
        >
          Save transaction
        </button>
      </div>
    ) : null,
}));
vi.mock("./Settings", () => ({
  default: () => <div data-testid="module">Settings</div>,
}));
vi.mock("./MyCars/MyCars", () => ({
  default: ({ mode }) => <output data-testid="module">Cars {mode}</output>,
}));
vi.mock("./Trips/Trips", () => ({
  default: ({ mode }) => <output data-testid="module">Trips {mode}</output>,
}));
vi.mock("./Investments/Investments", () => ({
  default: ({ mode }) => (
    <output data-testid="module">Investments {mode}</output>
  ),
}));
vi.mock("./CustomLists/CustomLists", () => ({
  default: ({ mode }) => <output data-testid="module">Lists {mode}</output>,
}));
vi.mock("./CustomLists/MarkdownNotes", () => ({
  default: () => <div data-testid="module">Notes</div>,
}));
vi.mock("./Music/Music", () => ({
  default: ({ mode }) => <output data-testid="module">Music {mode}</output>,
}));
vi.mock("./MinhasFinancas/MinhasFinancas", () => ({
  default: ({ screen }) => (
    <output data-testid="module">My finances {screen}</output>
  ),
}));
vi.mock("./Launchpad", () => ({
  default: ({ onNavigate, onLogout }) => (
    <div data-testid="module">
      Launchpad
      <button onClick={() => onNavigate("health/today")}>Open health</button>
      <button onClick={onLogout}>Logout</button>
    </div>
  ),
}));
const user = { id: "owner", email: "owner@example.test" };
beforeEach(() => {
  localStorage.clear();
  state.server = createQueryServer();
  vi.clearAllMocks();
  state.path = "launchpad";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
for (const [path, text] of [
  ["finances/dashboard", "Finance summary"],
  ["finances/transactions", "Finance list"],
  ["finances/settings", "Finance settings"],
  ["settings/general", "Settings"],
  ["cars/list", "Cars list"],
  ["cars/settings", "Cars admin"],
  ["trips/list", "Trips list"],
  ["trips/itinerary", "Trips itinerary"],
  ["investments/list", "Investments list"],
  ["lists/manager", "Lists manager"],
  ["lists/settings", "Lists settings"],
  ["lists/notes", "Notes"],
  ["music/repertoire", "Music repertoire"],
  ["music/setlists", "Music setlists"],
  ["minhasfinancas/accounts", "My finances accounts"],
  ["health/exams/exam", "Health exams:exam"],
])
  it(`routes ${path} to its existing module`, () => {
    state.path = path;
    render(<Dashboard user={user} />);
    expect(screen.getByTestId("module")).toHaveTextContent(text);
  });
for (const width of [390, 800, 1280])
  it(`uses navigation and preferences at viewport ${width}`, () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(width);
    render(<Dashboard user={user} />);
    fireEvent.click(screen.getByText("Open health"));
    expect(state.navigate).toHaveBeenCalledWith("health/today");
    fireEvent.click(screen.getByText("Logout"));
    expect(state.logout).toHaveBeenCalled();
    const theme = screen.queryByTitle("dashboard.toggle_theme");
    if (theme) {
      fireEvent.click(theme);
      expect(localStorage.getItem("personal-control-theme")).toBe("light");
      fireEvent.click(screen.getByTitle("dashboard.hide_values"));
      expect(localStorage.getItem("personal-control-show-values")).toBe(
        "false",
      );
    }
  });
it("opens editing and creation transaction dialogs and closes them after success", () => {
  state.path = "finances/transactions";
  render(<Dashboard user={user} />);
  fireEvent.click(screen.getByText("Edit transaction"));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Close transaction"));
  fireEvent.click(screen.getByTitle("dashboard.new_transaction"));
  fireEvent.click(screen.getByText("Save transaction"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Toggle finance values"));
  expect(localStorage.getItem("personal-control-show-values")).toBe("false");
});
it("opens and closes the mobile module sheet and navigates every remaining module", () => {
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
  const { container } = render(<Dashboard user={user} />);
  fireEvent.click(screen.getByText("nav.more"));
  expect(container.querySelector(".bottom-sheet")).toBeInTheDocument();
  fireEvent.click(container.querySelector(".bottom-sheet-close"));
  expect(container.querySelector(".bottom-sheet")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("nav.more"));
  fireEvent.click(container.querySelector(".bottom-sheet-overlay"));
  for (const path of [
    "investments/dashboard",
    "trips/list",
    "lists/manager",
    "music/repertoire",
    "health/today",
    "settings/general",
  ]) {
    fireEvent.click(screen.getByText("nav.more"));
    const link = container.querySelector(
      `.bottom-sheet-grid a[href="/${path}"]`,
    );
    expect(link).toBeInTheDocument();
    fireEvent.click(link);
    expect(state.navigate).toHaveBeenLastCalledWith(path);
    expect(container.querySelector(".bottom-sheet")).not.toBeInTheDocument();
  }
});
it("expands tablet navigation before navigating and collapses after selection", () => {
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(800);
  const { container } = render(<Dashboard user={user} />);
  const link = container.querySelector(
    '.tablet-sidebar a[href="/health/today"]',
  );
  fireEvent.click(link);
  expect(state.navigate).not.toHaveBeenCalled();
  expect(container.querySelector(".tablet-sidebar")).toHaveClass("expanded");
  fireEvent.click(link);
  expect(state.navigate).toHaveBeenCalledWith("health/today");
  expect(container.querySelector(".tablet-sidebar")).not.toHaveClass(
    "expanded",
  );
});
for (const menuOrder of [["health", "removed"], ["finances"]])
  it(`restores server menu settings and adds required modules: ${JSON.stringify(menuOrder)}`, async () => {
    localStorage.setItem(
      "personal-control-menu-order",
      JSON.stringify(["health", "removed"]),
    );
    localStorage.setItem(
      "personal-control-visible-modules",
      JSON.stringify(["health"]),
    );
    localStorage.setItem(
      "personal-control-expanded-sections",
      JSON.stringify({}),
    );
    localStorage.setItem("personal-control-theme", "light");
    localStorage.setItem("personal-control-show-values", "false");
    state.server.tables.notification_settings = [
      { id: "prefs", menu_order: menuOrder, visible_modules: ["health"] },
    ];
    render(<Dashboard user={user} />);
    await waitFor(() => {
      const order = JSON.parse(
        localStorage.getItem("personal-control-menu-order"),
      );
      expect(order[0]).toBe(menuOrder[0]);
      expect(order).not.toContain("removed");
    });
    expect(screen.getByTitle("dashboard.show_values")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("dashboard.toggle_theme"));
    expect(localStorage.getItem("personal-control-theme")).toBe("dark");
  });
