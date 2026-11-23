import { beforeEach, expect, it, vi } from "vitest";
const query = vi.hoisted(() => ({
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("./supabase", () => ({ supabase: { from: vi.fn(() => query) } }));
import { supabase } from "./supabase";
import {
  readMedicationPushPrivacy,
  saveMedicationPushPrivacy,
} from "./pushPrivacy";
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ["select", "eq", "upsert"])
    query[key].mockReturnValue(query);
});
it("requires an owner and accepts only an explicit boolean", async () => {
  await expect(readMedicationPushPrivacy(null)).rejects.toThrow("auth");
  await expect(saveMedicationPushPrivacy(null, true)).rejects.toThrow(
    "invalid",
  );
  await expect(saveMedicationPushPrivacy("a", "true")).rejects.toThrow(
    "invalid",
  );
  expect(supabase.from).not.toHaveBeenCalled();
});
it.each([
  null,
  {},
  { show_medication_details: false },
  { show_medication_details: "true" },
])("defaults to discreet for %j", async (data) => {
  query.maybeSingle.mockResolvedValue({ data });
  expect(await readMedicationPushPrivacy("owner")).toBe(false);
  expect(query.select).toHaveBeenCalledWith("show_medication_details");
  expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
});
it("reads explicit opt-in and propagates read errors", async () => {
  query.maybeSingle
    .mockResolvedValueOnce({ data: { show_medication_details: true } })
    .mockResolvedValueOnce({ error: new Error("failed") });
  expect(await readMedicationPushPrivacy("owner")).toBe(true);
  await expect(readMedicationPushPrivacy("owner")).rejects.toThrow();
});
it.each([true, false])(
  "updates only the privacy preference to %s",
  async (enabled) => {
    query.single.mockResolvedValue({
      data: { show_medication_details: enabled },
    });
    expect(await saveMedicationPushPrivacy("owner", enabled)).toBe(enabled);
    expect(query.upsert).toHaveBeenCalledWith(
      { user_id: "owner", show_medication_details: enabled },
      { onConflict: "user_id" },
    );
  },
);
it("fails if saving failed or no owner row was returned", async () => {
  query.single
    .mockResolvedValueOnce({ error: new Error("x") })
    .mockResolvedValueOnce({ data: null });
  await expect(saveMedicationPushPrivacy("owner", true)).rejects.toThrow(
    "save",
  );
  await expect(saveMedicationPushPrivacy("owner", false)).rejects.toThrow(
    "save",
  );
});
