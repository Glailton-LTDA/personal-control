import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFAccountDetail from './MFAccountDetail';
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

// Mock Supabase
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
      or: vi.fn().mockReturnThis(),
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
        initial_balance: 0,
        color: '#6366f1',
        sort_order: 0,
      },
      {
        id: 'acc-2',
        name: 'Itaú',
        account_type: 'CORRENTE',
        currency: 'BRL',
        initial_balance: 0,
        color: '#06b6d4',
        sort_order: 1,
      },
      {
        id: 'acc-card',
        name: 'Visa',
        account_type: 'CARTAO',
        currency: 'BRL',
        initial_balance: 0,
        color: '#f59e0b',
        sort_order: 2,
        closing_day: 10,
        due_day: 20,
        credit_limit: 3000,
        linked_account_id: 'acc-1',
      },
      {
        id: 'acc-card2',
        name: 'Master',
        account_type: 'CARTAO',
        currency: 'BRL',
        initial_balance: 0,
        color: '#8b5cf6',
        sort_order: 3,
        closing_day: 5,
        due_day: 15,
        credit_limit: 2000,
        linked_account_id: 'acc-1',
      },
    ],
    error: null,
  });
  const categories = makeChain({
    data: [
      { id: 'cat-market', name: 'Mercado', type: 'DESPESA', parent_id: null, color: '#f59e0b' },
      { id: 'cat-refunds', name: 'Estornos', type: 'DESPESA', parent_id: null, color: '#10b981' },
    ],
    error: null,
  });
  const tags = makeChain({ data: [], error: null });
  const transactions = makeChain({
    data: [
      {
        id: 'tx-paid',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Mercado',
        amount: 100,
        payment_date: '2026-10-05',
        due_date: '2026-10-05',
        effective_date: '2026-10-05',
        status: 'PAGO',
        category_id: 'cat-market',
        recurrence: 'NONE',
      },
      {
        id: 'tx-pending',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Conta de luz',
        amount: 50,
        payment_date: '2026-10-20',
        due_date: '2026-10-20',
        effective_date: null,
        status: 'PENDENTE',
        category_id: null,
        installments_current: 3,
        installments_total: 6,
        recurrence: 'NONE',
      },
      {
        id: 'tx-transfer',
        account_id: 'acc-2',
        transfer_account_id: 'acc-1',
        type: 'TRANSFERENCIA',
        description: 'Depósito',
        amount: 200,
        payment_date: '2026-10-10',
        due_date: '2026-10-10',
        effective_date: '2026-10-10',
        status: 'PAGO',
        category_id: null,
        recurrence: 'NONE',
      },
      {
        id: 'tx-cancelled',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Lançamento cancelado',
        amount: 999,
        payment_date: '2026-10-01',
        due_date: '2026-10-01',
        effective_date: null,
        status: 'CANCELADO',
        category_id: null,
        recurrence: 'NONE',
      },
      {
        id: 'tx-card1',
        account_id: 'acc-card',
        type: 'DESPESA',
        description: 'Compra no cartão',
        amount: 350,
        payment_date: '2026-10-02',
        due_date: '2026-10-02',
        effective_date: '2026-10-02',
        status: 'PAGO',
        category_id: null,
        recurrence: 'NONE',
      },
      {
        // Parcela já vinculada à fatura de NOVEMBRO (fecha 10/11), paga
        // em outubro: conta no mês de pagamento, mas NÃO é da fatura
        // corrente de outubro (fecha 10/10) — base do teste da pizza.
        id: 'tx-card-future',
        account_id: 'acc-card',
        type: 'DESPESA',
        description: 'Parcela vinculada',
        amount: 100,
        payment_date: '2026-10-05',
        due_date: '2026-10-05',
        effective_date: '2026-10-05',
        status: 'PAGO',
        category_id: 'cat-market',
        invoice_close: '2026-11-10',
        recurrence: 'NONE',
      },
      {
        // Fatura quitada do 2º cartão (setembro: fecha 05/09, vence 15/09)
        id: 'tx-card2-buy',
        account_id: 'acc-card2',
        type: 'DESPESA',
        description: 'Compra quitada',
        amount: 200,
        payment_date: '2026-09-20',
        due_date: '2026-09-20',
        effective_date: '2026-09-20',
        status: 'PAGO',
        category_id: null,
        recurrence: 'NONE',
      },
      {
        id: 'tx-card2-pay',
        account_id: 'acc-2',
        transfer_account_id: 'acc-card2',
        type: 'TRANSFERENCIA',
        description: 'Pagamento fatura',
        amount: 200,
        payment_date: '2026-10-06',
        due_date: '2026-10-06',
        effective_date: '2026-10-06',
        status: 'PAGO',
        category_id: null,
        recurrence: 'NONE',
        invoice_close: '2026-09-05',
      },
      {
        id: 'tx-refund',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Devolução loja',
        amount: -20,
        payment_date: '2026-10-06',
        due_date: '2026-10-06',
        effective_date: '2026-10-06',
        status: 'PAGO',
        category_id: 'cat-refunds',
        recurrence: 'NONE',
      },
      {
        // Receita do mês anterior: base do aviso de saldo inicial customizado
        id: 'tx-sept',
        account_id: 'acc-1',
        type: 'RECEITA',
        description: 'Salário setembro',
        amount: 1000,
        payment_date: '2026-09-15',
        due_date: '2026-09-15',
        effective_date: '2026-09-15',
        status: 'PAGO',
        category_id: null,
        recurrence: 'NONE',
      },
    ],
    error: null,
  });
  const transactionTags = makeChain({ data: [], error: null });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_categories') return categories;
        if (table === 'mf_tags') return tags;
        if (table === 'mf_transaction_tags') return transactionTags;
        return transactions;
      }),
      storage: {
        from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: null }) })),
      },
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
  };
});

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

