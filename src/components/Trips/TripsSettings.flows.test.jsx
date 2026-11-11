import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { createQueryServer } from "../../tests/queryServer";
import TripsSettings from "./TripsSettings";
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
const user = { id: "owner", email: "owner@example.test" };
const trip = {
  id: "trip",
  title: "Test trip",
  user_id: "owner",
  start_date: "2026-01-01",
  end_date: "2026-01-03",
  currencies: ["BRL", "USD"],
  participants: ["Person A"],
};
beforeEach(() => {
  state.server = createQueryServer();
  state.confirm = true;
  vi.clearAllMocks();
  state.server.tables = {
    trips: [
      trip,
      {
        ...trip,
        id: "shared",
        title: "Shared trip",
        user_id: "other",
        currencies: [],
      },
    ],
    trip_categories: [{ id: "food", name: "Food", user_id: "owner" }],
    trip_shares: [
      {
        id: "grant",
        trip_id: "shared",
        shared_by: "other",
        shared_with_email: user.email,
        trips: { title: "Shared trip", user_id: "other" },
      },
      {
        id: "outgoing",
        trip_id: "trip",
        shared_by: "owner",
        shared_with_email: "friend@example.test",
        trips: { title: "Test trip", user_id: "owner" },
      },
    ],
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function open(extra = {}) {
  const onEditTrip = vi.fn(),
    onAddTrip = vi.fn(),
    onSelectTrip = vi.fn();
  const result = render(
    <TripsSettings
      user={user}
      onEditTrip={onEditTrip}
      onAddTrip={onAddTrip}
      onSelectTrip={onSelectTrip}
      {...extra}
    />,
  );
  await screen.findByText("Test trip");
  return { ...result, onEditTrip, onAddTrip, onSelectTrip };
}
for (const width of [390, 1280])
  it(`opens trip actions at width ${width}`, async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(width);
    const { onEditTrip, onAddTrip, onSelectTrip } = await open();
    fireEvent.click(screen.getByTestId("edit-trip-btn"));
    expect(onEditTrip).toHaveBeenCalledWith(trip);
    fireEvent.click(screen.getByText("trips.new_trip"));
    expect(onAddTrip).toHaveBeenCalledOnce();
    fireEvent.click(screen.getAllByTitle("trips.dashboard_tooltip")[0]);
    expect(onSelectTrip).toHaveBeenCalled();
  });
for (const edit of [false, true])
  for (const failure of [false, true])
    it(`saves trip category: edit=${edit}, failure=${failure}`, async () => {
      await open();
      fireEvent.click(screen.getByText("trips.tabs.categories"));
      await screen.findByText("Food");
      fireEvent.click(
        edit
          ? screen.getByTitle("trips.edit")
          : screen.getByText("trips.new_category"),
      );
      const input = screen.getByPlaceholderText("trips.category_placeholder");
      fireEvent.change(input, { target: { value: "Transport" } });
      if (failure)
        state.server.failures[`trip_categories:${edit ? "update" : "insert"}`] =
          "denied";
      fireEvent.submit(input.closest("form"));
      if (failure) await waitFor(() => expect(toast.error).toHaveBeenCalled());
      else
        await waitFor(() =>
          expect(screen.getByText("Transport")).toBeInTheDocument(),
        );
    });
for (const target of ["trip", "category", "share", "exit"])
  for (const failure of [false, true])
    it(`confirms and deletes ${target}, failure=${failure}`, async () => {
      await open();
      let table = "trips",
        button;
      if (target === "category") {
        table = "trip_categories";
        fireEvent.click(screen.getByText("trips.tabs.categories"));
        button = await screen.findByTitle("trips.delete");
      } else if (target === "share") {
        table = "trip_shares";
        fireEvent.click(screen.getByText("trips.tabs.shares"));
        button = (await screen.findAllByTitle("trips.delete"))[0];
      } else if (target === "exit") {
        table = "trip_shares";
        button = screen.getByTitle("trips.exit_trip");
      } else button = screen.getByTitle("trips.delete");
      state.confirm = false;
      fireEvent.click(button);
      expect(state.server.calls.some((x) => x[1] === "delete")).toBe(false);
      state.confirm = true;
      if (failure) state.server.failures[`${table}:delete`] = "denied";
      fireEvent.click(button);
      await waitFor(() =>
        expect(failure ? toast.error : toast.success).toHaveBeenCalled(),
      );
    });
for (const failure of [false, true])
  it(`shares an owned trip, failure=${failure}`, async () => {
    await open();
    fireEvent.click(screen.getByText("trips.tabs.shares"));
    fireEvent.click(screen.getByText("trips.share_trip"));
    const email = screen.getByPlaceholderText("trips.email_placeholder");
    expect(
      email.closest("form").querySelectorAll("select option"),
    ).toHaveLength(2);
    fireEvent.change(email.closest("form").querySelector("select"), {
      target: { value: "trip" },
    });
    fireEvent.change(email, { target: { value: "new@example.test" } });
    if (failure) state.server.failures["trip_shares:insert"] = "denied";
    fireEvent.submit(email.closest("form"));
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalled(),
    );
    if (!failure)
      expect(state.server.tables.trip_shares.at(-1)).toMatchObject({
        trip_id: "trip",
        shared_with_email: "new@example.test",
        shared_by: "owner",
      });
  });
