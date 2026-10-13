import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFCardInvoices from './MFCardInvoices';
import { clearInvoiceSel } from './mfViewState';

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

// Mock Supabase: cartão + 1 despesa na fatura corrente.
vi.mock('../../lib/supabase', () => {
  const makeChain = (result) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
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

  const card = {
    id: 'card-1',
    name: 'Visa',
    account_type: 'CARTAO',
    currency: 'BRL',
    initial_balance: 0,
    closing_day: 10,
    due_day: 20,
    credit_limit: 3000,
    linked_account_id: null,
    color: '#f59e0b',
  };
  const accounts = makeChain({ data: [card], error: null });
  const transactions = makeChain({
    data: [
      {
        id: 'tx-1',
        account_id: 'card-1',
        type: 'DESPESA',
        description: 'Compra',
        amount: 350,
        payment_date: '2026-10-05',
        due_date: '2026-10-05',
        effective_date: '2026-10-05',
        status: 'PAGO',
        category_id: null,
        recurrence: 'NONE',
      },
    ],
    error: null,
  });
  const empty = makeChain({ data: [], error: null });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_transactions') return transactions;
        return empty;
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
  };
});

const mockUser = { id: 'test-user', email: 'test@example.com' };
const card = {
  id: 'card-1',
  name: 'Visa',
  account_type: 'CARTAO',
  currency: 'BRL',
  initial_balance: 0,
  closing_day: 10,
  due_day: 20,
  credit_limit: 3000,
  linked_account_id: null,
  color: '#f59e0b',
};

const renderInvoices = (overrides = {}) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MFCardInvoices card={card} user={mockUser} monthKey="2026-10" {...overrides} />
    </QueryClientProvider>
  );
};

describe('MFCardInvoices — Reajustar saldo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearInvoiceSel();
  });

  it('abre o Reajustar no modo fatura (sem alterar saldo inicial)', async () => {
    renderInvoices();

    await waitFor(() => {
      expect(screen.getByTestId('mf-invoice-chip-current')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-invoice-adjust'));
    expect(screen.getByTestId('mf-adjust-modal')).toBeInTheDocument();
    // fatura não tem "Alterar saldo inicial"
    expect(screen.queryByTestId('mf-adjust-opt-initial')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-adjust-target')).toBeInTheDocument();
  });

  it('manual e transferência chamam os callbacks da fatura', async () => {
    const onManualTx = vi.fn();
    const onOpenTransfer = vi.fn();
    renderInvoices({ onManualTx, onOpenTransfer });

    await waitFor(() => {
      expect(screen.getByTestId('mf-invoice-chip-current')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-invoice-adjust'));
    fireEvent.click(screen.getByTestId('mf-adjust-opt-manual'));
    fireEvent.click(screen.getByTestId('mf-adjust-save'));
    expect(onManualTx).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('mf-invoice-adjust'));
    fireEvent.click(screen.getByTestId('mf-adjust-opt-transfer'));
    fireEvent.click(screen.getByTestId('mf-adjust-save'));
    expect(onOpenTransfer).toHaveBeenCalledTimes(1);
  });
});
