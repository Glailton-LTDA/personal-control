import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import MFConfig from './MFConfig';

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

// Mock Supabase — insert devolve o payload ecoado com id gerado
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
      not: vi.fn().mockReturnThis(),
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

  const categories = makeChain({
    data: [
      { id: 'cat-1', name: 'Alimentação', type: 'DESPESA', parent_id: null, color: '#f59e0b' },
      { id: 'cat-2', name: 'Supermercado', type: 'DESPESA', parent_id: 'cat-1', color: '#10b981' },
      { id: 'cat-3', name: 'Receitas', type: 'RECEITA', parent_id: null, color: '#10b981' },
    ],
    error: null,
  });
  const tags = makeChain({
    data: [{ id: 'tag-1', name: 'Viagem', color: '#06b6d4' }],
    error: null,
  });
  const responsibles = makeChain({
    data: [{ id: 'resp-1', name: 'João', email: 'joao@x.com', color: '#6366f1', is_main: true }],
    error: null,
  });
  const accountTypes = makeChain({
    data: [{ id: 'type-1', name: 'Corretora', icon: '📈' }],
    error: null,
  });

  // Pontos de restauração (Fase 9): lista mutável acessível nos testes
  // + chains do snapshot para asserções de save/restore.
  const shared = { points: [] };
  const restorePoints = makeChain(() => ({ data: shared.points, error: null }));
  const empty = makeChain({ data: [], error: null });

  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'mf_tags') return tags;
        if (table === 'mf_responsibles') return responsibles;
        if (table === 'mf_categories') return categories;
        if (table === 'mf_restore_points') return restorePoints;
        if (table === 'mf_account_types') return accountTypes;
        // tabelas do snapshot (restore): vazias por padrão
        return empty;
      }),
      storage: { from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: null }) })) },
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
    __mfState: shared,
    __mfChains: { restorePoints, empty, accountTypes },
  };
});

const renderWithProviders = (ui) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

const mockUser = { id: 'test-user', email: 'test@example.com' };

const renderConfig = () => renderWithProviders(<MFConfig user={mockUser} />);

