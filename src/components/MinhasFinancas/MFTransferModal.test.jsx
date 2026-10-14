import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFTransferModal from './MFTransferModal';
import { addMonthsISO, toISODate } from '../../hooks/useMinhasFinancas';

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
  const ok = makeChain({ data: [], error: null });
  return {
    supabase: {
      from: vi.fn(() => ok),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
  };
});

const mockUser = { id: 'test-user', email: 'test@example.com' };
const accounts = [
  { id: 'acc-1', name: 'Nubank', currency: 'BRL', color: '#6366f1' },
  { id: 'acc-2', name: 'Itaú', currency: 'BRL', color: '#06b6d4' },
];

const renderModal = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MFTransferModal isOpen accounts={accounts} user={mockUser} onClose={() => {}} />
    </QueryClientProvider>
  );
};

const fillAmount = (value) => {
  fireEvent.change(screen.getByTestId('mf-transfer-amount'), { target: { value } });
};

describe('MFTransferModal — transferência recorrente (Fase D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('avulsa continua igual (sem parcelas)', async () => {
    renderModal();
    fillAmount('300,00');
    fireEvent.click(screen.getByTestId('mf-transfer-confirm'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert).toHaveBeenCalledTimes(1);
    });
    const payload = chain.insert.mock.calls[0][0];
    expect(payload).toMatchObject({
      account_id: 'acc-1',
      transfer_account_id: 'acc-2',
      type: 'TRANSFERENCIA',
      amount: 300,
      status: 'PAGO',
    });
    expect(payload).not.toHaveProperty('installments_total');
    expect(payload).not.toHaveProperty('parent_transaction_id');
  });

  it('mensal cria cabeça 1/3 + filhas pendentes vinculadas', async () => {
    renderModal();
    fillAmount('300,00');

    fireEvent.click(screen.getByTestId('mf-transfer-repeat-open'));
    expect(screen.getByTestId('mf-repeat-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-repeat-quantity-inc'));
    expect(screen.getByTestId('mf-repeat-quantity')).toHaveTextContent('3');
    fireEvent.click(screen.getByTestId('mf-repeat-confirm'));
    expect(screen.getByTestId('mf-transfer-repeat-summary')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-transfer-confirm'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    const today = toISODate(new Date());
    const head = chain.insert.mock.calls[0][0];
    expect(head).toHaveLength(1);
    expect(head[0]).toMatchObject({
      type: 'TRANSFERENCIA',
      amount: 300,
      status: 'PAGO',
      payment_date: today,
      installments_current: 1,
      installments_total: 3,
    });

    const children = chain.insert.mock.calls[1][0];
    expect(children).toHaveLength(2);
    expect(children[0]).toMatchObject({
      amount: 300,
      status: 'PENDENTE',
      payment_date: addMonthsISO(today, 1),
      installments_current: 2,
      installments_total: 3,
      parent_transaction_id: 'created-0',
    });
    expect(children[1]).toMatchObject({
      installments_current: 3,
      payment_date: addMonthsISO(today, 2),
      parent_transaction_id: 'created-0',
    });
  });

  it('fixa mensal cria cabeça + 11 filhas mensais vinculadas', async () => {
    renderModal();
    fillAmount('200,00');

    fireEvent.click(screen.getByTestId('mf-transfer-repeat-fixed'));
    expect(screen.getByTestId('mf-transfer-repeat-fixed')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('mf-transfer-fixed-hint')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-transfer-confirm'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    const today = toISODate(new Date());
    const head = chain.insert.mock.calls[0][0];
    expect(head).toHaveLength(1);
    expect(head[0]).toMatchObject({
      type: 'TRANSFERENCIA',
      amount: 200,
      status: 'PAGO',
      payment_date: today,
      recurrence: 'MONTHLY',
      is_fixed: true,
    });

    const children = chain.insert.mock.calls[1][0];
    expect(children).toHaveLength(11);
    expect(children[0]).toMatchObject({
      amount: 200,
      status: 'PENDENTE',
      payment_date: addMonthsISO(today, 1),
      recurrence: 'MONTHLY',
      is_fixed: true,
      parent_transaction_id: 'created-0',
    });
    expect(children[10]).toMatchObject({
      payment_date: addMonthsISO(today, 11),
      parent_transaction_id: 'created-0',
    });
  });

  it('semanal repete com recurrence e sem numeração', async () => {
    renderModal();
    fillAmount('100,00');

    fireEvent.click(screen.getByTestId('mf-transfer-repeat-open'));
    fireEvent.click(screen.getByTestId('mf-repeat-periodicity'));
    fireEvent.click(screen.getByTestId('mf-repeat-periodicity-option-WEEKLY'));
    expect(screen.getByTestId('mf-repeat-periodicity')).toHaveTextContent(
      'minhasfinancas.tx_recurrence_weekly'
    );
    fireEvent.click(screen.getByTestId('mf-repeat-confirm'));
    expect(screen.getByTestId('mf-transfer-repeat-summary')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-transfer-confirm'));

    const { supabase } = await import('../../lib/supabase');
    const chain = supabase.from('mf_transactions');
    await waitFor(() => {
      expect(chain.insert.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    const head = chain.insert.mock.calls[0][0];
    expect(head[0]).toMatchObject({ recurrence: 'WEEKLY' });
    expect(head[0]).not.toHaveProperty('installments_total');
    const children = chain.insert.mock.calls[1][0];
    expect(children[0]).toMatchObject({
      recurrence: 'WEEKLY',
      status: 'PENDENTE',
      parent_transaction_id: 'created-0',
    });
  });

  it('calculadora ao lado do valor abre e preenche o campo', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('mf-transfer-amount-calc'));
    expect(screen.getByTestId('mf-transfer-calc')).toBeInTheDocument();

    // 25 + 50 = 75 (operações + vírgula + ✓)
    fireEvent.click(screen.getByTestId('mf-calc-clear'));
    fireEvent.click(screen.getByTestId('mf-calc-2'));
    fireEvent.click(screen.getByTestId('mf-calc-5'));
    fireEvent.click(screen.getByTestId('mf-calc-op-add'));
    fireEvent.click(screen.getByTestId('mf-calc-5'));
    fireEvent.click(screen.getByTestId('mf-calc-0'));
    fireEvent.click(screen.getByTestId('mf-calc-confirm'));

    expect(screen.queryByTestId('mf-transfer-calc')).not.toBeInTheDocument();
    expect(screen.getByTestId('mf-transfer-amount')).toHaveValue('75,00');
  });
});
