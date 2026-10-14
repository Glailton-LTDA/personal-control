import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFGroupModal from './MFGroupModal';
import MFResumo from './MFResumo';
import MFAccountModal from './MFAccountModal';
import { MF_DASHBOARD_KEY } from './mfDashboard';

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

/**
 * Mock Supabase com cadeia POR CHAMADA (filtros valem de verdade) e um
 * gravador comum de inserts/updates para as asserções.
 */
vi.mock('../../lib/supabase', () => {
  const calls = { inserts: [], updates: [] };

  const DATA = {
    mf_accounts: [
      {
        id: 'acc-nu',
        name: 'Conta principal',
        account_type: 'CORRENTE',
        currency: 'BRL',
        initial_balance: 1000,
        color: '#6366f1',
        icon: 'brand:nubank',
        sort_order: 0,
        group_id: 'grp-nubank',
      },
      {
        id: 'acc-reserva',
        name: 'Reserva',
        account_type: 'POUPANCA',
        currency: 'BRL',
        initial_balance: 500,
        color: '#10b981',
        sort_order: 1,
        group_id: 'grp-caixinhas',
      },
      {
        id: 'acc-livre',
        name: 'Sem grupo',
        account_type: 'CORRENTE',
        currency: 'BRL',
        initial_balance: 200,
        color: '#f59e0b',
        sort_order: 2,
        group_id: null,
      },
      {
        id: 'acc-card',
        name: 'Cartão Visa',
        account_type: 'CARTAO',
        currency: 'BRL',
        initial_balance: 0,
        color: '#ef4444',
        sort_order: 3,
        credit_limit: 1000,
        closing_day: 10,
        due_day: 20,
        group_id: null,
      },
      {
        id: 'acc-antiga',
        name: 'Conta antiga',
        account_type: 'CORRENTE',
        currency: 'BRL',
        initial_balance: 0,
        color: '#a855f7',
        sort_order: 4,
        archived_at: '2026-09-01T12:00:00.000Z',
        group_id: null,
      },
    ],
    mf_account_groups: [
      {
        id: 'grp-nubank',
        user_id: 'test-user',
        parent_id: null,
        name: 'Nubank',
        icon: '🏦',
        show_in_summary: true,
        sum_totals: true,
        sort_order: 0,
      },
      {
        id: 'grp-caixinhas',
        user_id: 'test-user',
        parent_id: 'grp-nubank',
        name: 'Caixinhas',
        icon: '🐷',
        show_in_summary: true,
        sum_totals: true,
        sort_order: 1,
      },
      {
        id: 'grp-outro',
        user_id: 'test-user',
        parent_id: null,
        name: 'Outro',
        icon: '💼',
        show_in_summary: false,
        sum_totals: false,
        sort_order: 2,
      },
    ],
    mf_transactions: [],
    mf_categories: [],
  };

  const makeChain = (table) => {
    const state = { filters: [], inserted: null, single: false, pendingUpdate: null };
    const chain = {};
    const flush = () => {
      if (state.pendingUpdate) {
        calls.updates.push({ table, ...state.pendingUpdate });
        state.pendingUpdate = null;
      }
    };
    const resolve = () => {
      flush();
      if (state.inserted) {
        return state.single
          ? { data: state.inserted[0] ?? null, error: null }
          : { data: state.inserted, error: null };
      }
      let rows = DATA[table] ?? [];
      for (const match of state.filters) {
        rows = rows.filter(match);
      }
      if (state.single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    };

    chain.select = vi.fn(() => chain);
    chain.insert = vi.fn((rows) => {
      const list = (Array.isArray(rows) ? rows : [rows]).map((row, index) => ({
        id: `created-${index}`,
        ...row,
      }));
      state.inserted = list;
      calls.inserts.push({ table, rows: list });
      return chain;
    });
    chain.update = vi.fn((patch) => {
      state.pendingUpdate = { patch, ids: null };
      return chain;
    });
    chain.delete = vi.fn(() => chain);
    chain.eq = vi.fn((field, value) => {
      if (state.pendingUpdate && field === 'id') state.pendingUpdate.ids = [value];
      state.filters.push((row) => row[field] === value);
      return chain;
    });
    chain.in = vi.fn((field, values) => {
      if (state.pendingUpdate) state.pendingUpdate.ids = values;
      state.filters.push((row) => values.includes(row[field]));
      return chain;
    });
    chain.order = vi.fn(() => chain);
    chain.gte = vi.fn((field, value) => {
      state.filters.push((row) => String(row[field]) >= String(value));
      return chain;
    });
    chain.lte = vi.fn((field, value) => {
      state.filters.push((row) => String(row[field]) <= String(value));
      return chain;
    });
    chain.limit = vi.fn(() => chain);
    chain.single = vi.fn(() => {
      state.single = true;
      return chain;
    });
    chain.maybeSingle = vi.fn(() => {
      state.single = true;
      return chain;
    });
    chain.then = vi.fn((onFulfilled, onRejected) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected)
    );
    return chain;
  };

  return {
    supabase: {
      from: vi.fn((table) => makeChain(table)),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    __calls: calls,
  };
});

const getCalls = async () => (await import('../../lib/supabase')).__calls;
// vi.clearAllMocks() não zera arrays próprios do mock — limpamos na mão.
const resetCalls = async () => {
  const calls = await getCalls();
  calls.inserts.length = 0;
  calls.updates.length = 0;
};

const mockUser = { id: 'test-user', email: 'test@example.com' };

const renderWithProviders = (ui) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

const groupInserts = (calls) => calls.inserts.filter((row) => row.table === 'mf_account_groups');
const accountInserts = (calls) => calls.inserts.filter((row) => row.table === 'mf_accounts');
const accountUpdates = (calls) => calls.updates.filter((row) => row.table === 'mf_accounts');
const groupUpdates = (calls) => calls.updates.filter((row) => row.table === 'mf_account_groups');

beforeEach(async () => {
  vi.clearAllMocks();
  await resetCalls();
  localStorage.removeItem(MF_DASHBOARD_KEY);
});

describe('MFGroupModal', () => {
  it('filtra as contas pelo nome e aplica seleção em massa só no que está visível', async () => {
    renderWithProviders(<MFGroupModal user={mockUser} onClose={vi.fn()} />);

    // Lista completa: três contas comuns (nem cartão, nem arquivada)
    await waitFor(() => {
      expect(screen.getByTestId('mf-group-account-acc-nu')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mf-group-account-acc-reserva')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-account-acc-livre')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-accounts-selected')).toHaveTextContent(
      'minhasfinancas.group_accounts_selected'
    );

    // Filtro por nome reduz a lista ao que corresponde
    fireEvent.change(screen.getByTestId('mf-group-accounts-search'), {
      target: { value: 'reserva' },
    });
    expect(screen.getByTestId('mf-group-account-acc-reserva')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-group-account-acc-nu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-group-account-acc-livre')).not.toBeInTheDocument();

    // Seleção em massa marca apenas a conta visível (filtrada)
    fireEvent.click(screen.getByTestId('mf-group-accounts-select-all'));
    expect(
      within(screen.getByTestId('mf-group-account-acc-reserva')).getByRole('checkbox')
    ).toBeChecked();

    // Voltar o filtro: a filtrada segue marcada, as demais intactas
    fireEvent.change(screen.getByTestId('mf-group-accounts-search'), {
      target: { value: '' },
    });
    expect(
      within(screen.getByTestId('mf-group-account-acc-reserva')).getByRole('checkbox')
    ).toBeChecked();
    expect(
      within(screen.getByTestId('mf-group-account-acc-nu')).getByRole('checkbox')
    ).not.toBeChecked();

    // "Limpar seleção" desmarca o que está visível
    fireEvent.click(screen.getByTestId('mf-group-accounts-clear'));
    expect(
      within(screen.getByTestId('mf-group-account-acc-reserva')).getByRole('checkbox')
    ).not.toBeChecked();

    // Filtro sem resultado mostra estado vazio
    fireEvent.change(screen.getByTestId('mf-group-accounts-search'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByTestId('mf-group-accounts-no-results')).toBeInTheDocument();
  });

  it('cria grupo com as flags e vincula só a conta clicada', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderWithProviders(
      <MFGroupModal user={mockUser} onClose={onClose} onSaved={onSaved} />
    );

    expect(screen.getByTestId('mf-group-title')).toHaveTextContent(
      'minhasfinancas.group_new_title'
    );
    // Flags começam ligadas; desliga "Exibir no Resumo"
    expect(screen.getByTestId('mf-group-show-summary')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('mf-group-sum-totals')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('mf-group-show-summary'));
    expect(screen.getByTestId('mf-group-show-summary')).toHaveAttribute('aria-checked', 'false');

    fireEvent.change(screen.getByTestId('mf-group-name'), { target: { value: 'Cripto' } });
    // Marca só a Reserva (as outras contas — inclusive as de OUTROS
    // grupos — não podem ser tocadas)
    await waitFor(() => {
      expect(screen.getByTestId('mf-group-account-acc-reserva')).toBeInTheDocument();
    });
    // Só contas comuns: nem cartão nem arquivada aparecem na lista
    expect(screen.queryByTestId('mf-group-account-acc-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-group-account-acc-antiga')).not.toBeInTheDocument();
    // A linha da conta exibe o LOGO da marca — nunca o texto cru "brand:…"
    const nuRow = screen.getByTestId('mf-group-account-acc-nu');
    expect(nuRow.querySelector('img')).toBeInTheDocument();
    expect(nuRow).not.toHaveTextContent('brand:');
    fireEvent.click(within(screen.getByTestId('mf-group-account-acc-reserva')).getByRole('checkbox'));

    fireEvent.click(screen.getByTestId('mf-group-save'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(groupInserts(calls)).toHaveLength(1);
    });
    expect(groupInserts(calls)[0].rows[0]).toMatchObject({
      user_id: 'test-user',
      name: 'Cripto',
      icon: '📁',
      show_in_summary: false,
      sum_totals: true,
      parent_id: null,
    });

    await waitFor(() => {
      expect(accountUpdates(calls)).toHaveLength(1);
    });
    expect(accountUpdates(calls)[0]).toMatchObject({
      patch: { group_id: 'created-0' },
      ids: ['acc-reserva'],
    });

    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'created-0' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('escolhe a cor do grupo no seletor e salva junto', async () => {
    renderWithProviders(
      <MFGroupModal user={mockUser} onClose={vi.fn()} onSaved={vi.fn()} />
    );

    fireEvent.change(screen.getByTestId('mf-group-name'), { target: { value: 'Viagem' } });
    // Segunda cor da paleta fica ativa; clicar de novo desmarca (automático)
    fireEvent.click(screen.getByTestId('mf-group-color-1'));
    expect(screen.getByTestId('mf-group-color-1')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('mf-group-color-1'));
    expect(screen.getByTestId('mf-group-color-1')).toHaveAttribute('aria-checked', 'false');
    // Marca de novo e salva junto no payload
    fireEvent.click(screen.getByTestId('mf-group-color-1'));
    fireEvent.click(screen.getByTestId('mf-group-save'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(groupInserts(calls)).toHaveLength(1);
    });
    expect(groupInserts(calls)[0].rows[0]).toMatchObject({
      name: 'Viagem',
      color: '#ef4444',
    });
  });

  it('troca o ícone do grupo por uma marca de banco (com busca)', async () => {
    renderWithProviders(<MFGroupModal user={mockUser} onClose={vi.fn()} onSaved={vi.fn()} />);

    // Abre o picker na aba de emojis (padrão)
    fireEvent.click(screen.getByTestId('mf-group-icon'));
    expect(screen.getByTestId('mf-group-icon-picker')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-tab-emoji')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('mf-group-icon-opt-0')).toBeInTheDocument();

    // Aba Bancos: busca vazia, sem resultado e o Nubank
    fireEvent.click(screen.getByTestId('mf-group-tab-banks'));
    expect(screen.getByTestId('mf-group-tab-banks')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByTestId('mf-group-brand-search'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('mf-group-brand-empty')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('mf-group-brand-search'), {
      target: { value: 'nubank' },
    });
    expect(screen.getByTestId('mf-group-brand-opt-nubank')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-group-brand-opt-sicoob')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-group-brand-opt-nubank'));
    // Escolher fecha o picker e o botão passa a exibir a marca
    expect(screen.queryByTestId('mf-group-icon-picker')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-group-name'), { target: { value: 'Nubank' } });
    fireEvent.click(screen.getByTestId('mf-group-save'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(groupInserts(calls)).toHaveLength(1);
    });
    expect(groupInserts(calls)[0].rows[0]).toMatchObject({
      name: 'Nubank',
      icon: 'brand:nubank',
    });
  });

  it('guarda de ciclo: exclui o próprio grupo e os descendentes do seletor de pai', async () => {
    renderWithProviders(
      <MFGroupModal
        group={{
          id: 'grp-nubank',
          user_id: 'test-user',
          parent_id: null,
          name: 'Nubank',
          icon: '🏦',
          show_in_summary: true,
          sum_totals: true,
          sort_order: 0,
        }}
        user={mockUser}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByTestId('mf-group-title')).toHaveTextContent(
      'minhasfinancas.group_edit_title'
    );
    // Contas do próprio grupo já vêm marcadas
    await waitFor(() => {
      expect(screen.getByTestId('mf-group-account-acc-nu')).toBeInTheDocument();
    });
    expect(within(screen.getByTestId('mf-group-account-acc-nu')).getByRole('checkbox')).toBeChecked();

    fireEvent.click(screen.getByTestId('mf-group-parent'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-group-parent-option-grp-outro')).toBeInTheDocument();
    });
    // Nem a si mesmo nem ao filho (ciclo), mas grupos estranhos aparecem
    expect(screen.queryByTestId('mf-group-parent-option-grp-nubank')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-group-parent-option-grp-caixinhas')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-group-parent-option-')).toBeInTheDocument();
  });

  it('editar desmarcando uma conta desvincula só ela (as de outros grupos ficam)', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderWithProviders(
      <MFGroupModal
        group={{
          id: 'grp-nubank',
          user_id: 'test-user',
          parent_id: null,
          name: 'Nubank',
          icon: '🏦',
          show_in_summary: true,
          sum_totals: true,
          sort_order: 0,
        }}
        user={mockUser}
        onClose={onClose}
        onSaved={onSaved}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('mf-group-account-acc-nu')).toBeInTheDocument();
    });
    fireEvent.click(within(screen.getByTestId('mf-group-account-acc-nu')).getByRole('checkbox'));
    fireEvent.click(screen.getByTestId('mf-group-save'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(groupUpdates(calls)).toHaveLength(1);
    });
    expect(groupUpdates(calls)[0]).toMatchObject({
      patch: { name: 'Nubank', icon: '🏦', parent_id: null },
      ids: ['grp-nubank'],
    });

    await waitFor(() => {
      expect(accountUpdates(calls)).toHaveLength(1);
    });
    expect(accountUpdates(calls)[0]).toMatchObject({
      patch: { group_id: null },
      ids: ['acc-nu'],
    });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('MFResumo — widget de grupos e drill-down', () => {
  const renderScreen = () =>
    renderWithProviders(
      <MFResumo user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} />
    );

  const waitForData = () =>
    waitFor(() =>
      expect(screen.getByTestId('mf-kpi-value-kpi_balance')).not.toHaveTextContent('…')
    );

  it('mostra só raízes com "Exibir", navega pai→filho e volta pelo breadcrumb', async () => {
    renderScreen();
    await waitForData();

    const section = screen.getByTestId('mf-groups-section');
    expect(section).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-card-grp-nubank')).toBeInTheDocument();
    // Raiz sem "Exibir na tela de Resumo" fica de fora
    expect(screen.queryByTestId('mf-group-card-grp-outro')).not.toBeInTheDocument();

    // Total consolidado do subgrupo (Nubank 1000 + Caixinhas 500)
    fireEvent.click(screen.getByTestId('mf-group-card-grp-nubank'));

    expect(screen.getByTestId('mf-group-drill')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-groups-section')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-group-crumb-summary')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-crumb-grp-nubank')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Nubank' })).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-drill-total')).toHaveTextContent('R$ 1.500,00');
    // Filho + contas da subárvore: entrar no pai já mostra o conteúdo —
    // a conta do filho aparece com chip do subgrupo
    expect(screen.getByTestId('mf-group-drill-card-grp-caixinhas')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-drill-account-acc-nu')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-drill-account-acc-reserva')).toBeInTheDocument();
    expect(screen.getByTestId('mf-drill-group-chip-acc-reserva')).toHaveTextContent('Caixinhas');
    expect(screen.queryByTestId('mf-drill-group-chip-acc-nu')).not.toBeInTheDocument();

    // Sobe um nível: Caixinhas
    fireEvent.click(screen.getByTestId('mf-group-drill-card-grp-caixinhas'));
    expect(screen.getByRole('heading', { level: 2, name: 'Caixinhas' })).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-crumb-grp-nubank')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-crumb-grp-caixinhas')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-drill-total')).toHaveTextContent('R$ 500,00');
    expect(screen.getByTestId('mf-group-drill-account-acc-reserva')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-group-drill-account-acc-nu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-group-drill-card-grp-caixinhas')).not.toBeInTheDocument();

    // Volta ao painel pelo breadcrumb "Resumo"
    fireEvent.click(screen.getByTestId('mf-group-crumb-summary'));
    expect(screen.getByTestId('mf-groups-section')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-group-drill')).not.toBeInTheDocument();
  });

  it('conta oculta no painel continua no widget/drill de grupos (regressão do "0 contas")', async () => {
    // Usuário ocultou a conta direta do Nubank no "Personalizar painel" —
    // isso afeta KPIs/tabela/gráficos, mas NÃO a árvore de grupos.
    localStorage.setItem(
      MF_DASHBOARD_KEY,
      JSON.stringify({ hiddenAccounts: ['acc-nu'] })
    );
    renderScreen();
    await waitForData();

    // Card da raiz: subárvore completa (1000 + 500), não some com a oculta
    expect(screen.getByTestId('mf-group-card-grp-nubank')).toHaveTextContent('R$ 1.500,00');

    fireEvent.click(screen.getByTestId('mf-group-card-grp-nubank'));
    expect(screen.getByTestId('mf-group-drill-total')).toHaveTextContent('R$ 1.500,00');
    expect(screen.getByTestId('mf-group-drill-account-acc-nu')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-drill-account-acc-reserva')).toBeInTheDocument();
  });

  it('abre o detalhe da conta a partir do drill', async () => {
    renderScreen();
    await waitForData();

    fireEvent.click(screen.getByTestId('mf-group-card-grp-nubank'));
    fireEvent.click(screen.getByTestId('mf-group-drill-account-acc-nu'));

    await waitFor(() => {
      expect(screen.getByTestId('mf-account-detail')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('mf-group-drill')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-acct-det-back'));
    expect(screen.getByTestId('mf-group-drill')).toBeInTheDocument();
  });

  it('botão "Novo grupo" do Resumo abre o modal', async () => {
    renderScreen();
    await waitForData();

    fireEvent.click(screen.getByTestId('mf-groups-new'));
    expect(screen.getByTestId('mf-group-modal')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-title')).toHaveTextContent(
      'minhasfinancas.group_new_title'
    );
  });

  it('drill: cria subgrupo e conta com o grupo atual pré-selecionado', async () => {
    renderScreen();
    await waitForData();

    // Desce para Nubank
    fireEvent.click(screen.getByTestId('mf-group-card-grp-nubank'));
    expect(screen.getByTestId('mf-group-drill')).toBeInTheDocument();

    // --- Novo subgrupo: pai já = Nubank ---
    fireEvent.click(screen.getByTestId('mf-drill-new-subgroup'));
    expect(screen.getByTestId('mf-group-modal')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-parent')).toHaveTextContent('Nubank');
    fireEvent.change(screen.getByTestId('mf-group-name'), { target: { value: 'Cripto' } });
    fireEvent.click(screen.getByTestId('mf-group-save'));

    let calls = await getCalls();
    await waitFor(() => {
      expect(groupInserts(calls)).toHaveLength(1);
    });
    expect(groupInserts(calls)[0].rows[0]).toMatchObject({
      name: 'Cripto',
      parent_id: 'grp-nubank',
    });
    await waitFor(() => {
      expect(screen.queryByTestId('mf-group-modal')).not.toBeInTheDocument();
    });

    // --- Nova conta: grupo já = Nubank ---
    fireEvent.click(screen.getByTestId('mf-drill-new-account'));
    expect(screen.getByTestId('mf-account-name')).toBeInTheDocument();
    expect(screen.getByTestId('mf-account-group')).toHaveTextContent('Nubank');
    fireEvent.change(screen.getByTestId('mf-account-name'), {
      target: { value: 'Ações' },
    });
    fireEvent.click(screen.getByTestId('mf-account-save'));

    calls = await getCalls();
    await waitFor(() => {
      expect(accountInserts(calls)).toHaveLength(1);
    });
    expect(accountInserts(calls)[0].rows[0]).toMatchObject({
      name: 'Ações',
      group_id: 'grp-nubank',
    });
  });
});

describe('MFAccountModal — campo Grupo', () => {
  it('seleciona um grupo existente e grava group_id na conta', async () => {
    renderWithProviders(<MFAccountModal isOpen user={mockUser} onClose={vi.fn()} />);

    expect(screen.getByTestId('mf-account-group')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-account-group'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-account-group-option-grp-nubank')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mf-account-group-option-grp-nubank'));

    fireEvent.change(screen.getByTestId('mf-account-name'), {
      target: { value: 'Carteira' },
    });
    fireEvent.click(screen.getByTestId('mf-account-save'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(accountInserts(calls)).toHaveLength(1);
    });
    expect(accountInserts(calls)[0].rows[0]).toMatchObject({
      name: 'Carteira',
      group_id: 'grp-nubank',
    });
  });

  it('cartão não mostra o campo Grupo e zera group_id na gravação', async () => {
    renderWithProviders(
      <MFAccountModal
        isOpen
        user={mockUser}
        onClose={vi.fn()}
        account={{
          id: 'acc-card-edit',
          name: 'Visa',
          account_type: 'CARTAO',
          currency: 'BRL',
          initial_balance: 0,
          color: '#ef4444',
          sort_order: 0,
          credit_limit: 1000,
          closing_day: 10,
          due_day: 20,
          group_id: 'grp-nubank',
        }}
      />
    );

    expect(screen.queryByTestId('mf-account-group')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-new-group-toggle')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-account-save'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(accountUpdates(calls)).toHaveLength(1);
    });
    expect(accountUpdates(calls)[0].patch).toMatchObject({
      name: 'Visa',
      account_type: 'CARTAO',
      group_id: null,
    });
  });

  it('"Criar grupo de contas" abre o modal e seleciona o grupo criado', async () => {
    renderWithProviders(<MFAccountModal isOpen user={mockUser} onClose={vi.fn()} />);

    fireEvent.click(screen.getByTestId('mf-new-group-toggle'));
    expect(screen.getByTestId('mf-group-modal')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-group-name'), { target: { value: 'Cripto' } });
    fireEvent.click(screen.getByTestId('mf-group-save'));

    const calls = await getCalls();
    await waitFor(() => {
      expect(groupInserts(calls)).toHaveLength(1);
    });
    expect(groupInserts(calls)[0].rows[0]).toMatchObject({ name: 'Cripto' });
    await waitFor(() => {
      expect(screen.queryByTestId('mf-group-modal')).not.toBeInTheDocument();
    });

    // Grupo criado já vem selecionado no formulário da conta
    fireEvent.change(screen.getByTestId('mf-account-name'), {
      target: { value: 'Carteira' },
    });
    fireEvent.click(screen.getByTestId('mf-account-save'));
    await waitFor(() => {
      expect(accountInserts(calls)).toHaveLength(1);
    });
    expect(accountInserts(calls)[0].rows[0]).toMatchObject({
      name: 'Carteira',
      group_id: 'created-0',
    });
  });
});
