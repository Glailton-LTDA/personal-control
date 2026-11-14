// Pure treatment scheduling engine. Mirrors the SQL contract:
// - local wall times: nonexistent -> omitted (null), ambiguous -> earlier instant
// - interval slots: anchor + n*interval
// - finite end is exclusive: anchor + N*24h / local start + N days
// - bounded generation (<=1000 slots per call)
export const MAX_SLOTS = 1000;
export const MAX_DAYS = 42;
export const MIN_INTERVAL_MINUTES = 60;
export const MAX_INTERVAL_MINUTES = 10080;
export const MAX_DURATION_DAYS = 365;
export const MAX_TIMES = 24;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DAY_MS = 86400000;
const formatters = new Map();

function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    );
  }
  return formatters.get(timeZone);
}

export function isValidTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    formatter(timeZone).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function deviceTimeZone() {
  try {
    const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(value) ? value : "";
  } catch {
    return "";
  }
}

function partsAt(instantMs, timeZone) {
  const values = {};
  for (const part of formatter(timeZone).formatToParts(new Date(instantMs))) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return values;
}

function wallMs(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
}

function offsetAt(instantMs, timeZone) {
  const p = partsAt(instantMs, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0) - instantMs;
}

function wallKey(instantMs, timeZone) {
  const p = partsAt(instantMs, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

// Convert a local wall clock in a timezone to an instant (ms), or null when
// the wall time does not exist. Ambiguous times resolve to the earlier instant.
export function localInstant(date, time, timeZone) {
  if (!date || !time || !isValidTimeZone(timeZone)) return null;
  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(time)) return null;
  const target = wallMs(date, time);
  const key = `${date}T${time}`;
  const candidates = [
    target - offsetAt(target - DAY_MS, timeZone),
    target - offsetAt(target + DAY_MS, timeZone),
    target - offsetAt(target, timeZone),
  ].filter((value) => wallKey(value, timeZone) === key);
  if (!candidates.length) return null;
  return Math.min(...candidates);
}

export function formatLocalDate(instantMs, timeZone) {
  const p = partsAt(instantMs, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function formatLocalTime(instantMs, timeZone) {
  const p = partsAt(instantMs, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function addDays(date, days) {
  if (!DATE_PATTERN.test(date || '')) return null;
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

export function parseTime(time) {
  if (!TIME_PATTERN.test(time || '')) return null;
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function formatMinutes(total) {
  const value = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function interval(schedule) {
  return Number(schedule.interval_minutes);
}

function finiteEnd(schedule) {
  return schedule.end_exclusive_at ? new Date(schedule.end_exclusive_at).getTime() : Infinity;
}

function effectiveStart(schedule, fromMs) {
  const value = schedule.effective_from ? new Date(schedule.effective_from).getTime() : -Infinity;
  return Math.max(value, fromMs);
}

function effectiveEnd(schedule, toMs) {
  const until = schedule.effective_until ? new Date(schedule.effective_until).getTime() : Infinity;
  return Math.min(until, finiteEnd(schedule), toMs);
}

export class SlotLimitError extends Error {
  constructor() {
    super('window_too_large');
    this.name = 'SlotLimitError';
  }
}

// Generate slots in [from, to). Accepts ISO strings or Dates. Always bounded.
export function buildSlots(schedule, from, to, { limit = MAX_SLOTS, cap = true } = {}) {
  if (!schedule) return [];
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return [];
  const start = effectiveStart(schedule, fromMs);
  const end = effectiveEnd(schedule, toMs);
  if (end <= start) return [];
  const slots = [];
  if (schedule.mode === 'interval') {
    const anchor = new Date(schedule.anchor_at).getTime();
    const step = interval(schedule) * 60000;
    if (!Number.isFinite(anchor) || !Number.isFinite(step) || step <= 0) return [];
    let n = Math.max(0, Math.ceil((start - anchor) / step));
    for (;;) {
      const slot = anchor + n * step;
      if (slot >= end) break;
      if (slot >= start) {
        slots.push(slot);
        if (slots.length > limit) {
          if (cap) throw new SlotLimitError();
          break;
        }
      }
      n += 1;
    }
    return slots;
  }
  const timeZone = schedule.timezone;
  if (!isValidTimeZone(timeZone) || !Array.isArray(schedule.local_times) || !schedule.local_times.length) {
    return [];
  }
  if (!DATE_PATTERN.test(schedule.local_start_date || '')) return [];
  const firstDate = schedule.local_start_date > formatLocalDate(start, timeZone)
    ? schedule.local_start_date
    : formatLocalDate(start, timeZone);
  const lastDate = formatLocalDate(end - 1, timeZone);
  let date = firstDate;
  while (date && date <= lastDate) {
    for (const time of schedule.local_times) {
      const slot = localInstant(date, time, timeZone);
      if (slot != null && slot >= start && slot < end) {
        slots.push(slot);
        if (slots.length > limit) {
          if (cap) throw new SlotLimitError();
          return slots;
        }
      }
    }
    date = addDays(date, 1);
  }
  return slots;
}

export function countSlots(schedule, { from, to } = {}) {
  if (!schedule) return 0;
  if (!from || !to) {
    if (schedule.duration_kind !== 'finite') return null;
    const start = schedule.effective_from || new Date().toISOString();
    const end = schedule.end_exclusive_at;
    if (!end) return null;
    try {
      return buildSlots(schedule, start, end, { limit: 10000 }).length;
    } catch {
      return null;
    }
  }
  try {
    return buildSlots(schedule, from, to).length;
  } catch {
    return null;
  }
}

export function nextSlots(schedule, count = 5, now = Date.now()) {
  if (!schedule || count < 1) return [];
  const span =
    schedule.mode === "interval"
      ? Math.max(interval(schedule) * count * 60000, 3600000)
      : 86400000 * Math.min(Math.max(count, 1), 14);
  try {
    return buildSlots(schedule, now, now + span, {
      limit: count,
      cap: false,
    }).slice(0, count);
  } catch {
    return [];
  }
}

export function previewTreatment(values, now = Date.now(), days = 14) {
  const schedule = values.schedule || values;
  try {
    return buildSlots(schedule, now, now + days * DAY_MS, { cap: false }).slice(0, 50);
  } catch {
    return [];
  }
}

// Group projected instants by the local calendar date in the schedule timezone.
export function slotsByLocalDate(slots, timeZone) {
  if (!Array.isArray(slots) || !isValidTimeZone(timeZone)) return [];
  const groups = new Map();
  for (const slot of slots) {
    const date = formatLocalDate(slot, timeZone);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(slot);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, values]) => ({ date, slots: values }));
}

export function validateTreatment(values) {
  const errors = [];
  const name = String(values.name || '').trim();
  if (name.length < 1 || name.length > 255) errors.push('invalid_name');
  const dose = String(values.dose || '').trim();
  const quantity = values.dose_quantity === '' || values.dose_quantity == null
    ? null
    : Number(values.dose_quantity);
  if (!dose && (quantity == null || !Number.isFinite(quantity) || quantity <= 0)) {
    errors.push('invalid_dose');
  }
  if (dose.length > 255) errors.push('invalid_dose');
  if (quantity != null && (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000)) {
    errors.push('invalid_dose');
  }
  if (!isValidTimeZone(values.timezone)) errors.push('invalid_timezone');
  if (!['interval', 'daily_times'].includes(values.mode)) errors.push('invalid_mode');
  if (!['finite', 'continuous'].includes(values.duration_kind)) errors.push('invalid_duration');
  const durationDays = Number(values.duration_days);
  if (values.duration_kind === 'finite') {
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > MAX_DURATION_DAYS) {
      errors.push('invalid_duration');
    }
  }
  if (values.mode === 'interval') {
    const minutes = Number(values.interval_minutes);
    if (
      !Number.isInteger(minutes)
      || minutes < MIN_INTERVAL_MINUTES
      || minutes > MAX_INTERVAL_MINUTES
    ) {
      errors.push('invalid_interval');
    }
    if (!DATE_PATTERN.test(values.anchor_date || '') || !TIME_PATTERN.test(values.anchor_time || '')) {
      errors.push('invalid_local_time');
    } else if (
      localInstant(values.anchor_date, values.anchor_time, values.timezone) == null
    ) {
      errors.push('invalid_local_time');
    }
  } else if (values.mode === 'daily_times') {
    if (!DATE_PATTERN.test(values.local_start_date || '')) errors.push('invalid_local_time');
    const times = Array.isArray(values.local_times) ? values.local_times : [];
    if (!times.length || times.length > MAX_TIMES) errors.push('invalid_times');
    if (times.some((time) => !TIME_PATTERN.test(time))) errors.push('invalid_times');
    if (new Set(times).size !== times.length) errors.push('invalid_times');
  }
  if (values.reminders_enabled && values.mode === 'daily_times'
    && !(values.local_times || []).length) {
    errors.push('invalid_times');
  }
  const offset = Number(values.reminder_offset_minutes || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_INTERVAL_MINUTES) {
    errors.push('invalid_offset');
  }
  return [...new Set(errors)];
}

export function scheduleFromTreatment(values) {
  if (!isValidTimeZone(values.timezone)) return null;
  if (!["interval", "daily_times"].includes(values.mode)) return null;
  if (
    values.duration_kind === "finite" &&
    (!Number.isInteger(Number(values.duration_days)) ||
      Number(values.duration_days) < 1)
  )
    return null;
  if (
    values.mode === "interval" &&
    (!Number.isFinite(Number(values.interval_minutes)) ||
      Number(values.interval_minutes) < 60)
  )
    return null;
  if (
    values.mode === "daily_times" &&
    (!DATE_PATTERN.test(values.local_start_date || "") ||
      !values.local_times?.length ||
      values.local_times.some((time) => !TIME_PATTERN.test(time)))
  )
    return null;
  if (values.mode === "interval") {
    const anchorMs = localInstant(
      values.anchor_date,
      values.anchor_time,
      values.timezone,
    );
    if (anchorMs == null) return null;
    const days = Number(values.duration_days);
    return {
      mode: "interval",
      timezone: values.timezone,
      anchor_at: new Date(anchorMs).toISOString(),
      interval_minutes: Number(values.interval_minutes),
      duration_kind: values.duration_kind,
      duration_days: values.duration_kind === "finite" ? days : null,
      end_exclusive_at:
        values.duration_kind === "finite"
          ? new Date(anchorMs + days * DAY_MS).toISOString()
          : null,
      effective_from: values.effective_from || new Date(anchorMs).toISOString(),
      effective_until: null,
    };
  }
  const startMs = localInstant(
    values.local_start_date,
    "00:00",
    values.timezone,
  );
  const days = Number(values.duration_days);
  return {
    mode: "daily_times",
    timezone: values.timezone,
    local_start_date: values.local_start_date,
    local_times: [...values.local_times].sort(),
    duration_kind: values.duration_kind,
    duration_days: values.duration_kind === "finite" ? days : null,
    end_exclusive_at:
      values.duration_kind === "finite" && startMs != null
        ? new Date(
            localInstant(
              addDays(values.local_start_date, days),
              "00:00",
              values.timezone,
            ) ?? startMs + days * DAY_MS,
          ).toISOString()
        : null,
    effective_from:
      values.effective_from ||
      (startMs == null ? null : new Date(startMs).toISOString()),
    effective_until: null,
  };
}

export function treatmentPayload(values, schedule = scheduleFromTreatment(values)) {
  const base = {
    name: String(values.name || '').trim(),
    dose: String(values.dose || '').trim(),
    presentation_code: values.presentation_code || '',
    dose_quantity: values.dose_quantity === '' ? null : values.dose_quantity,
    dose_unit_code: values.dose_unit_code || null,
    professional_name: values.professional_name || '',
    indication: values.indication || '',
    pharmacy: values.pharmacy || '',
    batch: values.batch || '',
    notes: values.notes || '',
    timezone: values.timezone,
    reminders_enabled: Boolean(values.reminders_enabled),
    reminder_offset_minutes: Number(values.reminder_offset_minutes || 0),
    mode: values.mode,
    duration_kind: values.duration_kind,
    duration_days: values.duration_kind === 'finite' ? Number(values.duration_days) : null,
  };
  if (values.mode === 'interval') {
    base.anchor_date = values.anchor_date;
    base.anchor_time = values.anchor_time;
    base.interval_minutes = Number(values.interval_minutes);
  } else {
    base.local_start_date = values.local_start_date;
    base.local_times = [...values.local_times].sort();
  }
  if (values.id) {
    base.id = values.id;
    base.expected_version = values.row_version;
  }
  if (schedule?.mode === 'interval') {
    base.end_exclusive_at = schedule.end_exclusive_at;
  }
  return base;
}

export function scheduleLabel(schedule, t) {
  if (!schedule) return '';
  if (schedule.mode === 'interval') {
    const hours = interval(schedule) / 60;
    return Number.isInteger(hours)
      ? t('health.every_hours', { count: hours })
      : t('health.every_minutes', { count: interval(schedule) });
  }
  return (schedule.local_times || []).map((time) => time.slice(0, 5)).join(', ');
}
