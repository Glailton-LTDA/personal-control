import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFResumo from './MFResumo';
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

// Dados vivos compartilhados com o mock do Supabase (mutáveis por teste).
const mockData = vi.hoisted(() => {
  const baseAccounts = () => [
    { id: 'acc-brl', name: 'Conta BRL', account_type: 'CORRENTE', currency: 'BRL', initial_balance: 1000, color: '#6366f1', sort_order: 0 },
    { id: 'acc-usd', name: 'Conta USD', account_type: 'CORRENTE', currency: 'USD', initial_balance: 200, color: '#10b981', sort_order: 1 },
  ];
  const data = { accounts: baseAccounts(), transactions: [], categories: [], groups: [], baseAccounts };
  data.reset = () => {
    data.accounts.splice(0, data.accounts.length, ...baseAccounts());
    data.transactions.length = 0;
    data.categories.length = 0;
    data.groups.length = 0;
  };
  return data;
});

// Mock Supabase: contas/transações/categorias via mockData; demais tabelas vazias.
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
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn((onFulfilled, onRejected) =>
        Promise.resolve(result).then(onFulfilled, onRejected)
      ),
    };
    return chain;
  };

  const byTable = {
    mf_accounts: makeChain({ data: mockData.accounts, error: null }),
    mf_transactions: makeChain({ data: mockData.transactions, error: null }),
    mf_categories: makeChain({ data: mockData.categories, error: null }),
    mf_account_groups: makeChain({ data: mockData.groups, error: null }),
  };
  const empty = makeChain({ data: [], error: null });

  return {
    supabase: {
      from: vi.fn((table) => byTable[table] || empty),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  };
});

const renderScreen = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MFResumo user={{ id: 'test-user' }} monthKey="2026-10" onChangeMonth={() => {}} />
    </QueryClientProvider>
  );
};

/** Espera os dados carregarem (KPI sai do estado '…'). */
const waitForData = () =>
  waitFor(() =>
    expect(screen.getByTestId('mf-kpi-value-kpi_balance')).not.toHaveTextContent('…')
  );

const domOrder = () =>
  [...screen.getByTestId('mf-resumo').querySelectorAll('[data-widget]')].map(
    (el) => el.dataset.widget
  );

const DEFAULT_ORDER = ['kpis', 'groups', 'accounts', 'charts', 'budgets', 'goals'];

describe('MFResumo — compacto no estreito (Fase A)', () => {
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

  it('mostra Inicial/Saldo/Previsto e esconde os gráficos', async () => {
    mockNarrow();
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByTestId('mf-resumo-compact')).toBeInTheDocument();
      });
      expect(screen.getByTestId('mf-resumo-compact-initial')).toBeInTheDocument();
      expect(screen.getByTestId('mf-resumo-compact-balance')).toBeInTheDocument();
      expect(screen.getByTestId('mf-resumo-compact-forecast')).toBeInTheDocument();
      expect(screen.queryByTestId('mf-chart-categories-BRL')).not.toBeInTheDocument();
    } finally {
      restoreViewport();
    }
  });
});

