import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { db } from '../lib/offline/db';
import { MUSIC_SONG_LIST_COLUMNS } from '../lib/offline/musicQueries';
import { useOfflineSongs } from './useOfflineSongs';

// O sincronismo em bloco tem teste próprio; aqui interessa só a consulta da
// listagem (paginação + colunas pedidas).
vi.mock('../lib/offline/SyncEngine', () => ({
  SyncEngine: class {
    constructor() {
      this.isOnline = true;
    }
    sync() {
      return Promise.resolve({});
    }
    destroy() {}
  },
}));

vi.mock('../lib/supabase', () => {
  const state = { selectArgs: [] };
  const rows = [
    { id: 's1', user_id: 'u1', title: 'Título do servidor', type: 'cifra' },
  ];
  const chain = {
    select: vi.fn((columns, options) => {
      state.selectArgs.push([columns, options]);
      return chain;
    }),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => chain),
    then: vi.fn((onFulfilled, onRejected) =>
      Promise.resolve({ data: rows, count: rows.length, error: null }).then(
        onFulfilled,
        onRejected
      )
    ),
  };
  return {
    supabase: {
      from: vi.fn(() => chain),
      __state: state,
    },
  };
});

function wrapper({ children }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useOfflineSongs — listagem sem o texto da cifra', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.music_songs.clear();
  });

  it('pede só metadados e ainda assim devolve as músicas', async () => {
    const { supabase } = await import('../lib/supabase');
    const { result } = renderHook(
      () => useOfflineSongs('u1', { page: 0, pageSize: 25 }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.songs).toHaveLength(1));
    expect(result.current.totalCount).toBe(1);

    const [columns, options] = supabase.__state.selectArgs[0];
    expect(columns).toBe(MUSIC_SONG_LIST_COLUMNS);
    expect(columns).not.toContain('content');
    expect(options).toEqual({ count: 'exact' });
  });

  it('preserva no Dexie a cifra já baixada ao salvar a listagem', async () => {
    await db.music_songs.put({
      id: 's1',
      user_id: 'u1',
      title: 'Título antigo',
      type: 'cifra',
      content: 'C G Am F',
    });

    const { result } = renderHook(
      () => useOfflineSongs('u1', { page: 0, pageSize: 25 }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.songs).toHaveLength(1));
    await waitFor(async () => {
      const cached = await db.music_songs.get('s1');
      expect(cached.title).toBe('Título do servidor');
      expect(cached.content).toBe('C G Am F');
    });
  });
});
