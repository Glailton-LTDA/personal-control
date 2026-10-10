import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFTransacoes from './MFTransacoes';

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

// Mock Supabase (o insert devolve ids criados a partir do payload)
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
      or: vi.fn().mockReturnThis(),
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

  const accounts = makeChain({
    data: [
      // Arquivada e ordenada antes: não pode ser a conta padrão nem aparecer no seletor
      { id: 'acc-0', name: 'AAA Arquivada', currency: 'BRL', archived_at: '2026-09-01T12:00:00.000Z', color: '#94a3b8', sort_order: -1 },
      { id: 'acc-1', name: 'Nubank', currency: 'BRL', initial_balance: 100, color: '#6366f1', sort_order: 0 },
      { id: 'acc-2', name: 'Conta USD', currency: 'USD', initial_balance: 50, color: '#10b981', sort_order: 1 },
      // 2ª conta BRL: origem/destino de mesma moeda no modal de transferência
      { id: 'acc-3', name: 'Inter', currency: 'BRL', initial_balance: 200, color: '#f59e0b', sort_order: 2 },
      // Cartão (escopo "Despesa cartão" só lista cartões)
      { id: 'acc-card', name: 'Cartão Visa', account_type: 'CARTAO', currency: 'BRL', initial_balance: 0, color: '#3b82f6', sort_order: 3 },
    ],
    error: null,
  });
  const categories = makeChain({
    data: [
      { id: 'cat-food', name: 'Alimentação', type: 'DESPESA', parent_id: null, color: '#f59e0b' },
      { id: 'cat-market', name: 'Supermercado', type: 'DESPESA', parent_id: 'cat-food', color: '#10b981' },
      { id: 'cat-salary', name: 'Receitas', type: 'RECEITA', parent_id: null, color: '#10b981' },
    ],
    error: null,
  });
  const tags = makeChain({
    data: [
      { id: 'tag-trip', name: 'Viagem', color: '#06b6d4' },
      { id: 'tag-home', name: 'Casa', color: '#a855f7' },
    ],
    error: null,
  });
  const txRows = [
      {
        id: 'tx-1',
        account_id: 'acc-1',
        type: 'RECEITA',
        description: 'Salário',
        amount: 5000,
        payment_date: '2026-10-05',
        status: 'PAGO',
        category_id: 'cat-salary',
        recurrence: 'NONE',
      },
      {
        id: 'tx-2',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Supermercado Extra',
        amount: 200,
        payment_date: '2026-10-06',
        status: 'PAGO',
        category_id: 'cat-market',
        attachment_path: 'user-1/receipt.pdf',
        recurrence: 'NONE',
      },
      {
        id: 'tx-3',
        account_id: 'acc-2',
        type: 'DESPESA',
        description: 'Curso online',
        amount: 100,
        payment_date: '2026-10-10',
        status: 'PENDENTE',
        category_id: null,
        installments_current: 2,
        installments_total: 12,
        recurrence: 'NONE',
      },
    ];
  const transactions = makeChain(() => ({ data: txRows, error: null }));
  const transactionTags = makeChain({
    data: [
      { transaction_id: 'tx-3', tag_id: 'tag-trip' },
      { transaction_id: 'tx-1', tag_id: 'tag-home' },
    ],
    error: null,
  });

  const upload = vi.fn().mockResolvedValue({ error: null });
  const notifRow = { recipient_email: 'dest@test.com', bcc_email: null, skip_email_modal: true };
  const notifSettings = makeChain({ data: notifRow, error: null });
  const responsibles = makeChain({
    data: [
      { id: 'resp-1', name: 'Deisianne', email: 'dei@test.com', is_main: false },
      { id: 'resp-2', name: 'Glailton', email: 'glai@test.com', is_main: true },
    ],
    error: null,
  });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_categories') return categories;
        if (table === 'mf_tags') return tags;
        if (table === 'mf_transaction_tags') return transactionTags;
        if (table === 'notification_settings') return notifSettings;
        if (table === 'finance_responsibles') return responsibles;
        return transactions;
      }),
      functions: {
        invoke: vi.fn().mockResolvedValue({ error: null }),
      },
      storage: {
        from: vi.fn(() => ({ upload })),
      },
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
    __upload: upload,
    __txRows: txRows,
    __notifRow: notifRow,
  };
});

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