describe('MFResumo — painel personalizável (Fase 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(MF_DASHBOARD_KEY);
    mockData.reset();
  });

  it('esconde um widget e persiste a preferência (sobrevive a remontagem)', async () => {
    const view = renderScreen();
    await waitForData();
    expect(screen.getAllByTestId('mf-resumo-account-row')).toHaveLength(2);

    fireEvent.click(screen.getByTestId('mf-resumo-customize'));
    expect(screen.getByTestId('mf-widget-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-widget-toggle-accounts'));
    expect(screen.queryByTestId('mf-resumo-account-row')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-widget-row-accounts')).toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem(MF_DASHBOARD_KEY));
    expect(saved.hidden).toContain('accounts');

    // Nova montagem (reload) lê do storage — segue oculto
    view.unmount();
    renderScreen();
    await waitForData();
    expect(screen.queryByTestId('mf-resumo-account-row')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-kpi-value-kpi_balance')).toBeInTheDocument();
  });

  it('reordena widgets subindo na lista e persiste a nova ordem', async () => {
    const view = renderScreen();
    await waitForData();
    expect(domOrder()).toEqual(DEFAULT_ORDER);

    fireEvent.click(screen.getByTestId('mf-resumo-customize'));
    fireEvent.click(screen.getByTestId('mf-widget-up-budgets'));
    fireEvent.click(screen.getByTestId('mf-widget-up-budgets'));
    fireEvent.click(screen.getByTestId('mf-widget-up-budgets'));
    fireEvent.click(screen.getByTestId('mf-widget-up-budgets'));

    expect(domOrder()).toEqual(['budgets', 'kpis', 'groups', 'accounts', 'charts', 'goals']);
    // topo da lista: botão "subir" desabilitado
    expect(screen.getByTestId('mf-widget-up-budgets')).toBeDisabled();

    const saved = JSON.parse(localStorage.getItem(MF_DASHBOARD_KEY));
    expect(saved.order[0]).toBe('budgets');

    view.unmount();
    renderScreen();
    await waitForData();
    expect(domOrder()[0]).toBe('budgets');
  });

  it('oculta o widget de orçamento e "Concluir" fecha o painel', async () => {
    renderScreen();
    await waitForData();
    expect(screen.getByTestId('mf-resumo-budget-card')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-resumo-customize'));
    fireEvent.click(screen.getByTestId('mf-widget-toggle-budgets'));
    expect(screen.queryByTestId('mf-resumo-budget-card')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-resumo-customize'));
    expect(screen.queryByTestId('mf-widget-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-resumo-budget-card')).not.toBeInTheDocument();
  });

  it('ordens/ocultações inválidas no storage caem no padrão sem quebrar', async () => {
    localStorage.setItem(
      MF_DASHBOARD_KEY,
      JSON.stringify({ order: ['zona-morta'], hidden: ['zona-morta'] })
    );
    renderScreen();
    await waitForData();

    // ids desconhecidos descartados → widgets padrão todos visíveis
    expect(domOrder()).toEqual(DEFAULT_ORDER);
    expect(screen.getAllByTestId('mf-resumo-account-row')).toHaveLength(2);
  });

  it('"Ignorar nos totais": KPI exclui a conta ignorada', async () => {
    mockData.accounts.push({
      id: 'acc-ign',
      name: 'Caixinha ignorada',
      account_type: 'POUPANCA',
      currency: 'BRL',
      initial_balance: 500,
      color: '#a855f7',
      sort_order: 2,
      ignore_in_totals: true,
    });
    renderScreen();
    await waitForData();

    // Saldo soma só as contáveis (1000 BRL + 200 USD); a ignorada (500) fica fora
    const balance = screen.getByTestId('mf-kpi-value-kpi_balance');
    expect(balance).toHaveTextContent('R$ 1.000,00');
    expect(balance).toHaveTextContent('US$ 200,00');
    expect(balance).not.toHaveTextContent('500,00');
    // ...mas a conta continua listada na tela
    expect(screen.getByText('Caixinha ignorada')).toBeInTheDocument();
  });
});

describe('MFResumo — gráficos do mês', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(MF_DASHBOARD_KEY);
    mockData.reset();
  });

  it('sem movimentações mostra o estado de "sem dados"', async () => {
    renderScreen();
    await waitForData();
    expect(screen.getByTestId('mf-chart-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-chart-categories-BRL')).not.toBeInTheDocument();
  });

  it('com movimentações renderiza pizza por categoria e barras do fluxo', async () => {
    mockData.categories.push(
      { id: 'cat-food', name: 'Alimentação' },
      { id: 'cat-travel', name: 'Viagem' }
    );
    mockData.transactions.push(
      { id: 'tx1', account_id: 'acc-brl', type: 'DESPESA', status: 'PAGO', amount: 100, payment_date: '2026-10-02', category_id: 'cat-food' },
      { id: 'tx2', account_id: 'acc-brl', type: 'RECEITA', status: 'PAGO', amount: 500, payment_date: '2026-10-03', category_id: null },
      // mês anterior, em USD: entra no fluxo, mas não na pizza de outubro
      { id: 'tx3', account_id: 'acc-usd', type: 'DESPESA', status: 'PAGO', amount: 40, payment_date: '2026-09-20', category_id: 'cat-travel' }
    );

    renderScreen();
    await waitForData();

    expect(screen.queryByTestId('mf-chart-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-chart-categories-BRL')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-chart-pie-empty-BRL')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-chart-flow-BRL')).toBeInTheDocument();
    // USD não teve despesa em outubro → pizza vazia com aviso
    expect(screen.getByTestId('mf-chart-pie-empty-USD')).toBeInTheDocument();
    expect(screen.getByTestId('mf-chart-flow-USD')).toBeInTheDocument();
  });
});

