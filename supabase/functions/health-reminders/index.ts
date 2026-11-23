// Private, discreet Web Push. Invoke every minute with Bearer CRON_SECRET.
// Service role is server-only. Names/doses are loaded only after explicit owner opt-in.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import {
  configurePush,
  ownerPushSubscriptions,
  sendGlobalPush,
} from "../_shared/push.ts";

import { reminderContent } from "./content.ts";

Deno.serve(async (request: Request) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return new Response(null, { status: 401 });
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  try {
    const prepared = await db.rpc("health_prepare_reminders");
    if (prepared.error) throw prepared.error;
    if (!configurePush())
      return new Response("Push configuration missing", { status: 503 });
    const claimed = await db.rpc("health_claim_reminders");
    if (claimed.error) throw claimed.error;
    let sent = 0;
    const rows: { id: string; user_id: string }[] = claimed.data || [];
    // Limit parallel network calls and use a timeout per push service.
    for (let offset = 0; offset < rows.length; offset += 5) {
      await Promise.all(
        rows.slice(offset, offset + 5).map(async (row) => {
          // Recheck after claiming: a dose may have been recorded or reminder snoozed.
          const { data: reminder, error } = await db
            .from("health_reminders")
            .select("id,medication_id,scheduled_at")
            .eq("id", row.id)
            .eq("user_id", row.user_id)
            .is("dismissed_at", null)
            .is("delivered_at", null)
            .lte("remind_at", new Date().toISOString())
            .maybeSingle();
          if (error || !reminder) return;
          let medication: {
            name: string;
            dose: string;
            timezone: string;
          } | null = null;
          if (reminder.medication_id) {
            const preference = await db
              .from("notification_settings")
              .select("show_medication_details")
              .eq("user_id", row.user_id)
              .maybeSingle();
            // Missing rows, errors and older schemas all fail closed to generic copy.
            if (
              !preference.error &&
              preference.data?.show_medication_details === true
            ) {
              const owned = await db
                .from("health_medications")
                .select("name,dose,timezone")
                .eq("user_id", row.user_id)
                .eq("id", reminder.medication_id)
                .maybeSingle();
              if (!owned.error) medication = owned.data;
            }
          }
          const devices = await ownerPushSubscriptions(db, row.user_id);
          let delivered = !devices.length;
          for (let offset = 0; offset < devices.length; offset += 4) {
            // Recheck account privacy before each device batch as well as global
            // enrollment. Revoking details during processing switches to generic.
            if (medication) {
              const current = await db
                .from("notification_settings")
                .select("show_medication_details")
                .eq("user_id", row.user_id)
                .maybeSingle();
              if (
                current.error ||
                current.data?.show_medication_details !== true
              )
                medication = null;
            }
            await Promise.all(
              devices.slice(offset, offset + 4).map(async (sub) => {
                const copy = reminderContent(
                  sub.language,
                  medication,
                  reminder.scheduled_at,
                );
                if (
                  await sendGlobalPush(db, sub, {
                    type: "health-reminder",
                    ...copy,
                    tag: `health-${row.id}`,
                    url: medication
                      ? `/health/medications/${reminder.medication_id}`
                      : "/health/today",
                  })
                ) {
                  delivered = true;
                  sent++;
                }
              }),
            );
          }
          if (delivered)
            await db
              .from("health_reminders")
              .update({
                delivered_at: new Date().toISOString(),
                claimed_until: null,
              })
              .eq("user_id", row.user_id)
              .eq("id", row.id);
        }),
      );
    }
    return Response.json({ sent });
  } catch {
    // Do not log payloads, endpoints, tokens or health data.
    return new Response("Reminder processing failed", { status: 500 });
  }
});
