import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import ExpenseModal from "./ExpenseModal";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
  url: vi.fn(),
}));
const t = (key) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../../lib/supabase", () => ({
  supabase: { storage: { from: () => ({ upload: state.upload }) } },
  getSignedUrl: state.url,
}));
vi.mock("../../hooks/useOfflineTrips", () => ({
  useOfflineCategories: () => ({ data: [{ id: "food", name: "Food" }] }),
  useOfflineCreateExpense: () => ({ mutateAsync: state.create }),
  useOfflineUpdateExpense: () => ({ mutateAsync: state.update }),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
const trip = {
  id: "trip",
  start_date: "2026-01-01",
  end_date: "2026-01-03",
  currencies: ["BRL", "USD"],
  participants: ["Person A", "Person B"],
};
beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem(
    "draft_trip_expense_form",
    JSON.stringify({
      description: "",
      amount: "",
      date: "2026-01-01",
      paid_by: "Person A",
      category_id: "",
      currency: "BRL",
      receipt_url: null,
    }),
  );
  vi.clearAllMocks();
  state.create.mockResolvedValue({});
  state.update.mockResolvedValue({});
  state.upload.mockResolvedValue({ error: null });
  state.url.mockResolvedValue("https://example.test/private");
  vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function open(extra = {}) {
  const onSave = vi.fn(),
    onClose = vi.fn();
  return {
    ...render(
      <ExpenseModal
        user={{ id: "owner" }}
        trip={trip}
        onClose={onClose}
        onSave={onSave}
        {...extra}
      />,
    ),
    onSave,
    onClose,
  };
}
for (const edit of [false, true])
  for (const failure of [false, true])
    it(`saves expense: edit=${edit}, failure=${failure}`, async () => {
      const { container, onSave } = open({
        expense: edit
          ? {
              id: "expense",
              description: "Old",
              date: "2026-01-01",
              amount: 10,
            }
          : undefined,
      });
      fireEvent.change(
        screen.getByPlaceholderText("trips.description_placeholder"),
        { target: { value: "Dinner" } },
      );
      fireEvent.change(screen.getByPlaceholderText("0,00"), {
        target: { value: "12345" },
      });
      const selects = screen.getAllByRole("combobox");
      fireEvent.change(selects[0], { target: { value: "USD" } });
      fireEvent.change(selects[1], { target: { value: "02/01/2026" } });
      fireEvent.change(selects[2], { target: { value: "food" } });
      fireEvent.change(selects[3], { target: { value: "Person A" } });
      const mutate = edit ? state.update : state.create;
      if (failure) mutate.mockRejectedValueOnce(new Error("synthetic"));
      fireEvent.submit(container.querySelector("form"));
      await waitFor(() =>
        expect(mutate).toHaveBeenCalledWith(
          expect.objectContaining({
            user_id: "owner",
            trip_id: "trip",
            description: "Dinner",
            amount: 123.45,
            currency: "USD",
            date: "2026-01-02",
            paid_by: "Person A",
            category_id: "food",
          }),
        ),
      );
      if (failure) {
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(onSave).not.toHaveBeenCalled();
      } else await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    });
it("accepts a custom date and responsible, validates incomplete/invalid date and amount", async () => {
  const { container } = open();
  const selects = screen.getAllByRole("combobox");
  fireEvent.change(selects[1], { target: { value: "CUSTOM" } });
  const date = screen.getByPlaceholderText("common.date_placeholder");
  for (const value of ["", "1", "123", "99999999"]) {
    fireEvent.change(date, { target: { value } });
    fireEvent.submit(container.querySelector("form"));
    expect(toast.error).toHaveBeenLastCalledWith("trips.invalid_date");
  }
  fireEvent.change(date, { target: { value: "04012026" } });
  fireEvent.submit(container.querySelector("form"));
  expect(toast.error).toHaveBeenLastCalledWith("trips.invalid_amount");
  fireEvent.change(screen.getByPlaceholderText("0,00"), {
    target: { value: "1000" },
  });
  fireEvent.change(selects[3], { target: { value: "CUSTOM" } });
  fireEvent.change(
    screen.getByPlaceholderText("trips.responsible_placeholder"),
    { target: { value: "Visitor" } },
  );
  fireEvent.submit(container.querySelector("form"));
  await waitFor(() =>
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({
        date: "2026-01-04",
        paid_by: "Visitor",
        amount: 10,
      }),
    ),
  );
});
for (const failure of [false, true])
  it(`uploads, views and removes a receipt, failure=${failure}`, async () => {
    const { container } = open();
    if (failure)
      state.upload.mockResolvedValueOnce({ error: new Error("synthetic") });
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: {
        files: [
          new File(["synthetic"], "receipt.pdf", { type: "application/pdf" }),
        ],
      },
    });
    if (failure) {
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(
        screen.queryByText("trips.view_receipt_btn"),
      ).not.toBeInTheDocument();
      return;
    }
    const view = await screen.findByText("trips.view_receipt_btn");
    fireEvent.click(view);
    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith(
        "https://example.test/private",
        "_blank",
      ),
    );
    fireEvent.click(view.parentElement.querySelectorAll("button")[1]);
    expect(
      screen.queryByText("trips.view_receipt_btn"),
    ).not.toBeInTheDocument();
  });
it("handles absent trip and empty initial expense fields without throwing", () => {
  const { container } = open({ trip: null, expense: {} });
  fireEvent.submit(container.querySelector("form"));
  expect(toast.error).toHaveBeenCalledWith("trips.select_trip_first");
});
