import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { createQueryServer } from "../../tests/queryServer";
import MyCars from "./MyCars";
import toast from "react-hot-toast";
const state = vi.hoisted(() => ({ server: null, confirm: true }));
const t = (key) => (key === "common.locale" ? "pt-BR" : key);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t, i18n: { language: "pt-BR" } }),
}));
vi.mock("../../lib/supabase", () => ({
  supabase: { from: (table) => state.server.from(table) },
}));
vi.mock("../../lib/toast", () => ({
  confirmToast: (_message, accept) => (state.confirm ? accept() : undefined),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("./CarModal", () => ({
  default: ({ type, onClose, onSuccess }) => (
    <div role="dialog">
      <output>{JSON.stringify(type)}</output>
      <button onClick={onClose}>Close car form</button>
      <button onClick={onSuccess}>Save car form</button>
    </div>
  ),
}));
const car = {
  id: "car",
  user_id: "owner",
  name: "Synthetic car",
  plate: "ABC1234",
  current_km: 19000,
};
beforeEach(() => {
  state.server = createQueryServer();
  state.confirm = true;
  vi.clearAllMocks();
  localStorage.clear();
  state.server.tables = {
    cars: [car],
    car_service_templates: [
      {
        id: "oil",
        description: "Oil",
        km_milestone: 10000,
        interval_km: 10000,
        interval_months: 6,
      },
      {
        id: "tires",
        description: "Tires",
        km_milestone: 20000,
        interval_km: 20000,
      },
    ],
    car_maintenance: [
      {
        id: "oil",
        car_id: "car",
        description: "Oil",
        km_milestone: 10000,
        status: "DONE",
        amount: 150,
        notes: "Synthetic note",
        updated_at: "2025-01-01",
      },
      {
        id: "tires",
        car_id: "car",
        description: "Tires",
        km_milestone: 10000,
        status: "DONE",
        amount: 100,
        updated_at: "2026-01-01",
      },
    ],
    car_services: [
      {
        id: "wash",
        car_id: "car",
        service_date: "2026-01-01",
        description: "Wash",
        amount: 50,
        km_at_service: 15000,
        notes: "Synthetic note",
      },
    ],
    car_shares: [],
  };
});
afterEach(cleanup);
async function open(extra = {}) {
  const result = render(
    <MyCars user={{ id: "owner", email: "owner@example.test" }} {...extra} />,
  );
  await screen.findAllByText("Synthetic car");
  return result.container;
}
it("renders maintenance predictions, services, editing and global add action", async () => {
  await open();
  await screen.findAllByText("Oil");
  fireEvent.click(screen.getByTitle("cars.edit_action"));
  expect(screen.getByRole("dialog")).toHaveTextContent("edit_car");
  fireEvent.click(screen.getByText("Save car form"));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByText("cars.tabs.services"));
  await screen.findByText("Wash");
  expect(localStorage.getItem("personal-control-car-subtab")).toBe("services");
  fireEvent.click(screen.getByText("cars.tabs.revisions"));
  await screen.findAllByText("Oil");
  fireEvent(window, new Event("open-add-car-modal"));
  expect(screen.getByRole("dialog")).toHaveTextContent("add_car");
  fireEvent.click(screen.getByText("Close car form"));
});
for (const failure of [false, true])
  it(`archives and deletes an owned car: failure=${failure}`, async () => {
    await open();
    if (failure) state.server.failures["cars:update"] = "denied";
    fireEvent.click(screen.getByTitle("common.archive"));
    await waitFor(() =>
      expect(failure ? toast.error : toast.success).toHaveBeenCalled(),
    );
    if (!failure) expect(state.server.tables.cars[0].is_hidden).toBe(true);
    cleanup();
    delete state.server.failures["cars:update"];
    state.server.tables.cars = [car];
    await open();
    state.confirm = false;
    fireEvent.click(screen.getByTitle("common.delete"));
    expect(state.server.tables.cars).toHaveLength(1);
    state.confirm = true;
    if (failure) state.server.failures["cars:delete"] = "denied";
    fireEvent.click(screen.getByTitle("common.delete"));
    await waitFor(() =>
      expect(state.server.calls.some((x) => x[1] === "delete")).toBe(true),
    );
    if (!failure) await screen.findByText("cars.empty.title");
  });
for (const accept of [false, true])
  for (const failure of [false, true])
    it(`invitation accept=${accept}, failure=${failure}`, async () => {
      state.server.tables.car_shares = [
        {
          id: "invite",
          shared_by: "other",
          shared_with_email: "owner@example.test",
          status: "PENDING",
          car_id: { ...car, user_id: "other" },
        },
      ];
      const container = await open();
      await screen.findByText("common.accept");
      if (failure)
        state.server.failures[`car_shares:${accept ? "update" : "delete"}`] =
          "denied";
      fireEvent.click(
        accept
          ? screen.getByText("common.accept")
          : container.querySelector(".action-btn.danger"),
      );
      await waitFor(() =>
        expect(
          state.server.calls.some(
            (x) =>
              x[0] === "car_shares" && x[1] === (accept ? "update" : "delete"),
          ),
        ).toBe(true),
      );
      if (!failure)
        await waitFor(() =>
          expect(toast.success).toHaveBeenCalledWith(
            accept
              ? "cars.success.invite_accepted"
              : "cars.success.invite_rejected",
          ),
        );
    });
it("selects shared and hidden cars when no visible owned car exists", async () => {
  state.server.tables.cars = [];
  state.server.tables.car_shares = [
    {
      id: "share",
      shared_by: "other",
      shared_with_email: "owner@example.test",
      status: "ACCEPTED",
      car_id: { ...car, user_id: "other" },
    },
  ];
  await open();
  expect(screen.queryByTitle("common.delete")).not.toBeInTheDocument();
  cleanup();
  state.server.tables.car_shares = [];
  state.server.tables.cars = [{ ...car, is_hidden: true }];
  await open();
  expect(screen.getByTestId("car-name")).toHaveTextContent("Synthetic car");
});
