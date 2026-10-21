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
}));

import { mfSelectAll } from '../lib/offline/mfOffline';
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

let rows = [];
let filters = [];

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  filters = [];
  mfSelectAll.mockImplementation(async (table, buildQuery, local = {}) => {
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

describe('useMFCardTransactions — recorte enxuto do cálculo de faturas', () => {
  it('baixa compras do cartão, transferências para ele e os espelhos da vinculada', async () => {
    rows = [purchase, transfer, mirror, other];
    const { result } = renderHookQuery();

    await waitFor(() => expect(result.current.data).toBeDefined());
    const ids = result.current.data.map((row) => row.id).sort();
    // A compra do cartão, a transferência para o cartão e o pagamento-espelho
    // na conta vinculada entram; a conta sem relação fica de fora.
    expect(ids).toEqual(['tx-buy', 'tx-mirror', 'tx-transfer']);
  });

  it('consulta a tabela em três recortes (não a tabela inteira)', async () => {
    rows = [];
    renderHookQuery();
    await waitFor(() => expect(mfSelectAll).toHaveBeenCalledTimes(3));
    // Cada recorte tem seu próprio filtro de lista (o contrato do
    // mfSelectAll) — nenhum deles abre a tabela sem filtro.
    expect(filters).toHaveLength(3);
    const kept = (row) => filters.some((filter) => filter([row]).length > 0);
    expect(kept(purchase)).toBe(true);
    expect(kept(transfer)).toBe(true);
    expect(kept(mirror)).toBe(true);
    expect(kept(other)).toBe(false);
  });

  it('dedupe por id quando a mesma linha aparece em dois recortes', async () => {
    rows = [purchase, purchase];
    const { result } = renderHookQuery();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data.filter((row) => row.id === 'tx-buy')).toHaveLength(1);
  });

  it('sem cartão no escopo a query não busca nada', async () => {
    const { result } = renderHookQuery([]);

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(mfSelectAll).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});
