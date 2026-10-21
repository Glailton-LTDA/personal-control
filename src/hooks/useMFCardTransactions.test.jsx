import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../lib/offline/mfOffline', () => ({
  mfSelect: vi.fn(),
  mfSelectAll: vi.fn(),
  mfMutate: vi.fn(),
  isOffline: vi.fn(() => false),
}));

import { mfSelectAll } from '../lib/offline/mfOffline';
import { supabase } from '../lib/supabase';
import { useMFCardTransactions } from './useMinhasFinancas';

const CARD = {
  id: 'card-1',
  name: 'Nubank',
  account_type: 'CARTAO',
  currency: 'BRL',
  linked_account_id: 'acc-1',
  closing_day: 30,
  due_day: 7,
};

const purchase = {
  id: 'tx-buy',
  account_id: 'card-1',
  type: 'DESPESA',
  status: 'PAGO',
  amount: 100,
  payment_date: '2026-10-05',
  invoice_close: null,
};
const transfer = {
  id: 'tx-transfer',
  account_id: 'acc-1',
  transfer_account_id: 'card-1',
  type: 'TRANSFERENCIA',
  status: 'PAGO',
  amount: 250,
  payment_date: '2026-09-30',
  invoice_close: null,
};
const mirror = {
  id: 'tx-mirror',
  account_id: 'acc-1',
  type: 'DESPESA',
  status: 'PAGO',
  amount: 100,
  payment_date: '2026-10-07',
  invoice_close: '2026-09-30',
};
const other = {
  id: 'tx-other',
  account_id: 'acc-outro',
  type: 'DESPESA',
  status: 'PAGO',
  amount: 999,
  payment_date: '2026-10-08',
  invoice_close: null,
};

const AGGREGATES = {
  card_id: 'card-1',
  name: 'Nubank',
  pool: 250,
  firstDate: '2022-03-01',
  months: { '2026-10': { total: 100, refunds: 0, n: 1 } },
  closes: {},
  payments: { '2026-09-30': { rawBound: 100, pendingBound: 0, n: 1 } },
};

let rows = [];
let filters = [];
let queries = [];

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  filters = [];
  queries = [];
  supabase.rpc.mockImplementation(async () => ({ data: [AGGREGATES], error: null }));
  mfSelectAll.mockImplementation(async (table, buildQuery, local = {}) => {
    queries.push(buildQuery);
    if (typeof local.filter === 'function') filters.push(local.filter);
    let out = [...rows];
    if (typeof local.filter === 'function') out = local.filter(out);
    if (typeof local.sort === 'function') out = local.sort(out);
    return { data: out, error: null };
  });
});

const renderHookQuery = (cards = [CARD]) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useMFCardTransactions({ id: 'u1' }, cards), { wrapper });
};

describe('useMFCardTransactions — agregados do servidor + janela de exibição', () => {
  it('pede os agregados por ciclo ao servidor e devolve junto das transações', async () => {
    rows = [purchase, mirror];
    const { result } = renderHookQuery();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(supabase.rpc).toHaveBeenCalledWith('mf_card_cycle_totals', {
      p_ref_date: expect.any(String),
      p_live: true,
    });
    expect(result.current.data.aggregates['card-1'].pool).toBe(250);
    const ids = result.current.data.transactions.map((row) => row.id).sort();
    expect(ids).toEqual(['tx-buy', 'tx-mirror']);
  });

  it('com agregados, não baixa as transferências (o pool vem do servidor)', async () => {
    rows = [purchase, transfer, mirror, other];
    const { result } = renderHookQuery();

    await waitFor(() => expect(result.current.data).toBeDefined());
    const ids = result.current.data.transactions.map((row) => row.id).sort();
    expect(ids).toEqual(['tx-buy', 'tx-mirror']);
  });

  it('sem os agregados (RPC fora), cai no caminho local com o histórico inteiro', async () => {
    supabase.rpc.mockImplementation(async () => {
      throw new Error('sem rede');
    });
    rows = [purchase, transfer, mirror, other];
    const { result } = renderHookQuery();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data.aggregates).toBeNull();
    const ids = result.current.data.transactions.map((row) => row.id).sort();
    expect(ids).toEqual(['tx-buy', 'tx-mirror', 'tx-transfer']);
  });

  it('dedupe por id quando a mesma linha aparece em dois recortes', async () => {
    rows = [purchase, purchase];
    const { result } = renderHookQuery();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(
      result.current.data.transactions.filter((row) => row.id === 'tx-buy')
    ).toHaveLength(1);
  });

  it('sem cartão no escopo a query não busca nada', async () => {
    const { result } = renderHookQuery([]);

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(mfSelectAll).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});
