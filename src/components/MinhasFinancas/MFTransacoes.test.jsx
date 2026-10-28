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
      limit: vi.fn().mockReturnThis(),
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
  // Integração com viagens: estado mutável (testes setam state.links)
  const state = {
    links: [],
    trips: [
      {
        id: 'trip-1',
        title: 'Gramado',
        start_date: '2026-05-01',
        end_date: '2026-05-10',
        currencies: ['BRL'],
      },
    ],
    investments: [
      {
        id: 'inv-1',
        name: 'Rendimentos',
        currency: 'BRL',
        institution: { name: 'Mercado Pago' },
      },
    ],
  };
  const links = makeChain(() => ({ data: state.links[0] ?? null, error: null }));
  const trips = makeChain(() => ({ data: state.trips, error: null }));
  const investments = makeChain(() => ({
    data: state.investments,
    error: null,
  }));
  const profiles = makeChain({
    data: [{ id: 'prof-1', name: 'Glailton', sort_order: 0 }],
    error: null,
  });
  const rpc = vi.fn(() => Promise.resolve({ data: 'tx-linked', error: null }));

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_categories') return categories;
        if (table === 'mf_tags') return tags;
        if (table === 'mf_transaction_tags') return transactionTags;
        if (table === 'notification_settings') return notifSettings;
        if (table === 'finance_responsibles') return responsibles;
        if (table === 'mf_tx_links') return links;
        if (table === 'trips') return trips;
        if (table === 'investment_accounts') return investments;
        if (table === 'mf_profiles') return profiles;
        return transactions;
      }),
      rpc,
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
    __state: state,
    __rpc: rpc,
  };
});

