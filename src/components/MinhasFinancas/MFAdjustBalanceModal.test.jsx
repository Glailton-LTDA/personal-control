import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFAdjustBalanceModal from './MFAdjustBalanceModal';

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

// Mock Supabase: insert/update encadeáveis resolvendo ok; categorias mutáveis.
let categoriesRows = [];
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
  const ok = makeChain({ data: { id: 'new-1' }, error: null });
  const cats = makeChain(() => ({ data: { id: 'cat-new' }, error: null }));
  return {
    supabase: {
      from: vi.fn((table) => (table === 'mf_categories' ? cats : ok)),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
  };
});

const mockUser = { id: 'test-user', email: 'test@example.com' };
const account = {
  id: 'acc-1',
  name: 'Nubank',
  account_type: 'CORRENTE',
  currency: 'BRL',
  initial_balance: 1000,
};

/** Intl formata "R$ 10,00" com NBSP (char 160); normaliza para comparar. */
const norm = (el) => el.textContent.split(String.fromCharCode(160)).join(' ');

const renderModal = (overrides = {}) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // cache semeado: categorias disponíveis na 1ª renderização (sem corrida)
  queryClient.setQueryData(['mf-categories', 'test-user'], categoriesRows);
  const props = {
    account,
    user: mockUser,
    current: 8990,
    payDate: '2026-10-09',
    allowInitial: true,
    onClose: vi.fn(),
    onOpenTransfer: null,
    ...overrides,
  };
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MFAdjustBalanceModal {...props} />
    </QueryClientProvider>
  );
  return { ...view, props };
};

