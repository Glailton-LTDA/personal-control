import { db } from './db';
import { offlineIdentity, queueOwner } from './owner';

const COLUMNS = {
  trip_checklists: new Set(['id', 'trip_id', 'user_id', 'title', 'created_at', 'updated_at']),
  trip_itinerary: new Set([
    'id', 'trip_id', 'user_id', 'day', 'time', 'activity', 'location', 'notes',
    'completed', 'needs_booking', 'is_booked', 'coordinates', 'order_index',
    'created_at', 'updated_at',
  ]),
};
const PAYLOAD_VERSION = 1;

/** One server contract for new writes and legacy outbox entries. */
export function serializeTripRow(table, payload, owner) {
  if (!COLUMNS[table]) throw new Error('trip_payload_table_invalid');
  if (!owner || (payload?.user_id && payload.user_id !== owner)) throw new Error('offline_owner_mismatch');
  const row = Object.fromEntries(Object.entries(payload || {}).filter(([key]) => COLUMNS[table].has(key)));
  row.user_id = owner;
  // Legacy coordinates were stored separately. GeoJSON uses [longitude, latitude].
  if (table === 'trip_itinerary' && row.coordinates === undefined &&
      payload?.lat != null && payload?.lng != null && payload.lat !== '' && payload.lng !== '' &&
      Number.isFinite(Number(payload.lat)) && Number.isFinite(Number(payload.lng))) {
    row.coordinates = [Number(payload.lng), Number(payload.lat)];
  }
  return row;
}

/** Repair affected entries once BEFORE the retry limit is applied. */
export async function recoverTripQueue(owner) {
  if (!owner || await offlineIdentity() !== owner) return;
  await db.transaction('rw', db.sync_queue, async () => {
    const entries = await db.sync_queue.toArray();
    for (const entry of entries) {
      if (!COLUMNS[entry.table_name] || !['insert', 'update'].includes(entry.action) ||
          queueOwner(entry) !== owner || entry.trip_payload_version >= PAYLOAD_VERSION ||
          !entry.payload || (entry.payload.user_id && entry.payload.user_id !== owner)) continue;
      const payload = serializeTripRow(entry.table_name, entry.payload, owner);
      const changed = JSON.stringify(payload) !== JSON.stringify(entry.payload);
      await db.sync_queue.update(entry.id, {
        payload,
        trip_payload_version: PAYLOAD_VERSION,
        // Unrelated exhausted operations keep their existing limit.
        attempts: changed ? 0 : entry.attempts || 0,
      });
    }
    if (await offlineIdentity() !== owner) throw new Error('offline_session_changed');
  });
}
