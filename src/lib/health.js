import { supabase } from './supabase';

export const HEALTH_PAGE_SIZE = 20;
export const HEALTH_BUCKET = 'health-documents';
export const HEALTH_KINDS = [
  'conditions',
  'appointments',
  'medications',
  'exams',
];
export const HEALTH_FIELDS = {
  conditions: 'id,name,status,diagnosed_on',
  appointments: 'id,name,status,starts_at,professional,follow_up_of',
  medications: 'id,name,status,dose,starts_on,ends_on',
  exams: 'id,name,status,performed_at,laboratory,professional',
  documents: 'id,name,category,mime_type,size_bytes,created_at',
  results: 'id,name,value,unit,reference_range',
  doses:
    'id,medication_id,scheduled_at,taken_at,status,amount,medication:health_medications(name,dose)',
  reminders:
    'id,medication_id,appointment_id,exam_id,scheduled_at,remind_at,dismissed_at,medication:health_medications(name,dose),appointment:health_appointments(name),exam:health_exams(name)',
};
const DETAILS = {
  conditions: ',notes',
  appointments: ',specialty,location,address,notes,condition_id,reminder_minutes',
  medications:
    ',times,timezone,reminders_enabled,notes,condition_id,appointment_id',
  exams:
    ',notes,condition_id,appointment_id,report,preparation,reminder_minutes',
  documents: ',storage_path,condition_id,appointment_id,medication_id,exam_id',
};

function owner(userId) {
  if (!userId) throw new Error('health_auth_required');
  return userId;
}
function table(kind) {
  if (!Object.hasOwn(HEALTH_FIELDS, kind))
    throw new Error('health_invalid_kind');
  return `health_${kind}`;
}
function checked({ data, error }) {
  if (error) throw error;
  return data;
}
export async function listHealth(
  userId,
  kind,
  { page = 0, search = '', status, parent, before, after, name, category, soonestFirst = false } = {},
) {
  let query = supabase
    .from(table(kind))
    .select(HEALTH_FIELDS[kind])
    .eq('user_id', owner(userId));
  // Indexed prefix bounds use leakproof comparisons, so PostgreSQL can apply
  // them beneath the RLS barrier. Substring ILIKE cannot use its trigram index there.
  const prefix = search.trim().slice(0, 120).toLowerCase();
  if (prefix) {
    const points = Array.from(prefix, (char) => char.codePointAt(0));
    while (points.at(-1) === 0x10ffff) points.pop();
    if (points.length) points[points.length - 1]++;
    query = query.gte('name_search', prefix);
    if (points.length)
      query = query.lt('name_search', String.fromCodePoint(...points));
  }
  if (status) query = query.eq('status', status);
  if (category && kind === 'documents') query = query.eq('category', category);
  if (name) query = query.eq('name', name);
  if (parent) {
    const allowed = [
      'condition_id',
      'appointment_id',
      'medication_id',
      'exam_id',
      'follow_up_of',
    ];
    if (!allowed.includes(parent.field))
      throw new Error('health_invalid_parent');
    query = query.eq(parent.field, parent.id);
  }
  const dateField = {
    appointments: 'starts_at',
    exams: 'performed_at',
    doses: 'scheduled_at',
    reminders: 'remind_at',
  }[kind];
  if (before && dateField) query = query.lt(dateField, before);
  if (after && dateField) query = query.gte(dateField, after);
  if (kind === 'reminders') query = query.is('dismissed_at', null);
  // Searches keep the same chronological order as unfiltered lists.
  const sort = { medications: 'starts_on', conditions: 'created_at' }[kind]
    || dateField || 'created_at';
  const ascending = kind === 'reminders' || soonestFirst;
  // Appointments use a backward scan of the existing (date ASC, id ASC) index.
  const idAscending = ascending || kind !== 'appointments';
  const order = kind === 'exams'
    ? { ascending, nullsFirst: false }
    : { ascending };
  const start = Math.max(0, page) * HEALTH_PAGE_SIZE;
  const rows = checked(
    await query
      .order(sort, order)
      .order('id', { ascending: idAscending })
      .range(start, start + HEALTH_PAGE_SIZE),
  );
  return {
    rows: rows.slice(0, HEALTH_PAGE_SIZE),
    hasNext: rows.length > HEALTH_PAGE_SIZE,
  };
}
export async function getHealth(userId, kind, id) {
  return checked(
    await supabase
      .from(table(kind))
      .select(HEALTH_FIELDS[kind] + (DETAILS[kind] || ''))
      .eq('user_id', owner(userId))
      .eq('id', id)
      .single(),
  );
}
const WRITABLE = {
  conditions: ['name', 'status', 'diagnosed_on', 'notes'],
  appointments: [
    'name',
    'status',
    'starts_at',
    'professional',
    'specialty',
    'location',
    'address',
    'follow_up_of',
    'notes',
    'condition_id',
    'reminder_minutes',
  ],
  medications: [
    'name',
    'status',
    'dose',
    'starts_on',
    'ends_on',
    'times',
    'timezone',
    'reminders_enabled',
    'notes',
    'condition_id',
    'appointment_id',
  ],
  exams: [
    'name',
    'status',
    'performed_at',
    'laboratory',
    'professional',
    'notes',
    'report',
    'preparation',
    'condition_id',
    'appointment_id',
    'reminder_minutes',
  ],
  results: ['exam_id', 'name', 'value', 'unit', 'reference_range'],
  doses: ['medication_id', 'scheduled_at', 'taken_at', 'status', 'amount'],
};
export async function saveHealth(userId, kind, values, id) {
  owner(userId);
  if (!WRITABLE[kind]) throw new Error('health_invalid_kind');
  const writable =
    kind === 'doses' && id ? ['taken_at', 'status', 'amount'] : WRITABLE[kind];
  const payload = Object.fromEntries(
    writable
      .filter((key) => Object.hasOwn(values, key))
      .map((key) => [key, values[key]]),
  );
  const query = id
    ? supabase
        .from(table(kind))
        .update(payload)
        .eq('user_id', userId)
        .eq('id', id)
    : supabase.from(table(kind)).insert({ ...payload, user_id: userId });
  return checked(await query.select('id').single());
}
export async function deleteHealth(userId, kind, id) {
  checked(
    await supabase
      .from(table(kind))
      .delete()
      .eq('user_id', owner(userId))
      .eq('id', id)
      .select('id')
      .single(),
  );
}
export async function snoozeHealth(
  userId,
  id,
  minutes = 10,
  previousTime = null,
) {
  const base = Math.max(
    Date.now(),
    previousTime ? new Date(previousTime).getTime() : 0,
  );
  checked(
    await supabase
      .from('health_reminders')
      .update({
        remind_at: new Date(base + minutes * 60000).toISOString(),
      })
      .eq('user_id', owner(userId))
      .eq('id', id)
      .select('id')
      .single(),
  );
}
export async function dismissHealth(userId, id) {
  checked(
    await supabase
      .from('health_reminders')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('user_id', owner(userId))
      .eq('id', id)
      .select('id')
      .single(),
  );
}