const renderWithProviders = (ui) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
};

const mockUser = { id: 'test-user', email: 'test@example.com' };

const account = {
  id: 'acc-1',
  name: 'Nubank',
  account_type: 'CORRENTE',
  currency: 'BRL',
  color: '#6366f1',
  initial_balance: 0,
  receitas: 200,
  despesas: 150,
  transfCredito: 200,
  transfDebito: 0,
};

const cardAccount = {
  id: 'acc-card',
  name: 'Visa',
  account_type: 'CARTAO',
  currency: 'BRL',
  color: '#f59e0b',
  initial_balance: 0,
  closing_day: 10,
  due_day: 20,
  credit_limit: 3000,
  linked_account_id: 'acc-1',
  receitas: 0,
  despesas: 350,
};

const renderDetail = (overrides = {}) =>
  renderWithProviders(
    <MFAccountDetail
      account={account}
      user={mockUser}
      monthKey="2026-10"
      onChangeMonth={() => {}}
      onClose={() => {}}
      {...overrides}
    />
  );

describe('MFAccountDetail', () => {
  // Intl formata "R$ 100,00" com NBSP (U+00A0); normaliza para comparar
  const txt = (testId) => screen.getByTestId(testId).textContent.replace(/\u00a0/g, ' ');

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
    clearInvoiceSel();
  });

  /** Linha → modal Detalhes → Editar → tela completa. */
  const openDetailEdit = async (rowTestId) => {
    fireEvent.click(screen.getByTestId(rowTestId));
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-detail')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-detail-edit'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-screen')).toBeInTheDocument();
    });
  };


  it('abre a tela de lancamento ao clicar numa linha da timeline', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-pending')).toBeInTheDocument();
    });

    await openDetailEdit('mf-timeline-item-tx-pending');
  });

  it('busca lançamentos só da conta + cartões vinculados (sem full scan)', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-pending')).toBeInTheDocument();
    });

    // acc-1 + os dois cartões vinculados (origem ou destino), nada além
    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    expect(chain.or).toHaveBeenCalledWith(
      'account_id.in.(acc-1,acc-card,acc-card2),transfer_account_id.in.(acc-1,acc-card,acc-card2)'
    );
  });

  it('abre a tela de novo lancamento ja com a conta pre-preenchida', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-pending')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-acct-det-new-tx'));
    // Menu contextual da conta: despesa, receita e transferência
    expect(screen.getByTestId('mf-acct-det-add-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-add-opt-expense'));

    expect(screen.getByTestId('mf-tx-screen')).toBeInTheDocument();
    await waitFor(() => {
      // pré-preenchida com a conta do detalhe (Nubank)
      expect(screen.getByTestId('mf-tx-account')).toHaveTextContent('Nubank');
    });

    // Volta do detalhe
    fireEvent.click(screen.getByTestId('mf-tx-back'));
    expect(screen.getByTestId('mf-account-detail')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-screen')).not.toBeInTheDocument();
  });

  it('menu "+" da conta lista Despesa, Receita e Transferência (sem cartão/estorno)', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-pending')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-acct-det-new-tx'));
    expect(screen.getByTestId('mf-acct-det-add-menu')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-expense')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-income')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-transfer')).toBeInTheDocument();
    // Escopo do detalhe de conta: sem despesa de cartão nem estorno
    expect(screen.queryByTestId('mf-add-opt-cardExpense')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-add-opt-estorno')).not.toBeInTheDocument();

    // Transferência abre o modal direto (sem tela de criação)
    fireEvent.click(screen.getByTestId('mf-add-opt-transfer'));
    expect(screen.getByTestId('mf-transfer-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-screen')).not.toBeInTheDocument();
  });

  it('menu "+" do cartão lista Despesa cartão e Estorno; estorno grava negativo', async () => {
    renderDetail({ account: cardAccount });

    await waitFor(() => {
      expect(screen.getByTestId('mf-acct-det-invoices')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-acct-det-new-tx'));
    expect(screen.getByTestId('mf-acct-det-add-menu')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-cardExpense')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-estorno')).toBeInTheDocument();
    // Escopo do detalhe do cartão: só despesa de cartão e estorno
    expect(screen.queryByTestId('mf-add-opt-expense')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-add-opt-income')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-add-opt-transfer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-add-opt-estorno'));

    expect(screen.getByTestId('mf-tx-screen')).toBeInTheDocument();
    // Tela de estorno: selo fixo de tipo, sem status/parcelas, com Fatura
    expect(screen.getByTestId('mf-tx-type-badge')).toHaveTextContent('minhasfinancas.add_estorno');
    expect(screen.queryByTestId('mf-tx-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-installments')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-invoice')).toBeInTheDocument();
    // Único cartão pré-selecionado
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-account')).toHaveTextContent('Visa');
    });

    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Devolução loja' },
    });
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '20,00' } });
    fireEvent.click(screen.getByTestId('mf-tx-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert).toHaveBeenCalled();
    });
    // Valor positivo digitado → gravado negativo (reduz a fatura)
    expect(chain.insert.mock.calls[0][0][0]).toMatchObject({
      account_id: 'acc-card',
      type: 'DESPESA',
      status: 'PAGO',
      amount: -20,
      description: 'Devolução loja',
    });
  });

  it('mostra o extrato vazio quando a conta nao tem lancamentos', async () => {
    renderDetail({ account: { ...account, id: 'acc-9', name: 'Carteira' } });

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-empty')).toBeInTheDocument();
    });

    expect(screen.getByTestId('mf-account-detail')).toHaveTextContent('Carteira');
  });

  it('cartao detalha as faturas (chips + detalhe) sem secao de vinculados', async () => {
    renderDetail({ account: cardAccount });

    await waitFor(() => {
      expect(screen.getByTestId('mf-acct-det-invoices')).toBeInTheDocument();
    });

    expect(screen.getByTestId('mf-invoice-chip-current')).toBeInTheDocument();
    expect(screen.getByTestId('mf-invoice-detail')).toBeInTheDocument();
    expect(screen.getByTestId('mf-invoice-status')).toHaveTextContent(
      'minhasfinancas.card_status_current'
    );
    expect(screen.queryByTestId('mf-acct-det-linked-cards')).not.toBeInTheDocument();

    // Seleciona uma fatura fechada quando houver movimento nela
    const closedChip = document.querySelector('[data-testid^="mf-invoice-chip-20"]');
    if (closedChip) {
      fireEvent.click(closedChip);
      expect(screen.getByTestId('mf-invoice-detail')).toBeInTheDocument();
    }
  });

  it('abre a edição ao clicar num lançamento da fatura do cartão', async () => {
    renderDetail({ account: cardAccount });

    // Espera os dados da fatura: linha da compra (fatura corrente) ou o
    // chip da fatura fechada 10/10 (a compra migra pra ela depois do
    // fechamento) — mf-invoice-detail é estático e renderiza sem dados.
    await waitFor(() => {
      expect(
        screen.queryByTestId('mf-card-tx-row') ||
          screen.queryByTestId('mf-invoice-chip-2026-10-10')
      ).toBeTruthy();
    });

    // A compra (02/10) fica na fatura corrente até o fechamento de 10/10;
    // depois disso migra para a fatura fechada 10/10.
    if (!screen.queryByTestId('mf-card-tx-row')) {
      fireEvent.click(screen.getByTestId('mf-invoice-chip-2026-10-10'));
    }
    await openDetailEdit('mf-card-tx-row');

    // Mesmo fluxo dos demais lançamentos: MFTransacaoScreen pré-preenchida
    expect(screen.getByTestId('mf-tx-description')).toHaveValue('Compra no cartão');

    // Volta do detalhe
    fireEvent.click(screen.getByTestId('mf-tx-back'));
    expect(screen.getByTestId('mf-account-detail')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-screen')).not.toBeInTheDocument();
  });

  it('conta exibe a fatura do cartao vinculado e paga por transferencia', async () => {
    // Relatório congelado na véspera do vencimento (20/10): com o relógio
    // real no próprio vencimento, o modal cria PAGO (vencimento de hoje
    // não é futuro) e o caso "agendada: efetivável no Extrato" não existe.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 19, 12, 0, 0) });
    try {
      renderDetail();

      await waitFor(() => {
        expect(screen.getByTestId('mf-linked-card-acc-card')).toBeInTheDocument();
      });

      expect(screen.getByTestId('mf-linked-card-amount-acc-card')).toHaveTextContent('R$ 350,00');
      expect(screen.getByTestId('mf-linked-card-icon-acc-card')).toBeInTheDocument();
      expect(screen.queryByTestId('mf-acct-det-invoices')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('mf-linked-card-pay-acc-card'));

      // Modal "Quanto você quer pagar?" → Continuar agenda no vencimento
      await waitFor(() => {
        expect(screen.getByTestId('mf-pay-modal')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('mf-pay-continue'));

      const { supabase } = await import('../../lib/supabase');
      await waitFor(() => {
        expect(supabase.from('mf_transactions').insert).toHaveBeenCalled();
      });
      expect(supabase.from('mf_transactions').insert.mock.calls[0][0][0]).toMatchObject({
        user_id: 'test-user',
        type: 'DESPESA',
        account_id: 'acc-1', // origem: a própria conta (sem transação no cartão)
        amount: 350,
        status: 'PENDENTE', // agendada: efetivável no Extrato
        payment_date: '2026-10-20', // vencimento da fatura
        invoice_close: '2026-10-10', // vínculo com a fatura corrente
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('cartão vinculado quitado mostra o valor da última fatura com PAGA', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('mf-linked-card-acc-card2')).toBeInTheDocument();
    });

    // fatura de setembro quitada: mostra o total (não zero) + tag PAGA,
    // sem botão de pagar (nada em aberto)
    expect(txt('mf-linked-card-amount-acc-card2')).toBe('R$ 200,00');
    expect(screen.getByTestId('mf-linked-card-status-acc-card2')).toHaveTextContent(
      'minhasfinancas.card_status_paid'
    );
    expect(screen.queryByTestId('mf-linked-card-pay-acc-card2')).not.toBeInTheDocument();
  });

  it('cartão vinculado: o nome abre o detalhe do cartão pelo callback do pai', async () => {
    const onOpenCard = vi.fn();
    renderDetail({ onOpenCard });

    const open = await screen.findByTestId('mf-linked-card-open-acc-card');
    fireEvent.click(open);

    // A navegação é resolvida pelo pai (drill) — o detalhe só emite o card
    expect(onOpenCard).toHaveBeenCalledTimes(1);
    expect(onOpenCard.mock.calls[0][0]).toMatchObject({
      id: 'acc-card',
      account_type: 'CARTAO',
    });
  });

  it('sem onOpenCard o nome do cartão segue como texto (contexto legado)', async () => {
    renderDetail();

    await screen.findByTestId('mf-linked-card-acc-card');
    expect(screen.queryByTestId('mf-linked-card-open-acc-card')).not.toBeInTheDocument();
  });

  it('detalhe do cartão: chip da conta vinculada abre o detalhe da conta pelo callback', async () => {
    const onOpenAccount = vi.fn();
    renderDetail({ account: cardAccount, onOpenAccount });

    const chip = await screen.findByTestId('mf-open-linked-account');
    expect(chip).toHaveTextContent('Nubank');
    fireEvent.click(chip);

    expect(onOpenAccount).toHaveBeenCalledTimes(1);
    expect(onOpenAccount.mock.calls[0][0]).toMatchObject({ id: 'acc-1', name: 'Nubank' });
  });




  it('abre o Reajustar saldo pelo cabeçalho', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-paid')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-acct-det-adjust'));
    expect(screen.getByTestId('mf-adjust-modal')).toBeInTheDocument();
    expect(screen.getByTestId('mf-adjust-target')).toBeInTheDocument();
  });

  it('Reajustar manual abre o formulário de receita; transferência abre o modal', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-paid')).toBeInTheDocument();
    });

    // saldo do teste é 1.120 → alvo maior abre receita
    fireEvent.click(screen.getByTestId('mf-acct-det-adjust'));
    fireEvent.change(screen.getByTestId('mf-adjust-target'), { target: { value: '60000' } });
    fireEvent.click(screen.getByTestId('mf-adjust-opt-manual'));
    fireEvent.click(screen.getByTestId('mf-adjust-save'));
    expect(await screen.findByTestId('mf-tx-screen')).toBeInTheDocument();
  });

  it('Reajustar transferência abre o modal de transferência', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-paid')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-acct-det-adjust'));
    fireEvent.click(screen.getByTestId('mf-adjust-opt-transfer'));
    fireEvent.click(screen.getByTestId('mf-adjust-save'));
    expect(await screen.findByTestId('mf-transfer-modal')).toBeInTheDocument();
  });

  it('Reajustar em mês passado registra o ajuste no último dia desse mês', async () => {
    renderDetail({ monthKey: '2026-09' });

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-sept')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-acct-det-adjust'));
    fireEvent.change(screen.getByTestId('mf-adjust-target'), { target: { value: '60000' } });
    expect(screen.getByTestId('mf-adjust-date')).toHaveTextContent('30/09/2026');
    fireEvent.click(screen.getByTestId('mf-adjust-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert).toHaveBeenCalled();
    });
    const txPayload = chain.insert.mock.calls
      .map((call) => call[0])
      .find((payload) => Array.isArray(payload))[0];
    expect(txPayload).toMatchObject({ payment_date: '2026-09-30', status: 'PAGO' });
  });

  it('exclui o lançamento pela tela de edição', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-paid')).toBeInTheDocument();
    });

    // sem o botão na lista — só no formulário
    expect(screen.queryByTestId('mf-tx-delete')).not.toBeInTheDocument();

    await openDetailEdit('mf-timeline-item-tx-paid');
    expect(screen.getByTestId('mf-tx-delete')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-tx-delete'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.delete).toHaveBeenCalled();
    });
    expect(chain.eq).toHaveBeenCalledWith('id', 'tx-paid');
    const toast = (await import('react-hot-toast')).default;
    expect(toast.success).toHaveBeenCalledWith('minhasfinancas.tx_deleted');
    await waitFor(() => {
      expect(screen.queryByTestId('mf-tx-screen')).not.toBeInTheDocument();
    });
  });

  it('mostra MOVIMENTAÇÃO com efetivadas e pendentes por tipo', async () => {
    renderDetail();

    // espera os lançamentos (a seção renderiza vazia antes do load)
    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-pending')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mf-det-movement')).toBeInTheDocument();

    // despesas: 100 pago − 20 estorno = 80; pendente 50
    expect(txt('mf-det-movement-despesas')).toContain('R$ 80,00');
    expect(txt('mf-det-movement-despesas')).toContain('R$ 50,00');
    // sem receitas no mês
    expect(txt('mf-det-movement-receitas')).toContain('R$ 0,00');
    // transferência recebida de 200 (paga)
    expect(txt('mf-det-movement-transfIn')).toContain('R$ 200,00');
    expect(txt('mf-det-movement-transfOut')).toContain('R$ 0,00');

    // sanfona recolhe/expande
    fireEvent.click(screen.getByTestId('mf-det-movement-toggle'));
    expect(screen.queryByTestId('mf-det-movement-despesas')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-det-movement-toggle'));
    expect(screen.getByTestId('mf-det-movement-despesas')).toBeInTheDocument();
  });

  it('mostra o saldo inicial como o fechamento do mês anterior', async () => {
    renderDetail();

    // espera o all-transactions (base do fechamento anterior)
    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-pending')).toBeInTheDocument();
    });

    // abertura de outubro = fechamento de setembro (receita de 1000),
    // não a âncora de criação (inicial 0)
    await waitFor(() => {
      expect(txt('mf-acct-det-initial')).toBe('R$ 1.000,00');
    });
    // sem a linha "saldo sem o inicial" nem o aviso de customizado
    expect(screen.queryByTestId('mf-acct-det-chip-no-initial')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-det-initial-warning')).not.toBeInTheDocument();
    // Saldo/Previsão seguem intactos
    expect(screen.getByTestId('mf-acct-det-chip-balance')).toBeInTheDocument();
    expect(screen.getByTestId('mf-acct-det-chip-forecast')).toBeInTheDocument();
  });

  it('cartão com inicial zerado não mostra bloco de saldo de conta', async () => {
    renderDetail({ account: cardAccount });

    await waitFor(() => {
      expect(screen.getByTestId('mf-acct-det-invoices')).toBeInTheDocument();
    });
    // sem bloco de saldo (abertura, Saldo/Previsão, Reajustar)
    expect(screen.queryByTestId('mf-acct-det-initial')).not.toBeInTheDocument();
  });

  it('cartão não exibe bloco de saldo de conta (só fatura/limite)', async () => {
    renderDetail({ account: cardAccount });

    await waitFor(() => {
      expect(screen.getByTestId('mf-acct-det-invoices')).toBeInTheDocument();
    });
    // Sem saldo inicial, sem Saldo/Previsão, sem Reajustar: cartão não é conta
    expect(screen.queryByTestId('mf-acct-det-initial')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-acct-det-chip-balance')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-acct-det-chip-forecast')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-acct-det-chip-no-initial')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-acct-det-adjust')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-det-initial-warning')).not.toBeInTheDocument();
    // Movimentação e faturas continuam
    expect(screen.getByTestId('mf-det-movement-despesas')).toBeInTheDocument();
    expect(screen.getByTestId('mf-acct-det-invoices')).toBeInTheDocument();
  });
  it('abas mobile: Transações primeiro; Extrato troca para Transações', async () => {    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('mf-det-tab-transacoes')).toBeInTheDocument();
    });

    // padrão: Transações ativa
    expect(screen.getByTestId('mf-det-tab-transacoes')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mf-det-panel-transacoes')).toHaveClass('mf-det-active');
    expect(screen.getByTestId('mf-det-panel-resumo')).not.toHaveClass('mf-det-active');
    // visibilidade vem só das classes (sem display inline, que venceria o CSS)
    expect(screen.getByTestId('mf-det-panel-resumo').style.display).toBe('');
    expect(screen.getByTestId('mf-det-panel-transacoes').style.display).toBe('');

    // timeline embutida com os lançamentos do mês
    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-pending')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-det-tab-resumo'));
    expect(screen.getByTestId('mf-det-panel-resumo')).toHaveClass('mf-det-active');

    // ação Extrato volta para Transações
    fireEvent.click(screen.getByTestId('mf-det-goto-statement'));
    expect(screen.getByTestId('mf-det-panel-transacoes')).toHaveClass('mf-det-active');
  });

  it('gráficos: fluxo, pizza por categoria, 12 meses e últimas despesas', async () => {
    renderDetail();

    // espera os lançamentos (cashflow/pizza derivam deles)
    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-pending')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mf-det-cashflow')).toBeInTheDocument();

    // fluxo: entradas 200 (transf. recebida) · saídas 80 (100 − 20) · % do previsto
    expect(txt('mf-det-cashflow')).toContain('R$ 200,00');
    expect(txt('mf-det-cashflow')).toContain('R$ 80,00');
    expect(txt('mf-det-cashflow')).toContain('100%');
    expect(txt('mf-det-cashflow')).toContain('62%');

    // pizza: só despesa paga positiva (Mercado 100; estorno negativo fora)
    expect(txt('mf-det-categories-total')).toContain('R$ 100,00');
    expect(txt('mf-det-cat-row-cat-market')).toContain('Mercado');
    expect(txt('mf-det-cat-row-cat-market')).toContain('100%');

    // 12 meses com histórico: gráfico (sem estado vazio)
    expect(screen.getByTestId('mf-det-12m')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-det-12m-empty')).not.toBeInTheDocument();

    // últimas: pendente (20/10), estorno (06/10), paga (05/10)
    const rows = screen.getAllByTestId(/mf-det-latest-tx-/);
    expect(rows.map((el) => el.dataset.testid)).toEqual([
      'mf-det-latest-tx-pending',
      'mf-det-latest-tx-refund',
      'mf-det-latest-tx-paid',
    ]);
    expect(screen.getByTestId('mf-det-latest-tx-refund')).toHaveTextContent(
      'minhasfinancas.tx_estornada'
    );
  });

  it('cartão: total da pizza bate com a fatura do mês (parcela de outra fatura fica fora)', async () => {
    renderDetail({ account: cardAccount });

    // Chip da fatura corrente e pizza saem da MESMA régua (linhas da
    // fatura do mês): avulsa de outubro na corrente; a parcela já
    // vinculada à fatura de novembro (paga em outubro) fica DE FORA —
    // a régua antiga (mês de pagamento) contava as duas e mostrava 450.
    await waitFor(() => {
      expect(screen.getByTestId('mf-invoice-chip-current')).toHaveTextContent('R$ 350,00');
    });
    await waitFor(() => {
      expect(txt('mf-det-categories-total')).toContain('R$ 350,00');
    });
    expect(screen.getByTestId('mf-invoice-chip-current')).toHaveTextContent(
      'minhasfinancas.card_current'
    );
  });

  it('ações no menu ⋯: editar chama o callback, arquivar grava e exclui fecha', async () => {
    const onEdit = vi.fn();
    const onClose = vi.fn();
    renderDetail({ onEdit, onClose });

    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-pending')).toBeInTheDocument();
    });

    // Editar entrega a conta ao contexto (pai abre o modal de edição)
    fireEvent.click(screen.getByTestId('mf-acct-det-menu'));
    fireEvent.click(screen.getByTestId('mf-acct-det-edit'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit.mock.calls[0][0]).toBe(account);

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_accounts');

    // Arquivar grava archived_at na conta (o id vai no .eq do filtro)
    fireEvent.click(screen.getByTestId('mf-acct-det-menu'));
    fireEvent.click(screen.getByTestId('mf-acct-det-archive'));
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalled();
    });
    expect(chain.update.mock.calls[0][0].archived_at).toBeTruthy();

    // Excluir (confirmação pulada pelo setup) fecha o detalhe
    fireEvent.click(screen.getByTestId('mf-acct-det-menu'));
    fireEvent.click(screen.getByTestId('mf-acct-det-delete'));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});