describe('MFAdjustBalanceModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    categoriesRows = [];
  });

  /** Payload do lançamento (insert recebe array) e das categorias (objeto). */
  const insertsOf = (chain) => chain.insert.mock.calls.map((call) => call[0]);
  const txPayloadOf = (chain) =>
    insertsOf(chain).find((payload) => Array.isArray(payload))[0];
  const catPayloadsOf = (chain) => insertsOf(chain).filter((payload) => !Array.isArray(payload));

  it('mostra o saldo atual e recalcula a diferença ao digitar', () => {
    renderModal();
    expect(norm(screen.getByTestId('mf-adjust-current'))).toBe('R$ 8.990,00');
    expect(screen.getByTestId('mf-adjust-date')).toHaveTextContent('09/10/2026');
    // alvo = atual → diferença zerada e Salvar desabilitado (auto)
    expect(norm(screen.getByTestId('mf-adjust-diff'))).toBe('R$ 0,00');
    expect(screen.getByTestId('mf-adjust-save')).toBeDisabled();

    fireEvent.change(screen.getByTestId('mf-adjust-target'), { target: { value: '900000' } });
    expect(screen.getByTestId('mf-adjust-target')).toHaveValue('9000,00');
    expect(norm(screen.getByTestId('mf-adjust-diff'))).toBe('R$ 10,00');
    expect(screen.getByTestId('mf-adjust-save')).toBeEnabled();
  });

  it('aplica o efeito no cache na hora (otimista, antes do refetch)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['mf-categories', 'test-user'], []);
    queryClient.setQueryData(['mf-month-summary', 'test-user', '2026-10', 'all'], {
      rows: [
        {
          id: 'acc-1',
          currency: 'BRL',
          initial_balance: 1000,
          receitas: 0,
          despesas: 0,
          saldo: 8990,
          previsto: 8990,
        },
      ],
      chartTxs: [],
    });
    queryClient.setQueryData(['mf-lancamentos', 'test-user', '2026-10', 'all'], {
      transactions: [],
      tagIdsByTx: {},
    });
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <MFAdjustBalanceModal
          account={account}
          user={mockUser}
          current={8990}
          payDate="2026-10-09"
          allowInitial
          onClose={onClose}
        />
      </QueryClientProvider>
    );

    fireEvent.change(screen.getByTestId('mf-adjust-target'), { target: { value: '900000' } });
    fireEvent.click(screen.getByTestId('mf-adjust-save'));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    // saldo/receitas reagem na hora, sem esperar o refetch global
    const summary = queryClient.getQueryData(['mf-month-summary', 'test-user', '2026-10', 'all']);
    expect(summary.rows[0].saldo).toBe(9000);
    expect(summary.rows[0].receitas).toBe(10);
    const lanc = queryClient.getQueryData(['mf-lancamentos', 'test-user', '2026-10', 'all']);
    expect(lanc.transactions).toHaveLength(1);
  });

  it('auto cria RECEITA PAGA quando o alvo é maior', async () => {
    const { props } = renderModal();
    fireEvent.change(screen.getByTestId('mf-adjust-target'), { target: { value: '900000' } });
    fireEvent.click(screen.getByTestId('mf-adjust-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert).toHaveBeenCalled();
    });
    expect(txPayloadOf(chain)).toMatchObject({
      user_id: 'test-user',
      account_id: 'acc-1',
      type: 'RECEITA',
      amount: 10,
      status: 'PAGO',
      payment_date: '2026-10-09',
      description: 'minhasfinancas.adjust_tx_income',
      category_id: 'cat-new',
    });
    // sem "Outros → Ajuste": cria o pai e a filha antes do lançamento
    const cats = supabase.from('mf_categories');
    expect(catPayloadsOf(cats)).toEqual([
      expect.objectContaining({ name: 'Outros', type: 'AMBAS', parent_id: null }),
      expect.objectContaining({ name: 'Ajuste', type: 'AMBAS', parent_id: 'cat-new' }),
    ]);
    const toast = (await import('react-hot-toast')).default;
    expect(toast.success).toHaveBeenCalledWith('minhasfinancas.tx_saved');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('auto cria DESPESA quando o alvo é menor', async () => {
    renderModal();
    fireEvent.change(screen.getByTestId('mf-adjust-target'), { target: { value: '800000' } });
    fireEvent.click(screen.getByTestId('mf-adjust-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert).toHaveBeenCalled();
    });
    expect(txPayloadOf(chain)).toMatchObject({
      type: 'DESPESA',
      amount: 990,
      status: 'PAGO',
      description: 'minhasfinancas.adjust_tx_expense',
    });
  });

  it('initial soma a diferença no saldo inicial', async () => {
    const { props } = renderModal();
    fireEvent.change(screen.getByTestId('mf-adjust-target'), { target: { value: '900000' } });
    fireEvent.click(screen.getByTestId('mf-adjust-opt-initial'));
    fireEvent.click(screen.getByTestId('mf-adjust-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_accounts');
    await waitFor(() => {
      expect(chain.update).toHaveBeenCalledWith({ initial_balance: 1010 });
    });
    const toast = (await import('react-hot-toast')).default;
    expect(toast.success).toHaveBeenCalledWith('minhasfinancas.account_updated');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('manual abre o formulário (com o diff) e transferência abre a tela', async () => {
    const onManual = vi.fn();
    const onTransfer = vi.fn();
    const { props } = renderModal({ onManual, onTransfer });

    fireEvent.change(screen.getByTestId('mf-adjust-target'), { target: { value: '900000' } });
    fireEvent.click(screen.getByTestId('mf-adjust-opt-manual'));
    fireEvent.click(screen.getByTestId('mf-adjust-save'));
    expect(onManual).toHaveBeenCalledWith(10);
    expect(onTransfer).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('mf-adjust-opt-transfer'));
    fireEvent.click(screen.getByTestId('mf-adjust-save'));
    expect(onTransfer).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(2);

    const { supabase } = await import('../../lib/supabase');
    expect(supabase.from('mf_transactions').insert).not.toHaveBeenCalled();
    expect(supabase.from('mf_accounts').update).not.toHaveBeenCalled();
  });

  it('reutiliza a subcategoria Ajuste quando já existe', async () => {
    categoriesRows = [
      { id: 'cat-outros', name: 'Outros', parent_id: null },
      { id: 'cat-ajuste', name: 'Ajuste', parent_id: 'cat-outros' },
    ];
    renderModal();
    fireEvent.change(screen.getByTestId('mf-adjust-target'), { target: { value: '900000' } });
    fireEvent.click(screen.getByTestId('mf-adjust-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert).toHaveBeenCalled();
    });
    // só o lançamento — nenhuma categoria criada
    expect(chain.insert).toHaveBeenCalledTimes(1);
    expect(txPayloadOf(chain)).toMatchObject({ category_id: 'cat-ajuste' });
  });

  it('fatura esconde saldo inicial e cria DESPESA com sinal na data da fatura', async () => {
    renderModal({
      current: 350,
      payDate: '2026-10-20',
      invoiceLabel: 'Venc. 20/10/26',
      allowInitial: false,
    });

    expect(screen.queryByTestId('mf-adjust-opt-initial')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mf-adjust-target'), { target: { value: '40000' } });
    fireEvent.click(screen.getByTestId('mf-adjust-save'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert).toHaveBeenCalled();
    });
    expect(txPayloadOf(chain)).toMatchObject({
      account_id: 'acc-1',
      type: 'DESPESA',
      amount: 50,
      status: 'PAGO',
      payment_date: '2026-10-20',
      description: 'minhasfinancas.adjust_tx_expense',
    });
  });
});
