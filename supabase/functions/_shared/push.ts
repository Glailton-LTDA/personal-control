import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.103.3';

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  language: string;
};
const FIELDS = 'id,user_id,endpoint,p256dh,auth,language';
const normalizeKey = (value: string) =>
  value
    .replace(/\s+/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
export function configurePush(): boolean {
  const contact =
    Deno.env.get('VAPID_MAILTO') || Deno.env.get('MF_VAPID_MAILTO');
  const publicKey = normalizeKey(Deno.env.get('VAPID_PUBLIC_KEY') || '');
  const privateKey = normalizeKey(Deno.env.get('VAPID_PRIVATE_KEY') || '');
  if (!contact || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(contact, publicKey, privateKey);
  return true;
}
export function trustedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === 'fcm.googleapis.com' ||
        url.hostname === 'updates.push.services.mozilla.com' ||
        url.hostname === 'web.push.apple.com' ||
        url.hostname.endsWith('.notify.windows.com'))
    );
  } catch {
    return false;
  }
}
export async function* globalPushPages(db: SupabaseClient, userId?: string) {
  let after: string | null = null;
  while (true) {
    let query = db
      .from('push_subscriptions')
      .select(FIELDS)
      .eq('enabled', true)
      .order('id')
      .limit(200);
    if (userId) query = query.eq('user_id', userId);
    if (after) query = query.gt('id', after);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []) as PushSubscriptionRow[];
    if (!rows.length) return;
    yield rows;
    if (rows.length < 200) return;
    after = rows[rows.length - 1].id;
  }
}
export async function ownerPushSubscriptions(
  db: SupabaseClient,
  userId: string,
) {
  const rows: PushSubscriptionRow[] = [];
  for await (const page of globalPushPages(db, userId)) rows.push(...page);
  return rows;
}
export async function sendGlobalPush(
  db: SupabaseClient,
  subscription: PushSubscriptionRow,
  payload: Record<string, unknown>,
): Promise<boolean> {
  // Recheck consent immediately before sending, including long-running finance jobs.
  const { data, error } = await db
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', subscription.user_id)
    .eq('id', subscription.id)
    .eq('endpoint', subscription.endpoint)
    .eq('enabled', true)
    .maybeSingle();
  if (error || !data || !trustedPushEndpoint(subscription.endpoint))
    return false;
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: 300, timeout: 5000 },
    );
    return true;
  } catch (error) {
    if (
      [404, 410].includes((error as { statusCode?: number }).statusCode || 0)
    ) {
      await db
        .from('push_subscriptions')
        .delete()
        .eq('user_id', subscription.user_id)
        .eq('id', subscription.id)
        .eq('endpoint', subscription.endpoint);
    }
    return false;
  }
}
