import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFCardAnticipateModal from './MFCardAnticipateModal';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: {
      changeLanguage: vi.fn(),
      language: 'pt-BR',
    },
  }),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

// Mock Supabase
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
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      then: vi.fn((onFulfilled, onRejected) =>
        Promise.resolve(typeof result === 'function' ? result() : result).then(
          onFulfilled,
          onRejected
        )
      ),
    };
    return chain;
  };

  const card = {
    id: 'acc-card',
    name: 'Nubank',
    account_type: 'CARTAO',
    currency: 'BRL',
    closing_day: 30,
    due_day: 7,
    linked_account_id: 'acc-check',
  };
  const accounts = makeChain({ data: [card], error: null });
  const transactions = makeChain(() => ({
    data: [
      { id: 'p1', account_id: 'acc-card', type: 'DESPESA', description: 'Teste', amount: 250, payment_date: '2026-11-10', status: 'PAGO', installments_current: 1, installments_total: 4, parent_transaction_id: null, invoice_close: '2026-10-30' },
      { id: 'p2', account_id: 'acc-card', type: 'DESPESA', description: 'Teste', amount: 250, payment_date: '2026-12-10', status: 'PAGO', installments_current: 2, installments_total: 4, parent_transaction_id: 'p1', invoice_close: '2026-11-30' },
      { id: 'p3', account_id: 'acc-card', type: 'DESPESA', description: 'Teste', amount: 250, payment_date: '2027-01-10', status: 'PAGO', installments_current: 3, installments_total: 4, parent_transaction_id: 'p1', invoice_close: '2026-12-30' },
      { id: 'p4', account_id: 'acc-card', type: 'DESPESA', description: 'Teste', amount: 250, payment_date: '2027-02-10', status: 'PAGO', installments_current: 4, installments_total: 4, parent_transaction_id: 'p1', invoice_close: '2027-01-30' },
    ],
    error: null,
  }));

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        return transactions;
      }),
      storage: { from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: null }) })) },
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
  };
});

const card = {
  id: 'acc-card',
  name: 'Nubank',
  account_type: 'CARTAO',
  currency: 'BRL',
  closing_day: 30,
  due_day: 7,
  linked_account_id: 'acc-check',
};

const anchor = {
  id: 'p1',
  account_id: 'acc-card',
  type: 'DESPESA',
  description: 'Teste',
  amount: 250,
  installments_current: 1,
  installments_total: 4,
  parent_transaction_id: null,
  invoice_close: '2026-10-30',
};

const renderModal = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MFCardAnticipateModal
        tx={anchor}
        card={card}
        user={{ id: 'test-user' }}
        onClose={() => {}}
      />
    </QueryClientProvider>
  );
};

describe('MFCardAnticipateModal — antecipar parcelas de cartão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 4, 12, 0, 0) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('move as futuras para a fatura corrente (shift reverso, sem estorno)', async () => {
    renderModal();
    await waitFor(
      () => {
        expect(screen.getByTestId('mf-card-anticipate-count')).toHaveValue(3);
      },
      { timeout: 10000 }
    );
    // antecipar só 1: 2/4 vai a outubro; 3/4 e 4/4 sobem (shift reverso)
    fireEvent.change(screen.getByTestId('mf-card-anticipate-count'), {
      target: { value: '1' },
    });
    expect(screen.getByTestId('mf-card-anticipate-preview')).toHaveTextContent(
      'minhasfinancas.card_anticipate_moved'
    );

    fireEvent.click(screen.getByTestId('mf-card-anticipate-confirm'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalledTimes(3);
    });
    const closes = chain.update.mock.calls.map((call) => call[0].invoice_close);
    // 2/4 → outubro; 3/4 → dezembro (fatura da 2/4); 4/4 → janeiro
    expect(closes).toEqual(['2026-09-30', '2026-11-30', '2026-12-30']);
    // sem desconto → sem estorno
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('com desconto cria o estorno separado na fatura destino', async () => {
    renderModal();
    await waitFor(
      () => {
        expect(screen.getByTestId('mf-card-anticipate-count')).toHaveValue(3);
      },
      { timeout: 10000 }
    );

    fireEvent.change(screen.getByTestId('mf-card-anticipate-discount'), {
      target: { value: '200' },
    });
    fireEvent.click(screen.getByTestId('mf-card-anticipate-confirm'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert).toHaveBeenCalled();
    });
    expect(chain.insert.mock.calls[0][0][0]).toMatchObject({
      type: 'DESPESA',
      account_id: 'acc-card',
      amount: -2,
      status: 'PAGO',
      invoice_close: '2026-09-30',
      description: 'minhasfinancas.card_anticipate_estorno_desc',
    });
  });
});
