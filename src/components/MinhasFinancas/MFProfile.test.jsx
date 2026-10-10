import React from 'react';
import { render, screen, waitFor, fireEvent, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MinhasFinancas from './MinhasFinancas';
import MFTransacoes from './MFTransacoes';
import MFConfig from './MFConfig';
import { MFProfileContext } from '../../hooks/mfProfileContext';
import { useMFBudgets, useMFGoals } from '../../hooks/useMinhasFinancas';
import toast from 'react-hot-toast';

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

// Mock Supabase com estado compartilhado (perfis/contas/orçamentos/objetivos)
vi.mock('../../lib/supabase', () => {
  const makeChain = (resultFn) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: vi.fn((onFulfilled, onRejected) =>
        Promise.resolve(resultFn()).then(onFulfilled, onRejected)
      ),
    };
    chain.insert = vi.fn((rows) =>
      makeChain(() => ({
        data: (Array.isArray(rows) ? rows : [rows]).map((row, index) => ({
          id: `created-${index}`,
          ...row,
        })),
        error: null,
      }))
    );
    return chain;
  };

  const state = {
    profiles: [],
    accounts: [
      { id: 'acc-1', name: 'Nubank', account_type: 'CORRENTE', currency: 'BRL', initial_balance: 100, color: '#6366f1', sort_order: 0, profile_id: 'p1' },
      { id: 'acc-2', name: 'Itaú', account_type: 'CORRENTE', currency: 'BRL', initial_balance: 50, color: '#06b6d4', sort_order: 1, profile_id: 'p2' },
    ],
    budgets: [],
    goals: [],
  };

  const chains = {
    profiles: makeChain(() => ({ data: state.profiles, error: null })),
    accounts: makeChain(() => ({ data: state.accounts, error: null })),
    budgets: makeChain(() => ({ data: state.budgets, error: null })),
    goals: makeChain(() => ({ data: state.goals, error: null })),
    empty: makeChain(() => ({ data: [], error: null })),
  };

  const tableMap = {
    mf_profiles: chains.profiles,
    mf_accounts: chains.accounts,
    mf_budgets: chains.budgets,
    mf_goals: chains.goals,
  };

  return {
    supabase: {
      from: vi.fn((table) => tableMap[table] ?? chains.empty),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    __mfState: state,
    __mfChains: chains,
  };
});

const mockUser = { id: 'test-user', email: 'test@example.com' };

const withProviders = (ui, profileId = null) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MFProfileContext.Provider value={profileId}>{ui}</MFProfileContext.Provider>
    </QueryClientProvider>
  );
};

