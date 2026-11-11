import { useState } from "react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import AttachmentManager from "./AttachmentManager";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({
  upload: vi.fn(),
  url: vi.fn(),
  confirm: true,
}));
const t = (key) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../../lib/supabase", () => ({
  supabase: { storage: { from: () => ({ upload: state.upload }) } },
  getSignedUrl: state.url,
}));
vi.mock("../../lib/toast", () => ({
  confirmToast: (_message, accept) => (state.confirm ? accept() : undefined),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("./AddressInput", () => ({
  default: ({ value, onChange, placeholder }) => (
    <input
      value={value || ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock("./BadgeInput", () => ({
  default: ({ onChange }) => (
    <button type="button" onClick={() => onChange(["1A", "1B"])}>
      Choose seats
    </button>
  ),
}));
const entry = {
  id: "attachment",
  name: "Reservation",
  confirmation: "ABC",
  start_date: "2026-01-01",
  end_date: "2026-01-02",
  transports_type: "flight",
  seats: [],
  address: "",
  receipt_url: null,
};
function Harness({
  label = "Transportes",
  readOnly = false,
  initial = [entry],
}) {
  const [items, setItems] = useState(initial);
  return (
    <>
      <output data-testid="items">{JSON.stringify(items)}</output>
      <AttachmentManager
        label={label}
        icon={() => null}
        items={items}
        onItemsChange={setItems}
        tripId="trip"
        readOnly={readOnly}
      />
    </>
  );
}
const items = () => JSON.parse(screen.getByTestId("items").textContent);
beforeEach(() => {
  vi.clearAllMocks();
  state.confirm = true;
  state.upload.mockResolvedValue({ error: null });
  state.url.mockResolvedValue("https://example.test/private");
  vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
for (const type of ["flight", "train", "bus", "ship", "car", "generic"])
  it(`edits reservation transport ${type}`, () => {
    const { container } = render(<Harness />);
    fireEvent.click(
      screen.getByText(`trips.transport_types.${type}`.toUpperCase()),
    );
    const name = screen.getByPlaceholderText("trips.placeholders.transport");
    fireEvent.change(name, { target: { value: "Changed" } });
    fireEvent.change(
      screen.getByPlaceholderText("trips.labels.reservation_code"),
      { target: { value: "NEW" } },
    );
    const date = screen.getAllByPlaceholderText("DD/MM/AAAA");
    for (const value of ["", "1", "1203", "12032026"])
      fireEvent.change(date[0], { target: { value } });
    fireEvent.change(date[1], { target: { value: "" } });
    fireEvent.change(date[1], { target: { value: "13032026" } });
    const times = container.querySelectorAll('input[type="time"]');
    fireEvent.change(times[0], { target: { value: "10:30" } });
    fireEvent.change(times[1], { target: { value: "11:30" } });
    fireEvent.change(
      screen.getByPlaceholderText("trips.labels.notes_placeholder_detailed"),
      { target: { value: "Synthetic notes" } },
    );
    const origins = screen.queryAllByPlaceholderText(
      "trips.labels.city_station_placeholder",
    );
    if (origins.length) {
      fireEvent.change(origins[0], { target: { value: "Origin" } });
      fireEvent.change(origins[1], { target: { value: "Destination" } });
    } else if (type === "flight") {
      fireEvent.change(
        screen.getByPlaceholderText("trips.labels.iata_placeholder_origin"),
        { target: { value: "gru" } },
      );
      fireEvent.change(
        screen.getByPlaceholderText("trips.labels.iata_placeholder_dest"),
        { target: { value: "for" } },
      );
      expect(items()[0].origin).toBe("GRU");
    }
    if (screen.queryByText("Choose seats"))
      fireEvent.click(screen.getByText("Choose seats"));
    const coach = screen.queryByPlaceholderText(
      "trips.labels.coach_placeholder",
    );
    if (coach) fireEvent.change(coach, { target: { value: "2" } });
    expect(items()[0]).toMatchObject({
      name: "Changed",
      confirmation: "NEW",
      transports_type: type,
      start_date: "2026-03-12",
      end_date: "2026-03-13",
      start_time: "10:30",
      end_time: "11:30",
      notes: "Synthetic notes",
    });
  });
for (const label of ["Hospedagens", "Passeios", "Documentos", "Outros"])
  it(`renders ${label} and updates address when applicable`, () => {
    render(<Harness label={label} />);
    const address = screen.queryByPlaceholderText(
      "trips.labels.address_placeholder",
    );
    if (address) {
      fireEvent.change(address, { target: { value: "Synthetic street" } });
      expect(items()[0].address).toBe("Synthetic street");
    }
    expect(screen.getByDisplayValue("Reservation")).toBeInTheDocument();
  });
for (const failure of [false, true])
  it(`uploads and views private attachment, failure=${failure}`, async () => {
    const { container } = render(<Harness />);
    if (failure)
      state.upload.mockResolvedValueOnce({ error: new Error("synthetic") });
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: {
        files: [
          new File(["synthetic"], "reservation.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalled(),
    );
    if (!failure) {
      expect(items()[0].receipt_url).toMatch(/^receipts\/trip\//);
      fireEvent.click(screen.getByText("trips.labels.view_document"));
      await waitFor(() =>
        expect(window.open).toHaveBeenCalledWith(
          "https://example.test/private",
          "_blank",
        ),
      );
      fireEvent.click(screen.getByTitle("trips.labels.remove_attachment"));
      expect(items()[0].receipt_url).toBe(null);
    }
  });
it("prevents edits in read-only mode", () => {
  const { container } = render(<Harness readOnly />);
  expect(container.querySelector('input[type="file"]')).not.toBeInTheDocument();
  expect(
    screen.getByPlaceholderText("trips.placeholders.transport"),
  ).toBeDisabled();
});
