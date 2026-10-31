import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFContas from './MFContas';

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
        Promise.resolve(result).then(onFulfilled, onRejected)
      ),
    };
    return chain;
  };

  const accounts = makeChain({
    data: [
      { id: 'acc-1', name: 'Nubank', account_type: 'CORRENTE', initial_balance: 100, color: '#6366f1', sort_order: 0, group_id: 'grp-1' },
      { id: 'acc-2', name: 'Itaú', account_type: 'CORRENTE', initial_balance: 50, color: '#06b6d4', sort_order: 1 },
      {
        id: 'acc-3',
        name: 'Poupança Antiga',
        account_type: 'POUPANCA',
        initial_balance: 0,
        color: '#a855f7',
        sort_order: 2,
        archived_at: '2026-09-01T12:00:00.000Z',
      },
      {
        id: 'acc-card',
        name: 'Visa',
        account_type: 'CARTAO',
        initial_balance: 0,
        color: '#6366f1',
        sort_order: 3,
        credit_limit: 1000,
        closing_day: 10,
        due_day: 20,
        linked_account_id: 'acc-1',
      },
    ],
    error: null,
  });
  const transactions = makeChain({ data: [], error: null });
  const groups = makeChain({
    data: [
      { id: 'grp-1', name: 'Nubank', icon: '🟣', parent_id: null, sort_order: 0, show_in_summary: true },
      { id: 'grp-2', name: 'Caixinhas', icon: '🐷', parent_id: 'grp-1', sort_order: 1, show_in_summary: true },
      { id: 'grp-3', name: 'Vazio', icon: '📂', parent_id: null, sort_order: 2, show_in_summary: true },
    ],
    error: null,
  });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_account_groups') return groups;
        return transactions;
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  };
});

const createTestQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const renderWithProviders = (ui) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
};

const mockUser = { id: 'test-user', email: 'test@example.com' };

const renderScreen = (props = {}) =>
  renderWithProviders(
    <MFContas
      user={mockUser}
      monthKey="2026-10"
      onChangeMonth={() => {}}
      {...props}
    />
  );

/** Finge tela estreita (mobile): matchMedia com matches. */
const mockNarrowViewport = (matches = true) => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
};

const restoreViewport = () => {
  delete window.matchMedia;
};

/** Troca a lista de contas apenas durante um teste. */
const withAccounts = async (accounts) => {
  const { supabase } = await import('../../lib/supabase');
  const realFrom = supabase.from.getMockImplementation();
  const chainFor = (result) => {
    const chain = {
      select: () => chain,
      order: () => chain,
      eq: () => chain,
      gte: () => chain,
      lte: () => chain,
      then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
    };
    return chain;
  };
  supabase.from.mockImplementation((table) =>
    table === 'mf_accounts'
      ? chainFor({ data: accounts, error: null })
      : realFrom(table)
  );
  return () => supabase.from.mockImplementation(realFrom);
};

const captureTabEvents = () => {
  const events = [];
  const handler = (event) => events.push(event.detail.tab);
  window.addEventListener('set-active-tab', handler);
  return {
    events,
    stop: () => window.removeEventListener('set-active-tab', handler),
  };
};

const waitForDetail = async () => {
  await waitFor(() => {
    expect(screen.getByTestId('mf-accounts-detail')).toBeInTheDocument();
  });
};

