import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFOrcamentos from './MFOrcamentos';

// Mock react-i18next (t devolve a chave com interpolação aplicada em {{pct}})
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
    data: [{ id: 'acc-1', name: 'Nubank', currency: 'BRL', initial_balance: 100, color: '#6366f1' }],
    error: null,
  });
  const categories = makeChain({
    data: [
      { id: 'cat-food', name: 'Alimentação', type: 'DESPESA', parent_id: null, color: '#f59e0b' },
      { id: 'cat-market', name: 'Supermercado', type: 'DESPESA', parent_id: 'cat-food', color: '#10b981' },
    ],
    error: null,
  });
  const tags = makeChain({ data: [{ id: 'tag-trip', name: 'Viagem', color: '#06b6d4' }], error: null });
  const budgets = makeChain({
    data: [
      {
        id: 'bd-1',
        name: 'Alimentação do mês',
        category_id: 'cat-food',
        tag_id: null,
        account_id: null,
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        mode: 'FIXED',
        amount: 800,
        percent_of_income: null,
      },
      {
        id: 'bd-2',
        name: 'Tudo',
        category_id: null,
        tag_id: null,
        account_id: null,
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        mode: 'PERCENT',
        amount: null,
        percent_of_income: 10,
      },
    ],
    error: null,
  });
  const transactions = makeChain({
    data: [
      // filho da categoria do orçamento: conta no escopo
      { id: 'tx-1', account_id: 'acc-1', type: 'DESPESA', amount: 500, payment_date: '2026-10-05', status: 'PAGO', category_id: 'cat-market' },
      // pendente também conta (comprometido)
      { id: 'tx-2', account_id: 'acc-1', type: 'DESPESA', amount: 400, payment_date: '2026-10-12', status: 'PENDENTE', category_id: 'cat-market' },
      // sem categoria: só entra no escopo global
      { id: 'tx-3', account_id: 'acc-1', type: 'DESPESA', amount: 300, payment_date: '2026-10-03', status: 'PAGO', category_id: null },
      // cancelado: nunca conta
      { id: 'tx-4', account_id: 'acc-1', type: 'DESPESA', amount: 100, payment_date: '2026-10-08', status: 'CANCELADO', category_id: 'cat-food' },
      // receita: base do modo %
      { id: 'tx-5', account_id: 'acc-1', type: 'RECEITA', amount: 5000, payment_date: '2026-10-01', status: 'PAGO', category_id: null },
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
        if (table === 'mf_budgets') return budgets;
        if (table === 'mf_transaction_tags') return transactionTags;
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

const renderScreen = (monthKey = '2026-10') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MFOrcamentos
        user={{ id: 'test-user' }}
        monthKey={monthKey}
        onChangeMonth={() => {}}
      />
    </QueryClientProvider>
  );
};

describe('MFOrcamentos — Orçamentos (Fase 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
  });

  afterEach(() => {
    localStorage.removeItem('pc_skip_confirmations');
  });

  it('aceite: orçamento de R$ 800 com gasto de R$ 900 → alerta de estouro', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-budget-card')).toHaveLength(2);
    });

    // Card 1: escopo categoria (conta filhos, ignora cancelado e sem categoria)
    const spentEls = screen.getAllByTestId('mf-budget-spent');
    const limitEls = screen.getAllByTestId('mf-budget-limit');
    const pctEls = screen.getAllByTestId('mf-budget-pct');
    expect(spentEls[0]).toHaveTextContent('R$ 900,00');
    expect(limitEls[0]).toHaveTextContent('R$ 800,00');
    expect(pctEls[0]).toHaveTextContent('minhasfinancas.bdg_pct:113');

    // Alerta visível com os itens estourados (ambos os cards)
    expect(screen.getByTestId('mf-budget-alert')).toBeInTheDocument();
    expect(screen.getAllByTestId('mf-budget-alert-item')).toHaveLength(2);

    // Resumo
    expect(screen.getByTestId('mf-budget-total-spent')).toHaveTextContent('R$ 2.100,00');
  });

  it('modo % da receita calcula o limite (10% de R$ 5.000 = R$ 500)', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByTestId('mf-budget-card')).toHaveLength(2);
    });

    // Card 2: global, gasta tudo que é despesa não cancelada
    const limits = screen.getAllByTestId('mf-budget-limit');
    expect(limits[1]).toHaveTextContent('R$ 500,00');
    const spent = screen.getAllByTestId('mf-budget-spent');
    expect(spent[1]).toHaveTextContent('R$ 1.200,00');
  });

  it('cria orçamento pelo modal com período do mês selecionado', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-new-budget')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-new-budget'));
    expect(screen.getByTestId('mf-bdg-modal')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-bdg-name'), { target: { value: 'Transporte' } });
    fireEvent.click(screen.getByTestId('mf-bdg-scope-kind'));
    fireEvent.click(screen.getByTestId('mf-bdg-scope-kind-option-categoria'));
    fireEvent.click(screen.getByTestId('mf-bdg-scope-id'));
    fireEvent.click(screen.getByTestId('mf-bdg-scope-id-option-cat-food'));
    fireEvent.change(screen.getByTestId('mf-bdg-amount'), { target: { value: '250,00' } });
    fireEvent.click(screen.getByTestId('mf-bdg-save'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_budgets').insert).toHaveBeenCalled();
    });
    expect(supabase.from('mf_budgets').insert.mock.calls[0][0]).toMatchObject({
      user_id: 'test-user',
      name: 'Transporte',
      category_id: 'cat-food',
      tag_id: null,
      account_id: null,
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      mode: 'FIXED',
      amount: 250,
      percent_of_income: null,
    });
  });

  it('valida período e percentual inválidos', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-new-budget')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-new-budget'));
    const { supabase } = await import('../../lib/supabase');
    const budgets = supabase.from('mf_budgets');

    // Período invertido
    fireEvent.change(screen.getByTestId('mf-bdg-name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByTestId('mf-bdg-start'), { target: { value: '2026-10-31' } });
    fireEvent.change(screen.getByTestId('mf-bdg-end'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByTestId('mf-bdg-save'));
    expect(budgets.insert).not.toHaveBeenCalled();

    // Período ok mas percentual > 100
    fireEvent.change(screen.getByTestId('mf-bdg-end'), { target: { value: '2026-10-31' } });
    fireEvent.click(screen.getByTestId('mf-bdg-mode'));
    fireEvent.click(screen.getByTestId('mf-bdg-mode-option-PERCENT'));
    fireEvent.change(screen.getByTestId('mf-bdg-percent'), { target: { value: '150' } });
    fireEvent.click(screen.getByTestId('mf-bdg-save'));
    expect(budgets.insert).not.toHaveBeenCalled();
  });

  it('exclui orçamento com confirmação automática', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('mf-bdg-del-bd-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mf-bdg-del-bd-1'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_budgets').delete).toHaveBeenCalled();
    });
    expect(supabase.from('mf_budgets').eq).toHaveBeenCalledWith('id', 'bd-1');
  });

  it('fora do período do orçamento mostra estado vazio', async () => {
    renderScreen('2026-09');
    await waitFor(() => {
      expect(screen.getByTestId('mf-budgets-empty')).toBeInTheDocument();
    });
    expect(screen.queryAllByTestId('mf-budget-card')).toHaveLength(0);
  });
});
