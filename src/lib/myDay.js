import { supabase } from './supabase';

export const MY_DAY_MODULES = ['health', 'minhasfinancas', 'trips'];
export const myDayKey = (userId) => ['my-day', userId];
export const dayISO = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export async function requireMyDaySession(userId, signal) {
  if (!userId || signal?.aborted) throw new Error('AUTH_REQUIRED');
  // getSession reads the existing local session, not a separate getUser request.
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (
    sessionError ||
    !data?.session?.access_token ||
    data.session.user?.id !== userId ||
    signal?.aborted
  )
    throw new Error('AUTH_REQUIRED');
}

export async function loadMyDay(userId, timezone, modules, signal) {
  await requireMyDaySession(userId, signal);
  if (
    !modules.length ||
    modules.some((module) => !MY_DAY_MODULES.includes(module))
  )
    throw new Error('INVALID_MODULES');
  const { data: summary, error } = await supabase
    .rpc('my_day_summary', { p_timezone: timezone, p_modules: modules })
    .abortSignal(signal);
  if (error) throw new Error('MY_DAY_UNAVAILABLE');
  return summary;
}

export function myDayItems(summary) {
  return Object.entries(summary?.sections || {}).flatMap(([kind, section]) =>
    (section.rows || []).map((row) => ({
      ...row,
      kind,
      key: `${kind}:${row.id}`,
    }))
  );
}
export function splitMyDay(summary, timezone) {
  const today = summary?.day;
  const groups = { today: [], attention: [], upcoming: [] };
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const iso = (date) => {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(date))
        .map((part) => [part.type, part.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  myDayItems(summary).forEach((item) => {
    const day = item.day || iso(item.scheduled_at);
    const sortTime = item.scheduled_at
      ? new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(new Date(item.scheduled_at))
      : item.time || '23:59';
    item = { ...item, day, sortTime };
    if (day < today) groups.attention.push(item);
    else if (day === today) groups.today.push(item);
    else groups.upcoming.push(item);
  });
  const order = (a, b) =>
    a.day.localeCompare(b.day) ||
    a.sortTime.localeCompare(b.sortTime) ||
    a.key.localeCompare(b.key);
  Object.values(groups).forEach((rows) => rows.sort(order));
  return groups;
}
export function itemRoute(item) {
  if (item.kind === 'doses') return `health/medications/${item.medication_id}`;
  if (item.kind === 'appointments') return `health/appointments/${item.id}`;
  if (item.kind === 'exams') return `health/exams/${item.id}`;
  if (item.kind === 'payments')
    return `minhasfinancas/accounts/${item.account_id}`;
  if (item.kind === 'invoices')
    return `minhasfinancas/cards/${item.account_id}`;
  return `trips/itinerary/${item.trip_id || item.id}`;
}
