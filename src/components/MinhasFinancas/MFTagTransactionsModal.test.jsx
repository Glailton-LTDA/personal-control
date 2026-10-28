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
}));

const rangeCalls = [];
vi.mock('../../lib/supabase', () => {
  const makeChain = (result) => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      range: vi.fn((from, to) => {
        rangeCalls.push([from, to]);
        return makeChain({
          data: ROWS.slice(from, to + 1).map((row) => ({
            transaction_id: row.id,
            transaction: row,
          })),
          count: ROWS.length,
          error: null,
        });
      }),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  };
  const accounts = makeChain({
    data: [{ id: 'acc-1', name: 'Conta', currency: 'BRL' }],
    error: null,
  });
  return {
    supabase: {
      from: vi.fn((table) => (table === 'mf_accounts' ? accounts : makeChain(null))),
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
    rangeCalls.length = 0;
  });

  it('mostra 20 por página e navega para a próxima', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getAllByTestId(/^mf-tag-tx-row-/)).toHaveLength(20);
    });
    expect(rangeCalls[0]).toEqual([0, 19]);
    expect(screen.getByTestId('mf-tag-tx-next')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('mf-tag-tx-next'));

    await waitFor(() => {
      expect(rangeCalls[1]).toEqual([20, 39]);
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
    await waitFor(() => expect(rangeCalls[1]).toEqual([20, 39]));

    fireEvent.change(screen.getByTestId('mf-tag-tx-search'), {
      target: { value: 'hotel' },
    });
    await waitFor(() => {
      expect(rangeCalls[rangeCalls.length - 1]).toEqual([0, 19]);
    });
  });
});
