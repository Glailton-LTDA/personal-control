import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from './db';
import { SyncEngine, MusicSyncProvider } from './SyncEngine';
import { MUSIC_SONG_LIST_COLUMNS } from './musicQueries';

// Servidor em memória: só music_songs devolve linhas; as demais tabelas ficam
// vazias (o provider de música também sincroniza setlists/gêneros/acordes).
vi.mock('../supabase', () => {
  const serverRows = {
    music_songs: [
      {
        id: 'song-1',
        user_id: 'u1',
        title: 'Título novo',
        artist: 'Artista',
        type: 'cifra',
        updated_at: '2026-10-24T00:00:00.000Z',
      },
    ],
  };
  const state = { columns: {} };
  const chains = {};
  const makeChain = (table) => {
    const chain = {
      select: vi.fn((columns) => {
        state.columns[table] = columns;
        return chain;
      }),
      eq: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      order: vi.fn(() => chain),
      range: vi.fn(() => chain),
      then: vi.fn((onFulfilled, onRejected) =>
        Promise.resolve({ data: serverRows[table] || [], error: null }).then(
          onFulfilled,
          onRejected
        )
      ),
    };
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table) => {
        if (!chains[table]) chains[table] = makeChain(table);
        return chains[table];
      }),
      __state: state,
      __chains: chains,
    },
  };
});

describe('MusicSyncProvider — sincronização sem o texto da cifra', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.music_songs.clear();
  });

  it('baixa só metadados das músicas e mantém a cifra já cacheada', async () => {
    await db.music_songs.put({
      id: 'song-1',
      user_id: 'u1',
      title: 'Título antigo',
      type: 'cifra',
      content: 'C G Am F',
      updated_at: '2026-10-01T00:00:00.000Z',
    });

    const engine = new SyncEngine('u1', { providers: [] });
    const provider = new MusicSyncProvider('u1');
    await provider.pull(engine);

    const { supabase } = await import('../supabase');
    expect(supabase.__state.columns.music_songs).toBe(MUSIC_SONG_LIST_COLUMNS);
    expect(MUSIC_SONG_LIST_COLUMNS).not.toContain('content');

    const cached = await db.music_songs.get('song-1');
    expect(cached.title).toBe('Título novo');
    expect(cached.content).toBe('C G Am F');
  });

  it('saveBatch sem merge substitui o registro inteiro', async () => {
    await db.music_songs.put({
      id: 'song-1',
      user_id: 'u1',
      title: 'Antiga',
      content: 'C G',
    });

    const engine = new SyncEngine('u1', { providers: [] });
    await engine.saveBatch('music_songs', [{ id: 'song-1', title: 'Nova' }]);

    const cached = await db.music_songs.get('song-1');
    expect(cached.title).toBe('Nova');
    expect(cached.content).toBeUndefined();
  });

  it('saveBatch com merge preserva campos ausentes no lote', async () => {
    await db.music_songs.put({
      id: 'song-1',
      user_id: 'u1',
      title: 'Antiga',
      content: 'C G',
    });

    const engine = new SyncEngine('u1', { providers: [] });
    await engine.saveBatch('music_songs', [{ id: 'song-1', title: 'Nova' }], null, {
      merge: true,
    });

    const cached = await db.music_songs.get('song-1');
    expect(cached.title).toBe('Nova');
    expect(cached.content).toBe('C G');
  });
});
