import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { createQueryServer } from "../../tests/queryServer";
import CarModal from "./CarModal";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({ server: null }));
const t = (key) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../../lib/supabase", () => ({
  supabase: { from: (table) => state.server.from(table) },
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
const car = { id: "car", name: "Test car", plate: "ABC1234", current_km: 1000 };
beforeEach(() => {
  state.server = createQueryServer();
  state.server.tables.cars = [car];
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);
function open(type, extra = {}) {
  const onSuccess = vi.fn(),
    onClose = vi.fn();
  return {
    ...render(
      <CarModal
        isOpen
        type={type}
        car={car}
        user={{ id: "owner" }}
        onSuccess={onSuccess}
        onClose={onClose}
        maintenance={[]}
        {...extra}
      />,
    ),
    onSuccess,
    onClose,
  };
}
for (const type of ["add_car", "edit_car"])
  for (const failure of [false, true])
    it(`${type}: persists vehicle data, failure=${failure}`, async () => {
      const { container, onSuccess } = open(type);
      fireEvent.change(
        screen.getByPlaceholderText("cars.vehicle_placeholder"),
        { target: { value: "Changed car" } },
      );
      const texts = container.querySelectorAll('input[type="text"]');
      fireEvent.change(texts[1], { target: { value: "XYZ1234" } });
      fireEvent.change(container.querySelector('input[type="number"]'), {
        target: { value: "2500" },
      });
      fireEvent.click(
        container.querySelector('input[type="checkbox"]').parentElement,
      );
      const operation = type === "add_car" ? "insert" : "update";
      if (failure) state.server.failures[`cars:${operation}`] = "denied";
      fireEvent.click(container.querySelector(".btn-primary"));
      await waitFor(() =>
        expect(state.server.calls.some((x) => x[1] === operation)).toBe(true),
      );
      if (!failure) {
        await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
        expect(
          state.server.tables.cars.find((x) => x.name === "Changed car"),
        ).toMatchObject({
          plate: "XYZ1234",
          current_km: 2500,
          is_hidden: true,
        });
      } else expect(onSuccess).not.toHaveBeenCalled();
    });
for (const type of ["log_service", "free_service"])
  for (const failure of [false, true])
    for (const km of [500, 2000])
      it(`${type}: service km ${km}, failure=${failure}`, async () => {
        const { container, onSuccess } = open(type);
        expect(container.querySelector(".btn-primary")).toBeDisabled();
        fireEvent.change(
          screen.getByPlaceholderText("cars.service_placeholder"),
          { target: { value: " Oil change " } },
        );
        fireEvent.change(container.querySelector('input[type="number"]'), {
          target: { value: String(km) },
        });
        fireEvent.change(container.querySelector('input[type="date"]'), {
          target: { value: "2026-01-03" },
        });
        fireEvent.change(screen.getByPlaceholderText("0,00"), {
          target: { value: "12550" },
        });
        if (type === "free_service")
          fireEvent.change(
            screen.getByPlaceholderText("cars.notes_placeholder"),
            { target: { value: "Synthetic note" } },
          );
        else {
          fireEvent.click(screen.getByText("cars.revisions.status_pending"));
          fireEvent.click(screen.getByText("cars.revisions.status_ignored"));
          fireEvent.click(screen.getByText("cars.revisions.status_done"));
        }
        const table =
          type === "log_service" ? "car_maintenance" : "car_services";
        if (failure)
          state.server.failures[
            `${table}:${type === "log_service" ? "upsert" : "insert"}`
          ] = "denied";
        fireEvent.click(container.querySelector(".btn-primary"));
        await waitFor(() =>
          expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
            failure
              ? "cars.errors.service_log_failed"
              : "cars.success.service_logged",
          ),
        );
        if (!failure) {
          expect(onSuccess).toHaveBeenCalledOnce();
          expect(state.server.tables[table][0]).toMatchObject({
            car_id: "car",
            description: "Oil change",
            amount: 125.5,
            service_date: "2026-01-03",
          });
          if (type === "log_service")
            expect(state.server.tables.cars[0].current_km).toBe(
              Math.max(km, 1000),
            );
        }
      });
for (const failure of [false, true])
  it(`saves maintenance notes, failure=${failure}`, async () => {
    const { container, onSuccess } = open({
      isNote: true,
      description: "Oil",
      km_milestone: 1000,
      notes: "Old note",
    });
    const notes = screen.getByPlaceholderText("cars.notes_placeholder");
    fireEvent.change(notes, { target: { value: "   " } });
    fireEvent.click(container.querySelector(".btn-primary"));
    expect(state.server.calls).toEqual([]);
    fireEvent.change(notes, { target: { value: "New note" } });
    if (failure) state.server.failures["car_maintenance:upsert"] = "denied";
    fireEvent.click(container.querySelector(".btn-primary"));
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalledWith(
        failure ? "common.error_saving" : "common.success_saved",
      ),
    );
    expect(onSuccess).toHaveBeenCalledTimes(failure ? 0 : 1);
  });
it("supports a prefilled service, closed dialog and backdrop cancellation", () => {
  const { container, onClose } = open({
    type: "log_service",
    desc: "Oil",
    km: 2000,
    amount: 10,
    service_date: "2026-01-01",
  });
  expect(screen.getByPlaceholderText("cars.service_placeholder")).toHaveValue(
    "Oil",
  );
  fireEvent.click(container.querySelector(".modal-overlay"));
  expect(onClose).toHaveBeenCalledOnce();
  cleanup();
  const closed = open("add_car", { isOpen: false });
  expect(closed.container).toBeEmptyDOMElement();
});
