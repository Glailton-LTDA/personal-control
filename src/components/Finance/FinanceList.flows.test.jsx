import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import FinanceList from "./FinanceList";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({
  rows: [],
  settings: null,
  confirm: true,
  remove: vi.fn(),
  paid: vi.fn(),
  update: vi.fn(),
  copy: vi.fn(),
  invoke: vi.fn(),
}));
const t = (key) => key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t, i18n: { language: "pt-BR" } }),
}));
vi.mock("../../lib/supabase", () => ({
  supabase: { functions: { invoke: state.invoke } },
}));
vi.mock("../../hooks/useFinance", () => ({
  useFinances: () => ({ data: state.rows }),
  useFinanceResponsibles: () => ({
    data: [
      {
        id: "resp",
        name: "Recipient",
        email: "recipient@example.test",
        is_main: true,
      },
      { id: "none", name: "No address" },
    ],
  }),
  useNotificationSettings: () => ({ data: state.settings }),
  useDeleteTransaction: () => ({ mutateAsync: state.remove }),
  useMarkAsPaid: () => ({ mutateAsync: state.paid }),
  useUpdateTransaction: () => ({ mutateAsync: state.update }),
  useCopyMonthTransactions: () => ({ mutateAsync: state.copy }),
}));
vi.mock("../../lib/toast", () => ({
  confirmToast: (_message, accept) => (state.confirm ? accept() : undefined),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, getItemKey, estimateSize }) => ({
    getTotalSize: () => count * 180,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: getItemKey(index),
        size: estimateSize(index),
        start: index * 180,
      })),
  }),
}));
vi.mock("./SummaryDashboard", () => ({
  default: () => <div>Summary dashboard</div>,
}));
const tx = {
  id: "pending",
  description: "Synthetic expense",
  category: "Food",
  amount: 100,
  type: "DESPESA",
  status: "PENDENTE",
  payment_date: "2026-01-02",
  responsible: "Person",
  created_at: "2026-01-01",
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("personal-control-selected-month", "0");
  localStorage.setItem("personal-control-selected-year", "2026");
  state.rows = [
    tx,
    {
      ...tx,
      id: "paid",
      description: "Other expense",
      status: "PAGO",
      amount: 200,
      category: "Transport",
      payment_date: "2026-01-01",
    },
  ];
  state.settings = null;
  state.confirm = true;
  for (const fn of [state.remove, state.paid, state.update])
    fn.mockResolvedValue({});
  state.copy.mockResolvedValue(2);
  state.invoke.mockResolvedValue({ error: null });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function open(extra = {}) {
  const onEdit = vi.fn();
  return {
    ...render(
      <FinanceList user={{ id: "owner" }} onEdit={onEdit} {...extra} />,
    ),
    onEdit,
  };
}
for (const failure of [false, true])
  it(`copies previous December and handles failure=${failure}`, async () => {
    open();
    if (failure) state.copy.mockRejectedValueOnce(new Error("synthetic"));
    fireEvent.click(screen.getByTitle("finances.copy_previous"));
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure ? "finances.error_copy" : "finances.transactions_copied",
      ),
    );
    expect(state.copy).toHaveBeenCalledWith({
      prevMonth: 11,
      prevYear: 2025,
      selectedMonth: 0,
      selectedYear: 2026,
    });
  });
for (const failure of [false, true])
  it(`deletes after confirmation, failure=${failure}`, async () => {
    open();
    state.confirm = false;
    fireEvent.click(screen.getAllByTitle("common.delete")[0]);
    expect(state.remove).not.toHaveBeenCalled();
    state.confirm = true;
    if (failure) state.remove.mockRejectedValueOnce(new Error("synthetic"));
    fireEvent.click(screen.getAllByTitle("common.delete")[0]);
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalled(),
    );
  });
for (const auto of [false, true])
  for (const failure of [false, true])
    it(`marks paid, optional receipt auto-send=${auto}, failure=${failure}`, async () => {
      state.settings = {
        auto_send_on_paid: auto,
        recipient_email: "recipient@example.test",
        bcc_email: "copy@example.test",
      };
      open();
      if (failure) state.paid.mockRejectedValueOnce(new Error("synthetic"));
      fireEvent.click(screen.getByTitle("finances.mark_as_paid"));
      await waitFor(() => expect(state.paid).toHaveBeenCalledWith("pending"));
      if (failure)
        await waitFor(() =>
          expect(toast.error).toHaveBeenCalledWith("finances.error_mark_paid"),
        );
      else if (auto) {
        await waitFor(() =>
          expect(state.invoke).toHaveBeenCalledWith(
            "send-finance-email",
            expect.objectContaining({
              body: expect.objectContaining({
                to: "recipient@example.test",
                data: expect.objectContaining({ status: "PAGO" }),
              }),
            }),
          ),
        );
      } else expect(state.invoke).not.toHaveBeenCalled();
    });
for (const failure of [false, true])
  it(`chooses a receipt recipient, failure=${failure}`, async () => {
    open();
    fireEvent.click(screen.getAllByTitle("finances.send_email")[0]);
    if (failure)
      state.invoke.mockResolvedValueOnce({ error: new Error("synthetic") });
    fireEvent.click(screen.getByText("Recipient"));
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure ? "finances.error_send_email" : "finances.email_sent_to",
      ),
    );
  });
for (const action of ["paid", "unpaid", "delete"])
  for (const failure of [false, true])
    it(`batch ${action}, failure=${failure}`, async () => {
      state.settings = {
        auto_send_on_paid: true,
        recipient_email: "recipient@example.test",
      };
      open();
      fireEvent.click(screen.getByTitle("finances.select_all"));
      const fn = action === "delete" ? state.remove : state.update;
      if (failure) fn.mockRejectedValueOnce(new Error("synthetic"));
      fireEvent.click(
        screen.getByText(
          action === "paid"
            ? "finances.mark_paid"
            : action === "unpaid"
              ? "finances.mark_unpaid"
              : "finances.delete_selected",
        ),
      );
      await waitFor(() =>
        expect(failure ? toast.error : toast.success).toHaveBeenCalled(),
      );
      if (!failure) {
        if (action === "delete") expect(fn).toHaveBeenCalledTimes(2);
        else
          expect(
            fn.mock.calls.filter(([payload]) => payload.status),
          ).toHaveLength(2);
      }
    });
it("filters by description/category, sorts both ways, masks amounts and opens summary/edit", () => {
  const { onEdit } = open({ showValues: false });
  fireEvent.click(screen.getAllByTitle("common.edit")[0]);
  expect(onEdit).toHaveBeenCalled();
  fireEvent.click(screen.getByTitle("finances.sort_by_value"));
  fireEvent.click(screen.getByTitle("finances.sort_by_value"));
  const search = screen.getByPlaceholderText("finances.filter_description");
  fireEvent.change(search, { target: { value: "transport" } });
  expect(
    screen.queryByTestId("finance-row-Synthetic expense"),
  ).not.toBeInTheDocument();
  expect(screen.getByTestId("finance-row-Other expense")).toBeInTheDocument();
  fireEvent.change(search, { target: { value: "missing" } });
  expect(
    screen.queryByTestId("finance-row-Other expense"),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("finances.tabs.summary"));
  expect(screen.getByText("Summary dashboard")).toBeInTheDocument();
});
