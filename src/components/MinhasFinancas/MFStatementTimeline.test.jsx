import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFStatementTimeline from './MFStatementTimeline';

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

// Mock Supabase: 1 conta + 3 lançamentos em outubro + 1 categoria.
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
  const accounts = makeChain({
    data: [
      {
        id: 'acc-1',
        name: 'Nubank',
        account_type: 'CORRENTE',
        currency: 'BRL',
        initial_balance: 1000,
      },
    ],
    error: null,
  });
  const transactions = makeChain({
    data: [
      {
        id: 'tx-r',
        account_id: 'acc-1',
        type: 'RECEITA',
        description: 'Salário',
        amount: 500,
        payment_date: '2026-10-03',
        status: 'PAGO',
        category_id: null,
      },
      {
        id: 'tx-d',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Mercado',
        amount: 100,
        payment_date: '2026-10-05',
        status: 'PAGO',
        category_id: 'cat-food',
      },
      {
        id: 'tx-p',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Conta de luz',
        amount: 40,
        payment_date: '2026-10-07',
        effective_date: null,
        status: 'PENDENTE',
        category_id: null,
      },
    ],
    error: null,
  });
  const categories = makeChain({
    data: [{ id: 'cat-food', name: 'Alimentação', icon: '🍔', color: '#f59e0b' }],
    error: null,
  });
  const empty = makeChain({ data: [], error: null });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_transactions') return transactions;
        if (table === 'mf_categories') return categories;
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
const account = { id: 'acc-1', name: 'Nubank', currency: 'BRL' };

const renderTimeline = (overrides = {}) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MFStatementTimeline
        account={account}
        user={mockUser}
        monthKey="2026-10"
        onOpenTx={() => {}}
        {...overrides}
      />
    </QueryClientProvider>
  );
};

describe('MFStatementTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('agrupa por dia (mais recente primeiro) com avatar, saldos e abertura', async () => {
    renderTimeline();

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-day-2026-10-07')).toBeInTheDocument();
    });

    // ordem desc: 07, 05, 03
    const days = screen.getAllByTestId(/mf-timeline-day-/);
    expect(days.map((el) => el.dataset.testid)).toEqual([
      'mf-timeline-day-2026-10-07',
      'mf-timeline-day-2026-10-05',
      'mf-timeline-day-2026-10-03',
    ]);

    // avatar da categoria no Mercado
    expect(screen.getByTestId('mf-timeline-item-tx-d')).toHaveTextContent('🍔');
    // pendente tem Efetivar; pago não
    expect(screen.getByTestId('mf-timeline-settle-tx-p')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-timeline-settle-tx-d')).not.toBeInTheDocument();

    // saldo do dia (1000 + 500 − 100 = 1400) e abertura (1000)
    expect(screen.getByTestId('mf-timeline-balance-2026-10-05')).toBeInTheDocument();
    expect(screen.getByTestId('mf-timeline-opening')).toBeInTheDocument();
  });

  it('busca filtra os lançamentos', async () => {
    renderTimeline();

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-d')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('mf-timeline-search'), { target: { value: 'luz' } });
    expect(screen.getByTestId('mf-timeline-item-tx-p')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-timeline-item-tx-d')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-timeline-search'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('mf-timeline-empty')).toBeInTheDocument();
  });

  it('efetiva o pendente pela linha', async () => {
    renderTimeline();

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-settle-tx-p')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-timeline-settle-tx-p'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalledWith({
        status: 'PAGO',
        effective_date: expect.any(String),
      });
    });
    const toast = (await import('react-hot-toast')).default;
    expect(toast.success).toHaveBeenCalledWith('minhasfinancas.tx_marked_paid');
  });

  it('mostra skeleton enquanto carrega', () => {
    // primeiro render (síncrono) = loading, antes das queries resolverem
    renderTimeline();
    expect(screen.getByTestId('mf-timeline-loading')).toBeInTheDocument();
  });

  it('erro mostra mensagem e o retry recarrega', async () => {    const { supabase } = await import('../../lib/supabase');
    const origImpl = supabase.from.getMockImplementation();
    const rejectChain = {};
    ['select', 'order', 'gte', 'lte', 'eq', 'limit', 'single'].forEach((method) => {
      rejectChain[method] = () => rejectChain;
    });
    rejectChain.then = (onFulfilled, onRejected) =>
      Promise.reject(new Error('boom')).then(onFulfilled, onRejected);
    supabase.from.mockImplementation((table) =>
      table === 'mf_transactions' ? rejectChain : origImpl(table)
    );

    renderTimeline();
    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mf-timeline-retry')).toBeInTheDocument();

    // mock saudável de volta → retry cura (cenário da thread morta)
    supabase.from.mockImplementation(origImpl);
    fireEvent.click(screen.getByTestId('mf-timeline-retry'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-d')).toBeInTheDocument();
    });
  });

  it('modo pré-carregado usa as transações passadas sem buscar', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MFStatementTimeline
          account={{ id: 'acc-1', name: 'Nubank', currency: 'BRL' }}
          user={{ id: 'test-user' }}
          monthKey="2026-10"
          transactions={[
            {
              id: 'tx-r',
              account_id: 'acc-1',
              type: 'RECEITA',
              description: 'Salário',
              amount: 500,
              payment_date: '2026-10-03',
              status: 'PAGO',
              category_id: null,
            },
          ]}
          accounts={[{ id: 'acc-1', name: 'Nubank', currency: 'BRL', initial_balance: 1000 }]}
          txLoading={false}
          txError={null}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-r')).toBeInTheDocument();
    });
    // abertura = inicial (1000) e nenhum fetch de extrato disparado
    expect(screen.getByTestId('mf-timeline-opening')).toBeInTheDocument();
    const { supabase } = await import('../../lib/supabase');
    const tables = supabase.from.mock.calls.map((call) => call[0]);
    expect(tables).not.toContain('mf_transactions');
  });
});
