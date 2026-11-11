import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { createQueryServer } from "../../tests/queryServer";
import { db } from "../../lib/offline/db";
import TripsStats from "./TripsStats";
const state = vi.hoisted(() => ({ server: null }));
const t = (key) => key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t, i18n: { language: "pt-BR" } }),
}));
vi.mock("../../lib/supabase", () => ({
  supabase: { from: (table) => state.server.from(table) },
}));
vi.mock("react-simple-maps", () => ({
  ComposableMap: ({ children }) => <div>{children}</div>,
  ZoomableGroup: ({ children }) => <div>{children}</div>,
  Geographies: ({ children }) => <div>{children({ geographies: [] })}</div>,
  Geography: () => null,
  Marker: ({ children }) => <div data-testid="map-marker">{children}</div>,
}));
const trips = [
  {
    id: "trip",
    countries: ["Brasil", "Portugal", "Vaticano", "Unknown"],
    cities: [
      "Fortaleza, Brasil",
      "Lisboa, Portugal",
      "lisboa, Portugal",
      "Portugal",
      "",
      "Unknown",
      null,
      17,
    ],
    start_date: "2026-01-01",
    end_date: "2026-01-03",
  },
  {
    id: "empty",
    countries: null,
    cities: ["Unattributed"],
    start_date: "2026-01-03",
    end_date: "2026-01-01",
  },
];
const itinerary = [
  {
    id: "a",
    trip_id: "trip",
    coordinates: [-38.5, -3.7],
    location: "Start",
    transportation: "car",
  },
  {
    id: "b",
    trip_id: "trip",
    coordinates: [-38.4, -3.6],
    activity: "End",
    transportation: "car",
  },
  {
    id: "c",
    trip_id: "trip",
    coordinates: [-38.3, -3.5],
    transportation: "walk",
  },
  { id: "d", trip_id: "empty", coordinates: null },
];
beforeEach(async () => {
  state.server = createQueryServer();
  state.server.tables.trip_itinerary = itinerary;
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await db.trip_itinerary.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
for (const mode of ["online", "offline", "server-error"])
  it(`aggregates trips and caches/falls back to itineraries: ${mode}`, async () => {
    if (mode === "offline")
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    if (mode === "server-error")
      state.server.failures["trip_itinerary:select"] = "denied";
    if (mode !== "online") await db.trip_itinerary.bulkPut(itinerary);
    const onBack = vi.fn();
    const { container } = render(<TripsStats trips={trips} onBack={onBack} />);
    await waitFor(() =>
      expect(container.querySelector(".countries-card")).toBeInTheDocument(),
    );
    expect(await screen.findAllByTestId("map-marker")).toHaveLength(3);
    fireEvent.click(screen.getByText("trips.see_all"));
    fireEvent.click(screen.getByText("trips.continents.Europe"));
    expect(container.querySelectorAll(".country-card-full")).toHaveLength(2);
    fireEvent.click(screen.getByText("Portugal"));
    expect(container.querySelector(".country-modal-content")).toHaveTextContent(
      "Lisboa",
    );
    fireEvent.click(screen.getByText("common.cancel"));
    fireEvent.click(screen.getByText("common.months.all"));
    expect(container.querySelectorAll(".country-card-full")).toHaveLength(4);
    fireEvent.click(screen.getByText("Vaticano"));
    expect(container.querySelector(".country-modal-content")).toHaveTextContent(
      "Vaticano",
    );
    fireEvent.click(container.querySelector(".close-modal-btn"));
    fireEvent.click(screen.getByTestId("back-to-trips-btn"));
    fireEvent.click(screen.getByTestId("back-to-trips-btn"));
    expect(onBack).toHaveBeenCalledOnce();
  });
it("shows an empty journey for no trips", () => {
  render(<TripsStats trips={[]} />);
  expect(screen.queryByText("trips.see_all")).not.toBeInTheDocument();
});
