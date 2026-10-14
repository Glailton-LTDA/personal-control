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
      maybeSingle: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
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
  const notifRow = { recipient_email: 'dest@test.com', bcc_email: null, skip_email_modal: true };
  const notifSettings = makeChain({ data: notifRow, error: null });
  const responsibles = makeChain({
    data: [
      { id: 'resp-1', name: 'Deisianne', email: 'dei@test.com', is_main: false },
      { id: 'resp-2', name: 'Glailton', email: 'glai@test.com', is_main: true },
    ],
    error: null,
  });
  const empty = makeChain({ data: [], error: null });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_transactions') return transactions;
        if (table === 'mf_categories') return categories;
        if (table === 'notification_settings') return notifSettings;
        if (table === 'finance_responsibles') return responsibles;
        return empty;
      }),
      functions: {
        invoke: vi.fn().mockResolvedValue({ error: null }),
      },
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
    __notifRow: notifRow,
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

    // extrato de UMA conta: o servidor já filtra (origem ou destino)
    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    expect(chain.or).toHaveBeenCalledWith(
      'account_id.eq.acc-1,transfer_account_id.eq.acc-1'
    );

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

  it('x limpa a busca e mostra tudo de novo', async () => {
    renderTimeline();

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-d')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('mf-timeline-search-clear')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-timeline-search'), { target: { value: 'luz' } });
    expect(screen.queryByTestId('mf-timeline-item-tx-d')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-timeline-search-clear'));
    expect(screen.getByTestId('mf-timeline-search')).toHaveValue('');
    expect(screen.getByTestId('mf-timeline-item-tx-d')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-timeline-search-clear')).not.toBeInTheDocument();
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
    ['select', 'order', 'gte', 'lte', 'eq', 'limit', 'single', 'or'].forEach((method) => {
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

  it('modo pré-carregado usa as transações passadas sem buscar', async () => {    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

  it('envia o comprovante com o nome da categoria', async () => {
    renderTimeline();

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-d')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-timeline-email-tx-d'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-finance-email', {
        body: {
          to: 'dest@test.com',
          subject: 'minhasfinancas.email_subject_expense',
          data: {
            description: 'Mercado',
            category: 'Alimentação',
            type: 'DESPESA',
            status: 'PAGO',
            amount: 100,
            payment_date: '2026-10-05',
          },
          bcc: null,
        },
      });
    });
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalledWith({ email_sent: true });
    });
    expect(chain.eq).toHaveBeenCalledWith('id', 'tx-d');
  });

  it('sem pular o modal, abre a escolha e envia ao responsável', async () => {
    const { __notifRow } = await import('../../lib/supabase');
    __notifRow.skip_email_modal = false;
    try {
      renderTimeline();

      await waitFor(() => {
        expect(screen.getByTestId('mf-timeline-item-tx-d')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mf-timeline-email-tx-d'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-email-modal')).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.getByTestId('mf-email-resp-resp-2')).toBeInTheDocument();
      });

      const { supabase } = await import('../../lib/supabase');
      expect(supabase.functions.invoke).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('mf-email-resp-resp-2'));
      await waitFor(() => {
        expect(supabase.functions.invoke).toHaveBeenCalledWith(
          'send-finance-email',
          expect.objectContaining({
            body: expect.objectContaining({ to: 'glai@test.com' }),
          })
        );
      });
      await waitFor(() => {
        expect(screen.queryByTestId('mf-email-modal')).not.toBeInTheDocument();
      });
    } finally {
      __notifRow.skip_email_modal = true;
    }
  });

  it('linha clicável sem aninhar botões (role + teclado)', async () => {
    const onOpenTx = vi.fn();
    renderTimeline({ onOpenTx });

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-d')).toBeInTheDocument();
    });

    const row = screen.getByTestId('mf-timeline-item-tx-d');
    expect(row.tagName).toBe('DIV');
    expect(row.getAttribute('role')).toBe('button');
    // botões internos (email) existem sem aninhamento inválido
    expect(row.querySelector('button[data-testid="mf-timeline-email-tx-d"]')).toBeInTheDocument();

    fireEvent.click(row);
    expect(onOpenTx).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-d' }));

    onOpenTx.mockClear();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onOpenTx).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-d' }));
  });

  it('cartão: extrato segue a fatura (vinculada fora, futura dentro)', async () => {
    const cardAccount = {
      id: 'acc-card',
      name: 'Cartão',
      currency: 'BRL',
      account_type: 'CARTAO',
      initial_balance: 0,
    };
    const txs = [
      {
        id: 'tx-nov',
        account_id: 'acc-card',
        type: 'DESPESA',
        description: 'Teste Nov',
        amount: 10,
        payment_date: '2026-10-11',
        status: 'PAGO',
        category_id: null,
        invoice_close: '2026-11-14',
      },
      {
        id: 'tx-oct',
        account_id: 'acc-card',
        type: 'DESPESA',
        description: 'Compra Out',
        amount: 20,
        payment_date: '2026-10-05',
        status: 'PAGO',
        category_id: null,
        invoice_close: null,
      },
    ];

    // Outubro: a vinculada a novembro não aparece
    const first = renderTimeline({
      account: cardAccount,
      monthKey: '2026-10',
      transactions: txs,
      accounts: [cardAccount],
    });
    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-oct')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('mf-timeline-item-tx-nov')).not.toBeInTheDocument();
    first.unmount();

    // Novembro: aparece agrupada pela data de lançamento (11/10)
    renderTimeline({
      account: cardAccount,
      monthKey: '2026-11',
      transactions: txs,
      accounts: [cardAccount],
    });
    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-nov')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mf-timeline-day-2026-10-11')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-timeline-item-tx-oct')).not.toBeInTheDocument();
  });
});
