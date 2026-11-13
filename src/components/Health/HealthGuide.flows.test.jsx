import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HealthGuide from "./HealthGuide";
import toast from "react-hot-toast";
import {
  useTreatmentDetail,
} from "../../hooks/useTreatments";
const state = vi.hoisted(() => ({
  lists: {},
  details: {},
  treatments: {
    list: { rows: [], has_more: false },
    detail: null,
    saved: vi.fn(),
  },
  loading: false,
  error: false,
  save: vi.fn(),
  remove: vi.fn(),
  snooze: vi.fn(),
  dismiss: vi.fn(),
  sync: { isSuccess: true },
  queries: [],
}));
const t = (key) => key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t, i18n: { language: "en" } }),
}));
vi.mock("../../lib/health", async (original) => ({
  ...(await original()),
  saveHealth: state.save,
  deleteHealth: state.remove,
  snoozeHealth: state.snooze,
  dismissHealth: state.dismiss,
}));
vi.mock("../../hooks/useHealth", () => ({
  useHealthDetail: (_user, kind, id) => ({
    data: state.details[id] || state.details[kind],
    isLoading: state.loading,
    isError: state.error,
    error: new Error("synthetic"),
    refetch: vi.fn(),
  }),
  useHealthList: (_user, kind, options) => {
    state.queries.push([kind, options]);
    return {
      data: { rows: state.lists[kind] || [], hasNext: true },
      isLoading: state.loading,
      isError: state.error,
      error: new Error("synthetic"),
      refetch: vi.fn(),
    };
  },
  useHealthReminderSync: () => state.sync,
  useHealthSearch: (value) => value,
}));
vi.mock("../../hooks/useTreatments", () => ({
  useTreatmentList: () => ({
    data: state.treatments.list,
    isLoading: state.loading,
    isError: state.error,
    refetch: vi.fn(),
  }),
  useTreatmentDetail: () => ({
    data:
      state.treatments.detail || {
        medication: {
          id: "record",
          name: "Synthetic treatment",
          status: "active",
          dose: "1",
        },
        schedule: null,
        stats: { taken_total: 0, overdue: 0, due_recent: 0 },
        today: [],
        next: [],
      },
    isLoading: state.loading,
    isError: state.error,
    refetch: vi.fn(),
  }),
  useSaveTreatment: () => ({
    mutate: vi.fn((values, onSuccess) => {
      state.treatments.saved(values);
      if (onSuccess) onSuccess({ id: "saved" });
    }),
    isPending: false,
  }),
}));
vi.mock("./HealthForm", () => ({
  default: ({ kind, initial, onClose, onSaved }) => (
    <div role="dialog">
      <output>
        {kind}:{JSON.stringify(initial)}
      </output>
      <button onClick={onClose}>Close form</button>
      <button onClick={() => onSaved("saved")}>Save form</button>
    </div>
  ),
}));
vi.mock("./TreatmentForm", () => ({
  default: ({ record, onClose, onSaved }) => (
    <div role="dialog">
      <output>treatment:{JSON.stringify(record)}</output>
      <button onClick={onClose}>Close form</button>
      <button onClick={() => onSaved("saved")}>Save form</button>
    </div>
  ),
}));
vi.mock("./TreatmentList", () => ({
  default: ({ navigate }) => {
    const rows = state.treatments.list.rows || [];
    return (
      <div data-testid="treatment-list">
        {rows.map((record) => (
          <div
            key={record.id}
            onClick={() => navigate(`health/treatments/${record.id}`)}
            role="button"
          >
            {record.name}
          </div>
        ))}
      </div>
    );
  },
}));
vi.mock("./TreatmentDetail", () => {
  function TreatmentDetailMock({ userId, medicationId, navigate, onForm }) {
    const { data } = useTreatmentDetail(userId, medicationId);
    const medication = data?.medication;
    return (
      <div data-testid="treatment-detail">
        <button
          className="btn-secondary health-back"
          onClick={() => navigate("health/treatments")}
        >
          health.back
        </button>
        <h2>{medication?.name}</h2>
        <span>{medication?.dose}</span>
        {onForm && (
          <button onClick={() => onForm({ kind: "medications", record: medication })}>
            health.edit_treatment
          </button>
        )}
      </div>
    );
  }
  return { default: TreatmentDetailMock };
});
vi.mock("./HealthDocuments", () => ({
  default: ({ imageOnly }) => (
    <div>{imageOnly ? "Image attachments" : "Document attachments"}</div>
  ),
}));
vi.mock("./HealthResults", () => ({ default: () => <div>Exam results</div> }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
const record = {
  id: "record",
  name: "Synthetic record",
  status: "scheduled",
  starts_at: "2026-01-01T10:00:00Z",
  performed_at: "2026-01-01T10:00:00Z",
  times: ["08:00:00"],
  address: "Test street",
  dose: "1 pill",
  professional: "Doctor",
  notes: "Notes",
};
beforeEach(() => {
  state.lists = {};
  state.details = {};
  state.treatments.list.rows = [];
  state.loading = false;
  state.error = false;
  state.sync = { isSuccess: true };
  state.queries = [];
  vi.clearAllMocks();
  state.save.mockResolvedValue({});
  state.remove.mockResolvedValue({});
  state.snooze.mockResolvedValue({});
  state.dismiss.mockResolvedValue({});
});
afterEach(cleanup);
function open(props = {}) {
  const navigate = vi.fn(),
    client = new QueryClient();
  return {
    ...render(
      <QueryClientProvider client={client}>
        <HealthGuide user={{ id: "owner" }} navigate={navigate} {...props} />
      </QueryClientProvider>,
    ),
    navigate,
    client,
  };
}
for (const kind of ["conditions", "appointments", "medications", "exams"])
  it(`filters, opens and creates ${kind}`, () => {
    state.lists[kind] = [record];
    if (kind === "medications") state.treatments.list.rows = [record];
    const { navigate } = open({ screen: kind });
    if (kind !== "medications") {
      fireEvent.change(screen.getByLabelText("health.search"), {
        target: { value: "search" },
      });
      fireEvent.change(screen.getByLabelText("health.status"), {
        target: {
          value:
            kind === "conditions"
              ? "chronic"
              : kind === "medications"
                ? "active"
                : "completed",
        },
      });
      expect(state.queries.at(-1)[1]).toMatchObject({
        search: "search",
        page: 0,
      });
    }
    fireEvent.click(screen.getByText("Synthetic record"));
    expect(
      navigate,
    ).toHaveBeenCalledWith(
      kind === "medications" ? "health/treatments/record" : `health/${kind}/record`,
    );
    fireEvent.click(screen.getByText(`health.new_${kind}`));
    fireEvent.click(screen.getByText("Close form"));
    fireEvent.click(screen.getByText(`health.new_${kind}`));
    fireEvent.click(screen.getByText("Save form"));
    expect(
      navigate,
    ).toHaveBeenCalledWith(
      kind === "medications" ? "health/treatments/saved" : `health/${kind}/saved`,
    );
  });
for (const kind of ["conditions", "appointments", "medications", "exams"])
  it(`shows ${kind} details, attachments, history and edit`, () => {
    state.details[kind] = {
      ...record,
      status: kind === "medications" ? "active" : record.status,
      follow_up_of: kind === "appointments" ? "original" : null,
      condition_id: "condition",
    };
    state.details.condition = {
      ...record,
      id: "condition",
      name: "Condition",
      diagnosed_on: "2026-01-01",
    };
    state.details.original = {
      ...record,
      id: "original",
      name: "Original appointment",
    };
    state.lists.doses = [
      {
        ...record,
        medication: { name: "Medication" },
        scheduled_at: record.starts_at,
        taken_at: record.starts_at,
        amount: "1",
      },
    ];
    const { navigate } = open({ screen: kind, detailId: "record" });
    if (kind === "appointments") {
      expect(
        screen.getByRole("link", { name: "health.open_gps" }),
      ).toHaveAttribute("href", expect.stringContaining("Test%20street"));
      fireEvent.click(screen.getByText("health.schedule_follow_up"));
      expect(screen.getByRole("dialog")).toHaveTextContent("appointments");
      fireEvent.click(screen.getByText("Close form"));
    }
    if (kind !== "medications") {
      fireEvent.click(
        screen.getAllByRole("button", { name: "health.edit", exact: true })[0],
      );
      fireEvent.click(screen.getByText("Close form"));
    }
    if (kind !== "medications") {
      fireEvent.click(
        screen.getByRole("button", { name: "health.documents", exact: true }),
      );
      expect(screen.getByText("Document attachments")).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: "health.history", exact: true }),
      );
    }
    if (kind === "medications") {
      expect(screen.getByText("Synthetic treatment")).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: "health.edit_treatment" }),
      );
      fireEvent.click(screen.getByText("Close form"));
    }
    if (kind === "exams") {
      fireEvent.click(screen.getByRole("button", { name: "health.images" }));
      expect(screen.getByText("Image attachments")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "health.results" }));
      expect(screen.getByText("Exam results")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "health.report" }));
      expect(screen.getByText("health.no_information")).toBeInTheDocument();
    }
    fireEvent.click(screen.getByText("health.back"));
    expect(
      navigate,
    ).toHaveBeenCalledWith(
      kind === "medications" ? "health/treatments" : `health/${kind}`,
    );
  });