describe('Perfis separados (Fase 9)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
    localStorage.removeItem('mf_active_profile');
    const { __mfState } = await import('../../lib/supabase');
    __mfState.profiles = [];
    __mfState.budgets = [];
    __mfState.goals = [];
  });

  /* ── Trocador no container ─────────────────────────────── */

  it('sem perfis cadastrados não mostra o trocador', async () => {
    withProviders(<MinhasFinancas user={mockUser} refreshKey={0} mode="resumo" />);
    await screen.findByTestId('mf-resumo');
    await waitFor(() =>
      expect(screen.getByTestId('mf-kpi-value-kpi_balance')).not.toHaveTextContent('…')
    );
    expect(screen.queryByTestId('mf-profile-switch')).not.toBeInTheDocument();
  });

  it('com perfis: trocador lista perfis e grava o ativo em localStorage', async () => {
    const { __mfState } = await import('../../lib/supabase');
    __mfState.profiles = [
      { id: 'p1', name: 'Pessoal', color: '#6366f1', sort_order: 0 },
      { id: 'p2', name: 'Empresa', color: '#10b981', sort_order: 1 },
    ];

    withProviders(<MinhasFinancas user={mockUser} refreshKey={0} mode="resumo" />);

    const select = await screen.findByTestId('mf-profile-switch');
    fireEvent.click(select);
    expect(screen.getByTestId('mf-profile-switch-option-')).toBeInTheDocument();
    expect(screen.getByTestId('mf-profile-switch-option-p1')).toBeInTheDocument();
    expect(screen.getByTestId('mf-profile-switch-option-p2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-profile-switch-option-p1'));
    expect(localStorage.getItem('mf_active_profile')).toBe('p1');

    // com perfil ativo, as contas são filtradas por perfil no servidor
    const { __mfChains } = await import('../../lib/supabase');
    await waitFor(() =>
      expect(__mfChains.accounts.eq).toHaveBeenCalledWith('profile_id', 'p1')
    );
  });

  /* ── Escopo nos hooks ──────────────────────────────────── */

  it('com perfil ativo: lançamentos filtram por contas do perfil (.in)', async () => {
    withProviders(
      <MFTransacoes user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} showValues />,
      'p1'
    );
    await screen.findByTestId('mf-transacoes');

    const { __mfChains } = await import('../../lib/supabase');
    // helper busca os ids das contas do perfil...
    await waitFor(() =>
      expect(__mfChains.accounts.eq).toHaveBeenCalledWith('profile_id', 'p1')
    );
    // ...e o filtro de lançamentos usa esses ids
    await waitFor(() =>
      expect(__mfChains.empty.in).toHaveBeenCalledWith('account_id', ['acc-1', 'acc-2'])
    );
  });

  it('sem perfil (contexto padrão): nenhuma query ganha filtro de perfil', async () => {
    withProviders(
      <MFTransacoes user={mockUser} monthKey="2026-10" onChangeMonth={() => {}} showValues />
    );
    await screen.findByTestId('mf-transacoes');
    await waitFor(() =>
      expect(screen.getByTestId('mf-txs-empty')).toBeInTheDocument()
    );

    const { __mfChains } = await import('../../lib/supabase');
    expect(__mfChains.accounts.eq).not.toHaveBeenCalledWith('profile_id', expect.anything());
    expect(__mfChains.empty.in).not.toHaveBeenCalledWith('account_id', expect.anything());
  });

  it('useMFBudgets filtra por conta do perfil e mantém globais (sem conta)', async () => {
    const { __mfState } = await import('../../lib/supabase');
    __mfState.budgets = [
      { id: 'b1', name: 'Perfil', account_id: 'acc-1' },
      { id: 'b2', name: 'De fora', account_id: 'acc-99' },
      { id: 'b3', name: 'Global', account_id: null },
    ];

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <MFProfileContext.Provider value="p1">{children}</MFProfileContext.Provider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useMFBudgets(mockUser), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.map((budget) => budget.id)).toEqual(['b1', 'b3']);
  });

  it('useMFGoals filtra por conta do perfil e mantém avulsos (sem conta)', async () => {
    const { __mfState } = await import('../../lib/supabase');
    __mfState.goals = [
      { id: 'g1', name: 'Viagem', account_id: 'acc-1' },
      { id: 'g2', name: 'De fora', account_id: 'acc-99' },
      { id: 'g3', name: 'Avulso', account_id: null },
    ];

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <MFProfileContext.Provider value="p1">{children}</MFProfileContext.Provider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useMFGoals(mockUser), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.map((goal) => goal.id)).toEqual(['g1', 'g3']);
  });

  /* ── CRUD em Ajustes ───────────────────────────────────── */

  it('cria perfil validando nome vazio', async () => {
    withProviders(<MFConfig user={mockUser} />);
    await screen.findByTestId('mf-profile-empty');

    // nome vazio bloqueia
    fireEvent.click(screen.getByTestId('mf-profile-save'));
    expect(toast.error).toHaveBeenCalledWith(
      'minhasfinancas.cfg_name_required'
    );
    const { __mfChains } = await import('../../lib/supabase');
    expect(__mfChains.profiles.insert).not.toHaveBeenCalled();

    // cria
    fireEvent.change(screen.getByTestId('mf-profile-name'), {
      target: { value: 'Pessoal' },
    });
    fireEvent.click(screen.getByTestId('mf-profile-save'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'minhasfinancas.cfg_saved'
      )
    );
    expect(__mfChains.profiles.insert).toHaveBeenCalledWith({
      user_id: 'test-user',
      name: 'Pessoal',
      color: '#6366f1',
      sort_order: 0,
    });
  });

  it('bloqueia nome de perfil duplicado (case-insensitive)', async () => {
    const { __mfState, __mfChains } = await import('../../lib/supabase');
    __mfState.profiles = [
      { id: 'p9', name: 'Pessoal', color: '#6366f1', sort_order: 0 },
    ];

    withProviders(<MFConfig user={mockUser} />);
    await screen.findByTestId('mf-profile-row');

    fireEvent.change(screen.getByTestId('mf-profile-name'), {
      target: { value: 'pessoal' },
    });
    fireEvent.click(screen.getByTestId('mf-profile-save'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'minhasfinancas.cfg_duplicate_profile'
      )
    );
    expect(__mfChains.profiles.insert).not.toHaveBeenCalled();
  });

  it('edita e exclui perfil com confirmação', async () => {
    const { __mfState, __mfChains } = await import('../../lib/supabase');
    __mfState.profiles = [
      { id: 'p1', name: 'Pessoal', color: '#6366f1', sort_order: 0 },
    ];

    withProviders(<MFConfig user={mockUser} />);
    await screen.findByTestId('mf-profile-row');

    // editar
    fireEvent.click(screen.getByTestId('mf-profile-edit-p1'));
    expect(screen.getByTestId('mf-profile-name')).toHaveValue('Pessoal');
    fireEvent.change(screen.getByTestId('mf-profile-name'), {
      target: { value: 'Casa' },
    });
    fireEvent.click(screen.getByTestId('mf-profile-save'));
    await waitFor(() => expect(__mfChains.profiles.update).toHaveBeenCalled());
    expect(__mfChains.profiles.update.mock.calls[0][0]).toMatchObject({ name: 'Casa' });

    // excluir (confirmação automática)
    fireEvent.click(screen.getByTestId('mf-profile-del-p1'));
    await waitFor(() => expect(__mfChains.profiles.delete).toHaveBeenCalled());
    expect(__mfChains.profiles.eq).toHaveBeenCalledWith('id', 'p1');
  });
});
