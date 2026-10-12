import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFCartoes from './MFCartoes';
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
        id: 'acc-card',
        name: 'Visa',
        account_type: 'CARTAO',
        currency: 'BRL',
        initial_balance: 0,
        closing_day: 10,
        due_day: 20,
        credit_limit: 3000,
        linked_account_id: 'acc-check',
        color: '#6366f1',
        card_brand: 'visa',
      },
      {
        id: 'acc-master',
        name: 'Master',
        account_type: 'CARTAO',
        currency: 'BRL',
        initial_balance: 0,
        closing_day: 1,
        due_day: 10,
        credit_limit: 1500,
        linked_account_id: null,
        color: '#f59e0b',
        card_brand: 'mastercard',
      },
      {
        id: 'acc-check',
        name: 'Nubank',
        account_type: 'CORRENTE',
        currency: 'BRL',
        initial_balance: 5000,
        color: '#10b981',
      },
    ],
    error: null,
  });

  // Categorias para o badge da linha da fatura (lista da fatura mostra a
  // categoria ao lado da descrição, igual ao app original)
  const categories = makeChain({
    data: [
      { id: 'cat-refunds', name: 'Estornos', type: 'DESPESA', parent_id: null, color: '#10b981' },
      { id: 'cat-home', name: 'Casa', type: 'DESPESA', parent_id: null, color: '#6366f1' },
    ],
    error: null,
  });

  // Estado mutável (padrão __mfState): um teste pontual pode trocar as
  // transações e restaurá-las no finally — usado pela regressão do limite.
  const __mfState = {
    transactions: [
      // Fatura Visa 08 (fecha 10/08, vence 20/08) — paga pela transferência
      { id: 'tx-v1', account_id: 'acc-card', type: 'DESPESA', amount: 300, payment_date: '2026-08-05', status: 'PAGO', description: 'Farmácia' },
      { id: 'tx-pay1', account_id: 'acc-check', transfer_account_id: 'acc-card', type: 'TRANSFERENCIA', amount: 300, payment_date: '2026-08-15', status: 'PAGO', description: 'Pagamento' },
      // Fatura Visa 09 (fecha 10/09, vence 20/09) — vencida em aberto
      { id: 'tx-v2', account_id: 'acc-card', type: 'DESPESA', amount: 800, payment_date: '2026-09-05', status: 'PAGO', description: 'Curso' },
      // Corrente (vence 20/10): fatura do mês — a data é só rótulo
      { id: 'tx-v3', account_id: 'acc-card', type: 'DESPESA', amount: 1200, payment_date: '2026-10-02', status: 'PAGO', description: 'Notebook parcela 1/12', installments_current: 1, installments_total: 12 },
      { id: 'tx-v4', account_id: 'acc-card', type: 'DESPESA', amount: 500, payment_date: '2026-10-01', status: 'PENDENTE', description: 'Combustível' },
      // Master (fecha 01/09, vence 10/09) — vencida, sem conta vinculada
      { id: 'tx-m1', account_id: 'acc-master', type: 'DESPESA', amount: 300, payment_date: '2026-08-20', status: 'PAGO', description: 'Streaming' },
    ],
  };
  const transactions = makeChain(() => ({ data: __mfState.transactions, error: null }));

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_categories') return categories;
        return transactions;
      }),
      storage: { from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: null }) })) },
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
    __mfState,
  };
});

const renderScreen = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MFCartoes user={{ id: 'test-user' }} />
    </QueryClientProvider>
  );
};