// Histórico do autocomplete mockado (o hook real pagina via .range,
// que o mock do supabase não implementa)
const allTxMock = vi.fn();
vi.mock('../../hooks/useMinhasFinancas', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useMFAllTransactions: (...args) => allTxMock(...args),
    // As sugestões do autocomplete vêm de um hook próprio (só as linhas
    // recentes, com colunas mínimas).
    useMFSuggestionRows: (...args) => allTxMock(...args),
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

/** Lápis da linha → modal Detalhes → Editar → tela completa. */
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

describe('Tela de Lançamentos (Fase 3)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
    // Default do histórico: as mesmas linhas do mock (o hook real funciona
    // sem .range — ver mfSelectAll — então os consumidores esperam os dados)
    const mocked = await import('../../lib/supabase');
    mocked.__state.links = [];
    allTxMock.mockReturnValue({
      data: mocked.__txRows ?? [],
      isLoading: false,
      isError: false,
    });
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
    // Tags: seletor fechado por padrão — abre, filtra pela busca e escolhe
    fireEvent.click(screen.getByTestId('mf-tx-tags-toggle'));
    expect(screen.getByTestId('mf-tx-tags-picker')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('mf-tx-tags-picker-search'), {
      target: { value: 'via' },
    });
    expect(
      screen.queryByTestId('mf-tx-tags-picker-option-tag-home')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-tx-tags-picker-option-tag-trip'));

    fireEvent.click(screen.getByTestId('mf-tx-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    // 1ª chamada: parcela 1 (id gerado aqui para as filhas apontarem)
    const first = chain.insert.mock.calls[0][0];
    expect(first).toHaveLength(1);
    expect(first[0].id).toEqual(expect.any(String));
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
      payment_date: '2026-11-15',
    });
    expect(rest[0].parent_transaction_id).toBe(first[0].id);
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

  it('despesa vinculada à viagem é salva pela RPC atômica (sem insert avulso)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Hospedagem Gramado' },
    });
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '100,00' } });
    fireEvent.click(screen.getByTestId('mf-tx-account'));
    fireEvent.click(screen.getByTestId('mf-tx-account-option-acc-1'));
    fireEvent.change(screen.getByTestId('mf-tx-payment-date'), {
      target: { value: '2026-05-02' },
    });

    fireEvent.click(screen.getByTestId('mf-integration-trip-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-integration-trip-select')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-integration-trip-select'));
    await waitFor(() => {
      expect(
        screen.getByTestId('mf-integration-trip-select-option-trip-1')
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-integration-trip-select-option-trip-1'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-integration-preview')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-tx-save'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalled();
    });
    // Sem perfil ativo ("Todos os perfis"), o responsável vem do primeiro
    // perfil — não do prefixo do e-mail do usuário.
    expect(supabase.rpc).toHaveBeenCalledWith('mf_save_tx_linked', {
      p_tx: expect.objectContaining({
        description: 'Hospedagem Gramado',
        amount: 100,
        payment_date: '2026-05-02',
        status: 'PAGO',
      }),
      p_tx_id: null,
      p_trip_id: 'trip-1',
      p_investment_account_id: null,
      p_children: [],
      p_paid_by: 'Glailton',
      p_mirror_amount: 100,
    });
    // O lançamento não é gravado duas vezes (insert direto também rodaria).
    expect(supabase.from('mf_transactions').insert).not.toHaveBeenCalled();
  });

  it('parcelado vinculado manda as filhas e o total do espelho na RPC', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Passeio parcelado' },
    });
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '100,00' } });
    fireEvent.click(screen.getByTestId('mf-tx-account'));
    fireEvent.click(screen.getByTestId('mf-tx-account-option-acc-1'));
    fireEvent.change(screen.getByTestId('mf-tx-payment-date'), {
      target: { value: '2026-05-02' },
    });

    fireEvent.click(screen.getByTestId('mf-tx-repeat-open'));
    fireEvent.click(screen.getByTestId('mf-repeat-mode-total'));
    fireEvent.click(screen.getByTestId('mf-repeat-confirm'));

    fireEvent.click(screen.getByTestId('mf-integration-trip-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-integration-trip-select')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-integration-trip-select'));
    await waitFor(() => {
      expect(
        screen.getByTestId('mf-integration-trip-select-option-trip-1')
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-integration-trip-select-option-trip-1'));

    fireEvent.click(screen.getByTestId('mf-tx-save'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalled();
    });
    const args = supabase.rpc.mock.calls[0][1];
    expect(args.p_tx.amount).toBe(50);
    expect(args.p_tx.installments_total).toBe(2);
    expect(args.p_mirror_amount).toBe(100);
    expect(args.p_children).toHaveLength(1);
    expect(args.p_children[0]).toMatchObject({
      amount: 50,
      installments_current: 2,
      installments_total: 2,
    });
    expect(supabase.from('mf_transactions').insert).not.toHaveBeenCalled();
  });

  it('edição de lançamento vinculado desmarca a viagem e remove o espelho', async () => {
    const mocked = await import('../../lib/supabase');
    mocked.__state.links = [{ transaction_id: 'tx-2', trip_id: 'trip-1' }];
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    await openDetailEdit('mf-tx-edit-tx-2');
    const toggle = screen.getByTestId('mf-integration-trip-toggle');
    await waitFor(() => {
      expect(toggle).toBeChecked();
    });
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();

    fireEvent.click(screen.getByTestId('mf-tx-save'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalled();
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'mf_save_tx_linked',
      expect.objectContaining({ p_tx_id: 'tx-2', p_trip_id: null, p_mirror_amount: null })
    );
  });

  it('série fixa desabilita a integração com a viagem', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    fireEvent.click(screen.getByTestId('mf-tx-repeat-fixed'));

    const toggle = screen.getByTestId('mf-integration-trip-toggle');
    expect(toggle).toBeDisabled();
    expect(screen.getByTestId('mf-integration-disabled')).toHaveTextContent(
      'minhasfinancas.integration_disabled_recurring'
    );
  });

  it('receita vinculada ao investimento é salva pela RPC com o valor total', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('income');
    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Rendimento CDB' },
    });
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '100,00' } });
    fireEvent.click(screen.getByTestId('mf-tx-account'));
    fireEvent.click(screen.getByTestId('mf-tx-account-option-acc-1'));
    fireEvent.change(screen.getByTestId('mf-tx-payment-date'), {
      target: { value: '2026-05-02' },
    });

    fireEvent.click(screen.getByTestId('mf-integration-investment-toggle'));
    // Uma única conta de investimento em BRL: o painel já seleciona.
    await waitFor(() => {
      expect(screen.getByTestId('mf-integration-investment-preview')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-tx-save'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalled();
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'mf_save_tx_linked',
      expect.objectContaining({
        p_tx_id: null,
        p_trip_id: null,
        p_investment_account_id: 'inv-1',
        p_mirror_amount: 100,
        p_tx: expect.objectContaining({
          type: 'RECEITA',
          amount: 100,
          status: 'PAGO',
        }),
      })
    );
    expect(supabase.from('mf_transactions').insert).not.toHaveBeenCalled();
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

      await openDetailEdit('mf-tx-edit-tx-3');

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

  it('cria a categoria digitada na busca do seletor e já seleciona', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    fireEvent.click(screen.getByTestId('mf-tx-category'));
    fireEvent.change(screen.getByTestId('mf-tx-category-search'), {
      target: { value: 'Lazer' },
    });

    // sem resultado exato: oferece criar com o texto digitado
    // (no teste o t() retorna a chave — o nome vai no parâmetro)
    const createBtn = await screen.findByTestId('mf-tx-category-create');
    expect(createBtn).toHaveTextContent('minhasfinancas.category_create_named');
    fireEvent.click(createBtn);

    const { supabase } = await import('../../lib/supabase');
    const catChain = supabase.from('mf_categories');
    await waitFor(() => {
      expect(catChain.insert).toHaveBeenCalled();
    });
    expect(catChain.insert.mock.calls[0][0]).toMatchObject({
      user_id: 'test-user',
      name: 'Lazer',
      type: 'DESPESA',
      parent_id: null,
    });

    // a nova categoria (id created-0 do mock) já vai vinculada ao salvar
    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Compra lazer teste' },
    });
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '10,00' } });
    fireEvent.click(screen.getByTestId('mf-tx-account'));
    fireEvent.click(screen.getByTestId('mf-tx-account-option-acc-1'));
    fireEvent.click(screen.getByTestId('mf-tx-save'));

    const txChain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(txChain.insert).toHaveBeenCalled();
    });
    const inserted = txChain.insert.mock.calls.flatMap((call) => call[0]);
    expect(
      inserted.find((row) => row?.description === 'Compra lazer teste')
    ).toMatchObject({ category_id: 'created-0' });
  });

  it('cria categoria pelo modal do seletor e já a seleciona', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    fireEvent.click(screen.getByTestId('mf-tx-category'));
    fireEvent.click(screen.getByTestId('mf-tx-category-new-category'));

    expect(screen.getByTestId('mf-cat-modal')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('mf-cat-modal-name'), {
      target: { value: 'Pets' },
    });
    fireEvent.click(screen.getByTestId('mf-cat-modal-save'));

    await waitFor(() => {
      expect(screen.queryByTestId('mf-cat-modal')).not.toBeInTheDocument();
    });
    const { supabase } = await import('../../lib/supabase');
    expect(supabase.from('mf_categories').insert.mock.calls[0][0]).toMatchObject({
      name: 'Pets',
      type: 'DESPESA',
      parent_id: null,
    });
  });

  it('cria subcategoria pelo "+" do seletor com o pai pré-selecionado', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    fireEvent.click(screen.getByTestId('mf-tx-category'));
    fireEvent.click(screen.getByTestId('mf-tx-category-add-sub-cat-food'));

    expect(screen.getByTestId('mf-cat-modal')).toBeInTheDocument();
    // subcategoria herda o tipo do pai: o campo Tipo não aparece
    expect(screen.queryByTestId('mf-cat-modal-type')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('mf-cat-modal-name'), {
      target: { value: 'Padaria' },
    });
    fireEvent.click(screen.getByTestId('mf-cat-modal-save'));

    await waitFor(() => {
      expect(screen.queryByTestId('mf-cat-modal')).not.toBeInTheDocument();
    });

    const { supabase } = await import('../../lib/supabase');
    expect(supabase.from('mf_categories').insert.mock.calls[0][0]).toMatchObject({
      name: 'Padaria',
      parent_id: 'cat-food',
      type: 'DESPESA',
    });
  });

  it('não oferece criar quando o nome já existe (só selecionar)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    fireEvent.click(screen.getByTestId('mf-tx-category'));
    fireEvent.change(screen.getByTestId('mf-tx-category-search'), {
      target: { value: 'alimentação' },
    });

    // achou exato: mostra a opção existente e não oferece criar
    expect(screen.getByTestId('mf-tx-category-search')).toHaveValue('alimentação');
    expect(screen.queryByTestId('mf-tx-category-create')).not.toBeInTheDocument();
  });

  it('autocomplete do histórico preenche descrição + categoria sem tocar no valor', async () => {
    allTxMock.mockReturnValue({
      data: [
        {
          id: 'tx-1',
          type: 'DESPESA',
          description: 'Chocolate',
          amount: 10,
          payment_date: '2026-10-01',
          status: 'PAGO',
          category_id: 'cat-market',
          account_id: 'acc-1',
        },
      ],
      isLoading: false,
      isError: false,
    });
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Cho' },
    });

    // sugestão aparece com descrição + categoria (sem valor)
    const item = await screen.findByTestId('mf-tx-suggest-item-0');
    expect(item).toHaveTextContent('Chocolate');
    expect(item).toHaveTextContent('Supermercado');
    expect(item).not.toHaveTextContent('10');

    fireEvent.mouseDown(item);

    // descrição e categoria preenchidas; valor continua vazio
    expect(screen.getByTestId('mf-tx-description')).toHaveValue('Chocolate');
    expect(screen.getByTestId('mf-tx-category')).toHaveTextContent('Supermercado');
    expect(screen.getByTestId('mf-tx-amount')).toHaveValue('');
    expect(screen.queryByTestId('mf-tx-suggest')).not.toBeInTheDocument();
  });

  it('autocomplete do histórico traz as tags do lançamento original', async () => {
    allTxMock.mockReturnValue({
      data: [
        {
          id: 'tx-1',
          type: 'DESPESA',
          description: 'Chocolate',
          amount: 10,
          payment_date: '2026-10-01',
          status: 'PAGO',
          category_id: 'cat-market',
          account_id: 'acc-1',
        },
      ],
      isLoading: false,
      isError: false,
    });
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Cho' },
    });

    const item = await screen.findByTestId('mf-tx-suggest-item-0');
    fireEvent.mouseDown(item);

    // tx-1 tem vínculo com tag-home (Casa) no mock: chip de selecionada aparece
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-tag-sel-tag-home')).toBeInTheDocument();
    });

    // regressão produção: o select precisa trazer transaction_id, senão
    // o filtro client-side zera as tags (mock ignora colunas, então só
    // a asserção da query pega)
    const { supabase } = await import('../../lib/supabase');
    const linksChain = supabase.from('mf_transaction_tags');
    expect(
      linksChain.select.mock.calls.some(([cols]) =>
        String(cols).includes('transaction_id')
      )
    ).toBe(true);
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

  it('novo lançamento já nasce efetivado (PAGO por padrão)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    // status padrão é PAGO (igual ao app original)
    expect(screen.getByTestId('mf-tx-status')).toHaveTextContent('minhasfinancas.status_pago');
  });

  it('efetivação automática: desmarcada por padrão e vai no payload ao marcar', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    // Default false: nasce efetivado (PAGO), mas NUNCA vira PAGO sozinho
    // depois — a virada só acontece com a opção marcada na criação.
    expect(screen.getByTestId('mf-tx-auto-settle')).not.toBeChecked();

    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Conta de luz' },
    });
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '89,90' } });
    fireEvent.click(screen.getByTestId('mf-tx-account'));
    fireEvent.click(screen.getByTestId('mf-tx-account-option-acc-1'));
    fireEvent.click(screen.getByTestId('mf-tx-auto-settle'));
    expect(screen.getByTestId('mf-tx-auto-settle')).toBeChecked();
    fireEvent.click(screen.getByTestId('mf-tx-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert).toHaveBeenCalled();
    });
    expect(chain.insert.mock.calls[0][0][0]).toMatchObject({
      description: 'Conta de luz',
      status: 'PAGO', // nascimento efetivado continua (P2 da rodada)
      auto_settle: true,
    });
  });

  it('edita um lançamento existente', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    await openDetailEdit('mf-tx-edit-tx-3');
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

  it('edição de parcelada pergunta o escopo; "todos" atualiza a série com conteúdo', async () => {
    // 2ª ocorrência da série (o mock ignora filtros; o fetch filtra por pai)
    const mocked = await import('../../lib/supabase');
    const rows = mocked.__txRows;
    rows.push({
      id: 'tx-3c',
      account_id: 'acc-2',
      type: 'DESPESA',
      description: 'Curso online',
      amount: 100,
      payment_date: '2026-11-10',
      status: 'PENDENTE',
      parent_transaction_id: 'tx-3',
      installments_current: 3,
      installments_total: 12,
      recurrence: 'NONE',
    });
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-edit-tx-3')).toBeInTheDocument();
      });

      await openDetailEdit('mf-tx-edit-tx-3');
      fireEvent.change(screen.getByTestId('mf-tx-description'), {
        target: { value: 'Curso online 2026' },
      });
      fireEvent.click(screen.getByTestId('mf-tx-save'));

      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-edit-scope-dialog')).toBeInTheDocument();
      });
      expect(screen.getByTestId('mf-tx-edit-scope-one')).toBeInTheDocument();
      expect(screen.getByTestId('mf-tx-edit-scope-from')).toBeInTheDocument();
      expect(screen.getByTestId('mf-tx-edit-scope-all')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('mf-tx-edit-scope-all'));

      const { supabase } = await import('../../lib/supabase');
      const chain = supabase.from('mf_transactions');
      await waitFor(() => {
        expect(
          chain.update.mock.calls.some(
            ([patch]) => patch?.description === 'Curso online 2026'
          )
        ).toBe(true);
      });
      const patches = chain.update.mock.calls.map(([patch]) => patch);
      // este: form completo (data preservada do formulário)
      const full = patches.find(
        (patch) => patch?.description === 'Curso online 2026' && 'payment_date' in patch
      );
      expect(full).toMatchObject({ payment_date: '2026-10-10' });
      // demais parcelas: só conteúdo (sem data/fatura/status)
      const bulk = patches.find(
        (patch) => patch?.description === 'Curso online 2026' && !('payment_date' in patch)
      );
      expect(bulk).toBeTruthy();
      expect(bulk).not.toHaveProperty('invoice_close');
      expect(bulk).not.toHaveProperty('status');
      expect(chain.in).toHaveBeenCalledWith('id', expect.arrayContaining(['tx-3c']));
      expect(screen.queryByTestId('mf-tx-edit-scope-dialog')).not.toBeInTheDocument();
    } finally {
      const index = rows.findIndex((row) => row.id === 'tx-3c');
      if (index >= 0) rows.splice(index, 1);
    }
  });

  it('edição de repetição com vínculo pergunta o escopo (semanais/anuais)', async () => {
    // Repetição semanal vinculada por parent (sem is_fixed nem parcelas):
    // antes caía direto no update único sem perguntar.
    const mocked = await import('../../lib/supabase');
    const rows = mocked.__txRows;
    rows.push(
      {
        id: 'tx-rep-head',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Aula semanal',
        amount: 80,
        payment_date: '2026-10-06',
        status: 'PAGO',
        recurrence: 'WEEKLY',
        parent_transaction_id: null,
      },
      {
        id: 'tx-rep-c1',
        account_id: 'acc-1',
        type: 'DESPESA',
        description: 'Aula semanal',
        amount: 80,
        payment_date: '2026-10-13',
        status: 'PENDENTE',
        recurrence: 'WEEKLY',
        parent_transaction_id: 'tx-rep-head',
      }
    );
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-edit-tx-rep-head')).toBeInTheDocument();
      });

      await openDetailEdit('mf-tx-edit-tx-rep-head');
      fireEvent.change(screen.getByTestId('mf-tx-description'), {
        target: { value: 'Aula semanal reajustada' },
      });
      fireEvent.click(screen.getByTestId('mf-tx-save'));

      // usa o diálogo de série fixa (conteúdo, mantendo as datas)
      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-edit-fixed-dialog')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('mf-tx-edit-fixed-all'));

      const { supabase } = await import('../../lib/supabase');
      const chain = supabase.from('mf_transactions');
      await waitFor(() => {
        expect(
          chain.update.mock.calls.some(
            ([patch]) => patch?.description === 'Aula semanal reajustada'
          )
        ).toBe(true);
      });
      expect(chain.in).toHaveBeenCalledWith('id', expect.arrayContaining(['tx-rep-c1']));
    } finally {
      for (const id of ['tx-rep-head', 'tx-rep-c1']) {
        const index = rows.findIndex((row) => row.id === id);
        if (index >= 0) rows.splice(index, 1);
      }
    }
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
    // Despesa de cartão entra sempre paga (sem status, como no original)...
    expect(screen.queryByTestId('mf-tx-status')).not.toBeInTheDocument();
    // ...e sem efetivação automática (nasce PAGO — a opção não existe)
    expect(screen.queryByTestId('mf-tx-auto-settle')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-repeat')).toBeInTheDocument();
    // ...e escolhe a fatura no picker do app original (~2 anos)
    expect(screen.getByTestId('mf-tx-invoice')).toBeInTheDocument();
    // Despesa de cartão (app original): só Data de lançamento, sem
    // Competência/Vencimento/Efetivação
    expect(screen.getByTestId('mf-tx-payment-date')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-due-date')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-tx-effective-date')).not.toBeInTheDocument();
  });

  it('fatura padrão da despesa de cartão segue o mês visualizado', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 11, 12, 0, 0) });
    try {
      renderWithProviders(
        <MFTransacoes user={mockUser} monthKey="2026-11" onChangeMonth={() => {}} />
      );
      await waitFor(() => {
        expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
      });

      openAdd('cardExpense');
      // Único cartão do mock já vem selecionado; o picker abre em novembro
      // (mês visualizado), não no mês corrente (outubro)
      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-account')).toHaveTextContent('Cartão Visa');
      });
      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-invoice')).toHaveTextContent('Novembro');
      });

      fireEvent.change(screen.getByTestId('mf-tx-description'), {
        target: { value: 'Compra futura teste' },
      });
      fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '50,00' } });
      fireEvent.click(screen.getByTestId('mf-tx-save'));

      const { supabase } = await import('../../lib/supabase');
      const chain = supabase.from('mf_transactions');
      await waitFor(() => {
        expect(chain.insert).toHaveBeenCalled();
      });
      const inserted = chain.insert.mock.calls.flatMap((call) => call[0]);
      expect(
        inserted.find((row) => row?.description === 'Compra futura teste')
      ).toMatchObject({ invoice_close: '2026-11-01' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fatura fechada pede confirmação antes de salvar (app original)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 11, 12, 0, 0) });
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
      });

      openAdd('cardExpense');
      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-invoice')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByTestId('mf-tx-description'), {
        target: { value: 'Compra atrasada' },
      });
      fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '99,90' } });
      // Cartão do mock sem closing_day → C=1: setembro/2026 (fecha 01/09)
      // já fechou em 11/10/2026 → salva com aviso
      fireEvent.click(screen.getByTestId('mf-tx-invoice'));
      fireEvent.click(screen.getByTestId('mf-tx-invoice-option-2026-09-01'));
      fireEvent.click(screen.getByTestId('mf-tx-save'));

      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-closed-invoice')).toBeInTheDocument();
      });
      // Continuar + "não perguntar" grava com o vínculo e suprime o aviso
      fireEvent.click(screen.getByTestId('mf-tx-closed-check'));
      fireEvent.click(screen.getByTestId('mf-tx-closed-invoice-option-continue'));

      const { supabase } = await import('../../lib/supabase');
      const chain = supabase.from('mf_transactions');
      await waitFor(() => {
        expect(chain.insert).toHaveBeenCalled();
      });
      const inserted = chain.insert.mock.calls.flatMap((call) => call[0]);
      expect(
        inserted.find((row) => row?.description === 'Compra atrasada')
      ).toMatchObject({ invoice_close: '2026-09-01', status: 'PAGO' });
      expect(localStorage.getItem('mf_closed_invoice_warn_off')).toBe('1');
      localStorage.removeItem('mf_closed_invoice_warn_off');
    } finally {
      vi.useRealTimers();
    }
  });

  it('fixa mensal com mesmo nome no mês pede confirmação (anti-duplicada)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    // 'Supermercado Extra' já existe em 10/2026 (tx-2): fixa avisa antes
    openAdd('expense');
    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Supermercado Extra' },
    });
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '100,00' } });
    fireEvent.click(screen.getByTestId('mf-tx-account'));
    fireEvent.click(screen.getByTestId('mf-tx-account-option-acc-1'));
    fireEvent.change(screen.getByTestId('mf-tx-payment-date'), {
      target: { value: '2026-10-15' },
    });
    fireEvent.click(screen.getByTestId('mf-tx-repeat-fixed'));
    fireEvent.click(screen.getByTestId('mf-tx-save'));

    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-dupe')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-dupe-option-continue'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    // cabeça fixa + 11 filhas
    expect(chain.insert.mock.calls[0][0][0]).toMatchObject({ is_fixed: true });
  });

  it('duplicada de despesa de cartão compara pela Fatura, não pela data', async () => {
    // Existe "Compra racao" lançada em 10/10 mas na fatura de NOVEMBRO:
    // o aviso tem que mirar a fatura (novembro), não o mês da data (outubro).
    const mocked = await import('../../lib/supabase');
    const rows = mocked.__txRows;
    rows.push({
      id: 'tx-racao',
      account_id: 'acc-card',
      type: 'DESPESA',
      description: 'Compra racao',
      amount: 50,
      payment_date: '2026-10-10',
      status: 'PAGO',
      invoice_close: '2026-11-01',
      recurrence: 'NONE',
    });
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-edit-tx-racao')).toBeInTheDocument();
      });

      openAdd('cardExpense');
      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-account')).toHaveTextContent('Cartão Visa');
      });
      fireEvent.change(screen.getByTestId('mf-tx-description'), {
        target: { value: 'Compra racao' },
      });
      fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '50,00' } });
      fireEvent.change(screen.getByTestId('mf-tx-payment-date'), {
        target: { value: '2026-10-10' },
      });
      fireEvent.click(screen.getByTestId('mf-tx-invoice'));
      fireEvent.click(screen.getByTestId('mf-tx-invoice-option-2026-11-01'));
      // parcelada 2x → faturas de novembro e dezembro
      fireEvent.click(screen.getByTestId('mf-tx-repeat-open'));
      fireEvent.click(screen.getByTestId('mf-repeat-confirm'));
      fireEvent.click(screen.getByTestId('mf-tx-save'));

      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-dupe')).toBeInTheDocument();
      });

      const { supabase } = await import('../../lib/supabase');
      const chain = supabase.from('mf_transactions');
      // a checagem consulta invoice_close (fatura da cabeça + filhas), não payment_date
      expect(
        chain.select.mock.calls.flat().some((arg) => String(arg).includes('invoice_close'))
      ).toBe(true);
      expect(chain.gte.mock.calls).toContainEqual(['invoice_close', '2026-11-01']);
      expect(chain.lte.mock.calls).toContainEqual(['invoice_close', '2026-12-31']);
    } finally {
      const index = rows.findIndex((row) => row.id === 'tx-racao');
      if (index >= 0) rows.splice(index, 1);
    }
  });

  it('picker de fatura do cartão lista ~2 anos de faturas (Mês, ano)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('cardExpense');
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-invoice')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-invoice'));
    const popover = await screen.findByTestId('mf-tx-invoice-popover');
    // treze meses para trás + doze para frente + o vigente
    expect(popover.querySelectorAll('[role="option"]')).toHaveLength(26);
  });

  it('"Despesa cartão" parcelada ancora as filhas na fatura da cabeça', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('cardExpense');
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-account')).toHaveTextContent('Cartão Visa');
    });
    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Vacina ancorada' },
    });
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '186,84' } });
    fireEvent.change(screen.getByTestId('mf-tx-payment-date'), {
      target: { value: '2026-08-27' },
    });
    // Cartão do mock sem closing_day → C=1: cabeça vai para setembro/2026
    // (fecha 01/09) mesmo lançada em agosto
    fireEvent.click(screen.getByTestId('mf-tx-invoice'));
    fireEvent.click(screen.getByTestId('mf-tx-invoice-option-2026-09-01'));
    fireEvent.click(screen.getByTestId('mf-tx-repeat-open'));
    fireEvent.click(screen.getByTestId('mf-repeat-confirm'));
    // fecha o aviso de fatura fechada (setembro já fechou)
    fireEvent.click(screen.getByTestId('mf-tx-save'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-closed-invoice')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-tx-closed-invoice-option-continue'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    // cabeça em setembro, filha em outubro (não colidem na mesma fatura)
    expect(chain.insert.mock.calls[0][0][0]).toMatchObject({
      invoice_close: '2026-09-01',
      installments_current: 1,
      installments_total: 2,
    });
    expect(chain.insert.mock.calls[1][0][0]).toMatchObject({
      invoice_close: '2026-10-01',
      installments_current: 2,
      installments_total: 2,
      payment_date: '2026-09-27',
    });
    localStorage.removeItem('mf_closed_invoice_warn_off');
  });

  it('"Despesa cartão" parcelada grava cabeça e filhas como PAGO com fatura vinculada', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('cardExpense');
    await waitFor(() => {
      expect(screen.getByTestId('mf-tx-account')).toHaveTextContent('Cartão Visa');
    });
    fireEvent.change(screen.getByTestId('mf-tx-description'), {
      target: { value: 'Vacina cartão' },
    });
    fireEvent.change(screen.getByTestId('mf-tx-amount'), { target: { value: '582,71' } });
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

    // Cartão do mock sem closing_day → C=1: 15/10 é da fatura de outubro
    // (fecha 01/10, vence no mês); a filha de 15/11 leva a de novembro.
    expect(chain.insert.mock.calls[0][0][0]).toMatchObject({
      amount: 582.71,
      status: 'PAGO',
      invoice_close: '2026-10-01',
      installments_current: 1,
      installments_total: 2,
    });
    expect(chain.insert.mock.calls[1][0][0]).toMatchObject({
      status: 'PAGO',
      invoice_close: '2026-11-01',
      installments_current: 2,
      installments_total: 2,
      payment_date: '2026-11-15',
    });
  });

  it('edição mostra Repetição no avulso e esconde no parcelado', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    // tx-2 é avulso (recurrence NONE) → pode virar série na edição
    await openDetailEdit('mf-tx-edit-tx-2');
    expect(screen.getByTestId('mf-tx-repeat')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-tx-back'));

    // tx-3 já é parcela (2/12) → repetição não aparece
    await openDetailEdit('mf-tx-edit-tx-3');
    expect(screen.queryByTestId('mf-tx-repeat')).not.toBeInTheDocument();
  });

  it('opções de repetição usam o segmento e marcam a selecionada', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    const none = screen.getByTestId('mf-tx-repeat-none');
    expect(none).toHaveClass('btn-option');
    expect(none).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('mf-tx-repeat-fixed'));
    expect(screen.getByTestId('mf-tx-repeat-fixed')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(none).toHaveAttribute('aria-pressed', 'false');
  });

  it('edição converte avulso em parcelado (cabeça atualizada + filhas)', async () => {    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    await openDetailEdit('mf-tx-edit-tx-2');
    expect(screen.getByTestId('mf-tx-repeat')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-tx-repeat-open'));
    fireEvent.click(screen.getByTestId('mf-repeat-confirm'));
    fireEvent.click(screen.getByTestId('mf-tx-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert).toHaveBeenCalled();
    });
    const inserted = chain.insert.mock.calls.flatMap((call) => call[0]);
    // tx-2 é 06/10 conta comum → filha 2/2 em 06/11, pendente (regra das contas)
    expect(
      inserted.find((row) => row?.parent_transaction_id === 'tx-2')
    ).toMatchObject({
      installments_current: 2,
      installments_total: 2,
      status: 'PENDENTE',
      payment_date: '2026-11-06',
    });
    expect(chain.update).toHaveBeenCalled();
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

  it('calculadora ao lado do valor abre, calcula e preenche o campo', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
    });

    openAdd('expense');
    expect(screen.getByTestId('mf-tx-screen')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-tx-amount-calc'));
    expect(screen.getByTestId('mf-tx-calc')).toBeInTheDocument();

    // 9 × 2 = 18
    fireEvent.click(screen.getByTestId('mf-calc-clear'));
    fireEvent.click(screen.getByTestId('mf-calc-9'));
    fireEvent.click(screen.getByTestId('mf-calc-op-mul'));
    fireEvent.click(screen.getByTestId('mf-calc-2'));
    fireEvent.click(screen.getByTestId('mf-calc-confirm'));

    expect(screen.queryByTestId('mf-tx-calc')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-tx-amount')).toHaveValue('18,00');
  });
});