const renderWithProviders = (ui) => {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

const mockUser = { id: 'test-user', email: 'test@example.com' };

const renderScreen = () =>
  renderWithProviders(
    <MFTransacoes user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
  );

/** Abre o menu "+" da tela e escolhe uma opção (fluxo novo). */
const openAdd = (kind = 'expense') => {
  fireEvent.click(screen.getByTestId('mf-new-tx'));
  fireEvent.click(screen.getByTestId(`mf-add-opt-${kind}`));
};

describe('Tela de Lançamentos (Fase 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
  });

  afterEach(() => {
    localStorage.removeItem('pc_skip_confirmations');
  });

  it('lista lançamentos com categoria, tags, parcelas e totais', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    // Categorias: filho (Supermercado) e pai (Receitas) exibidos como badge
    expect(screen.getAllByTestId('mf-tx-category-badge').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Supermercado')).toBeInTheDocument();

    // Tags via vínculo
    expect(screen.getAllByTestId('mf-tx-tag-badge')).toHaveLength(2);
    expect(screen.getAllByText('# Viagem').length).toBeGreaterThanOrEqual(1);

    // Parcela 2/12 na linha do curso
    expect(screen.getByTestId('mf-tx-installment-badge')).toHaveTextContent('2/12');

    // Totais do filtro
    expect(screen.getAllByText('R$ 5.000,00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/US\$ 100,00/).length).toBeGreaterThanOrEqual(1);
  });

  it('filtra por status, tag, busca e categoria pai (inclui filhos)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    // Status pendente → só tx-3
    fireEvent.click(screen.getByTestId('mf-tx-filter-status'));
    fireEvent.click(screen.getByTestId('mf-tx-filter-status-option-PENDENTE'));
    expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(1);
    expect(screen.getByText('Curso online 2/12')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-tx-filter-status'));
    fireEvent.click(screen.getByTestId('mf-tx-filter-status-option-all'));

    // Tag Viagem → tx-3
    fireEvent.click(screen.getByTestId('mf-tx-filter-tag'));
    fireEvent.click(screen.getByTestId('mf-tx-filter-tag-option-tag-trip'));
    expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('mf-tx-filter-tag'));
    fireEvent.click(screen.getByTestId('mf-tx-filter-tag-option-all'));

    // Busca
    fireEvent.change(screen.getByTestId('mf-tx-search'), { target: { value: 'super' } });
    expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(1);
    expect(screen.getByText('Supermercado Extra')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('mf-tx-search'), { target: { value: '' } });

    // Categoria pai Alimentação → inclui o filho Supermercado (tx-2)
    fireEvent.click(screen.getByTestId('mf-tx-filter-category'));
    fireEvent.click(screen.getByTestId('mf-tx-filter-category-option-cat-food'));
    expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(1);
    expect(screen.getByText('Supermercado Extra')).toBeInTheDocument();
  });

  it('marca um lançamento pendente como pago', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    fireEvent.click(screen.getByTestId('mf-tx-pay-tx-3'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalled();
    });
    expect(chain.update.mock.calls[0][0]).toMatchObject({ status: 'PAGO' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'tx-3');
  });

  it('estorna uma despesa paga criando lançamento negativo', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    fireEvent.click(screen.getByTestId('mf-tx-estorno-tx-2'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert).toHaveBeenCalled();
    });
    const payload = chain.insert.mock.calls[0][0];
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0]).toMatchObject({
      account_id: 'acc-1',
      type: 'DESPESA',
      amount: -200,
      payment_date: '2026-10-06',
      status: 'PAGO',
      description: 'minhasfinancas.tx_estorno_of',
    });
  });

  it('antecipa parcelas escolhendo quantas com desconto', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    // Só a parcela tx-3 (2/12) está no mock → 1 em aberto
    fireEvent.click(screen.getByTestId('mf-tx-anticipate-tx-3'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-anticipate-modal')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('mf-anticipate-count')).toHaveValue(1);
    });

    expect(screen.getByTestId('mf-anticipate-preview')).toHaveTextContent(
      'minhasfinancas.anticipate_sum'
    );
    // acc-2 é em USD → moeda da conta do lançamento
    expect(screen.getByTestId('mf-anticipate-net')).toHaveTextContent('US$ 100,00');

    // Máscara de moeda: dígitos contam centavos (1000 = 10,00)
    fireEvent.change(screen.getByTestId('mf-anticipate-discount'), {
      target: { value: '1000' },
    });
    expect(screen.getByTestId('mf-anticipate-net')).toHaveTextContent('US$ 90,00');

    fireEvent.click(screen.getByTestId('mf-anticipate-confirm'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert).toHaveBeenCalled();
    });
    expect(chain.insert.mock.calls[0][0][0]).toMatchObject({
      account_id: 'acc-2',
      type: 'DESPESA',
      amount: 90, // líquido: 100 − 10 de desconto
      status: 'PAGO',
      description: 'minhasfinancas.tx_anticipate_of',
    });

    // A parcela escolhida foi cancelada (sai dos totais, histórico preservado)
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalledWith({ status: 'CANCELADO' });
    });

    const toast = (await import('react-hot-toast')).default;
    expect(toast.success).toHaveBeenCalledWith('minhasfinancas.anticipate_done');
    expect(screen.queryByTestId('mf-anticipate-modal')).not.toBeInTheDocument();
  });

  it('cria lançamento parcelado em 12x com tags vinculadas', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    expect(screen.getByTestId('mf-tx-screen')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Plano anual' },
    });
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '1.200,00' } });
    fireEvent.click(screen.getByTestId('mf-tx-account'));
    fireEvent.click(screen.getByTestId('mf-tx-account-option-acc-1'));
    fireEvent.change(screen.getByTestId('mf-tx-payment-date'), {
      target: { value: '2026-10-15' },
    });
    // Repetição: abrir "Parcelar ou repetir" e configurar 12 parcelas
    fireEvent.click(screen.getByTestId('mf-tx-repeat-open'));
    expect(screen.getByTestId('mf-repeat-modal')).toBeInTheDocument();
    for (let i = 0; i < 10; i += 1) {
      fireEvent.click(screen.getByTestId('mf-repeat-quantity-inc'));
    }
    expect(screen.getByTestId('mf-repeat-quantity')).toHaveTextContent('12');
    fireEvent.click(screen.getByTestId('mf-repeat-confirm'));
    expect(screen.queryByTestId('mf-repeat-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-repeat-summary')).toBeInTheDocument();
    // Tags: seletor fechado por padrão — abre e escolhe a tag
    fireEvent.click(screen.getByTestId('mf-tx-tags-toggle'));
    expect(screen.getByTestId('mf-tx-tags-picker')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-tx-tag-tag-trip'));

    fireEvent.click(screen.getByTestId('mf-tx-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    // 1ª chamada: parcela 1
    const first = chain.insert.mock.calls[0][0];
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      description: 'Plano anual',
      installments_current: 1,
      installments_total: 12,
      payment_date: '2026-10-15',
    });

    // 2ª chamada: parcelas 2..12 com pai e datas avançadas
    const rest = chain.insert.mock.calls[1][0];
    expect(rest).toHaveLength(11);
    expect(rest[0]).toMatchObject({
      installments_current: 2,
      installments_total: 12,
      parent_transaction_id: 'created-0',
      payment_date: '2026-11-15',
    });
    expect(rest[10]).toMatchObject({
      installments_current: 12,
      payment_date: '2027-09-15',
    });

    // Tags vinculadas a todos os filhos
    const tagsChain = supabase.from('mf_transaction_tags');
    await waitFor(() => {
      expect(tagsChain.insert).toHaveBeenCalled();
    });
    expect(tagsChain.insert.mock.calls[0][0]).toEqual(
      expect.arrayContaining([{ transaction_id: expect.any(String), tag_id: 'tag-trip', user_id: 'test-user' }])
    );
  });

  it('modo "Valor total" divide o digitado entre as parcelas', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Plano total' },
    });
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '1.200,00' } });
    fireEvent.click(screen.getByTestId('mf-tx-account'));
    fireEvent.click(screen.getByTestId('mf-tx-account-option-acc-1'));
    fireEvent.change(screen.getByTestId('mf-tx-payment-date'), {
      target: { value: '2026-10-15' },
    });
    fireEvent.click(screen.getByTestId('mf-tx-repeat-open'));
    fireEvent.click(screen.getByTestId('mf-repeat-mode-total'));
    fireEvent.click(screen.getByTestId('mf-repeat-confirm'));

    fireEvent.click(screen.getByTestId('mf-tx-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    // 1.200,00 em 2x → 600,00 cada
    expect(chain.insert.mock.calls[0][0][0]).toMatchObject({ amount: 600 });
    expect(chain.insert.mock.calls[1][0][0]).toMatchObject({ amount: 600 });
  });

  it('modo "Valor parcela" (padrão) repete o valor digitado', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Plano parcela' },
    });
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '1.200,00' } });
    fireEvent.click(screen.getByTestId('mf-tx-account'));
    fireEvent.click(screen.getByTestId('mf-tx-account-option-acc-1'));
    fireEvent.change(screen.getByTestId('mf-tx-payment-date'), {
      target: { value: '2026-10-15' },
    });
    fireEvent.click(screen.getByTestId('mf-tx-repeat-open'));
    fireEvent.click(screen.getByTestId('mf-repeat-confirm'));

    fireEvent.click(screen.getByTestId('mf-tx-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    expect(chain.insert.mock.calls[0][0][0]).toMatchObject({ amount: 1200 });
    expect(chain.insert.mock.calls[1][0][0]).toMatchObject({ amount: 1200 });
  });

  const seriesChildren = () => [
    {
      id: 'tx-3-c3',
      account_id: 'acc-2',
      type: 'DESPESA',
      description: 'Curso online',
      amount: 100,
      payment_date: '2026-11-10',
      status: 'PENDENTE',
      category_id: null,
      installments_current: 3,
      installments_total: 12,
      parent_transaction_id: 'tx-3',
      recurrence: 'NONE',
    },
    {
      id: 'tx-3-c4',
      account_id: 'acc-2',
      type: 'DESPESA',
      description: 'Curso online',
      amount: 100,
      payment_date: '2026-12-10',
      status: 'PENDENTE',
      category_id: null,
      installments_current: 4,
      installments_total: 12,
      parent_transaction_id: 'tx-3',
      recurrence: 'NONE',
    },
  ];

  it('excluir parcela pergunta o escopo; "esta e as próximas" apaga o resto', async () => {
    const { __txRows } = await import('../../lib/supabase');
    __txRows.push(...seriesChildren());
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(5);
      });

      fireEvent.click(screen.getByTestId('mf-tx-delete-tx-3'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-inst-delete-dialog')).toBeInTheDocument();
      });
      // renumerar vem marcado por padrão
      expect(screen.getByTestId('mf-inst-delete-renumber')).toBeChecked();

      fireEvent.click(screen.getByTestId('mf-inst-delete-from'));

      const { supabase } = await import('../../lib/supabase');
      const chain = supabase.from('mf_transactions');
      await waitFor(() => {
        expect(chain.delete).toHaveBeenCalled();
      });
      expect(chain.in).toHaveBeenCalledWith('id', ['tx-3', 'tx-3-c3', 'tx-3-c4']);
      const toast = (await import('react-hot-toast')).default;
      expect(toast.success).toHaveBeenCalledWith('minhasfinancas.tx_deleted');
      expect(screen.queryByTestId('mf-inst-delete-dialog')).not.toBeInTheDocument();
    } finally {
      __txRows.length = 3;
    }
  });

  it('"apenas esta" com renumerar atualiza as restantes para 1..N', async () => {
    const { __txRows } = await import('../../lib/supabase');
    __txRows.push(...seriesChildren());
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(5);
      });

      // deleta a do meio (3/12): sobram tx-3 e c4 → 1/2 e 2/2
      fireEvent.click(screen.getByTestId('mf-tx-delete-tx-3-c3'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-inst-delete-dialog')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('mf-inst-delete-one'));

      const { supabase } = await import('../../lib/supabase');
      const chain = supabase.from('mf_transactions');
      await waitFor(() => {
        expect(chain.delete).toHaveBeenCalled();
      });
      expect(chain.in).toHaveBeenCalledWith('id', ['tx-3-c3']);
      await waitFor(() => {
        const updates = chain.update.mock.calls.map((call) => call[0]);
        expect(updates).toEqual([
          { installments_current: 1, installments_total: 2 },
          { installments_current: 2, installments_total: 2 },
        ]);
      });
      expect(chain.eq).toHaveBeenCalledWith('id', 'tx-3');
      expect(chain.eq).toHaveBeenCalledWith('id', 'tx-3-c4');
    } finally {
      __txRows.length = 3;
    }
  });

  it('formulário também pergunta o escopo ao excluir parcelada', async () => {
    const { __txRows } = await import('../../lib/supabase');
    __txRows.push(...seriesChildren());
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(5);
      });

      fireEvent.click(screen.getByTestId('mf-tx-edit-tx-3'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-screen')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mf-tx-delete'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-delete-inst-dialog')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('mf-tx-delete-inst-one'));

      const { supabase } = await import('../../lib/supabase');
      const chain = supabase.from('mf_transactions');
      await waitFor(() => {
        expect(chain.delete).toHaveBeenCalled();
      });
      expect(chain.in).toHaveBeenCalledWith('id', ['tx-3']);
      // a aberta saiu → a tela fecha
      await waitFor(() => {
        expect(screen.queryByTestId('mf-tx-screen')).not.toBeInTheDocument();
      });
    } finally {
      __txRows.length = 3;
    }
  });

  it('envia o comprovante com a categoria e marca como enviado', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    fireEvent.click(screen.getByTestId('mf-tx-email-tx-2'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-finance-email', {
        body: {
          to: 'dest@test.com',
          subject: 'minhasfinancas.email_subject_expense',
          data: {
            description: 'Supermercado Extra',
            category: 'Supermercado',
            type: 'DESPESA',
            status: 'PAGO',
            amount: 200,
            payment_date: '2026-10-06',
          },
          bcc: null,
        },
      });
    });
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalledWith({ email_sent: true });
    });
    expect(chain.eq).toHaveBeenCalledWith('id', 'tx-2');
    const toast = (await import('react-hot-toast')).default;
    expect(toast.success).toHaveBeenCalledWith('minhasfinancas.email_sent_to');
  });

  it('sem pular o modal, abre a escolha e envia ao responsável', async () => {
    const { __notifRow } = await import('../../lib/supabase');
    __notifRow.skip_email_modal = false;
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
      });

      fireEvent.click(screen.getByTestId('mf-tx-email-tx-2'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-email-modal')).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.getByTestId('mf-email-resp-resp-2')).toBeInTheDocument();
      });

      // envio direto NÃO aconteceu ainda
      const { supabase } = await import('../../lib/supabase');
      expect(supabase.functions.invoke).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('mf-email-resp-resp-1'));
      await waitFor(() => {
        expect(supabase.functions.invoke).toHaveBeenCalledWith(
          'send-finance-email',
          expect.objectContaining({
            body: expect.objectContaining({ to: 'dei@test.com' }),
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

  it('autocompleta categoria por palavra-chave na descrição', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Compra no mercado' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-category')).toHaveTextContent('Alimentação');
    });
  });

  it('envia anexo para o bucket mf-attachments', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    const file = new File(['conteudo'], 'comprovante.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('mf-tx-attachment'), { target: { files: [file] } });

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.storage.from).toHaveBeenCalledWith('mf-attachments');
    });
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-attachment-view')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('mf-tx-description'), { target: { value: 'Farmácia' } });
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '50,00' } });
    fireEvent.click(screen.getByTestId('mf-tx-account'));
    fireEvent.click(screen.getByTestId('mf-tx-account-option-acc-1'));
    fireEvent.click(screen.getByTestId('mf-tx-save'));

    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert).toHaveBeenCalled();
    });
    expect(chain.insert.mock.calls[0][0][0].attachment_path).toMatch(/^test-user\/\d+\.pdf$/);
  });

  it('edita um lançamento existente', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    fireEvent.click(screen.getByTestId('mf-tx-edit-tx-3'));
    expect(screen.getByTestId('mf-tx-screen')).toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-description')).toHaveValue('Curso online');
    // Parcela existente não mostra o campo de parcelas
    expect(screen.queryByTestId('mf-tx-installments')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '150,00' } });
    fireEvent.click(screen.getByTestId('mf-tx-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalled();
    });
    expect(chain.eq).toHaveBeenCalledWith('id', 'tx-3');
    expect(chain.update.mock.calls[0][0]).toMatchObject({ amount: 150 });
  });

  it('transferência criada pelo menu grava TRANSFERENCIA e fecha o modal', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('transfer');
    expect(screen.getByTestId('mf-transfer-form')).toBeInTheDocument();

    // origem = 1ª BRL, destino = 2ª BRL (moedas diferentes ficam de fora)
    fireEvent.change(screen.getByTestId('mf-transfer-amount'), {
      target: { value: '250000' }, // máscara → 2.500,00
    });
    fireEvent.click(screen.getByTestId('mf-transfer-confirm'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert).toHaveBeenCalled();
    });
    const payload = chain.insert.mock.calls[0][0];
    const row = Array.isArray(payload) ? payload[0] : payload;
    expect(row).toMatchObject({
      type: 'TRANSFERENCIA',
      account_id: 'acc-1',
      transfer_account_id: 'acc-3',
      amount: 2500,
      status: 'PAGO',
    });

    const toast = (await import('react-hot-toast')).default;
    expect(toast.success).toHaveBeenCalledWith('minhasfinancas.transfer_success');

    // Sucesso fecha o modal — a lista segue montada e a tela nunca abriu
    await waitFor(() => {
      expect(screen.queryByTestId('mf-transfer-modal')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mf-tx-screen')).not.toBeInTheDocument();
    });
  });

  it('dropdown de conta: ignora arquivada como padrão e não lista no popover', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');

    // Padrão = primeira NÃO arquivada (acc-0 tem sort_order anterior, mas está arquivada)
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-account')).toHaveTextContent('Nubank');
    });

    fireEvent.click(screen.getByTestId('mf-tx-account'));
    expect(screen.getByTestId('mf-tx-account-popover')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-account-option-acc-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-account-option-acc-1')).toBeInTheDocument();

    // Busca e seleção pelo popover
    fireEvent.change(screen.getByTestId('mf-tx-account-search'), {
      target: { value: 'inter' },
    });
    expect(screen.getByTestId('mf-tx-account-option-acc-3')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-tx-account-option-acc-3'));
    expect(screen.queryByTestId('mf-tx-account-popover')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-account')).toHaveTextContent('Inter');
  });

  it('edição em lote: marcar pago e excluir selecionados', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    fireEvent.click(screen.getByTestId('mf-tx-select-all'));
    expect(screen.getByTestId('mf-tx-bulk-bar')).toBeInTheDocument();
    expect(screen.getByText('minhasfinancas.tx_selected')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-tx-bulk-pay'));
    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.in).toHaveBeenCalledWith('id', ['tx-1', 'tx-2', 'tx-3']);
    });
    expect(chain.update.mock.calls[0][0]).toMatchObject({ status: 'PAGO' });

    // Seleciona duas linhas e exclui em lote
    fireEvent.click(screen.getByTestId('mf-tx-select-tx-1'));
    fireEvent.click(screen.getByTestId('mf-tx-select-tx-2'));
    fireEvent.click(screen.getByTestId('mf-tx-bulk-delete'));
    await waitFor(() => {
      expect(chain.in).toHaveBeenCalledWith('id', ['tx-1', 'tx-2']);
    });
    expect(chain.delete).toHaveBeenCalled();
  });

  it('menu "+" lista Despesa, Despesa cartão, Receita e Transferência', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    fireEvent.click(screen.getByTestId('mf-new-tx'));
    expect(screen.getByTestId('mf-new-tx-menu')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-expense')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-cardExpense')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-income')).toBeInTheDocument();
    expect(screen.getByTestId('mf-add-opt-transfer')).toBeInTheDocument();
    // Estorno é exclusivo do detalhe do cartão
    expect(screen.queryByTestId('mf-add-opt-estorno')).not.toBeInTheDocument();
    // Ainda não abriu a tela
    expect(screen.queryByTestId('mf-tx-screen')).not.toBeInTheDocument();

    // Receita abre o modal já com o selo de tipo "Receita"
    fireEvent.click(screen.getByTestId('mf-add-opt-income'));
    expect(screen.getByTestId('mf-tx-screen')).toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-type-badge')).toHaveTextContent('minhasfinancas.add_income');
  });

  it('"Despesa cartão" restringe o seletor ao cartão e esconde o tipo', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('cardExpense');
    expect(screen.getByTestId('mf-tx-screen')).toBeInTheDocument();
    // Único cartão do mock já vem selecionado
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-account')).toHaveTextContent('Cartão Visa');
    });
    // Selo de tipo fixo "Despesa cartão" — a tela não tem mais abas de tipo
    expect(screen.getByTestId('mf-tx-type-badge')).toHaveTextContent('minhasfinancas.add_card_expense');
    expect(screen.getByTestId('mf-tx-status')).toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-repeat')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-invoice')).not.toBeInTheDocument();
  });

  it('Transferência pelo menu abre o modal direto (sem tela de criação)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    fireEvent.click(screen.getByTestId('mf-new-tx'));
    fireEvent.click(screen.getByTestId('mf-add-opt-transfer'));

    expect(screen.getByTestId('mf-transfer-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-screen')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-transfer-cancel'));
    expect(screen.queryByTestId('mf-transfer-modal')).not.toBeInTheDocument();
  });

  it('modal de criação abre sobre a lista (lista segue montada)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    expect(screen.getByTestId('mf-tx-screen')).toBeInTheDocument();
    // Mesmo padrão da conta: modal por cima, conteúdo de baixo montado
    expect(screen.getByTestId('mf-transacoes')).toBeInTheDocument();
    expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    expect(screen.getByTestId('mf-tx-type-badge')).toHaveTextContent('minhasfinancas.add_expense');

    // O X do cabeçalho fecha o modal e devolve a lista intacta
    fireEvent.click(screen.getByTestId('mf-tx-back'));
    expect(screen.queryByTestId('mf-tx-screen')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
  });
});
