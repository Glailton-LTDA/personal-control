import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PushMedicationPrivacy from "./PushMedicationPrivacy";
import {
  readMedicationPushPrivacy,
  saveMedicationPushPrivacy,
} from "../lib/pushPrivacy";
vi.mock("../lib/pushPrivacy", () => ({
  readMedicationPushPrivacy: vi.fn(),
  saveMedicationPushPrivacy: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));
function setup(userId = "owner") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <PushMedicationPrivacy userId={userId} />
      </QueryClientProvider>,
    ),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  readMedicationPushPrivacy.mockResolvedValue(false);
  saveMedicationPushPrivacy.mockImplementation(async (_, value) => value);
});
it("defaults off and persists explicit opt-in then opt-out", async () => {
  setup();
  const box = screen.getByRole("checkbox");
  await waitFor(() => expect(box).toBeEnabled());
  expect(box).not.toBeChecked();
  fireEvent.click(box);
  await waitFor(() => expect(box).toBeChecked());
  expect(saveMedicationPushPrivacy).toHaveBeenCalledWith("owner", true);
  fireEvent.click(box);
  await waitFor(() => expect(box).not.toBeChecked());
  expect(saveMedicationPushPrivacy).toHaveBeenCalledWith("owner", false);
});
it("does not present a failed save as enabled", async () => {
  saveMedicationPushPrivacy.mockRejectedValue(new Error("internal private"));
  setup();
  const box = screen.getByRole("checkbox");
  await waitFor(() => expect(box).toBeEnabled());
  fireEvent.click(box);
  expect(await screen.findByRole("alert")).toHaveTextContent("push.error");
  expect(box).not.toBeChecked();
  expect(screen.queryByText("internal private")).not.toBeInTheDocument();
});
it("blocks interaction during loading and save", async () => {
  let resolveRead, resolveSave;
  readMedicationPushPrivacy.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
  );
  saveMedicationPushPrivacy.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
  );
  setup();
  const box = screen.getByRole("checkbox");
  expect(box).toBeDisabled();
  resolveRead(false);
  await waitFor(() => expect(box).toBeEnabled());
  fireEvent.click(box);
  await waitFor(() => expect(box).toBeDisabled());
  resolveSave(true);
  await waitFor(() => expect(box).toBeChecked());
});
it("recovers from a read failure without enabling details", async () => {
  readMedicationPushPrivacy.mockRejectedValue(new Error("offline"));
  setup();
  expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toBeVisible();
  expect(screen.getByRole("checkbox")).toBeDisabled();
  readMedicationPushPrivacy.mockResolvedValue(false);
  fireEvent.click(screen.getByRole("button", { name: "push.retry" }));
  await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled());
});
it("does not read another account or query without authentication", () => {
  setup(null);
  expect(screen.getByRole("checkbox")).toBeDisabled();
  expect(readMedicationPushPrivacy).not.toHaveBeenCalled();
});
