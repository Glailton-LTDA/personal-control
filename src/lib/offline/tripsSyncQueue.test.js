import { beforeEach, describe, expect, it, vi } from 'vitest';
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

beforeEach(() => {
  vi.clearAllMocks();
});

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