describe('Lançamentos — estreito (mobile, cartões por dia, sem scroll lateral)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
    const mocked = await import('../../lib/supabase');
    allTxMock.mockReturnValue({
      data: mocked.__txRows ?? [],
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    localStorage.removeItem('pc_skip_confirmations');
  });

  const mockNarrow = () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  };
  const restoreViewport = () => {
    delete window.matchMedia;
  };

  it('lista em cartões agrupados por dia, sem tabela; KPIs, badge de itens e FAB', async () => {
    mockNarrow();
    try {
      renderScreen();

      // 3 lançamentos em 3 dias distintos (05, 06 e 10) → 3 grupos de dia
      await waitFor(() => {
        expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
      });
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByTestId('mf-tx-day-2026-10-05')).toBeInTheDocument();
      expect(screen.getByTestId('mf-tx-day-2026-10-06')).toBeInTheDocument();
      expect(screen.getByTestId('mf-tx-day-2026-10-10')).toBeInTheDocument();

      // Cabeçalho: badge de itens; o "+" do cabeçalho sai e o FAB assume
      expect(screen.getByTestId('mf-tx-count')).toBeInTheDocument();
      expect(screen.queryByTestId('mf-new-tx')).not.toBeInTheDocument();
      expect(screen.getByTestId('mf-new-tx-fab')).toBeInTheDocument();

      // Tira de KPIs (Receitas / Despesas / Transf.)
      expect(screen.getByTestId('mf-tx-kpi-receita')).toHaveTextContent('R$ 5.000,00');
      expect(screen.getByTestId('mf-tx-kpi-despesa')).toHaveTextContent(/US\$ 100,00/);
      expect(screen.getByTestId('mf-tx-kpi-transfer')).toBeInTheDocument();

      // Cartão mantém descrição, parcelas, categoria, tags e status
      expect(screen.getByTestId('mf-tx-desc-tx-1')).toHaveTextContent('Salário');
      expect(screen.getByTestId('mf-tx-installment-badge')).toHaveTextContent('2/12');
      expect(screen.getAllByTestId('mf-tx-tag-badge')).toHaveLength(2);
      expect(screen.getAllByTestId('mf-tx-status-badge')).toHaveLength(3);
      expect(screen.getByTestId('mf-tx-menu-tx-1')).toBeInTheDocument();
    } finally {
      restoreViewport();
    }
  });

  it('checkbox do dia marca o dia inteiro e Pagar grava PAGO (sem barra global)', async () => {
    mockNarrow();
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
      });

      // Sem seleção: Pagar do dia fica desabilitado
      expect(screen.getByTestId('mf-tx-day-pay-2026-10-10')).toBeDisabled();

      // Marca o dia 10 por inteiro (só tx-3 ali)
      fireEvent.click(screen.getByTestId('mf-tx-day-select-2026-10-10'));
      expect(screen.getByTestId('mf-tx-select-tx-3')).toBeChecked();
      // No estreito a barra de lote global não aparece — os botões do dia assumem
      expect(screen.queryByTestId('mf-tx-bulk-bar')).not.toBeInTheDocument();

      // Clicar no checkbox do card seleciona sem abrir os Detalhes
      fireEvent.click(screen.getByTestId('mf-tx-select-tx-1'));
      expect(screen.getByTestId('mf-tx-select-tx-1')).toBeChecked();
      expect(screen.queryByTestId('mf-tx-detail')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('mf-tx-day-pay-2026-10-10'));
      const { supabase } = await import('../../lib/supabase');
      const chain = supabase.from('mf_transactions');
      await waitFor(() => {
        expect(chain.in).toHaveBeenCalledWith('id', ['tx-3']);
      });
      expect(chain.update.mock.calls[0][0]).toMatchObject({ status: 'PAGO' });

      // Seleção esvazia → o botão do dia volta a ficar desabilitado
      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-day-pay-2026-10-10')).toBeDisabled();
      });
    } finally {
      restoreViewport();
    }
  });

  it('Excluir do dia exclui só os selecionados do dia', async () => {
    mockNarrow();
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
      });

      fireEvent.click(screen.getByTestId('mf-tx-day-select-2026-10-05'));
      fireEvent.click(screen.getByTestId('mf-tx-day-delete-2026-10-05'));

      const { supabase } = await import('../../lib/supabase');
      const chain = supabase.from('mf_transactions');
      await waitFor(() => {
        expect(chain.in).toHaveBeenCalledWith('id', ['tx-1']);
      });
      expect(chain.delete).toHaveBeenCalled();
    } finally {
      restoreViewport();
    }
  });

  it('⋮ expande as ações dentro do card; o card abre os Detalhes', async () => {
    mockNarrow();
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
      });

      // ⋮ NÃO abre mais o modal: expande as ações dentro do próprio card
      fireEvent.click(screen.getByTestId('mf-tx-menu-tx-2'));
      expect(screen.getByTestId('mf-tx-actions-tx-2')).toBeInTheDocument();
      expect(screen.queryByTestId('mf-tx-detail')).not.toBeInTheDocument();
      expect(screen.getByTestId('mf-tx-action-paid-tx-2')).toBeInTheDocument();
      expect(screen.getByTestId('mf-tx-action-edit-tx-2')).toBeInTheDocument();
      expect(screen.getByTestId('mf-tx-action-send-tx-2')).toBeInTheDocument();
      expect(screen.getByTestId('mf-tx-action-delete-tx-2')).toBeInTheDocument();

      // Clicar de novo recolhe as ações
      fireEvent.click(screen.getByTestId('mf-tx-menu-tx-2'));
      expect(screen.queryByTestId('mf-tx-actions-tx-2')).not.toBeInTheDocument();

      // O card (área clicável) abre os Detalhes
      fireEvent.click(screen.getByTestId('mf-tx-open-tx-2'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-detail')).toBeInTheDocument();
      });
    } finally {
      restoreViewport();
    }
  });

  it('ações do card: Pago grava o status e Editar abre a edição completa', async () => {
    mockNarrow();
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getAllByTestId('mf-tx-row')).toHaveLength(3);
      });

      // tx-3 está PENDENTE → Pago grava PAGO
      fireEvent.click(screen.getByTestId('mf-tx-menu-tx-3'));
      fireEvent.click(screen.getByTestId('mf-tx-action-paid-tx-3'));
      const { supabase } = await import('../../lib/supabase');
      const chain = supabase.from('mf_transactions');
      await waitFor(() => {
        expect(chain.update.mock.calls[0][0]).toMatchObject({ status: 'PAGO' });
      });
      expect(chain.eq).toHaveBeenCalledWith('id', 'tx-3');

      // Editar abre a tela completa de edição
      fireEvent.click(screen.getByTestId('mf-tx-menu-tx-2'));
      fireEvent.click(screen.getByTestId('mf-tx-action-edit-tx-2'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-tx-screen')).toBeInTheDocument();
      });
    } finally {
      restoreViewport();
    }
  });
});