describe('MFCartoes — Cartões e faturas (Fase 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
    localStorage.removeItem('mf_month_key');
    localStorage.removeItem('mf_detail_drill');
    clearInvoiceSel();
    // congela o relatório: 04/10/2026 (ciclos do cartão fixos)
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 4, 12, 0, 0) });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem('pc_skip_confirmations');
  });

  it('drill do cartão sobrevive ao F5 e limpa ao fechar', async () => {
    localStorage.setItem('mf_detail_drill', JSON.stringify({ tab: 'cards', id: 'acc-card' }));
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-account-detail')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-acct-det-back'));
    await waitFor(() => {
      expect(screen.queryByTestId('mf-account-detail')).not.toBeInTheDocument();
    });
    expect(localStorage.getItem('mf_detail_drill')).toBeNull();
  });

  it('fatura selecionada sobrevive ao F5 e volta à corrente ao trocar', async () => {
    localStorage.setItem('mf_detail_drill', JSON.stringify({ tab: 'cards', id: 'acc-card' }));
    localStorage.setItem('mf_invoice_sel_acc-card', '2026-08-10');
    renderScreen();
    // abre direto na fatura salva (paga), não na corrente
    await waitFor(() => {
      expect(screen.getByTestId('mf-invoice-status')).toHaveTextContent(
        'minhasfinancas.card_status_paid'
      );
    });

    // trocar para a corrente limpa a seleção salva
    fireEvent.click(screen.getByTestId('mf-invoice-chip-current'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-invoice-status')).toHaveTextContent(
        'minhasfinancas.card_status_current'
      );
    });
    expect(localStorage.getItem('mf_invoice_sel_acc-card')).toBeNull();
  });

  it('drill de outra aba é ignorado nos cartões', async () => {    localStorage.setItem('mf_detail_drill', JSON.stringify({ tab: 'accounts', id: 'acc-card' }));
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-card-widget-acc-card')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('mf-account-detail')).not.toBeInTheDocument();
  });

  it('aceite: fechamento dia 10 → fatura vence dia 20; status e corrente calculados', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('mf-card-widget-acc-card')).toBeInTheDocument();
    });

    // Widget exibe fatura corrente, barra de uso e ações de editar/arquivar
    expect(screen.getByTestId('mf-card-fatura-acc-card')).toHaveTextContent('R$ 1.700,00');
    expect(screen.getByTestId('mf-card-usage-acc-card')).toBeInTheDocument();
    expect(screen.getByTestId('mf-edit-card-acc-card')).toBeInTheDocument();
    expect(screen.getByTestId('mf-archive-card-acc-card')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-open-card-acc-card'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-invoice-chip-current')).toBeInTheDocument();
    });

    // Fatura corrente: a do mês (vence 20/10) — 2 compras de outubro
    expect(screen.getByTestId('mf-invoice-chip-current')).toHaveTextContent('R$ 1.700,00');
    expect(screen.getByTestId('mf-invoice-status')).toHaveTextContent(
      'minhasfinancas.card_status_current'
    );
    expect(screen.getByTestId('mf-invoice-total')).toHaveTextContent('R$ 1.700,00');
    expect(screen.getByTestId('mf-invoice-detail')).toHaveTextContent('10/10/26');
    expect(screen.getAllByTestId('mf-card-tx-row')).toHaveLength(2);

    // Fatura fechada 10/09 → vence 20/09 (vencida) e 10/08 → 20/08 (paga)
    const chip09 = screen.getByTestId('mf-invoice-chip-2026-09-10');
    expect(chip09).toHaveTextContent('minhasfinancas.card_due 20/09/26');
    expect(chip09).toHaveTextContent('minhasfinancas.card_status_overdue');
    const chip08 = screen.getByTestId('mf-invoice-chip-2026-08-10');
    expect(chip08).toHaveTextContent('minhasfinancas.card_due 20/08/26');
    expect(chip08).toHaveTextContent('minhasfinancas.card_status_paid');
  });

  it('paga a fatura vencida criando transferência da conta vinculada ao cartão', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-open-card-acc-card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-open-card-acc-card'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-invoice-chip-2026-09-10')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-invoice-chip-2026-09-10'));

    expect(screen.getByTestId('mf-invoice-status')).toHaveTextContent(
      'minhasfinancas.card_status_overdue'
    );
    expect(screen.getByTestId('mf-invoice-total')).toHaveTextContent('R$ 800,00');
    expect(screen.getByTestId('mf-invoice-open')).toHaveTextContent('R$ 800,00');

    fireEvent.click(screen.getByTestId('mf-invoice-pay'));

    // Modal "Quanto você quer pagar?": total pré-preenchido, confirma em Continuar
    await waitFor(() => {
      expect(screen.getByTestId('mf-pay-modal')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mf-pay-amount')).toHaveValue('800,00');
    fireEvent.click(screen.getByTestId('mf-pay-continue'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_transactions').insert).toHaveBeenCalled();
    });
    expect(supabase.from('mf_transactions').insert.mock.calls[0][0][0]).toMatchObject({
      user_id: 'test-user',
      type: 'DESPESA',
      account_id: 'acc-check', // origem: conta vinculada (sem transação no cartão)
      amount: 800,
      status: 'PAGO', // vencimento 20/09 já passou → pago hoje
      payment_date: '2026-10-04',
      invoice_close: '2026-09-10', // vínculo com a fatura paga
    });
  });

  it('fatura já paga não exibe o botão de pagar', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-open-card-acc-card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-open-card-acc-card'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-invoice-chip-2026-08-10')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-invoice-chip-2026-08-10'));

    expect(screen.getByTestId('mf-invoice-status')).toHaveTextContent(
      'minhasfinancas.card_status_paid'
    );
    expect(screen.getByTestId('mf-invoice-open')).toHaveTextContent('R$ 0,00');
    expect(screen.queryByTestId('mf-invoice-pay')).not.toBeInTheDocument();
    // identidade pelo vencimento: fatura de agosto (vence 20/08/26)
    expect(screen.getByTestId('mf-invoice-chip-2026-08-10')).toHaveTextContent('Agosto de 2026');
  });

  it('widget oferece pagar a fatura vencida quando a corrente zerou (feedback 07/10)', async () => {
    const { __mfState } = await import('../../lib/supabase');
    const original = __mfState.transactions;
    __mfState.transactions = [
      // Compra em 15/12/2020 → fatura de dezembro (fecha 10/12, vence 20/12), em aberto
      { id: 'tx-old', account_id: 'acc-card', type: 'DESPESA', amount: 1266.93, payment_date: '2020-12-15', status: 'PAGO', description: 'Compras' },
    ];
    vi.setSystemTime(new Date(2021, 0, 15, 12, 0, 0));
    try {
      renderScreen();

      // EM ABERTO acusa a dívida antiga…
      await waitFor(() => {
        expect(screen.getByTestId('mf-card-open-acc-card')).toHaveTextContent('1.266,93');
      });
      // …a corrente zerada não tem botão próprio…
      expect(screen.queryByTestId('mf-card-pay-acc-card')).not.toBeInTheDocument();
      // …mas o widget agora oferece pagar a fatura em aberto mais antiga
      expect(screen.getByTestId('mf-card-pay-open-acc-card')).toBeInTheDocument();
      // …nomeando qual fatura (não é a corrente): a mais antiga, vence 20/12/20
      expect(screen.getByTestId('mf-card-pay-open-acc-card')).toHaveTextContent('20/12/20');

      fireEvent.click(screen.getByTestId('mf-card-pay-open-acc-card'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-pay-modal')).toBeInTheDocument();
      });
      expect(screen.getByTestId('mf-pay-amount')).toHaveValue('1266,93');

      fireEvent.click(screen.getByTestId('mf-pay-continue'));
      const { supabase } = await import('../../lib/supabase');
      await waitFor(() => {
        expect(supabase.from('mf_transactions').insert).toHaveBeenCalled();
      });
      expect(supabase.from('mf_transactions').insert.mock.calls[0][0][0]).toMatchObject({
        type: 'DESPESA',
        account_id: 'acc-check', // conta vinculada (sem transação no cartão)
        amount: 1266.93,
        // vencimento 20/12/2020 já passou em 15/01 → pago hoje
        status: 'PAGO',
        payment_date: '2021-01-15',
        invoice_close: '2020-12-10', // vínculo com a fatura em aberto
      });
    } finally {
      __mfState.transactions = original;
    }
  });

  it('paga a fatura corrente agendada no vencimento (extrato efetivável)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-open-card-acc-card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-open-card-acc-card'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-invoice-anticipate')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-invoice-anticipate'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-pay-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-pay-continue'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_transactions').insert).toHaveBeenCalled();
    });
    expect(supabase.from('mf_transactions').insert.mock.calls[0][0][0]).toMatchObject({
      type: 'DESPESA',
      account_id: 'acc-check',
      amount: 1700,
      status: 'PENDENTE', // agendada: efetivável no Extrato
      payment_date: '2026-10-20', // vencimento da fatura corrente
      invoice_close: '2026-10-10', // vínculo com a fatura corrente
    });
  });

  it('antecipa direto pelo botão da fatura corrente no widget', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-card-pay-acc-card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-card-pay-acc-card'));
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
      account_id: 'acc-check',
      amount: 1700,
      status: 'PENDENTE',
      payment_date: '2026-10-20',
      invoice_close: '2026-10-10',
    });
  });

  it('pagamento parcial: valor editável no modal vira transferência menor', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-card-pay-acc-card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-card-pay-acc-card'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-pay-modal')).toBeInTheDocument();
    });
    // dica de parcial + nota de agendamento presentes no modal
    expect(screen.getByTestId('mf-pay-partial-hint')).toBeInTheDocument();
    expect(screen.getByTestId('mf-pay-note')).toBeInTheDocument();

    // digita 500,00 por cima do total (máscara de centavos)
    fireEvent.change(screen.getByTestId('mf-pay-amount'), { target: { value: '50000' } });
    expect(screen.getByTestId('mf-pay-amount')).toHaveValue('500,00');
    fireEvent.click(screen.getByTestId('mf-pay-continue'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_transactions').insert).toHaveBeenCalled();
    });
    expect(supabase.from('mf_transactions').insert.mock.calls[0][0][0]).toMatchObject({
      amount: 500,
      status: 'PENDENTE',
      payment_date: '2026-10-20',
      invoice_close: '2026-10-10',
    });
  });

  it('abre a edição do cartão pelo botão lápis do widget', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-edit-card-acc-card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-edit-card-acc-card'));

    expect(screen.getByTestId('mf-account-modal')).toBeInTheDocument();
    // Campos de cartão presentes: fechamento, vencimento, limite e conta
    expect(screen.getByTestId('mf-card-closing')).toBeInTheDocument();
    expect(screen.getByTestId('mf-card-due')).toBeInTheDocument();
    expect(screen.getByTestId('mf-card-limit')).toBeInTheDocument();
    expect(screen.getByTestId('mf-card-linked')).toBeInTheDocument();
  });

  it('cartão sem conta vinculada bloqueia o pagamento com aviso', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-open-card-acc-master')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-open-card-acc-master'));
    // Master fecha dia 1/vence dia 10: 20/08 é de agosto (fecha 01/08)
    await waitFor(() => {
      expect(screen.getByTestId('mf-invoice-chip-2026-08-01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-invoice-chip-2026-08-01'));

    expect(screen.getByTestId('mf-invoice-link-hint')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-invoice-pay'));

    const toast = (await import('react-hot-toast')).default;
    expect(toast.error).toHaveBeenCalledWith('minhasfinancas.card_link_required');
    const { supabase } = await import('../../lib/supabase');
    expect(supabase.from('mf_transactions').insert).not.toHaveBeenCalled();
  });

  it('navega o mês: fatura corrente reflete o mês selecionado (não é sempre "hoje")', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-card-fatura-acc-card')).toHaveTextContent('R$ 1.700,00');
    });

    // Mês anterior (set/2026, referência = fim do mês): fatura corrente =
    // setembro (só a compra de 05/09; a de outubro ainda não existe à época)
    fireEvent.click(screen.getByTestId('mf-month-prev'));
    expect(screen.getByTestId('mf-month-label')).toHaveTextContent('Setembro de 2026');
    await waitFor(() => {
      expect(screen.getByTestId('mf-card-fatura-acc-card')).toHaveTextContent('R$ 800,00');
    });

    // Volta para o mês atual (referência = hoje): a compra de 01/10 volta
    fireEvent.click(screen.getByTestId('mf-month-next'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-card-fatura-acc-card')).toHaveTextContent('R$ 1.700,00');
    });
  });

  it('época: vínculo ao ciclo fechado conta no mês da fatura; vínculo futuro não (widget)', async () => {
    const { __mfState } = await import('../../lib/supabase');
    const original = __mfState.transactions;
    __mfState.transactions = [
      { id: 'tx-s1', account_id: 'acc-card', type: 'DESPESA', amount: 800, payment_date: '2026-09-05', status: 'PAGO', description: 'Curso' },
      { id: 'tx-s2', account_id: 'acc-card', type: 'DESPESA', amount: 500, payment_date: '2026-09-25', status: 'PAGO', description: 'Livros' },
      // registrado em out/2026 para a fatura de setembro (fecha 10/09)
      { id: 'tx-p1', account_id: 'acc-check', transfer_account_id: 'acc-card', type: 'TRANSFERENCIA', amount: 800, payment_date: '2026-10-06', status: 'PAGO', description: 'Pagamento', invoice_close: '2026-09-10' },
      // registrado em out/2026 para a fatura de outubro (fecha 10/10, futura à época)
      { id: 'tx-p2', account_id: 'acc-check', transfer_account_id: 'acc-card', type: 'TRANSFERENCIA', amount: 500, payment_date: '2026-10-06', status: 'PAGO', description: 'Pagamento', invoice_close: '2026-10-10' },
    ];
    try {
      renderScreen();

      // Mês vivo (out/2026): setembro tem 1300 − 800 = 500 em aberto
      await waitFor(() => {
        expect(screen.getByTestId('mf-card-open-acc-card')).toHaveTextContent('R$ 500,00');
      });

      // Set/2026 (época): o vínculo futuro não abate — só o do ciclo fechado
      fireEvent.click(screen.getByTestId('mf-month-prev'));
      expect(screen.getByTestId('mf-month-label')).toHaveTextContent('Setembro de 2026');
      await waitFor(() => {
        expect(screen.getByTestId('mf-card-open-acc-card')).toHaveTextContent('R$ 500,00');
      });
      // fatura corrente à época = setembro (1300 de compras, 800 pagos)
      expect(screen.getByTestId('mf-card-fatura-acc-card')).toHaveTextContent('R$ 1.300,00');
    } finally {
      __mfState.transactions = original;
    }
  });

  it('fatura em aberto mostra Fatura + selo Fechada (padrão do app original)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-open-card-acc-card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-open-card-acc-card'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-invoice-chip-2026-09-10')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-invoice-chip-2026-09-10'));

    const summary = screen.getByTestId('mf-invoice-summary');
    expect(summary).toHaveTextContent('minhasfinancas.inv_title_open');
    expect(screen.getByTestId('mf-invoice-total')).toHaveTextContent('R$ 800,00');
    expect(screen.getByTestId('mf-invoice-open')).toHaveTextContent('R$ 800,00');
    expect(screen.getByTestId('mf-invoice-badge')).toHaveTextContent(
      'minhasfinancas.inv_status_closed'
    );
    // ação de pagar mora no resumo
    expect(screen.getByTestId('mf-invoice-pay')).toHaveTextContent(
      'minhasfinancas.card_register_payment'
    );
  });

  it('fatura paga mostra Pagamentos/Despesas, selo Paga e Reabrir exclui o vínculo', async () => {
    const { __mfState } = await import('../../lib/supabase');
    const original = __mfState.transactions;
    __mfState.transactions = [
      { id: 'tx-s1', account_id: 'acc-card', type: 'DESPESA', amount: 800, payment_date: '2026-09-05', status: 'PAGO', description: 'Curso' },
      { id: 'tx-e1', account_id: 'acc-card', type: 'DESPESA', amount: -20, payment_date: '2026-09-06', status: 'PAGO', description: 'Estorno' },
      { id: 'tx-p1', account_id: 'acc-check', transfer_account_id: 'acc-card', type: 'TRANSFERENCIA', amount: 780, payment_date: '2026-09-25', status: 'PAGO', description: 'Pagamento', invoice_close: '2026-09-10' },
    ];
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByTestId('mf-open-card-acc-card')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mf-open-card-acc-card'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-invoice-chip-2026-09-10')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('mf-invoice-chip-2026-09-10'));

      const summary = screen.getByTestId('mf-invoice-summary');
      expect(summary).toHaveTextContent('minhasfinancas.inv_title_paid');
      expect(summary).toHaveTextContent('minhasfinancas.inv_paid_amount');
      expect(summary).toHaveTextContent('R$ 780,00');
      expect(summary).toHaveTextContent('minhasfinancas.inv_month_expenses');
      expect(summary).toHaveTextContent('R$ 800,00');
      expect(screen.getByTestId('mf-invoice-open')).toHaveTextContent('R$ 0,00');
      expect(screen.getByTestId('mf-invoice-badge')).toHaveTextContent(
        'minhasfinancas.inv_status_paid'
      );

      fireEvent.click(screen.getByTestId('mf-invoice-reopen'));
      const { supabase } = await import('../../lib/supabase');
      const txTable = supabase.from('mf_transactions');
      await waitFor(() => {
        expect(txTable.delete).toHaveBeenCalled();
      });
      expect(txTable.eq).toHaveBeenCalledWith('id', 'tx-p1');
      const toast = (await import('react-hot-toast')).default;
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('minhasfinancas.card_reopened');
      });
    } finally {
      __mfState.transactions = original;
    }
  });

  it('lista da fatura pinta despesa − vermelha, estorno + verde e fecha com a linha "Fatura"', async () => {
    const { __mfState } = await import('../../lib/supabase');
    const original = __mfState.transactions;
    __mfState.transactions = [
      {
        id: 'tx-s1',
        account_id: 'acc-card',
        type: 'DESPESA',
        amount: 1000,
        payment_date: '2026-09-05',
        status: 'PAGO',
        description: 'Móveis',
        category_id: 'cat-home',
      },
      {
        // Devolução da operadora: despesa negativa → + verde na lista
        id: 'tx-e1',
        account_id: 'acc-card',
        type: 'DESPESA',
        amount: -20,
        payment_date: '2026-09-06',
        status: 'PAGO',
        description: 'Estorno loja',
        category_id: 'cat-refunds',
      },
    ];
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByTestId('mf-open-card-acc-card')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mf-open-card-acc-card'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-invoice-chip-2026-09-10')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('mf-invoice-chip-2026-09-10'));

      await waitFor(() => {
        expect(screen.getAllByTestId('mf-card-tx-row')).toHaveLength(2);
      });

      const rows = screen.getAllByTestId('mf-card-tx-row');
      const expenseRow = rows.find((row) => row.textContent.includes('Móveis'));
      const refundRow = rows.find((row) => row.textContent.includes('Estorno loja'));
      const amountOf = (row) => {
        const cell = row.querySelector('td:last-child');
        return { color: cell.style.color, text: cell.textContent.replace(/\u00a0/g, ' ') };
      };

      // Despesa − vermelha (sinal negativo, como no app original)
      expect(expenseRow).toHaveTextContent('Móveis');
      expect(expenseRow).toHaveTextContent('Casa'); // badge de categoria
      expect(amountOf(expenseRow).color).toBe('#ef4444');
      expect(amountOf(expenseRow).text).toContain('-R$ 1.000,00');

      // Estorno + verde (valor positivo, categoria visível)
      expect(refundRow).toHaveTextContent('Estorno loja');
      expect(refundRow).toHaveTextContent('Estornos');
      expect(amountOf(refundRow).color).toBe('#10b981');
      expect(amountOf(refundRow).text).toContain('R$ 20,00');
      expect(amountOf(refundRow).text).not.toContain('-');

      // Linha de total líquido da fatura (1000 − 20)
      const totalRow = screen.getByTestId('mf-invoice-total-row');
      expect(totalRow).toHaveTextContent('minhasfinancas.inv_total');
      expect(totalRow.textContent.replace(/\u00a0/g, ' ')).toContain('R$ 980,00');
    } finally {
      __mfState.transactions = original;
    }
  });

  it('exibe o ícone da bandeira no badge do cartão', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('mf-card-brand-acc-card')).toBeInTheDocument();
    });

    const badge = screen.getByTestId('mf-card-brand-acc-card');
    expect(badge).toHaveTextContent('minhasfinancas.card_brand_visa');
    expect(badge).toContainElement(screen.getByTestId('mf-brand-icon-visa'));

    const badgeMaster = screen.getByTestId('mf-card-brand-acc-master');
    expect(badgeMaster).toContainElement(screen.getByTestId('mf-brand-icon-mastercard'));
  });

  it('pagamento futuro quita o mês da fatura, sem limpar o mês passado (regressão de época)', async () => {
    const { __mfState } = await import('../../lib/supabase');
    const original = __mfState.transactions;
    // Compra de mar/2023 (fatura de março: fecha 10/03, vence 20/03) +
    // pagamento feito hoje com vínculo: em fev/2023 a compra nem existia
    // (fatura futura não vaza para o mês passado); em mar/2023 o vínculo
    // conta (fatura Paga).
    __mfState.transactions = [
      {
        id: 'tx-old',
        account_id: 'acc-card',
        type: 'DESPESA',
        amount: 748.76,
        payment_date: '2023-03-05',
        status: 'PAGO',
        description: 'Compras antigas',
      },
      {
        id: 'tx-pay-old',
        account_id: 'acc-check',
        transfer_account_id: 'acc-card',
        type: 'TRANSFERENCIA',
        amount: 748.76,
        payment_date: '2026-10-04',
        status: 'PAGO',
        description: 'Pagamento de fatura',
        invoice_close: '2023-03-10',
      },
    ];

    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByTestId('mf-card-widget-acc-card')).toBeInTheDocument();
      });

      // Navega até fev/2023 (44 meses a partir de out/2026 — relatório congelado)
      for (let i = 0; i < 44; i += 1) {
        fireEvent.click(screen.getByTestId('mf-month-prev'));
      }
      await waitFor(() => {
        expect(screen.getByTestId('mf-month-label')).toHaveTextContent('Fevereiro de 2023');
      });

      // Fev/2023: a compra de março ainda não existia — nada em aberto.
      expect(screen.getByTestId('mf-card-fatura-acc-card')).toHaveTextContent('R$ 0,00');
      expect(screen.getByTestId('mf-card-open-acc-card')).toHaveTextContent('R$ 0,00');

      // Mar/2023: vínculo conta — em aberto zera e a fatura exibe Paga.
      fireEvent.click(screen.getByTestId('mf-month-next'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-month-label')).toHaveTextContent('Março de 2023');
      });
      expect(screen.getByTestId('mf-card-open-acc-card')).toHaveTextContent('R$ 0,00');
      expect(screen.getByTestId('mf-card-available-acc-card')).toHaveTextContent('R$ 3.000,00');
      expect(screen.getByTestId('mf-card-limit-acc-card')).toHaveTextContent('R$ 3.000,00');

      fireEvent.click(screen.getByTestId('mf-open-card-acc-card'));
      // Março é a corrente do mês (paga): o detalhe já abre nela com Paga.
      await waitFor(() => {
        expect(screen.getByTestId('mf-invoice-chip-current')).toBeInTheDocument();
      });
      expect(screen.getByTestId('mf-invoice-badge')).toHaveTextContent(
        'minhasfinancas.inv_status_paid'
      );
    } finally {
      __mfState.transactions = original;
    }
    // 44 navegações de mês + refetches ficam colados no limite de 5s
  }, 15000);
});
