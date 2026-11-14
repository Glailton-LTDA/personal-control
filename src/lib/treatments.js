// Treatment service: thin wrappers over the Supabase treatment RPCs.
// All write RPCs are SECURITY DEFINER (owner-enforced, search_path fixed);
// read RPCs are security invoker. Request IDs make every mutation idempotent.
import { supabase } from './supabase';
import { healthErrorKey } from './health';

export const TREATMENT_PAGE_SIZE = 20;
export const MAX_CALENDAR_DAYS = 42;
export const MAX_HISTORY_LIMIT = 20;

// Stable server error codes (P0001) -> UI i18n keys. Never expose raw server
// text to the user.
const ERROR_MAP = {
  AUTH_REQUIRED: 'auth_required',
  INVALID_TIMEZONE: 'invalid_timezone',
  INVALID_LOCAL_TIME: 'invalid_local_time',
  VERSION_CONFLICT: 'version_conflict',
  WINDOW_TOO_LARGE: 'window_too_large',
  INVALID_SCHEDULE: 'invalid_schedule',
  INVALID_INTERVAL: 'invalid_interval',
  INVALID_DURATION: 'invalid_duration',
  OCCURRENCE_NOT_SCHEDULED: 'occurrence_not_scheduled',
  SCHEDULE_HAS_RECORDED_OCCURRENCES: 'schedule_has_recorded_occurrences',
  RESUME_EXPIRED: 'resume_expired',
  FUTURE_TAKEN_AT: 'future_taken_at',
  FUTURE_OCCURRENCE: 'future_occurrence',
  NOT_FOUND_OR_FORBIDDEN: 'not_found_or_forbidden',
  IDEMPOTENCY_CONFLICT: 'idempotency_conflict',
};

function mapError(error) {
  if (!error) return 'error';
  const code = error.message || error.code || '';
  return ERROR_MAP[code] || healthErrorKey(error) || 'error';
}

function requestId() {
  return crypto.randomUUID();
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function toLocalDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

export async function saveTreatment(userId, values, p_request_id = null) {
  if (!userId) throw new Error('auth_required');
  const { error, data } = await supabase.rpc('health_treatment_save', {
    p_payload: values,
    p_request_id: p_request_id || requestId(),
  });
  return { data, error: error ? mapError(error) : null };
}

export async function treatmentState(
  userId,
  medicationId,
  action,
  { effectiveAt, expectedVersion, reason, p_request_id = null } = {},
) {
  if (!userId) throw new Error('auth_required');
  if (!['pause', 'resume', 'finish'].includes(action))
    throw new Error('invalid_schedule');
  const { error, data } = await supabase.rpc('health_treatment_state', {
    p_medication_id: medicationId,
    p_action: action,
    p_effective_at: effectiveAt ? toDate(effectiveAt) : null,
    p_expected_version: expectedVersion == null ? null : Number(expectedVersion),
    p_reason: reason || '',
    p_request_id: p_request_id || requestId(),
  });
  return { data, error: error ? mapError(error) : null };
}

export async function recordDose(
  userId,
  medicationId,
  scheduledAt,
  status,
  {
    takenAt,
    amount = '',
    reason = '',
    expectedVersion = 0,
    p_request_id = null,
  } = {},
) {
  if (!userId) throw new Error('auth_required');
  if (!['taken', 'skipped'].includes(status)) throw new Error('invalid_schedule');
  const { error, data } = await supabase.rpc('health_dose_record', {
    p_medication_id: medicationId,
    p_scheduled_at: toDate(scheduledAt),
    p_status: status,
    p_taken_at: takenAt ? toDate(takenAt) : null,
    p_amount: amount,
    p_reason: reason,
    p_expected_version: Number(expectedVersion),
    p_request_id: p_request_id || requestId(),
  });
  return { data, error: error ? mapError(error) : null };
}

export async function undoDose(
  userId,
  medicationId,
  scheduledAt,
  expectedVersion,
  p_request_id = null,
) {
  if (!userId) throw new Error('auth_required');
  const { error, data } = await supabase.rpc('health_dose_undo', {
    p_medication_id: medicationId,
    p_scheduled_at: toDate(scheduledAt),
    p_expected_version: Number(expectedVersion),
    p_request_id: p_request_id || requestId(),
  });
  return { data, error: error ? mapError(error) : null };
}

export async function listTreatments(
  userId,
  { group = 'active', prefix = '', limit = TREATMENT_PAGE_SIZE, offset, page = 0 } = {},
) {
  if (!userId) throw new Error('auth_required');
  const { error, data } = await supabase.rpc('health_treatment_list', {
    p_group: group,
    p_prefix: prefix,
    p_limit: Math.min(Math.max(Number(limit) || 20, 1), 20),
    p_offset: Math.max(Number(offset ?? page * TREATMENT_PAGE_SIZE) || 0, 0),
  });
  return { data, error: error ? mapError(error) : null };
}

export async function treatmentDashboard(userId, timezone = 'UTC') {
  if (!userId) throw new Error('auth_required');
  const { error, data } = await supabase.rpc('health_treatment_dashboard', {
    p_timezone: timezone,
  });
  return { data, error: error ? mapError(error) : null };
}

export async function treatmentDetail(userId, medicationId) {
  if (!userId) throw new Error('auth_required');
  const { error, data } = await supabase.rpc('health_treatment_detail', {
    p_medication_id: medicationId,
  });
  return { data, error: error ? mapError(error) : null };
}

export async function treatmentCalendar(userId, medicationId, from, to) {
  if (!userId) throw new Error('auth_required');
  const { error, data } = await supabase.rpc('health_treatment_calendar', {
    p_medication_id: medicationId,
    p_from: toLocalDate(from),
    p_to: toLocalDate(to),
  });
  return { data, error: error ? mapError(error) : null };
}

export async function treatmentHistory(
  userId,
  medicationId,
  { filter = 'all', cursorAt, cursorId, limit = MAX_HISTORY_LIMIT } = {},
) {
  if (!userId) throw new Error('auth_required');
  const { error, data } = await supabase.rpc('health_treatment_history', {
    p_medication_id: medicationId,
    p_filter: filter,
    p_cursor_at: cursorAt ? toDate(cursorAt) : null,
    p_cursor_id: cursorId || null,
    p_limit: Math.min(Math.max(Number(limit) || 20, 1), 20),
  });
  return { data, error: error ? mapError(error) : null };
}

export async function refreshReminders(userId) {
  if (!userId) throw new Error('auth_required');
  const { error } = await supabase.rpc('health_refresh_reminders');
  return { error: error ? mapError(error) : null };
}
