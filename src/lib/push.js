import { supabase } from './supabase';

const PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  import.meta.env.VITE_MF_VAPID_PUBLIC_KEY ||
  '';
let pending = Promise.resolve();
const serialize = (action) => {
  const next = pending.then(action, action);
  pending = next.catch(() => {});
  return next;
};
const requireOwner = (userId) => {
  if (!userId) throw new Error('auth');
};
const checked = ({ data, error }) => {
  if (error) throw error;
  return data;
};
export const pushSupported = () =>
  Boolean(
    window.isSecureContext &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window,
  );
export const pushConfigured = () => Boolean(PUBLIC_KEY);
const applicationKey = (value) => {
  const raw = value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(
    atob(raw + '='.repeat((4 - (raw.length % 4)) % 4)),
    (char) => char.charCodeAt(0),
  );
};
const languageCode = (language) =>
  ['pt', 'en', 'es'].includes(language?.split('-')[0])
    ? language.split('-')[0]
    : 'pt';
async function browserSubscription() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) || null;
}
async function ownSubscription(userId, endpoint) {
  requireOwner(userId);
  return checked(
    await supabase
      .from('push_subscriptions')
      .select('id,enabled,language')
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .maybeSingle(),
  );
}
export function readGlobalPush(userId) {
  return serialize(async () => {
    requireOwner(userId);
    if (!pushSupported()) return { state: 'unsupported', enabled: false };
    const sub = await browserSubscription();
    const row = sub ? await ownSubscription(userId, sub.endpoint) : null;
    const enabled = Boolean(row?.enabled);
    const state =
      Notification.permission === 'denied'
        ? 'blocked'
        : enabled
          ? 'on'
          : !PUBLIC_KEY
            ? 'unconfigured'
            : 'off';
    return { state, enabled };
  });
}
export function enableGlobalPush(userId, language) {
  // Permission is requested synchronously from the click, before queued I/O (Safari).
  requireOwner(userId);
  if (!pushSupported() || !PUBLIC_KEY)
    return Promise.reject(new Error('unsupported'));
  const permission = Notification.requestPermission();
  return serialize(async () => {
    if ((await permission) !== 'granted') throw new Error('blocked');
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    let sub = await registration.pushManager.getSubscription();
    const owned = sub ? await ownSubscription(userId, sub.endpoint) : null;
    // Never take over an endpoint belonging to another account on a shared browser.
    if (sub && !owned) {
      await sub.unsubscribe();
      sub = null;
    }
    const created = !sub;
    sub ||= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationKey(PUBLIC_KEY),
    });
    try {
      const raw = sub.toJSON();
      checked(
        await supabase
          .from('push_subscriptions')
          .upsert(
            {
              user_id: userId,
              endpoint: raw.endpoint,
              p256dh: raw.keys.p256dh,
              auth: raw.keys.auth,
              language: languageCode(language),
              enabled: true,
            },
            { onConflict: 'endpoint' },
          )
          .select('id')
          .single(),
      );
    } catch (error) {
      if (created) await sub.unsubscribe().catch(() => {});
      throw error;
    }
    return { state: 'on', enabled: true };
  });
}
export function disableGlobalPush(userId) {
  return serialize(async () => {
    requireOwner(userId);
    const sub = await browserSubscription();
    if (sub) {
      const row = await ownSubscription(userId, sub.endpoint);
      if (row)
        checked(
          await supabase
            .from('push_subscriptions')
            .update({ enabled: false })
            .eq('user_id', userId)
            .eq('id', row.id)
            .eq('endpoint', sub.endpoint)
            .select('id')
            .single(),
        );
      // Persist the global opt-out BEFORE unsubscribing. Failed DB writes keep state.
      await sub.unsubscribe().catch(() => {});
    }
    return { state: 'off', enabled: false };
  });
}
export function reconcilePushAccount(userId, language) {
  return serialize(async () => {
    requireOwner(userId);
    const sub = await browserSubscription();
    if (!sub) return;
    const row = await ownSubscription(userId, sub.endpoint);
    if (!row?.enabled) {
      await sub.unsubscribe();
      return;
    }
    const code = languageCode(language);
    if (row.language !== code)
      checked(
        await supabase
          .from('push_subscriptions')
          .update({ language: code })
          .eq('user_id', userId)
          .eq('id', row.id)
          .select('id')
          .single(),
      );
  });
}
export function unsubscribeDevicePush() {
  return serialize(async () => {
    const sub = await browserSubscription();
    if (sub) await sub.unsubscribe();
  });
}