export async function refreshHealthReminders(userId) {
  owner(userId);
  checked(await supabase.rpc('health_refresh_reminders'));
  return true;
}

const TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/dicom': 'dcm',
};
export async function uploadHealth(userId, file, category, links = {}) {
  owner(userId);
  if (!TYPES[file.type] || !file.size || file.size > 20 * 1024 * 1024)
    throw new Error('health_invalid_file');
  const id = crypto.randomUUID();
  const path = `${userId}/${id}.${TYPES[file.type]}`;
  const payload = {
    id,
    user_id: userId,
    name: file.name.slice(0, 255),
    category,
    mime_type: file.type,
    size_bytes: file.size,
    storage_path: path,
  };
  for (const field of [
    'condition_id',
    'appointment_id',
    'medication_id',
    'exam_id',
  ])
    if (links[field]) payload[field] = links[field];
  checked(await supabase.from('health_documents').insert(payload));
  const { error } = await supabase.storage
    .from(HEALTH_BUCKET)
    .upload(path, file, {
      upsert: false,
      cacheControl: '0',
      contentType: file.type,
    });
  if (error) {
    await supabase
      .from('health_documents')
      .delete()
      .eq('user_id', userId)
      .eq('id', id);
    throw error;
  }
  return id;
}
export async function downloadHealth(userId, id) {
  const doc = await getHealth(userId, 'documents', id);
  // Authenticated download rechecks RLS every time; no shareable signed/public URL.
  const blob = checked(
    await supabase.storage.from(HEALTH_BUCKET).download(doc.storage_path),
  );
  return { doc, blob };
}
export async function deleteHealthDocument(userId, id) {
  const doc = await getHealth(userId, 'documents', id);
  checked(
    await supabase.storage.from(HEALTH_BUCKET).remove([doc.storage_path]),
  );
  await deleteHealth(userId, 'documents', id);
}

export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function localDateTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return `${localDay(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function healthErrorKey(error) {
  if (error?.message === 'health_invalid_file') return 'file_error';
  if (error?.code === '23503') return 'linked_error';
  if (error?.code === '23505') return 'duplicate_error';
  return 'error';
}
