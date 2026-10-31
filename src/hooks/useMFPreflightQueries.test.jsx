import React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from '../lib/supabase';
import { useMFReminderRows, useMFSuggestionRows, useMFSeriesRows } from './useMinhasFinancas';

let chain;

const makeChain = (result) => {
  chain = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn((onFulfilled, onRejected) =>
      Promise.resolve(typeof result === 'function' ? result() : result).then(
        onFulfilled,
        onRejected
      )
    ),
  };
  return chain;
};

const run = (hook, ...args) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => hook(...args), { wrapper });
};

beforeEach(() => {
  vi.clearAllMocks();
  supabase.from.mockImplementation(() => makeChain({ data: [], error: null }));
});

describe('queries estreitas do MF (egress)', () => {
  it('lembretes: só os PENDENTE e só as colunas do planeador', () => {
    run(useMFReminderRows, { id: 'u1' });
    const cols = chain.select.mock.calls[0][0];
    expect(cols).toContain('status');
    expect(cols).not.toContain('notes');
    expect(chain.eq).toHaveBeenCalledWith('status', 'PENDENTE');
  });

  it('sugestões: recentes, com limite e sem as colunas pesadas', () => {
    run(useMFSuggestionRows, { id: 'u1' });
    const cols = chain.select.mock.calls[0][0];
    expect(cols).toContain('description');
    expect(cols).not.toContain('notes');
    expect(cols).not.toContain('attachment_path');
    expect(chain.lte).toHaveBeenCalledWith('payment_date', expect.any(String));
    expect(chain.limit).toHaveBeenCalledWith(300);
  });

  it('série de parcelas: só a raiz e as irmãs', () => {
    run(useMFSeriesRows, { id: 'u1' }, 'root-1');
    expect(chain.or).toHaveBeenCalledWith('id.eq.root-1,parent_transaction_id.eq.root-1');
  });
});
