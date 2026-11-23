import { supabase } from "./supabase";

export async function readMedicationPushPrivacy(userId) {
  if (!userId) throw new Error("auth");
  const { data, error } = await supabase
    .from("notification_settings")
    .select("show_medication_details")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.show_medication_details === true;
}

export async function saveMedicationPushPrivacy(userId, enabled) {
  if (!userId || typeof enabled !== "boolean") throw new Error("invalid");
  const { data, error } = await supabase
    .from("notification_settings")
    .upsert(
      { user_id: userId, show_medication_details: enabled },
      { onConflict: "user_id" },
    )
    .select("show_medication_details")
    .single();
  if (error || data?.show_medication_details !== enabled)
    throw new Error("save");
  return enabled;
}
