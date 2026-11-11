import { useState } from "react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import ItineraryManager from "./ItineraryManager";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({ confirm: true, drag: vi.fn() }));
const t = (key) => key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t, i18n: { language: "pt-BR" } }),
}));
vi.mock("../../lib/toast", () => ({
  confirmToast: (_message, accept) => (state.confirm ? accept() : undefined),
}));
vi.mock("react-hot-toast", () => ({ default: vi.fn() }));
vi.mock("./AddressInput", () => ({
  default: ({ value, onChange, onFocus, onBlur, placeholder }) => (
    <input
      value={value || ""}
      onChange={(e) =>
        onChange(
          e.target.value,
          e.target.value === "Coordinates" ? { lat: 1, lng: 2 } : undefined,
        )
      }
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
    />
  ),
}));
vi.mock("framer-motion", () => {
  const element = ({ children, className, style }) => (
    <div className={className} style={style}>
      {children}
    </div>
  );
  return {
    motion: { div: element },
    AnimatePresence: ({ children }) => children,
    useDragControls: () => ({ start: state.drag }),
    Reorder: {
      Item: element,
      Group: ({ children, onReorder, values }) => (
        <div>
          <button onClick={() => onReorder([...values].reverse())}>
            Reverse itinerary
          </button>
          {children}
        </div>
      ),
    },
  };
});
const trip = { id: "trip", start_date: "2026-01-01", end_date: "2026-01-03" };
const entry = {
  id: "entry",
  day: "2026-01-01",
  activity: "Museum",
  time: "10:00",
  location: "Street 1",
  needs_booking: false,
  is_booked: false,
  completed: false,
  notes: "",
};
function Harness({ initial = [entry], tripData = trip, onAddToTickets }) {
  const [items, setItems] = useState(initial);
  return (
    <>
      <output data-testid="items">{JSON.stringify(items)}</output>
      <ItineraryManager
        trip={tripData}
        items={items}
        onItemsChange={setItems}
        onAddToTickets={onAddToTickets}
      />
    </>
  );
}
function items() {
  return JSON.parse(screen.getByTestId("items").textContent);
}
beforeEach(() => {
  state.confirm = true;
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
for (const width of [390, 1280])
  it(`edits itinerary and booking transitions, width=${width}`, () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(width);
    const ticket = vi.fn();
    render(<Harness onAddToTickets={ticket} />);
    const activity = screen.getByPlaceholderText(
      "trips.what_to_do_placeholder",
    );
    fireEvent.focus(activity);
    fireEvent.change(activity, { target: { value: "New museum" } });
    fireEvent.blur(activity);
    fireEvent.change(document.querySelector('input[type="time"]'), {
      target: { value: "11:30" },
    });
    const address = screen.getByPlaceholderText("trips.location_placeholder");
    fireEvent.focus(address);
    fireEvent.change(address, { target: { value: "Coordinates" } });
    fireEvent.blur(address);
    fireEvent.change(screen.getByPlaceholderText("trips.notes_placeholder"), {
      target: { value: "Bring ticket" },
    });
    expect(screen.getByLabelText("common.pending")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("trips.booking_required"));
    fireEvent.click(screen.getByLabelText("common.pending"));
    expect(items()[0]).toMatchObject({
      activity: "New museum",
      time: "11:30",
      coordinates: { lat: 1, lng: 2 },
      notes: "Bring ticket",
      needs_booking: true,
      is_booked: true,
    });
    fireEvent.click(screen.getByLabelText("trips.booking_required"));
    expect(items()[0].is_booked).toBe(false);
    fireEvent.click(screen.getByTitle("trips.tickets"));
    expect(ticket).toHaveBeenCalledWith(
      expect.objectContaining({ id: "entry" }),
    );
    fireEvent.click(screen.getByText("trips.view_route"));
    expect(window.open).toHaveBeenCalledWith(
      "https://www.google.com/maps/dir/Coordinates",
      "_blank",
    );
    fireEvent.click(screen.getByTitle("trips.view_on_map"));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("query=Coordinates"),
      "_blank",
    );
    const card = activity.closest(".glass-card");
    fireEvent.click(within(card).getAllByRole("button")[0]);
    expect(items()[0].completed).toBe(true);
  });
it("sorts/reorders only the active day, preserves other days, adds and cancels/removes entries", () => {
  const initial = [
    entry,
    { ...entry, id: "late", activity: "Late", time: "15:00" },
    { ...entry, id: "early", activity: "Early", time: "08:00" },
    { ...entry, id: "none", activity: "Untimed", time: "" },
    { ...entry, id: "none2", activity: "Untimed 2", time: "" },
    { ...entry, id: "other", day: "2026-01-02", activity: "Other day" },
  ];
  render(<Harness initial={initial} />);
  fireEvent.click(screen.getByText("common.sort"));
  expect(
    items()
      .filter((x) => x.day === entry.day)
      .map((x) => x.time),
  ).toEqual(["08:00", "10:00", "15:00", "", ""]);
  expect(items().find((x) => x.id === "other").day).toBe("2026-01-02");
  fireEvent.click(screen.getByText("Reverse itinerary"));
  expect(items().filter((x) => x.day === entry.day)[0].id).toBe("none2");
  state.confirm = false;
  fireEvent.click(screen.getAllByTitle("common.delete")[0]);
  expect(items()).toHaveLength(6);
  state.confirm = true;
  fireEvent.click(screen.getAllByTitle("common.delete")[0]);
  expect(items()).toHaveLength(5);
  fireEvent.click(screen.getByText("trips.launch_activity"));
  expect(items()).toHaveLength(6);
  expect(items().at(-1)).toMatchObject({
    day: "2026-01-01",
    activity: "",
    needs_booking: false,
  });
});
it("provides ticket hint without a callback and does not open an empty route", () => {
  render(<Harness initial={[{ ...entry, activity: "", location: "" }]} />);
  fireEvent.click(screen.getByTitle("trips.tickets"));
  expect(toast).toHaveBeenCalled();
  fireEvent.click(screen.getByText("trips.view_route"));
  expect(window.open).not.toHaveBeenCalled();
});
it("handles missing dates and a saved day", () => {
  localStorage.setItem("pc_itinerary_active_day_trip", "2026-01-02");
  const { unmount } = render(
    <Harness initial={[{ ...entry, day: "2026-01-02" }]} />,
  );
  expect(
    screen.getByPlaceholderText("trips.what_to_do_placeholder").value,
  ).toBe("Museum");
  unmount();
  render(<Harness tripData={{}} initial={[]} />);
  expect(
    screen.queryByPlaceholderText("trips.what_to_do_placeholder"),
  ).not.toBeInTheDocument();
});
