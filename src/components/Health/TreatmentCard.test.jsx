import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TreatmentCard from "./TreatmentCard";
const mocks = vi.hoisted(() => ({
  take: vi.fn(),
  undo: vi.fn(),
  state: vi.fn(),
  busy: false,
  editData: null,
}));
vi.mock("../../hooks/useTreatments", () => ({
  useTreatmentDetail: () => ({
    isSuccess: Boolean(mocks.editData),
    data: mocks.editData,
  }),
  useRecordDose: () => ({ mutateAsync: mocks.take, isPending: mocks.busy }),
  useUndoDose: () => ({ mutateAsync: mocks.undo }),
  useTreatmentState: () => ({ mutateAsync: mocks.state }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "pt" },
    t: (key, params) =>
      params?.time
        ? `${params.time} ${params.status}`
        : params?.name
          ? `${key} ${params.name}`
          : key,
  }),
}));
const slot = (status, hour, version = 0) => ({
  status,
  scheduled_at: `2026-11-23T${hour}:00Z`,
  planned_amount: "1 tablet",
  record_version: version,
});
const row = {
  id: "m1",
  name: "Synthetic",
  dose: "1 tablet",
  status: "active",
  row_version: 3,
  timezone: "UTC",
  schedule: { mode: "interval", interval_minutes: 480, timezone: "UTC" },
  total_predicted: 21,
  taken_total: 1,
  today: {
    slots: [
      slot("taken", "06:00", 2),
      slot("missed", "14:00"),
      slot("scheduled", "22:00"),
    ],
  },
  next_at: "2026-11-23T22:00:00Z",
};
const renderCard = (record = row, props = {}) =>
  render(
    <TreatmentCard
      record={record}
      userId="owner"
      navigate={vi.fn()}
      {...props}
    />,
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.busy = false;
  mocks.editData = null;
  vi.spyOn(Date, "now").mockReturnValue(
    new Date("2026-11-23T17:00:00Z").getTime(),
  );
  mocks.take.mockResolvedValue({});
  mocks.undo.mockResolvedValue({});
  mocks.state.mockResolvedValue({});
});
describe("dose cards", () => {
  it("shows dose states, disables future doses, and preserves detail/edit navigation", async () => {
    const navigate = vi.fn(),
      onForm = vi.fn();
    renderCard(row, { navigate, onForm });
    expect(
      screen.getByRole("button", { name: "22:00 health.status_scheduled" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "06:00 health.status_taken" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Synthetic" }));
    expect(navigate).toHaveBeenCalledWith("health/medications/m1");
    fireEvent.click(
      screen.getByRole("button", { name: "health.view_treatment" }),
    );
    expect(navigate).toHaveBeenCalledTimes(2);
    mocks.editData = {
      medication: { ...row, notes: "Keep existing notes" },
      schedule: row.schedule,
    };
    fireEvent.click(
      screen.getByRole("button", {
        name: "health.edit_named_treatment Synthetic",
      }),
    );
    await waitFor(() =>
      expect(onForm).toHaveBeenCalledWith({
        kind: "medications",
        record: { ...row, notes: "Keep existing notes" },
      }),
    );
  });
  it("requires explicit confirmation and sends owner mutation with version and scheduled instant", async () => {
    renderCard();
    fireEvent.click(
      screen.getByRole("button", { name: "14:00 health.dose_overdue" }),
    );
    expect(mocks.take).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "health.confirm" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mocks.take).toHaveBeenCalledWith(
      expect.objectContaining({
        medicationId: "m1",
        scheduledAt: "2026-11-23T14:00:00Z",
        status: "taken",
        requestId: expect.any(String),
        options: {
          expectedVersion: 0,
          takenAt: expect.any(String),
          amount: "1 tablet",
        },
      }),
    );
  });
  it("does not mutate when cancelled or closed with Escape", () => {
    renderCard();
    fireEvent.click(
      screen.getByRole("button", { name: "14:00 health.dose_overdue" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "health.cancel" }));
    expect(mocks.take).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "14:00 health.dose_overdue" }),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it.each(["taken", "skipped"])(
    "undoes a %s record with its actual version",
    async (status) => {
      renderCard({ ...row, today: { slots: [slot(status, "06:00", 2)] } });
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp("06:00") }),
      );
      fireEvent.click(screen.getByRole("button", { name: "health.confirm" }));
      await waitFor(() =>
        expect(mocks.undo).toHaveBeenCalledWith(
          expect.objectContaining({
            expectedVersion: 2,
            medicationId: "m1",
            requestId: expect.any(String),
          }),
        ),
      );
    },
  );
  it("keeps a failed command stable across retries and translates server errors", async () => {
    mocks.take.mockRejectedValueOnce(new Error("version_conflict"));
    renderCard();
    fireEvent.click(
      screen.getByRole("button", { name: "14:00 health.dose_overdue" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "health.confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "health.version_conflict",
    );
    fireEvent.click(screen.getByRole("button", { name: "health.confirm" }));
    await waitFor(() => expect(mocks.take).toHaveBeenCalledTimes(2));
    expect(mocks.take.mock.calls[1][0]).toEqual(mocks.take.mock.calls[0][0]);
  });
  it("supports ending a treatment after confirmation with optimistic concurrency", async () => {
    renderCard();
    fireEvent.click(
      screen.getByRole("button", { name: "health.treatment_finish" }),
    );
    expect(screen.getByText("health.finish_impact")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "health.confirm" }));
    await waitFor(() =>
      expect(mocks.state).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "finish",
          options: { expectedVersion: 3 },
        }),
      ),
    );
  });
  it("renders continuous legacy/empty cards and last-dose information", () => {
    renderCard({
      ...row,
      total_predicted: null,
      schedule: null,
      today: null,
      next_at: null,
      last_taken_at: "2026-11-23T06:00:00Z",
    });
    expect(
      screen.getByText("health.treatment_duration_continuous"),
    ).toBeVisible();
    expect(screen.getByText("health.treatment_no_slots")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText(/health.last_taken/)).toBeVisible();
  });
  it("shows finite end date and prevents edits to completed/canceled dose records", () => {
    renderCard({
      ...row,
      status: "finished",
      ends_on: "2026-11-27",
      today: { slots: [slot("canceled", "06:00")] },
    });
    expect(
      screen.queryByRole("button", { name: "health.treatment_finish" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /06:00/ })).toBeDisabled();
    expect(screen.getByText(/health.ends_on/)).toBeVisible();
  });
  it("disables actions during mutations", () => {
    mocks.busy = true;
    renderCard();
    expect(
      screen.getByRole("button", { name: "14:00 health.dose_overdue" }),
    ).toBeDisabled();
  });
});