for (const failure of [false, true])
  it(`completes appointment, failure=${failure}`, async () => {
    state.details.appointments = record;
    if (failure) state.save.mockRejectedValueOnce(new Error("synthetic"));
    open({ screen: "appointments", detailId: "record" });
    fireEvent.click(screen.getByText("health.complete_appointment"));
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalled(),
    );
    expect(state.save).toHaveBeenCalledWith(
      "owner",
      "appointments",
      { status: "completed" },
      "record",
    );
  });
for (const failure of [false, true])
  it(`cancels or confirms deletion, failure=${failure}`, async () => {
    state.details.conditions = record;
    const { navigate } = open({ screen: "conditions", detailId: "record" });
    fireEvent.click(screen.getByRole("button", { name: "health.delete" }));
    fireEvent.click(screen.getByText("health.cancel"));
    expect(state.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "health.delete" }));
    if (failure) state.remove.mockRejectedValueOnce(new Error("synthetic"));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "health.delete",
      }),
    );
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalled(),
    );
    if (!failure) expect(navigate).toHaveBeenCalledWith("health/conditions");
  });
for (const mode of ["loading", "error", "empty"])
  it(`renders ${mode} state and requires authentication`, () => {
    state.loading = mode === "loading";
    state.error = mode === "error";
    const { unmount } = open({ screen: "exams" });
    expect(screen.queryByText("Synthetic record")).not.toBeInTheDocument();
    unmount();
    open({ user: null });
    expect(screen.getByRole("alert")).toHaveTextContent("health.auth_required");
  });