describe('MFResumo — drill-down da conta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(MF_DASHBOARD_KEY);
    mockData.reset();
  });

  it('clicar na linha abre o detalhe; "voltar" retorna ao painel', async () => {
    renderScreen();
    await waitForData();

    fireEvent.click(screen.getByTestId('mf-resumo-open-account-acc-brl'));

    expect(await screen.findByTestId('mf-account-detail')).toBeInTheDocument();
    // controles do painel saem enquanto o detalhe está aberto
    expect(screen.queryByTestId('mf-resumo-customize')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-resumo-account-row')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-acct-det-back'));
    expect(screen.queryByTestId('mf-account-detail')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('mf-resumo-account-row')).toHaveLength(2);
    expect(screen.getByTestId('mf-resumo-customize')).toBeInTheDocument();
  });

  it('clicar na própria linha (fora do nome) também abre o detalhe', async () => {
    renderScreen();
    await waitForData();

    fireEvent.click(screen.getAllByTestId('mf-resumo-account-row')[1]);
    expect(await screen.findByTestId('mf-account-detail')).toBeInTheDocument();
  });
});

describe('MFResumo — contas visíveis no painel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(MF_DASHBOARD_KEY);
    mockData.reset();
  });

  it('oculta uma conta: some da tabela mas os KPIs seguem; persiste na remontagem', async () => {
    // despesa em outubro na conta USD: alimenta a pizza/fluxo em USD
    mockData.transactions.push(
      { id: 'tx-usd-oct', account_id: 'acc-usd', type: 'DESPESA', status: 'PAGO', amount: 40, payment_date: '2026-10-05', category_id: null }
    );
    const view = renderScreen();
    await waitForData();
    expect(screen.getAllByTestId('mf-resumo-account-row')).toHaveLength(2);
    // total misto BRL+USD aparece agrupado
    expect(screen.getByTestId('mf-kpi-value-kpi_balance')).toHaveTextContent('US$');

    fireEvent.click(screen.getByTestId('mf-resumo-customize'));
    fireEvent.click(screen.getByTestId('mf-dash-acct-acc-usd'));

    // Filtro é visual: some da tabela do painel…
    expect(screen.getAllByTestId('mf-resumo-account-row')).toHaveLength(1);
    expect(screen.queryByTestId('mf-dash-acct-acc-usd')).toBeInTheDocument(); // continua na lista do seletor
    // …mas o saldo continua sendo a soma de TODAS as contas ativas
    expect(screen.getByTestId('mf-kpi-value-kpi_balance')).toHaveTextContent('US$');
    // …e os gráficos continuam incluindo a conta oculta
    expect(screen.getByTestId('mf-chart-flow-USD')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-chart-pie-empty-USD')).not.toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem(MF_DASHBOARD_KEY));
    expect(saved.hiddenAccounts).toContain('acc-usd');

    view.unmount();
    renderScreen();
    await waitForData();
    expect(screen.getAllByTestId('mf-resumo-account-row')).toHaveLength(1);
  });

  it('"Nenhuma" zera o painel; "Personalizar" reativa; "Todas" restaura', async () => {
    renderScreen();
    await waitForData();

    fireEvent.click(screen.getByTestId('mf-resumo-customize'));
    fireEvent.click(screen.getByTestId('mf-dash-accts-none'));
    expect(screen.queryByTestId('mf-resumo-account-row')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-resumo-customize')); // Concluir
    expect(screen.queryByTestId('mf-widget-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-resumo-no-visible')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-resumo-open-customize'));
    expect(screen.getByTestId('mf-widget-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-dash-accts-all'));
    expect(screen.getAllByTestId('mf-resumo-account-row')).toHaveLength(2);
    expect(screen.queryByTestId('mf-resumo-no-visible')).not.toBeInTheDocument();
  });

  it('busca filtra o seletor quando há muitas contas', async () => {    for (let i = 0; i < 8; i += 1) {
      mockData.accounts.push({
        id: `acc-x${i}`,
        name: `Extra ${i}`,
        account_type: 'CORRENTE',
        currency: 'BRL',
        initial_balance: 0,
        color: '#888888',
        sort_order: 10 + i,
      });
    }
    renderScreen();
    await waitForData();

    fireEvent.click(screen.getByTestId('mf-resumo-customize'));
    expect(screen.getByTestId('mf-dash-accts-search')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-dash-accts-search'), {
      target: { value: 'Conta USD' },
    });
    expect(screen.getByTestId('mf-dash-acct-acc-usd')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-dash-acct-acc-brl')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-dash-accts-search'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByText('common.no_results')).toBeInTheDocument();
  });
});

