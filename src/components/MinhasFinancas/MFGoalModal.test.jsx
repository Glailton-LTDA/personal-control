import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MFGoalModal from "./MFGoalModal";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({
  accounts: [],
  create: vi.fn(),
  update: vi.fn(),
  loading: false,
  error: false,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../../hooks/useMinhasFinancas", async (original) => ({
  ...(await original()),
  useMFAccounts: () => ({
    data: state.accounts,
    isLoading: state.loading,
    isError: state.error,
  }),
  useCreateMFGoal: () => ({ mutateAsync: state.create }),
  useUpdateMFGoal: () => ({ mutateAsync: state.update }),
}));
vi.mock("./MFIconPicker", () => ({ default: () => null }));
vi.mock("./MFColorGrid", () => ({ default: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  state.loading = false;
  state.error = false;
  state.accounts = [
    { id: "a", name: "Account A", currency: "BRL" },
    { id: "b", name: "Account B", currency: "BRL" },
  ];
  state.create.mockResolvedValue({});
  state.update.mockResolvedValue({});
});
function show(goal = null, other = {}) {
  return render(
    <MFGoalModal
      isOpen
      onClose={vi.fn()}
      user={{ id: "owner" }}
      goal={goal}
      {...other}
    />,
  );
}
function fill() {
  fireEvent.change(screen.getByTestId("mf-goal-name"), {
    target: { value: "Synthetic goal" },
  });
  fireEvent.change(screen.getByTestId("mf-goal-target-input"), {
    target: { value: "1000000" },
  });
}
it("creates a goal with two accounts and disables manual initial amount", async () => {
  show();
  fill();
  fireEvent.click(screen.getByRole("checkbox", { name: /Account A/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Account B/ }));
  expect(screen.getByTestId("mf-goal-initial")).toBeDisabled();
  fireEvent.click(screen.getByTestId("mf-goal-save"));
  await waitFor(() =>
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "owner",
        account_ids: ["a", "b"],
        target_amount: 10000,
      }),
    ),
  );
  expect(state.create.mock.calls[0][0]).not.toHaveProperty("account_id");
});
it("preserves a legacy single link while adding another account", async () => {
  show({ id: "g", name: "Legacy", target_amount: 10000, account_id: "a" });
  expect(screen.getByRole("checkbox", { name: /Account A/ })).toBeChecked();
  fireEvent.click(screen.getByRole("checkbox", { name: /Account B/ }));
  fireEvent.click(screen.getByTestId("mf-goal-save"));
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "g", account_ids: ["a", "b"] }),
    ),
  );
});
it("allows no account and re-enables manual seed after removing all links", async () => {
  show({
    id: "g",
    name: "Manual",
    target_amount: 10000,
    account_ids: ["a", "b"],
  });
  for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
  expect(screen.getByTestId("mf-goal-initial")).toBeEnabled();
  fireEvent.click(screen.getByTestId("mf-goal-save"));
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({ account_ids: [] }),
    ),
  );
});
it("rejects incompatible currencies without writing", () => {
  state.accounts[1].currency = "USD";
  show();
  fill();
  for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
  fireEvent.click(screen.getByTestId("mf-goal-save"));
  expect(toast.error).toHaveBeenCalledWith(
    "minhasfinancas.gl_accounts_currency",
  );
  expect(state.create).not.toHaveBeenCalled();
});
it("keeps the form open after a save error", async () => {
  state.create.mockRejectedValue(new Error("private internal error"));
  show();
  fill();
  fireEvent.click(screen.getByTestId("mf-goal-save"));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith("minhasfinancas.save_error"),
  );
  expect(screen.getByTestId("mf-goal-modal")).toBeVisible();
});
it.each(["loading", "error"])(
  "blocks saving when account data is %s",
  (status) => {
    state[status] = true;
    show();
    expect(screen.getByTestId("mf-goal-save")).toBeDisabled();
    expect(
      screen.getByRole(status === "error" ? "alert" : "status"),
    ).toBeVisible();
  },
);
it("validates required name and target and handles closing", () => {
  const close = vi.fn();
  show(null, { onClose: close });
  fireEvent.submit(screen.getByTestId("mf-goal-save").closest("form"));
  expect(toast.error).toHaveBeenCalledWith("minhasfinancas.cfg_name_required");
  fireEvent.change(screen.getByTestId("mf-goal-name"), {
    target: { value: "Name" },
  });
  fireEvent.submit(screen.getByTestId("mf-goal-save").closest("form"));
  expect(toast.error).toHaveBeenCalledWith("minhasfinancas.gl_target_required");
  fireEvent.click(screen.getByRole("button", { name: "minhasfinancas.close" }));
  expect(close).toHaveBeenCalled();
});

it("disables submit and account controls while saving", async () => {
  let resolve;
  state.create.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  show();
  fill();
  fireEvent.click(screen.getByTestId("mf-goal-save"));
  expect(screen.getByTestId("mf-goal-save")).toBeDisabled();
  expect(screen.getAllByRole("checkbox")[0]).toBeDisabled();
  fireEvent.click(screen.getByTestId("mf-goal-save"));
  expect(state.create).toHaveBeenCalledTimes(1);
  resolve({});
  await waitFor(() => expect(screen.getByTestId("mf-goal-save")).toBeEnabled());
});
