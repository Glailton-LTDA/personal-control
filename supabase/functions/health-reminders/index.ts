// Private, discreet Web Push. Invoke every minute with Bearer CRON_SECRET.
// Service role is server-only; this function never loads names, notes or results.
import { createClient } from 'npm:@supabase/supabase-js@2.103.3';
import {
  configurePush,
  ownerPushSubscriptions,
  sendGlobalPush,
} from '../_shared/push.ts';

import messages from './messages.json' with { type: 'json' };

Deno.serve(async (request: Request) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`)
    return new Response(null, { status: 401 });
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  try {
    const prepared = await db.rpc('health_prepare_reminders');
    if (prepared.error) throw prepared.error;
    if (!configurePush())
      return new Response('Push configuration missing', { status: 503 });
    const claimed = await db.rpc('health_claim_reminders');
    if (claimed.error) throw claimed.error;
    let sent = 0;
    const rows: { id: string; user_id: string }[] = claimed.data || [];
    // Limit parallel network calls and use a timeout per push service.
    for (let offset = 0; offset < rows.length; offset += 5) {
      await Promise.all(
        rows.slice(offset, offset + 5).map(async (row) => {
          // Recheck after claiming: a dose may have been recorded or reminder snoozed.
          const { data: reminder, error } = await db
            .from('health_reminders')
            .select('id')
            .eq('id', row.id)
            .eq('user_id', row.user_id)
            .is('dismissed_at', null)
            .is('delivered_at', null)
            .lte('remind_at', new Date().toISOString())
            .maybeSingle();
          if (error || !reminder) return;
          const devices = await ownerPushSubscriptions(db, row.user_id);
          let delivered = !devices.length;
          for (let offset = 0; offset < devices.length; offset += 4) {
            await Promise.all(
              devices.slice(offset, offset + 4).map(async (sub) => {
                const copy =
                  messages[sub.language as keyof typeof messages] ||
                  messages.pt;
                if (
                  await sendGlobalPush(db, sub, {
                    type: 'health-reminder',
                    ...copy,
                    tag: `health-${row.id}`,
                    url: '/health/today',
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
              .from('health_reminders')
              .update({
                delivered_at: new Date().toISOString(),
                claimed_until: null,
              })
              .eq('user_id', row.user_id)
              .eq('id', row.id);
        }),
      );
    }
    return Response.json({ sent });
  } catch {
    // Do not log payloads, endpoints, tokens or health data.
    return new Response('Reminder processing failed', { status: 500 });
  }
});
