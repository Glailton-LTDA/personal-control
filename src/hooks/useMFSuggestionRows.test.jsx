import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../lib/offline/mfOffline', () => ({
  mfSelect: vi.fn(),
  mfSelectAll: vi.fn(),
  mfMutate: vi.fn(),
  isOffline: () => false,
}));

import { supabase } from '../lib/supabase';
import { useMFSuggestionRows, toISODate } from './useMinhasFinancas';

const wrapper = (client) =>
  function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

describe('useMFSuggestionRows — autocomplete de descrição', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('busca só até hoje, para recorrências futuras não esconderem descrições recentes', async () => {
    const calls = {};
    const chain = {
      select: vi.fn(() => chain),
      lte: vi.fn((field, value) => {
        calls[field] = value;
        return chain;
      }),
      order: vi.fn(() => chain),
      limit: vi.fn((value) => {
        calls.limit = value;
        return chain;
      }),
      then: (resolve, reject) =>
        Promise.resolve({ data: [{ id: 'tx-1', description: 'Rendimentos' }], error: null }).then(
          resolve,
          reject
        ),
    };
    supabase.from.mockReturnValue(chain);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useMFSuggestionRows({ id: 'user-1' }), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(calls.payment_date).toBe(toISODate(new Date()));
    expect(calls.limit).toBe(300);
    expect(result.current.data).toHaveLength(1);
  });
});