describe('MFAccountDetail — card-resumo rápido + menu ⋯', () => {
  const txt = (testId) => screen.getByTestId(testId).textContent.replace(/\u00a0/g, ' ');

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
    clearInvoiceSel();
  });

  it('conta: saldo colorido, saldo inicial, entradas/saídas, pendente e previsto', async () => {
    renderDetail();
    // Card-resumo pinta de cara (props), mas os valores do mês exigem o
    // extrato completo — espera o timeline carregar
    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-pending')).toBeInTheDocument();
    });

    // Saldo/previsto calculados dos lançamentos (mf_accounts não tem
    // saldo/previsto): setembro +1.000, outubro +200 −100 +20 = 1.120;
    // pendente −50 → previsto 1.070.
    expect(screen.getByTestId('mf-det-quick-saldo')).toHaveTextContent('R$ 1.120,00');
    // Cashflow do mês: transferência recebida 200; despesas pagas 100 − 20
    expect(txt('mf-det-quick-in')).toBe('+R$ 200,00');
    expect(txt('mf-det-quick-out')).toBe('-R$ 80,00');
    // Saldo inicial = fechamento de setembro (receita de 1.000) e
    // pendente = previsto − saldo (agendado que ainda mexe no saldo)
    expect(screen.getByTestId('mf-det-quick')).toHaveTextContent('R$ 1.000,00');
    expect(screen.getByTestId('mf-det-quick')).toHaveTextContent('-R$ 50,00');
    // Pendente difere do saldo → a linha de Previsto aparece
    expect(screen.getByTestId('mf-det-quick-forecast')).toHaveTextContent('R$ 1.070,00');
  });

  it('cores do card-resumo: pendente na cor do rótulo; saldo/previsto por sinal', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('mf-det-quick-forecast')).toBeInTheDocument();
    });
    // Pendente herda a cor do rótulo (muted) — não destaca como saldo
    expect(screen.getByTestId('mf-det-quick-pending').style.color).toBe('var(--text-muted)');
    // Saldo/previsto positivos → verde (mesma lógica em todos os valores)
    expect(screen.getByTestId('mf-det-quick-saldo').style.color).toBe('var(--success)');
    expect(screen.getByTestId('mf-det-quick-forecast').querySelector('b').style.color)
      .toBe('var(--success)');
    // Chips Saldo/Previsão do detalhe seguem a mesma lógica de sinal
    expect(screen.getByTestId('mf-acct-det-chip-balance').style.color).toBe('var(--success)');
    expect(screen.getByTestId('mf-acct-det-chip-forecast').style.color).toBe('var(--success)');
  });

  it('previsto negativo fica vermelho (card-resumo e chip)', async () => {
    // inicial −1.080 → saldo 40 (1.120 − 1.080) e previsto −10 (pendente 50)
    renderDetail({ account: { ...account, initial_balance: -1080 } });
    await waitFor(() => {
      expect(screen.getByTestId('mf-det-quick-forecast')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mf-det-quick-forecast').querySelector('b').style.color)
      .toBe('var(--danger)');
    expect(screen.getByTestId('mf-acct-det-chip-forecast').style.color).toBe('var(--danger)');
  });

  it('conta sem pendente: some a linha de Previsto (igual ao saldo)', async () => {
    // setembro não tem agendados (o pendente é de outubro)
    renderDetail({ monthKey: '2026-09' });
    await waitFor(() => {
      expect(screen.getByTestId('mf-det-quick')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('mf-det-quick-forecast')).toBeNull();
  });

  it('saldo/previsto do cabeçalho saem dos lançamentos, não de mf_accounts', async () => {
    // Regressão: a tabela mf_accounts não tem saldo/previsto — antes o
    // detalhe mostrava 0 mesmo com saldo.
    renderDetail({ account: { ...account, initial_balance: 2000 } });
    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-item-tx-pending')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mf-acct-det-chip-balance')).toHaveTextContent('R$ 3.120,00');
    expect(screen.getByTestId('mf-acct-det-chip-forecast')).toHaveTextContent('R$ 3.070,00');
  });

  it('olho do card esconde só o card (o resto segue o olho global)', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByTestId('mf-det-quick-saldo')).toHaveTextContent('R$ 1.120,00');
    });
    fireEvent.click(screen.getByTestId('mf-det-quick-eye'));
    expect(screen.getByTestId('mf-det-quick-saldo').textContent).toBe('•••');
    fireEvent.click(screen.getByTestId('mf-det-quick-eye'));
    expect(screen.getByTestId('mf-det-quick-saldo')).toHaveTextContent('R$ 1.120,00');
  });

  it('cartão: fatura corrente com total, gastos do mês e próxima fatura', async () => {
    renderDetail({ account: cardAccount });
    await waitFor(() => {
      expect(screen.getByTestId('mf-det-quick-total')).toHaveTextContent('R$ 350,00');
    });
    // Fatura de outubro (fecha 10/10, vence 20/10) soma só a compra sem
    // vínculo (350); a parcela vinculada a novembro vira a próxima (100)
    expect(screen.getByTestId('mf-det-quick-next')).toHaveTextContent('R$ 100,00');
    expect(screen.getByTestId('mf-det-quick-goto-invoices')).toBeInTheDocument();
  });

  it('menu ⋯ da conta: editar, reajustar, arquivar e excluir', async () => {
    renderDetail({ onEdit: vi.fn() });
    await waitFor(() => {
      expect(screen.getByTestId('mf-det-quick')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-acct-det-menu'));
    expect(screen.getByTestId('mf-acct-det-edit')).toBeInTheDocument();
    expect(screen.getByTestId('mf-acct-det-adjust-menu')).toBeInTheDocument();
    expect(screen.getByTestId('mf-acct-det-archive')).toBeInTheDocument();
    expect(screen.getByTestId('mf-acct-det-delete')).toBeInTheDocument();
  });

  it('menu ⋯ do cartão: sem Reajustar (cartão não tem saldo)', async () => {
    renderDetail({ account: cardAccount, onEdit: vi.fn() });
    await waitFor(() => {
      expect(screen.getByTestId('mf-det-quick-total')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-acct-det-menu'));
    expect(screen.getByTestId('mf-acct-det-edit')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-acct-det-adjust-menu')).toBeNull();
    expect(screen.getByTestId('mf-acct-det-archive')).toBeInTheDocument();
    expect(screen.getByTestId('mf-acct-det-delete')).toBeInTheDocument();
  });
});
