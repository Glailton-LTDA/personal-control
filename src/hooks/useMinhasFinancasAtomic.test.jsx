import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: (...args) => rpc(...args) },
}));

vi.mock('../lib/offline/mfOffline', () => ({
  mfSelect: vi.fn(),
  mfSelectAll: vi.fn(),
  // Online: a mutation executa o `run` (a RPC).
  mfMutate: vi.fn(async (args) => args.run()),
  isOffline: () => false,
}));

import { usePayCardInvoice, useSaveMFTransactionWithGoal } from './useMinhasFinancas';

const wrapper = ({ children }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

describe('escritas transacionais do Minhas Finanças', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: { transaction_id: 'op-1' }, error: null });
  });

  it('a receita com aporte vai numa RPC só (idempotente pelo id da operação)', async () => {
    const { result } = renderHook(() => useSaveMFTransactionWithGoal(), { wrapper });

    await result.current.mutateAsync({
      operationId: 'op-1',
      payload: { id: 'op-1', type: 'RECEITA', amount: 1000 },
      contribution: { goal_id: 'g1', kind: 'DEPOSIT', amount: 1000 },
    });

    expect(rpc).toHaveBeenCalledWith('mf_save_tx_with_goal', {
      p_operation_id: 'op-1',
      p_tx: { id: 'op-1', type: 'RECEITA', amount: 1000 },
      p_goal_contribution: { goal_id: 'g1', kind: 'DEPOSIT', amount: 1000 },
      p_delete_contribution: false,
    });
  });

  it('o pagamento de fatura manda pagamento, extras e saldo numa RPC só', async () => {
    const { result } = renderHook(() => usePayCardInvoice(), { wrapper });

    await result.current.mutateAsync({
      card: { id: 'card-1', linked_account_id: 'acc-1' },
      invoice: { closeISO: '2026-10-10', openAmount: 800, pendingBound: 0 },
      payload: {
        account_id: 'acc-1',
        type: 'DESPESA',
        amount: 800,
        notes: 'Pagamento de fatura',
      },
      extraRows: [{ id: 'e1', account_id: 'card-1', type: 'DESPESA', amount: -800 }],
    });

    expect(rpc).toHaveBeenCalledWith('mf_pay_card_invoice', {
      p_card_id: 'card-1',
      p_account_id: 'acc-1',
      p_invoice_close: '2026-10-10',
      // O pagamento do usuário não leva o marcador do agendador.
      p_payment: {
        account_id: 'acc-1',
        type: 'DESPESA',
        amount: 800,
        notes: null,
      },
      p_extras: [{ id: 'e1', account_id: 'card-1', type: 'DESPESA', amount: -800 }],
      p_replace_all: false,
      p_open_amount: 800,
    });
  });

  it('fatura totalmente financiada (sem entrada) substitui a fila pendente', async () => {
    const { result } = renderHook(() => usePayCardInvoice(), { wrapper });

    await result.current.mutateAsync({
      card: { id: 'card-1', linked_account_id: 'acc-1' },
      invoice: { closeISO: '2026-10-10', openAmount: 800, pendingBound: 0 },
      payload: null,
      extraRows: [{ id: 'e1', account_id: 'card-1', type: 'DESPESA', amount: -800 }],
    });

    expect(rpc).toHaveBeenCalledWith(
      'mf_pay_card_invoice',
      expect.objectContaining({ p_payment: null, p_replace_all: true })
    );
  });

  it('erro da RPC propaga para a tela (não deixa a operação pela metade)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'mf_pay_card_amount' } });
    const { result } = renderHook(() => usePayCardInvoice(), { wrapper });

    await expect(
      result.current.mutateAsync({
        card: { id: 'card-1', linked_account_id: 'acc-1' },
        invoice: { closeISO: '2026-10-10', openAmount: 800, pendingBound: 0 },
        payload: { account_id: 'acc-1', type: 'DESPESA', amount: 5000 },
      })
    ).rejects.toThrow(/mf_pay_card_amount/);

    await waitFor(() => {
      expect(rpc).toHaveBeenCalled();
    });
  });
});
