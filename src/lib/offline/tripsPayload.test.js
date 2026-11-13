import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeTripRow, recoverTripQueue } from './tripsPayload';
import { db } from './db';
import { setOfflineIdentity } from './owner';

beforeEach(async () => { setOfflineIdentity('owner'); await db.sync_queue.clear(); });
afterEach(() => { vi.restoreAllMocks(); setOfflineIdentity(null); });

describe('trip server payload contract', () => {
  it('keeps valid partial checklist updates and drops local metadata', () => {
    expect(serializeTripRow('trip_checklists', { id: 'id', title: 'New', description: '', is_template: true, items: [] }, 'owner'))
      .toEqual({ id: 'id', title: 'New', user_id: 'owner' });
    expect(serializeTripRow('trip_checklists', null, 'owner')).toEqual({ user_id: 'owner' });
  });
  it('keeps explicit coordinate changes, null and false values', () => {
    expect(serializeTripRow('trip_itinerary', {
      id: 'id', coordinates: null, lat: 10, lng: 20, completed: false,
      needs_booking: false, is_booked: false, order_index: 0,
    }, 'owner')).toEqual({ id: 'id', coordinates: null, completed: false,
      needs_booking: false, is_booked: false, order_index: 0, user_id: 'owner' });
    expect(serializeTripRow('trip_itinerary', { coordinates: [1,2], lat: 10, lng: 20 }, 'owner').coordinates).toEqual([1,2]);
    expect(serializeTripRow('trip_itinerary', { lat: 0, lng: '0' }, 'owner').coordinates).toEqual([0,0]);
  });
  it.each([
    {}, { lat: null, lng: 10 }, { lat: '', lng: 10 }, { lat: 10, lng: '' },
    { lat: 'invalid', lng: 10 }, { lat: 10, lng: Infinity },
  ])('does not invent coordinates from missing/invalid legacy values: %o', (payload) => {
    expect(serializeTripRow('trip_itinerary', payload, 'owner')).toEqual({ user_id: 'owner' });
  });
  it('rejects unsupported tables and foreign owners', () => {
    expect(() => serializeTripRow('trips', {}, 'owner')).toThrow('trip_payload_table_invalid');
    expect(() => serializeTripRow('trip_checklists', {}, null)).toThrow('offline_owner_mismatch');
    expect(() => serializeTripRow('trip_checklists', { user_id: 'other' }, 'owner')).toThrow('offline_owner_mismatch');
  });
  it('does not recover entries after logout or a session switch', async () => {
    const add = vi.spyOn(db.sync_queue, 'update');
    await recoverTripQueue(null);
    setOfflineIdentity('other');
    await recoverTripQueue('owner');
    expect(add).not.toHaveBeenCalled();
  });
  it('rolls the recovery back if the session changes during the transaction', async () => {
    const id = await db.sync_queue.add({ owner_id: 'owner', table_name: 'trip_checklists', action: 'insert', attempts: 5, payload: { title: 'Legacy' } });
    const original = db.sync_queue.update.bind(db.sync_queue);
    vi.spyOn(db.sync_queue, 'update').mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      setOfflineIdentity('other');
      return result;
    });
    await expect(recoverTripQueue('owner')).rejects.toThrow('offline_session_changed');
    expect(await db.sync_queue.get(id)).toMatchObject({ attempts: 5, payload: { title: 'Legacy' } });
  });
  it('marks a valid exhausted entry without resetting it, and preserves entries with no payload', async () => {
    const valid = await db.sync_queue.add({ owner_id: 'owner', table_name: 'trip_checklists', action: 'insert', attempts: 5, payload: { user_id: 'owner', title: 'Valid' } });
    const absent = await db.sync_queue.add({ owner_id: 'owner', table_name: 'trip_checklists', action: 'insert', attempts: 5, payload: null });
    const retry = await db.sync_queue.add({ owner_id: 'owner', table_name: 'trip_checklists', action: 'update', payload: { user_id: 'owner', title: 'Valid' } });
    await recoverTripQueue('owner');
    expect(await db.sync_queue.get(valid)).toMatchObject({ attempts: 5, trip_payload_version: 1 });
    expect(await db.sync_queue.get(absent)).not.toHaveProperty('trip_payload_version');
    expect(await db.sync_queue.get(retry)).toMatchObject({ attempts: 0, trip_payload_version: 1 });
  });
});