describe('MFContas — master-detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.setItem('pc_skip_confirmations', 'true');
    localStorage.removeItem('mf_month_key');
    localStorage.removeItem('mf_detail_drill');
  });

  it('abre no primeiro grupo e mostra rail, resumo e contas diretas', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('mf-accounts-detail')).toBeInTheDocument();
    });

    // Rail: Nubank selecionado por padrão; "Sem grupo" com a conta solta.
    expect(screen.getByTestId('mf-group-card-grp-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('mf-group-total-grp-1')).toHaveTextContent('R$ 100,00');
    expect(screen.getByTestId('mf-ungrouped-card')).toBeInTheDocument();
    expect(screen.getByTestId('mf-ungrouped-total')).toHaveTextContent('R$ 50,00');

    // Resumo global inclui as contas da aba (100 + 50).
    expect(screen.getByTestId('mf-contas-kpi-balance')).toHaveTextContent('R$ 150,00');

    // Detalhe do Nubank: só a conta do grupo (a solta não aparece).
    expect(screen.getByTestId('mf-accounts-detail')).toHaveTextContent('Nubank');
    expect(screen.getAllByTestId('mf-account-row')).toHaveLength(1);
    expect(screen.getByText('Nubank', { selector: '.mf-accounts-acc-link' })).toBeInTheDocument();
    expect(screen.queryByText('Itaú', { selector: '.mf-accounts-acc-link' })).not.toBeInTheDocument();
  });

  it('seleciona "Sem grupo", mostra a conta solta e grava a rota do grupo', async () => {
    const tab = captureTabEvents();
    try {
      renderScreen();
      await waitForDetail();

      fireEvent.click(screen.getByTestId('mf-ungrouped-card'));

      await waitFor(() => {
        expect(screen.getAllByTestId('mf-account-row')).toHaveLength(1);
      });
      expect(screen.getByText('Itaú', { selector: '.mf-accounts-acc-link' })).toBeInTheDocument();
      expect(tab.events).toContain('minhasfinancas/accounts/grupo/mf-ungrouped');
      expect(screen.getByTestId('mf-ungrouped-card')).toHaveAttribute('aria-pressed', 'true');
    } finally {
      tab.stop();
    }
  });

  it('respeita o grupo inicial vindo da rota', async () => {
    renderScreen({ initialGroupId: 'grp-2' });

    await waitForDetail();
    expect(screen.getByTestId('mf-accounts-detail')).toHaveTextContent('Caixinhas');
    expect(screen.getByTestId('mf-group-card-grp-1')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('mf-accounts-detail')).toHaveTextContent(
      'minhasfinancas.accounts_no_direct'
    );
  });

  it('restaura o último grupo selecionado ao remontar sem grupo na rota', async () => {
    const first = renderScreen();
    await waitForDetail();

    fireEvent.click(screen.getByTestId('mf-ungrouped-card'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-ungrouped-card')).toHaveAttribute('aria-pressed', 'true');
    });
    expect(sessionStorage.getItem('mf_accounts_last_group.test-user')).toBe('mf-ungrouped');

    // Simula a volta do detalhe da conta: MFContas remonta com a rota
    // `accounts` (sem grupo), como em produção.
    first.unmount();
    renderScreen();
    await waitForDetail();

    expect(screen.getByTestId('mf-ungrouped-card')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('mf-accounts-detail')).toHaveTextContent(
      'minhasfinancas.group_ungrouped'
    );
    expect(screen.getByText('Itaú', { selector: '.mf-accounts-acc-link' })).toBeInTheDocument();
  });

  it('revela o painel de detalhe quando o grupo clicado está fora da viewport', async () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderScreen();
      await waitForDetail();

      // jsdom não calcula layout: o painel é tratado como fora da viewport.
      fireEvent.click(screen.getByTestId('mf-ungrouped-card'));
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
    } finally {
      if (original) Element.prototype.scrollIntoView = original;
      else delete Element.prototype.scrollIntoView;
    }
  });

  it('grupo soma a conta ignorada; o total geral a exclui', async () => {
    const restore = await withAccounts([
      { id: 'acc-1', name: 'Nubank', account_type: 'CORRENTE', initial_balance: 100, color: '#6366f1', sort_order: 0, group_id: 'grp-1', ignore_in_totals: true },
      { id: 'acc-2', name: 'Itaú', account_type: 'CORRENTE', initial_balance: 50, color: '#06b6d4', sort_order: 1 },
    ]);
    try {
      renderScreen();
      await waitForDetail();

      // Grupo: 100 (inclui a ignorada). Resumo geral: 50 (exclui).
      expect(screen.getByTestId('mf-group-total-grp-1')).toHaveTextContent('R$ 100,00');
      expect(screen.getByTestId('mf-contas-kpi-balance')).toHaveTextContent('R$ 50,00');
      expect(screen.getByTestId('mf-contas-foot-saldo')).toHaveTextContent('R$ 100,00');
      expect(screen.getAllByTestId('mf-ignore-dots')).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it('mostra os três KPIs do grupo e a distribuição ao escolher BRL', async () => {
    const restore = await withAccounts([
      { id: 'acc-1', name: 'Nubank', account_type: 'CORRENTE', initial_balance: 100, currency: 'BRL', color: '#6366f1', sort_order: 0, group_id: 'grp-1' },
      { id: 'acc-child', name: 'Caixinha Turbo', account_type: 'Caixinha', initial_balance: 300, currency: 'BRL', color: '#22c55e', sort_order: 1, group_id: 'grp-2' },
      { id: 'acc-2', name: 'Itaú', account_type: 'CORRENTE', initial_balance: 50, currency: 'USD', color: '#06b6d4', sort_order: 2 },
    ]);
    try {
      renderScreen();
      await waitForDetail();

      expect(screen.getByTestId('mf-group-kpi-initial')).toHaveTextContent('R$ 400,00');
      expect(screen.getByTestId('mf-group-kpi-saldo')).toHaveTextContent('R$ 400,00');
      expect(screen.getByTestId('mf-group-kpi-forecast')).toHaveTextContent('R$ 400,00');

      // "Todas as moedas" não distribui (evita somar moedas diferentes).
      expect(screen.queryByTestId('mf-group-distribution')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('mf-contas-currency-tabs-BRL'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-group-distribution')).toBeInTheDocument();
      });
      expect(screen.getByTestId('mf-group-distribution')).toHaveTextContent('Caixinhas');
      expect(screen.getByTestId('mf-group-distribution')).toHaveTextContent('75,0%');
    } finally {
      restore();
    }
  });

  it('renderiza subgrupo com subtotal e abre o grupo pelo chevron', async () => {
    const restore = await withAccounts([
      { id: 'acc-1', name: 'Nubank', account_type: 'CORRENTE', initial_balance: 100, color: '#6366f1', sort_order: 0, group_id: 'grp-1' },
      { id: 'acc-child', name: 'Caixinha Turbo', account_type: 'Caixinha', initial_balance: 300, color: '#22c55e', sort_order: 1, group_id: 'grp-2' },
    ]);
    try {
      renderScreen();
      await waitForDetail();

      expect(screen.getByTestId('mf-subgroup-grp-2')).toBeInTheDocument();
      expect(screen.getByTestId('mf-subgroup-total-grp-2')).toHaveTextContent('R$ 300,00');
      expect(
        screen.getByTestId('mf-subgroup-grp-2').querySelector('tfoot')
      ).toContainElement(screen.getByTestId('mf-subgroup-total-grp-2'));
      expect(
        screen
          .getByTestId('mf-subgroup-grp-2')
          .querySelector('.mf-accounts-subgroup-badge')
      ).toHaveTextContent('minhasfinancas.accounts_subgroup_badge_short');
      expect(screen.getByTestId('mf-group-count-grp-2')).toHaveTextContent(
        'minhasfinancas.accounts_direct_count'
      );
      expect(screen.getByText('Caixinha Turbo')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('mf-open-subgroup-grp-2'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-accounts-detail')).toHaveTextContent('Caixinhas');
      });
      expect(screen.getByTestId('mf-accounts-detail')).toHaveTextContent('minhasfinancas.accounts_subgroup_badge_short');
    } finally {
      restore();
    }
  });

  it('botões da conta têm ações com tooltip e abrem edição sem entrar no detalhe', async () => {
    renderScreen();
    await waitForDetail();

    expect(screen.getByTestId('mf-statement-account-acc-1')).toHaveAttribute('title', 'minhasfinancas.row_open');
    expect(screen.getByTestId('mf-archive-account-acc-1')).toHaveAttribute('title', 'minhasfinancas.archive');
    expect(screen.getByTestId('mf-edit-account-acc-1')).toHaveAttribute('title', 'minhasfinancas.edit');
    expect(screen.getByTestId('mf-delete-account-acc-1')).toHaveAttribute('title', 'minhasfinancas.delete');

    fireEvent.click(screen.getByTestId('mf-edit-account-acc-1'));
    expect(screen.getByTestId('mf-account-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('mf-account-detail')).not.toBeInTheDocument();
  });

  it('mantém a coluna de previsão mesmo quando ela iguala o saldo (ações não escorregam)', async () => {
    renderScreen();
    await waitForDetail();

    const row = screen.getByTestId('mf-account-row');
    const cells = row.querySelectorAll('td');
    expect(cells).toHaveLength(5);
    expect(cells[3]).toHaveAttribute('data-testid', 'mf-account-forecast-acc-1');
    expect(cells[3].style.display).not.toBe('none');
    expect(cells[4]).toHaveClass('mf-accounts-actions-cell');
    expect(cells[4]).toContainElement(screen.getByTestId('mf-edit-account-acc-1'));
    expect(cells[4]).toContainElement(screen.getByTestId('mf-delete-account-acc-1'));
  });

  it('abre o detalhe da conta ao clicar na linha e volta para o grupo', async () => {
    renderScreen();
    await waitForDetail();

    fireEvent.click(screen.getByTestId('mf-account-row'));
    expect(screen.getByTestId('mf-account-detail')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('mf-timeline-empty')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-acct-det-back'));
    await waitFor(() => {
      expect(screen.queryByTestId('mf-account-detail')).not.toBeInTheDocument();
      expect(screen.getByTestId('mf-accounts-detail')).toBeInTheDocument();
    });
  });

  it('edita o grupo e cria subgrupo a partir do detalhe', async () => {
    renderScreen();
    await waitForDetail();

    fireEvent.click(screen.getByTestId('mf-group-edit-grp-1'));
    expect(await screen.findByTestId('mf-group-modal')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-name')).toHaveValue('Nubank');
    fireEvent.click(screen.getByTestId('mf-group-close'));

    fireEvent.click(screen.getByTestId('mf-new-subgroup'));
    expect(await screen.findByTestId('mf-group-modal')).toBeInTheDocument();
    expect(screen.getByTestId('mf-group-title')).toHaveTextContent(
      'minhasfinancas.group_new_title'
    );
  });

  it('abre o modal de nova conta e o pedido do FAB', async () => {
    renderScreen();
    await waitForDetail();

    fireEvent.click(screen.getByTestId('mf-new-account'));
    expect(screen.getByTestId('mf-account-modal')).toBeInTheDocument();
    expect(screen.getByTestId('mf-account-currency')).toHaveTextContent('BRL');
    fireEvent.click(screen.getByTestId('mf-account-modal'));

    fireEvent(window, new CustomEvent('mf-new-account'));
    expect(screen.getByTestId('mf-account-modal')).toBeInTheDocument();
  });

  it('arquiva e exclui contas', async () => {
    renderScreen();
    await waitForDetail();

    fireEvent.click(screen.getByTestId('mf-archive-account-acc-1'));
    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_accounts');
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalled();
    });
    expect(chain.update.mock.calls[0][0]).toHaveProperty('archived_at');

    vi.clearAllMocks();
    fireEvent.click(screen.getByTestId('mf-delete-account-acc-1'));
    await waitFor(() => {
      expect(chain.delete).toHaveBeenCalled();
    });
  });

  it('alterna arquivadas e não lista cartões', async () => {
    const restore = await withAccounts([
      { id: 'acc-1', name: 'Nubank', account_type: 'CORRENTE', initial_balance: 100, color: '#6366f1', sort_order: 0, group_id: 'grp-1' },
      { id: 'acc-3', name: 'Poupança Antiga', account_type: 'POUPANCA', initial_balance: 0, color: '#a855f7', sort_order: 2, group_id: 'grp-1', archived_at: '2026-09-01T12:00:00.000Z' },
      { id: 'acc-card', name: 'Visa', account_type: 'CARTAO', initial_balance: 0, color: '#6366f1', sort_order: 3 },
    ]);
    try {
      renderScreen();
      await waitForDetail();

      expect(screen.queryByText('Poupança Antiga')).not.toBeInTheDocument();
      expect(screen.queryByText('Visa')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('mf-show-archived'));
      await waitFor(() => {
        expect(screen.getByText('Poupança Antiga')).toBeInTheDocument();
      });
      expect(screen.getByTestId('mf-account-archived-badge')).toBeInTheDocument();
      expect(screen.queryByText('Visa')).not.toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('reordena grupos e contas', async () => {
    const restore = await withAccounts([
      { id: 'acc-1', name: 'Nubank', account_type: 'CORRENTE', initial_balance: 100, color: '#6366f1', sort_order: 0, group_id: 'grp-1' },
      { id: 'acc-3b', name: 'Conta Vazia', account_type: 'CORRENTE', initial_balance: 10, color: '#f59e0b', sort_order: 1, group_id: 'grp-3' },
    ]);
    try {
      renderScreen();
      await waitForDetail();

      fireEvent.click(screen.getByTestId('mf-reorder-toggle'));
      expect(screen.getByTestId('mf-group-move-up-grp-1')).toBeDisabled();
      expect(screen.getByTestId('mf-group-move-down-grp-1')).toBeEnabled();

      fireEvent.click(screen.getByTestId('mf-group-move-down-grp-1'));
      const { supabase } = await import('../../lib/supabase');
      const chain = supabase.from('mf_account_groups');
      await waitFor(() => {
        expect(chain.update).toHaveBeenCalledTimes(2);
      });
      expect(chain.eq).toHaveBeenCalledWith('id', 'grp-1');
      expect(chain.eq).toHaveBeenCalledWith('id', 'grp-3');
    } finally {
      restore();
    }
  });

  it('alterna para a visão linear com todas as contas', async () => {
    renderScreen();
    await waitForDetail();

    fireEvent.click(screen.getByTestId('mf-linear-toggle'));
    await waitFor(() => {
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(2);
    });
    expect(screen.getByTestId('mf-group-toggle')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('mf-group-card-grp-1')).not.toBeInTheDocument();
    expect(screen.getByText('Itaú', { selector: '.mf-accounts-acc-link' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-group-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-group-card-grp-1')).toBeInTheDocument();
    });
  });

  it('mobile: lista → detalhe → voltar; sem sanfona', async () => {
    mockNarrowViewport();
    const tab = captureTabEvents();
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByTestId('mf-contas-cards')).toBeInTheDocument();
      });
      expect(screen.getByTestId('mf-contas-narrow-summary')).toBeInTheDocument();
      expect(screen.queryByTestId('mf-account-row')).not.toBeInTheDocument();
      expect(screen.getByTestId('mf-group-card-grp-1')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('mf-group-card-grp-1'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-accounts-detail')).toBeInTheDocument();
      });
      expect(screen.getAllByTestId('mf-account-row')).toHaveLength(1);
      expect(tab.events).toContain('minhasfinancas/accounts/grupo/grp-1');

      fireEvent.click(screen.getByTestId('mf-group-back'));
      await waitFor(() => {
        expect(screen.getByTestId('mf-contas-cards')).toBeInTheDocument();
      });
    } finally {
      tab.stop();
      restoreViewport();
    }
  });

  it('mobile: filtro por tipo e detalhe da conta', async () => {
    mockNarrowViewport();
    const restore = await withAccounts([
      { id: 'acc-1', name: 'Nubank', account_type: 'CORRENTE', initial_balance: 100, color: '#6366f1', sort_order: 0, group_id: 'grp-1' },
      { id: 'acc-4', name: 'Cofrinho', account_type: 'POUPANCA', initial_balance: 20, color: '#22c55e', sort_order: 1, group_id: 'grp-1' },
    ]);
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByTestId('mf-contas-cards')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mf-narrow-type-POUPANCA'));
      fireEvent.click(screen.getByTestId('mf-group-card-grp-1'));
      await waitFor(() => {
        expect(screen.getAllByTestId('mf-account-row')).toHaveLength(1);
      });
      expect(screen.getByText('Cofrinho')).toBeInTheDocument();
      expect(screen.queryByText('Nubank', { selector: '.mf-accounts-acc-link' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('mf-account-row'));
      expect(screen.getByTestId('mf-account-detail')).toBeInTheDocument();
    } finally {
      restore();
      restoreViewport();
    }
  });

  it('mostra estado vazio quando não há contas', async () => {
    const restore = await withAccounts([]);
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByTestId('mf-contas-empty')).toBeInTheDocument();
      });
    } finally {
      restore();
    }
  });
});