describe('MFConfig — Ajustes (categorias, tags, responsáveis)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
    const { __mfState } = await import('../../lib/supabase');
    __mfState.points = [];
  });

  afterEach(() => {
    localStorage.removeItem('pc_skip_confirmations');
  });

  it('renderiza as seções com listas e o card de categorias com o total', async () => {
    renderConfig();

    await waitFor(() => {
      expect(screen.getByTestId('mf-cfg-section-tags')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mf-cfg-section-responsibles')).toBeInTheDocument();

    // Card de navegação com a contagem (3 categorias no mock)…
    const openCategories = screen.getByTestId('mf-cfg-open-categories');
    expect(openCategories).toHaveTextContent('minhasfinancas.cfg_manage_categories');
    await waitFor(() => expect(openCategories).toHaveTextContent('3'));
    // …e nenhuma linha de categoria inline (saiu para a tela própria)
    expect(screen.queryByTestId('mf-cfg-cat-row')).not.toBeInTheDocument();

    // Tag e responsável principal
    expect(screen.getByText(/Viagem/)).toBeInTheDocument();
    expect(screen.getByText(/João/)).toBeInTheDocument();
    expect(screen.getAllByText('minhasfinancas.cfg_main').length).toBeGreaterThanOrEqual(1);
  });

  it('abre a tela de gerenciar categorias e volta pelo cabeçalho', async () => {
    renderConfig();
    await waitFor(() => {
      expect(screen.getByTestId('mf-cfg-open-categories')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-cfg-open-categories'));
    await waitFor(() => {
      expect(screen.getByTestId('mf-cat-screen')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('mf-cat-row-cat-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-cat-back'));
    expect(screen.queryByTestId('mf-cat-screen')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-config')).toBeInTheDocument();
  });

  it('cria tag e bloqueia duplicidade', async () => {
    renderConfig();
    await waitFor(() => {
      expect(screen.getByTestId('mf-cfg-tag-save')).toBeInTheDocument();
    });
    const { supabase } = await import('../../lib/supabase');
    const tags = supabase.from('mf_tags');

    // Duplicada
    fireEvent.change(screen.getByTestId('mf-cfg-tag-name'), { target: { value: 'viagem' } });
    fireEvent.click(screen.getByTestId('mf-cfg-tag-save'));
    expect(tags.insert).not.toHaveBeenCalled();

    // Nova
    fireEvent.change(screen.getByTestId('mf-cfg-tag-name'), { target: { value: 'Trabalho' } });
    fireEvent.click(screen.getByTestId('mf-cfg-tag-save'));
    await waitFor(() => {
      expect(tags.insert).toHaveBeenCalled();
    });
    expect(tags.insert.mock.calls[0][0]).toMatchObject({
      user_id: 'test-user',
      name: 'Trabalho',
    });
  });

  it('cria responsável com perfil principal', async () => {
    renderConfig();
    await waitFor(() => {
      expect(screen.getByTestId('mf-cfg-resp-save')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('mf-cfg-resp-name'), { target: { value: 'Maria' } });
    fireEvent.change(screen.getByTestId('mf-cfg-resp-email'), {
      target: { value: 'maria@x.com' },
    });
    fireEvent.click(screen.getByTestId('mf-cfg-resp-main'));
    fireEvent.click(screen.getByTestId('mf-cfg-resp-save'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_responsibles').insert).toHaveBeenCalled();
    });
    expect(supabase.from('mf_responsibles').insert.mock.calls[0][0]).toMatchObject({
      name: 'Maria',
      email: 'maria@x.com',
      is_main: true,
    });
  });

  it('exclui tag com confirmação automática', async () => {
    renderConfig();
    await waitFor(() => {
      expect(screen.getByTestId('mf-cfg-tag-del-tag-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-cfg-tag-del-tag-1'));

    const { supabase } = await import('../../lib/supabase');
    const tags = supabase.from('mf_tags');
    await waitFor(() => {
      expect(tags.delete).toHaveBeenCalled();
    });
    expect(tags.eq).toHaveBeenCalledWith('id', 'tag-1');
  });

  /* ── Pontos de restauração (Fase 9) ────────────────────── */

  it('mostra a seção vazia e salva um ponto com o snapshot das tabelas', async () => {
    renderConfig();
    await screen.findByTestId('mf-rp-empty');

    // nome vazio bloqueia
    fireEvent.click(screen.getByTestId('mf-rp-save'));
    expect(toast.error).toHaveBeenCalledWith('minhasfinancas.cfg_name_required');

    fireEvent.change(screen.getByTestId('mf-rp-label'), {
      target: { value: 'Antes da viagem' },
    });
    fireEvent.click(screen.getByTestId('mf-rp-save'));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('minhasfinancas.rp_saved')
    );
    const { __mfChains } = await import('../../lib/supabase');
    expect(__mfChains.restorePoints.insert).toHaveBeenCalledTimes(1);
    const arg = __mfChains.restorePoints.insert.mock.calls[0][0];
    expect(arg.label).toBe('Antes da viagem');
    // payload com as tabelas do snapshot (pais → filhos)
    expect(Object.keys(arg.payload)).toContain('mf_accounts');
    expect(Object.keys(arg.payload)).toContain('mf_transactions');
    expect(Object.keys(arg.payload)).toContain('mf_goal_contributions');
    expect(arg.payload).not.toHaveProperty('mf_restore_points');
    expect(screen.getByTestId('mf-rp-label')).toHaveValue('');
  });

  it('seção de tipos: lista, cria e remove um tipo personalizado', async () => {
    renderConfig();
    await screen.findByTestId('mf-cfg-section-types');

    // Lista o tipo do mock (o X de gestão migrou do modal para cá)
    await waitFor(() => {
      expect(screen.getByTestId('mf-cfg-type-row')).toHaveTextContent('Corretora');
    });

    const { supabase } = await import('../../lib/supabase');
    const typesChain = supabase.from('mf_account_types');

    // Nome vazio valida
    fireEvent.click(screen.getByTestId('mf-cfg-type-save'));
    expect(toast.error).toHaveBeenCalledWith('minhasfinancas.type_name_required');

    // Escolhe o ícone na grade e cria
    fireEvent.click(screen.getByTestId('mf-cfg-type-icon'));
    expect(screen.getByTestId('mf-cfg-type-icon-picker')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-cfg-type-icon-opt-0'));
    expect(screen.queryByTestId('mf-cfg-type-icon-picker')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-cfg-type-name'), { target: { value: 'Cripto' } });
    fireEvent.click(screen.getByTestId('mf-cfg-type-save'));

    await waitFor(() => {
      expect(typesChain.insert).toHaveBeenCalled();
    });
    expect(typesChain.insert.mock.calls[0][0]).toEqual({
      user_id: 'test-user',
      name: 'Cripto',
      icon: '🏦',
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('minhasfinancas.type_saved');
    });
    expect(screen.getByTestId('mf-cfg-type-name')).toHaveValue('');

    // Remove com confirmação automática
    fireEvent.click(screen.getByTestId('mf-cfg-type-del-type-1'));
    await waitFor(() => {
      expect(typesChain.delete).toHaveBeenCalled();
    });
    expect(typesChain.eq).toHaveBeenCalledWith('id', 'type-1');
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('minhasfinancas.type_deleted');
    });
  });

  it('restaura um ponto: apaga filhos→pais e reinsere o snapshot', async () => {
    const { __mfState, __mfChains } = await import('../../lib/supabase');
    __mfState.points = [
      {
        id: 'pt-1',
        label: 'Antes da viagem',
        created_at: '2026-10-01T12:00:00Z',
        payload: { mf_accounts: [{ id: 'a1', name: 'Conta', user_id: 'test-user' }] },
      },
    ];
    renderConfig();
    await screen.findByTestId('mf-rp-point');
    expect(screen.getByText('Antes da viagem')).toBeInTheDocument();

    // Só as chamadas do fluxo de restore: a seção de tipos consulta
    // mf_account_types no load (antes do clique), o que embaralharia a ordem
    const { supabase } = await import('../../lib/supabase');
    const baseline = supabase.from.mock.calls.length;
    fireEvent.click(screen.getByTestId('mf-rp-restore-pt-1'));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('minhasfinancas.rp_restored')
    );

    const calls = supabase.from.mock.calls.slice(baseline).map((entry) => entry[0]);
    // deletes na ordem filhos → pais (FK)
    expect(calls.indexOf('mf_transaction_tags')).toBeGreaterThan(-1);
    expect(calls.indexOf('mf_transaction_tags')).toBeLessThan(
      calls.indexOf('mf_account_types')
    );
    expect(calls.indexOf('mf_transactions')).toBeLessThan(calls.indexOf('mf_accounts'));
    expect(calls.indexOf('mf_budgets')).toBeLessThan(calls.indexOf('mf_accounts'));
    // snapshot reinserido DEPOIS de toda a limpeza
    expect(calls.lastIndexOf('mf_accounts')).toBeGreaterThan(
      calls.indexOf('mf_saved_reports')
    );
    // os próprios pontos de restauração não são apagados
    expect(__mfChains.restorePoints.delete).not.toHaveBeenCalled();
  });

  it('exclui um ponto com confirmação automática', async () => {
    const { __mfState, __mfChains } = await import('../../lib/supabase');
    __mfState.points = [
      { id: 'pt-2', label: 'Backup antigo', created_at: '2026-09-01T10:00:00Z', payload: {} },
    ];
    renderConfig();
    await screen.findByTestId('mf-rp-point');

    fireEvent.click(screen.getByTestId('mf-rp-del-pt-2'));

    await waitFor(() =>
      expect(__mfChains.restorePoints.delete).toHaveBeenCalled()
    );
    expect(__mfChains.restorePoints.eq).toHaveBeenCalledWith('id', 'pt-2');
    expect(toast.success).toHaveBeenCalledWith('minhasfinancas.cfg_deleted');
  });
});
