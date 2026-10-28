import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFTagsManager from './MFTagsManager';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

// Mock Supabase: 2 tags, 3 vínculos (2 na tag-1, 1 na tag-2) + 2 lançamentos
vi.mock('../../lib/supabase', () => {
  const makeChain = (result) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn((rows) =>
        makeChain(() => ({
          data: (Array.isArray(rows) ? rows : [rows]).map((row, index) => ({
            id: `created-${index}`,
            ...row,
          })),
          error: null,
        }))
      ),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn((onFulfilled, onRejected) =>
        Promise.resolve(typeof result === 'function' ? result() : result).then(
          onFulfilled,
          onRejected
        )
      ),
    };
    return chain;
  };
  const tags = makeChain({
    data: [
      { id: 'tag-1', name: 'Viagem', color: '#06b6d4' },
      { id: 'tag-2', name: 'Casa', color: '#a855f7' },
    ],
    error: null,
  });
  const links = makeChain({
    data: [
      { transaction_id: 'tx-a', tag_id: 'tag-1' },
      { transaction_id: 'tx-b', tag_id: 'tag-1' },
      { transaction_id: 'tx-c', tag_id: 'tag-2' },
    ],
    error: null,
  });
  const transactions = makeChain({
    data: [
      { id: 'tx-a', description: 'Hotel', amount: 500, payment_date: '2026-10-05', status: 'PAGO' },
      { id: 'tx-b', description: 'Passagem', amount: 900, payment_date: '2026-10-06', status: 'PAGO' },
    ],
    error: null,
  });
  // Lançamentos do modal (RPC paginada).
  const accounts = makeChain({
    data: [{ id: 'acc-1', name: 'Conta', currency: 'BRL' }],
    error: null,
  });
  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_tags') return tags;
        if (table === 'mf_transaction_tags') return links;
        if (table === 'mf_accounts') return accounts;
        return transactions;
      }),
      rpc: vi.fn(async () => ({
        data: {
          rows: [
            {
              id: 'tx-b',
              description: 'Passagem',
              amount: 900,
              payment_date: '2026-10-06',
              account_id: 'acc-1',
              status: 'PAGO',
              type: 'DESPESA',
              currency: 'BRL',
            },
            {
              id: 'tx-a',
              description: 'Hotel',
              amount: 500,
              payment_date: '2026-10-05',
              account_id: 'acc-1',
              status: 'PAGO',
              type: 'DESPESA',
              currency: 'BRL',
            },
          ],
          total: 2,
          amounts: { BRL: 1400 },
          years: [2026],
        },
        error: null,
      })),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  };
});

const renderManager = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MFTagsManager user={{ id: 'test-user' }} />
    </QueryClientProvider>
  );
};

describe('MFTagsManager — gestão de tags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
  });

  it('lista com utilização e filtra pela busca', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tags-manager-row-tag-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('mf-tags-manager-usage-tag-1')).toHaveTextContent('2');
    expect(screen.getByTestId('mf-tags-manager-usage-tag-2')).toHaveTextContent('1');

    fireEvent.change(screen.getByTestId('mf-tags-manager-search'), {
      target: { value: 'cas' },
    });
    expect(screen.queryByTestId('mf-tags-manager-row-tag-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-tags-manager-row-tag-2')).toBeInTheDocument();
  });

  it('ver lançamentos abre o modal paginado da tag', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tags-manager-row-tag-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-tags-manager-view-tag-1'));
    expect(screen.getByTestId('mf-tag-tx-modal')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tag-tx-row-tx-b')).toHaveTextContent('Passagem');
    });
    expect(screen.getByTestId('mf-tag-tx-row-tx-a')).toHaveTextContent('Hotel');
    expect(screen.getByTestId('mf-tag-tx-page')).toHaveTextContent(
      'minhasfinancas.tag_tx_page'
    );

    // busca no modal e fechar
    fireEvent.change(screen.getByTestId('mf-tag-tx-search'), {
      target: { value: 'hotel' },
    });
    expect(screen.getByTestId('mf-tag-tx-search')).toHaveValue('hotel');
    fireEvent.click(screen.getByTestId('mf-tag-tx-close'));
    expect(screen.queryByTestId('mf-tag-tx-modal')).not.toBeInTheDocument();
  });

  it('nova tag abre o modal e salva', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tags-manager-row-tag-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-tags-manager-new'));
    expect(screen.getByTestId('mf-tag-modal')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('mf-tag-modal-name'), {
      target: { value: 'Praia' },
    });
    fireEvent.click(screen.getByTestId('mf-tag-modal-save'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_tags').insert).toHaveBeenCalled();
    });
    expect(supabase.from('mf_tags').insert.mock.calls[0][0]).toMatchObject({
      name: 'Praia',
    });
  });

  it('exclui com confirmação automática', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tags-manager-del-tag-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-tags-manager-del-tag-1'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_tags').delete).toHaveBeenCalled();
    });
  });
});