for (const failure of [false, true])
  it(`snoozes and dismisses a reminder, failure=${failure}`, async () => {
    state.lists.reminders = [
      {
        id: "reminder",
        medication_id: "med",
        medication: { name: "Medication", dose: "1" },
        remind_at: "2026-01-01T10:00:00Z",
        scheduled_at: "2026-01-01T10:00:00Z",
      },
    ];
    open();
    fireEvent.click(screen.getByText("health.record_dose"));
    expect(screen.getByRole("dialog")).toHaveTextContent("medication_id");
    fireEvent.click(screen.getByText("Close form"));
    if (failure) state.snooze.mockRejectedValueOnce(new Error("synthetic"));
    fireEvent.click(screen.getByText("health.snooze"));
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalled(),
    );
    expect(state.snooze).toHaveBeenCalledWith(
      "owner",
      "reminder",
      10,
      "2026-01-01T10:00:00Z",
    );
  });
for (const kind of ["appointments", "exams"])
  it(`navigates a ${kind} reminder and dismisses it`, async () => {
    state.lists.reminders = [
      {
        id: "reminder",
        [kind === "appointments" ? "appointment_id" : "exam_id"]: "record",
        remind_at: "2099-01-01T10:00:00Z",
        scheduled_at: "2099-01-01T10:00:00Z",
      },
    ];
    const { navigate } = open();
    fireEvent.click(screen.getByText("health.view"));
    expect(navigate).toHaveBeenCalledWith(`health/${kind}/record`);
    fireEvent.click(screen.getByText("health.dismiss"));
    await waitFor(() =>
      expect(state.dismiss).toHaveBeenCalledWith("owner", "reminder"),
    );
  });
for (const status of ["loading", "error"])
  it(`shows ${status} while the reminder synchronization is unavailable`, () => {
    state.sync = {
      isLoading: status === "loading",
      isError: status === "error",
      error: new Error("synthetic"),
      refetch: vi.fn(),
    };
    open();
    expect(screen.queryByText("health.snooze")).not.toBeInTheDocument();
  });
for (const kind of ["medications", "appointments", "conditions"])
  it(`renders sparse ${kind} details and nullable links`, () => {
    state.details[kind] = {
      ...record,
      times: [],
      starts_on: null,
      ends_on: null,
      diagnosed_on: null,
      dose: "",
      professional: "",
      notes: "",
      address: "",
      status: "cancelled",
      condition_id: "missing",
      appointment_id: "missing",
    };
    open({ screen: kind, detailId: "record" });
    if (kind !== "medications") {
      expect(screen.getAllByText("health.no_information").length).toBeGreaterThan(
        0,
      );
    }
    expect(screen.queryByText("health.open_gps")).not.toBeInTheDocument();
    if (kind === "appointments")
      expect(
        screen.queryByText("health.schedule_follow_up"),
      ).not.toBeInTheDocument();
  });
