import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFObjetivos from './MFObjetivos';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, params) =>
      params && params.pct != null ? `${key}:${params.pct}` : key,
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
      { id: 'acc-1', name: 'Nubank', currency: 'BRL', initial_balance: 1000, color: '#6366f1' },
    ],
    error: null,
  });
  const goals = makeChain({
    data: [
      {
        id: 'g1',
        name: 'Reserva de emergência',
        target_amount: 5000,
        initial_amount: 1000,
        target_date: '2027-06-30',
        account_id: null,
        color: '#6366f1',
        icon: '🎯',
        status: 'ACTIVE',
      },
      {
        id: 'g2',
        name: 'Viagem',
        target_amount: 3000,
        initial_amount: 0,
        target_date: null,
        account_id: 'acc-1',
        color: '#06b6d4',
        icon: '✈️',
        status: 'ACTIVE',
      },
      {
        id: 'g3',
        name: 'Notebook novo',
        target_amount: 1000,
        initial_amount: 0,
        target_date: null,
        account_id: null,
        color: '#10b981',
        icon: '💻',
        status: 'COMPLETED',
      },
    ],
    error: null,
  });
  const contributions = makeChain({
    data: [
      { id: 'c1', goal_id: 'g1', kind: 'DEPOSIT', amount: 1500, contribution_date: '2026-10-01', notes: null },
      { id: 'c3', goal_id: 'g3', kind: 'DEPOSIT', amount: 1000, contribution_date: '2026-09-01', notes: null },
    ],
    error: null,
  });
  const transactions = makeChain({ data: [], error: null });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_accounts') return accounts;
        if (table === 'mf_goals') return goals;
        if (table === 'mf_goal_contributions') return contributions;
        return transactions;
      }),
      storage: { from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: null }) })) },
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
  };
});

const renderScreen = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MFObjetivos user={{ id: 'test-user' }} />
    </QueryClientProvider>
  );
};

describe('MFObjetivos — Objetivos (Fase 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
  });

  afterEach(() => {
    localStorage.removeItem('pc_skip_confirmations');
  });

  it('calcula progresso manual (inicial + aportes) e automático (conta)', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-goal-card')).toHaveLength(3);
    });

    const currents = screen.getAllByTestId('mf-goal-current');
    const targets = screen.getAllByTestId('mf-goal-target');
    const pcts = screen.getAllByTestId('mf-goal-pct');

    // g1: 1000 inicial + 1500 aporte = 2500 / 5000 = 50%
    expect(currents[0]).toHaveTextContent('R$ 2.500,00');
    expect(targets[0]).toHaveTextContent('R$ 5.000,00');
    expect(pcts[0]).toHaveTextContent('minhasfinancas.bdg_pct:50');

    // g2: vinculado à conta → saldo R$ 1.000 (automático)
    expect(currents[1]).toHaveTextContent('R$ 1.000,00');
    // e não tem botões de aporte
    expect(screen.queryByTestId('mf-goal-deposit-g2')).not.toBeInTheDocument();
    expect(screen.getByText(/minhasfinancas.gl_linked_hint/)).toBeInTheDocument();

    // g3: atingida → badge
    expect(screen.getByTestId('mf-goal-badge-completed')).toBeInTheDocument();
  });

  it('registra um aporte pelo modal de movimento', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-goal-deposit-g1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-goal-deposit-g1'));
    expect(screen.getByTestId('mf-goal-contrib')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-contrib-amount'), { target: { value: '500,00' } });
    fireEvent.click(screen.getByTestId('mf-contrib-save'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_goal_contributions').insert).toHaveBeenCalled();
    });
    expect(supabase.from('mf_goal_contributions').insert.mock.calls[0][0]).toMatchObject({
      user_id: 'test-user',
      goal_id: 'g1',
      kind: 'DEPOSIT',
      amount: 500,
    });
  });

  it('cria objetivo com meta e valida valor', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-new-goal')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-new-goal'));
    expect(screen.getByTestId('mf-goal-modal')).toBeInTheDocument();

    // Meta zerada → bloqueia
    fireEvent.change(screen.getByTestId('mf-goal-name'), { target: { value: 'Viagem 2027' } });
    fireEvent.click(screen.getByTestId('mf-goal-save'));
    const { supabase } = await import('../../lib/supabase');
    expect(supabase.from('mf_goals').insert).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('mf-goal-target-input'), { target: { value: '8.000,00' } });
    fireEvent.click(screen.getByTestId('mf-goal-save'));
    await waitFor(() => {
      expect(supabase.from('mf_goals').insert).toHaveBeenCalled();
    });
    expect(supabase.from('mf_goals').insert.mock.calls[0][0]).toMatchObject({
      user_id: 'test-user',
      name: 'Viagem 2027',
      target_amount: 8000,
    });
  });

  it('exclui movimento com confirmação automática', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-contrib-del-c1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-contrib-del-c1'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_goal_contributions').delete).toHaveBeenCalled();
    });
    expect(supabase.from('mf_goal_contributions').eq).toHaveBeenCalledWith('id', 'c1');
  });
});
