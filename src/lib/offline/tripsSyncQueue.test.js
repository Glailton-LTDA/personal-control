import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { setOfflineIdentity } from './owner';
import { supabase } from '../supabase';
import { SyncEngine } from './SyncEngine';

// Mock do Supabase só para capturar o upsert do drain da fila.
vi.mock('../supabase', () => {
  const chains = {};
  const makeChain = () => ({
    upsert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: vi.fn((onFulfilled, onRejected) =>
      Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
    ),
  });
  return {
    supabase: {
      from: vi.fn((table) => {
        if (!chains[table]) chains[table] = makeChain();
        return chains[table];
      }),
      __chains: chains,
    },
  };
});

const upsertedRow = async (table) => {
  const { supabase } = await import('../supabase');
  const chain = supabase.from(table);
  return chain.upsert.mock.calls.at(-1)?.[0];
};

beforeEach(async () => {
  vi.clearAllMocks();
  setOfflineIdentity('owner');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await db.sync_queue.clear();
});
afterEach(() => { vi.restoreAllMocks(); setOfflineIdentity(null); });

describe('fila offline de viagens', () => {
  it('completa o dono de uma checklist antiga e remove colunas inexistentes', async () => {
    const engine = new SyncEngine('owner', { providers: [] });
    await engine._processQueueEntry({
      table_name: 'trip_checklists',
      record_id: 'check-1',
      action: 'insert',
      owner_id: 'owner',
      payload: {
        id: 'check-1',
        trip_id: 'trip-1',
        title: 'Lista antiga',
        description: 'não existe no servidor',
        is_template: false,
        created_at: '2026-10-04T00:00:00.000Z',
        updated_at: '2026-10-04T00:00:00.000Z',
      },
    });

    const row = await upsertedRow('trip_checklists');
    expect(row).toMatchObject({
      id: 'check-1',
      trip_id: 'trip-1',
      user_id: 'owner',
      title: 'Lista antiga',
    });
    expect(row).not.toHaveProperty('description');
    expect(row).not.toHaveProperty('is_template');
    engine.destroy();
  });

  it('preserva o dono já gravado no payload da checklist', async () => {
    const engine = new SyncEngine('owner', { providers: [] });
    await engine._processQueueEntry({
      table_name: 'trip_checklists',
      record_id: 'check-1',
      action: 'update',
      owner_id: 'owner',
      payload: { id: 'check-1', title: 'Novo título', user_id: 'owner' },
    });

    expect(await upsertedRow('trip_checklists')).toMatchObject({
      id: 'check-1',
      title: 'Novo título',
      user_id: 'owner',
    });
    engine.destroy();
  });

  it('completa o dono de um item de itinerário antigo', async () => {
    const engine = new SyncEngine('owner', { providers: [] });
    await engine._processQueueEntry({
      table_name: 'trip_itinerary',
      record_id: 'item-1',
      action: 'insert',
      owner_id: 'owner',
      payload: { id: 'item-1', trip_id: 'trip-1', day: 1, activity: 'Visita' },
    });

    expect(await upsertedRow('trip_itinerary')).toMatchObject({
      id: 'item-1',
      trip_id: 'trip-1',
      user_id: 'owner',
    });
    engine.destroy();
  });
});

describe('legacy recovery through the complete drain', () => {
  const legacy = (overrides = {}) => ({
    owner_id: 'owner', table_name: 'trip_checklists', record_id: 'check-1', action: 'insert', attempts: 5,
    payload: { id: 'check-1', trip_id: 'trip-1', title: 'Legacy', description: '', is_template: false }, ...overrides,
  });
  it('recovers an exhausted checklist once and sends the sanitized payload', async () => {
    await db.sync_queue.add(legacy());
    const engine = new SyncEngine('owner', { providers: [] });
    try {
      expect(await engine.drainQueue()).toBe(1);
      expect(await upsertedRow('trip_checklists')).toEqual({ id: 'check-1', trip_id: 'trip-1', title: 'Legacy', user_id: 'owner' });
      expect(await db.sync_queue.count()).toBe(0);
    } finally { engine.destroy(); }
  });
  it('does not reset the retry budget again when the recovered row still fails', async () => {
    const id = await db.sync_queue.add(legacy());
    const chain = supabase.from('trip_checklists');
    const response = chain.then.mockImplementation((resolve) => resolve({ data: null, error: new Error('still unavailable') }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const engine = new SyncEngine('owner', { providers: [] });
    try {
      expect(await engine.drainQueue()).toBe(0);
      expect(await db.sync_queue.get(id)).toMatchObject({ attempts: 1, trip_payload_version: 1 });
      for (let attempt = 0; attempt < 4; attempt++) await engine.drainQueue();
      expect((await db.sync_queue.get(id)).attempts).toBe(5);
      expect(await engine.drainQueue()).toBe(0);
      expect(chain.upsert).toHaveBeenCalledTimes(5);
    } finally { engine.destroy(); response.mockImplementation((resolve) => resolve({ data: [], error: null })); }
  });
  it('does not revive unrelated failures, another owner, mismatched payloads or ownerless entries', async () => {
    const entries = [
      legacy({ owner_id: 'other' }), legacy({ owner_id: undefined }),
      legacy({ table_name: 'trip_expenses' }),
      legacy({ payload: { id: 'check-1', title: 'Valid contract', user_id: 'owner' } }),
      legacy({ payload: { id: 'check-1', title: 'Mismatch', user_id: 'other' } }),
      legacy({ action: 'delete' }),
    ];
    await db.sync_queue.bulkAdd(entries);
    const engine = new SyncEngine('owner', { providers: [] });
    try {
      expect(await engine.drainQueue()).toBe(0);
      expect(supabase.from).not.toHaveBeenCalled();
      const queue = await db.sync_queue.toArray();
      expect(queue).toHaveLength(entries.length);
      expect(queue.every((entry) => entry.attempts === 5)).toBe(true);
      expect(queue[0].payload).toEqual(entries[0].payload);
      expect(queue[1].payload).toEqual(entries[1].payload);
    } finally { engine.destroy(); }
  });
  it('recovers an exhausted itinerary and preserves the real server fields', async () => {
    await db.sync_queue.add(legacy({ table_name: 'trip_itinerary', payload: {
      id: 'item', trip_id: 'trip', day: '2026-11-13', activity: 'Visit', lat: 10, lng: 20,
      completed: true, needs_booking: true, is_booked: false, order_index: 2, km_multiplier: 3, transportation: 'drive',
    } }));
    const engine = new SyncEngine('owner', { providers: [] });
    try {
      expect(await engine.drainQueue()).toBe(1);
      expect(await upsertedRow('trip_itinerary')).toEqual({
        id: 'item', trip_id: 'trip', day: '2026-11-13', activity: 'Visit', user_id: 'owner',
        coordinates: [20, 10], completed: true, needs_booking: true, is_booked: false, order_index: 2,
      });
    } finally { engine.destroy(); }
  });
});