describe('MFResumo — cartões em seção separada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(MF_DASHBOARD_KEY);
    mockData.reset();
    // Um cartão (CARTAO) com despesa em outubro, além das 2 contas-base.
    mockData.accounts.push({
      id: 'acc-card',
      name: 'C6 Bank Cartão',
      account_type: 'CARTAO',
      currency: 'BRL',
      initial_balance: 0,
      color: '#f59e0b',
      sort_order: 2,
    });
    mockData.categories.push({ id: 'cat-food', name: 'Alimentação' });
    mockData.transactions.push({
      id: 'tx-card',
      account_id: 'acc-card',
      type: 'DESPESA',
      status: 'PAGO',
      amount: 89.9,
      payment_date: '2026-10-02',
      category_id: 'cat-food',
    });
  });

  it('cartão não mistura com as contas: aparece só na seção própria', async () => {
    renderScreen();
    await waitForData();

    const accountsSection = screen.getByTestId('mf-resumo-accounts-section');
    const cardsSection = screen.getByTestId('mf-resumo-cards-section');

    // tabela de contas: apenas as 2 contas; cartão vive na seção de cartões
    expect(within(accountsSection).getAllByTestId('mf-resumo-account-row')).toHaveLength(2);
    expect(within(accountsSection).queryByTestId('mf-resumo-card-row')).not.toBeInTheDocument();
    expect(within(cardsSection).getAllByTestId('mf-resumo-card-row')).toHaveLength(1);
    expect(within(cardsSection).getByTestId('mf-resumo-open-account-acc-card')).toBeInTheDocument();

    // KPI "Total gasto" segue considerando a despesa do cartão
    expect(screen.getByTestId('mf-kpi-value-kpi_spent')).toHaveTextContent('89,90');
  });

  it('clicar no cartão abre o detalhe dele (drill-down)', async () => {
    renderScreen();
    await waitForData();

    fireEvent.click(screen.getByTestId('mf-resumo-open-account-acc-card'));
    expect(await screen.findByTestId('mf-account-detail')).toBeInTheDocument();
  });

  it('esconder o cartão no painel remove a seção mas mantém o valor nos KPIs', async () => {
    renderScreen();
    await waitForData();
    expect(screen.getByTestId('mf-resumo-cards-section')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-resumo-customize'));
    fireEvent.click(screen.getByTestId('mf-dash-acct-acc-card'));

    // filtro é visual: a seção de cartões some…
    expect(screen.queryByTestId('mf-resumo-cards-section')).not.toBeInTheDocument();
    // …mas os KPIs somam todas as contas ativas (ocultas não mudam totais)
    expect(screen.getByTestId('mf-kpi-value-kpi_spent')).toHaveTextContent('89,90');
    // seletor continua oferecendo o cartão para reativar
    expect(screen.queryByTestId('mf-dash-acct-acc-card')).toBeInTheDocument();
  });

  it('sem cartões cadastrados a seção simplesmente não renderiza', async () => {
    mockData.reset(); // remove o cartão do beforeEach
    renderScreen();
    await waitForData();

    expect(screen.queryByTestId('mf-resumo-cards-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mf-resumo-card-row')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('mf-resumo-account-row')).toHaveLength(2);
  });
});

describe('MFResumo — reordenar grupos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(MF_DASHBOARD_KEY);
    mockData.reset();
    mockData.groups.push(
      { id: 'grp-a', name: 'Alimentação', icon: '🍔', parent_id: null, color: null, show_in_summary: true, sum_totals: true, sort_order: 0 },
      { id: 'grp-b', name: 'Banco', icon: '🏦', parent_id: null, color: null, show_in_summary: true, sum_totals: true, sort_order: 0 }
    );
  });

  it('cards ganham ↑/↓ no modo reordenar e a troca persiste o sort_order', async () => {
    renderScreen();
    await waitForData();

    expect(screen.getByTestId('mf-group-card-grp-a')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-card-grp-b')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-group-move-down-grp-a')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-groups-reorder-toggle'));
    expect(screen.getByTestId('mf-group-move-up-grp-a')).toBeDisabled();
    expect(screen.getByTestId('mf-group-move-down-grp-a')).toBeEnabled();

    fireEvent.click(screen.getByTestId('mf-group-move-down-grp-a'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_account_groups');
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalledTimes(2);
    });
    // posições reescritas nas raízes: grp-b → 0, grp-a → 1
    expect(chain.update).toHaveBeenCalledWith({ sort_order: 0 });
    expect(chain.update).toHaveBeenCalledWith({ sort_order: 1 });
    expect(chain.eq).toHaveBeenCalledWith('id', 'grp-b');
    expect(chain.eq).toHaveBeenCalledWith('id', 'grp-a');
  });
});
