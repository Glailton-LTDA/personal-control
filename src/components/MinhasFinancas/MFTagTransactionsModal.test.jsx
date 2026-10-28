import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFTagTransactionsModal from './MFTagTransactionsModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
}));

const ROWS = Array.from({ length: 25 }, (_, index) => ({
  id: `tx-${index + 1}`,
  description: `Lançamento ${index + 1}`,
  amount: 100 + index,
  payment_date: `2026-10-${String((index % 28) + 1).padStart(2, '0')}`,
  account_id: 'acc-1',
  status: 'PAGO',
  type: 'DESPESA',
  currency: 'BRL',
}));

const rpcCalls = [];
vi.mock('../../lib/supabase', () => {
  const accounts = {
    select: vi.fn(() => accounts),
    order: vi.fn(() => accounts),
    then: (resolve) =>
      Promise.resolve({
        data: [{ id: 'acc-1', name: 'Conta', currency: 'BRL' }],
        error: null,
      }).then(resolve),
  };
  return {
    supabase: {
      from: vi.fn(() => accounts),
      rpc: vi.fn((fn, params) => {
        rpcCalls.push({ fn, params });
        const offset = params.p_offset ?? 0;
        const limit = params.p_limit ?? 20;
        return Promise.resolve({
          data: {
            rows: ROWS.slice(offset, offset + limit),
            total: ROWS.length,
            amounts: { BRL: ROWS.reduce((sum, row) => sum + row.amount, 0) },
            years: [2026, 2025],
          },
          error: null,
        });
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  };
});

const renderModal = (tag = { id: 'tag-1', name: 'viagem', color: '#a78bfa' }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MFTagTransactionsModal user={{ id: 'test-user' }} tag={tag} onClose={() => {}} />
    </QueryClientProvider>
  );
};

describe('MFTagTransactionsModal — lista paginada da tag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls.length = 0;
  });

  it('mostra 20 por página, navega e exibe a soma do filtro', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getAllByTestId(/^mf-tag-tx-row-/)).toHaveLength(20);
    });
    expect(rpcCalls[0].fn).toBe('mf_tag_transactions');
    expect(rpcCalls[0].params).toMatchObject({ p_offset: 0, p_limit: 20 });
    expect(screen.getByTestId('mf-tag-tx-next')).not.toBeDisabled();
    expect(screen.getByTestId('mf-tag-tx-total-BRL')).toHaveTextContent('R$');

    fireEvent.click(screen.getByTestId('mf-tag-tx-next'));

    await waitFor(() => {
      expect(rpcCalls[rpcCalls.length - 1].params).toMatchObject({ p_offset: 20 });
    });
    await waitFor(() => {
      expect(screen.getAllByTestId(/^mf-tag-tx-row-/)).toHaveLength(5);
    });
    expect(screen.getByTestId('mf-tag-tx-next')).toBeDisabled();
    expect(screen.getByTestId('mf-tag-tx-row-tx-21')).toHaveTextContent(
      'Lançamento 21'
    );
  });

  it('a busca reinicia a página e consulta o servidor', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getAllByTestId(/^mf-tag-tx-row-/)).toHaveLength(20);
    });

    fireEvent.click(screen.getByTestId('mf-tag-tx-next'));
    await waitFor(() =>
      expect(rpcCalls[rpcCalls.length - 1].params).toMatchObject({ p_offset: 20 })
    );

    fireEvent.change(screen.getByTestId('mf-tag-tx-search'), {
      target: { value: 'hotel' },
    });
    await waitFor(() => {
      expect(rpcCalls[rpcCalls.length - 1].params).toMatchObject({
        p_offset: 0,
        p_search: 'hotel',
      });
    });
  });

  it('filtra por ano, mês e dia e limpa', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tag-tx-year')).toBeInTheDocument();
    });
    // anos vêm da RPC; espera a opção existir antes de selecionar
    await waitFor(() => {
      expect(screen.getByTestId('mf-tag-tx-year')).toHaveTextContent('2026');
    });

    fireEvent.change(screen.getByTestId('mf-tag-tx-year'), {
      target: { value: '2026' },
    });
    await waitFor(() => {
      expect(rpcCalls[rpcCalls.length - 1].params).toMatchObject({
        p_from: '2026-01-01',
        p_to: '2026-12-31',
      });
    });

    fireEvent.change(screen.getByTestId('mf-tag-tx-month'), {
      target: { value: '02' },
    });
    await waitFor(() => {
      expect(rpcCalls[rpcCalls.length - 1].params).toMatchObject({
        p_from: '2026-02-01',
        p_to: '2026-02-28',
      });
    });

    fireEvent.change(screen.getByTestId('mf-tag-tx-day'), {
      target: { value: '15' },
    });
    await waitFor(() => {
      expect(rpcCalls[rpcCalls.length - 1].params).toMatchObject({
        p_from: '2026-02-15',
        p_to: '2026-02-15',
      });
    });

    fireEvent.click(screen.getByTestId('mf-tag-tx-clear'));
    await waitFor(() => {
      expect(rpcCalls[rpcCalls.length - 1].params).toMatchObject({
        p_from: null,
        p_to: null,
      });
    });
  });
});
