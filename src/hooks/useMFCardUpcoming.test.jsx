import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Supabase/ Dexie não interessam: o alvo é o ESCOPO da query. O mock do
// mfSelectAll aplica o `local.filter` (como o branch offline faz) — no
// ambiente online o PostgREST aplica o `.or()` no servidor, e o mock de
// supabase dos testes de componente ignora filtros (por isso a regressão
// do escopo só pega aqui).
vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));
vi.mock('../lib/offline/mfOffline', () => ({
  mfSelect: vi.fn(),
  mfSelectAll: vi.fn(),
  mfMutate: vi.fn(),
  isOffline: vi.fn(() => false),
}));

import { mfSelectAll } from '../lib/offline/mfOffline';
import { useMFCardUpcoming } from './useMinhasFinancas';

/**
 * Cenário Nubank (o pedido do usuário): cartão fecha dia 30, vence dia 7 —
 * a fatura corrente do mês 2026-10 fecha 2026-09-30. A compra é SEM
 * invoice_close na conta do cartão; o PAGAMENTO é DESPESA na CONTA
 * VINCULADA com invoice_close = fechamento (como cria o modal "Pagar
 * fatura"). Tudo fixo em out/2026 e o mês passado como parâmetro →
 * determinístico em qualquer calendário.
 */
const CARD = {
  id: 'card-nu',
  name: 'Nubank',
  account_type: 'CARTAO',
  currency: 'BRL',
  linked_account_id: 'acc-nu',
  closing_day: 30,
  due_day: 7,
};
const purchase = {
  id: 'tx-buy',
  account_id: 'card-nu',
  type: 'DESPESA',
  status: 'PAGO',
  amount: 100,
  payment_date: '2026-10-05',
  invoice_close: null,
};
const payment = {
  id: 'tx-pay',
  account_id: 'acc-nu', // conta vinculada — fora do escopo "só cartões"
  type: 'DESPESA',
  status: 'PAGO',
  amount: 100,
  payment_date: '2026-10-06',
  invoice_close: '2026-09-30', // fechamento da fatura corrente
};

let rows = [];
let scopeFilters = [];

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  scopeFilters = [];
  mfSelectAll.mockImplementation(async (table, buildQuery, local = {}) => {
    // O hook de cartões consulta o recorte em três pedaços (compras no
    // cartão, transferências para ele e os pagamentos-espelho na conta
    // vinculada) — o escopo efetivo é a união dos filtros.
    if (typeof local.filter === 'function') scopeFilters.push(local.filter);
    let out = [...rows];
    // Simula o servidor: `filter` = transform da lista (o mesmo contrato
    // do mfSelectAll real, que aplica `local.filter(rows)`) e `sort` =
    // transform das linhas (byDateDesc devolve (rows) => ordenadas —
    // passar como comparador de .sort() estoura "rows is not iterable"
    // quando há 2+ linhas).
    if (typeof local.filter === 'function') out = local.filter(out);
    if (typeof local.sort === 'function') out = local.sort(out);
    return { data: out, error: null };
  });
});

const renderUpcoming = (cards = [CARD]) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useMFCardUpcoming({ id: 'u1' }, cards, '2026-10'), {
    wrapper,
  });
};

describe('useMFCardUpcoming — escopo enxuto com conta vinculada', () => {
  it('o filtro de escopo enxerga a conta vinculada (pagamento) e não vaza contas alheias', async () => {
    rows = [purchase, payment];
    const { result } = renderUpcoming();

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    // Escopo efetivo = união dos recortes (cartão, transferências para
    // ele e pagamentos-espelho na conta vinculada).
    const inScope = (row) => scopeFilters.some((filter) => filter([row]).length > 0);
    // Pagamento é DESPESA na conta vinculada (transfer_account_id nulo):
    // sem ela no recorte o Resumo nunca via o pagamento.
    expect(
      inScope({ id: 'tx-pay', account_id: 'acc-nu', invoice_close: '2026-09-30' })
    ).toBe(true);
    expect(inScope({ id: 'tx-buy', account_id: 'card-nu' })).toBe(true);
    // Escopo segue enxuto: conta sem relação com cartão fica de fora.
    expect(inScope({ id: 'x', account_id: 'acc-outro' })).toBe(false);
  });

  it('fatura quitada na conta vinculada zera e vira PAGA (check verde do Resumo)', async () => {
    rows = [purchase, payment];
    const { result } = renderUpcoming();

    await waitFor(() =>
      expect(result.current.items[0]?.current?.status).toBe('PAGA')
    );
    const current = result.current.items[0].current;
    expect(current.closeISO).toBe('2026-09-30');
    expect(current.total).toBe(100);
    expect(current.openAmount).toBe(0);
    // nada em aberto → rodapé "À pagar" fica zerado
    expect(result.current.openTotalByCurrency).toEqual({});
  });

  it('sem o pagamento visível a fatura fica em aberto (o cadeado antigo)', async () => {
    rows = [purchase]; // pagamento fora do escopo = pré-correção
    const { result } = renderUpcoming();

    // espera o dado chegar (status "CORRENTE" também é o estado de carga)
    await waitFor(() =>
      expect(result.current.items[0]?.current?.total).toBe(100)
    );
    const current = result.current.items[0].current;
    // ciclo fechado com saldo → "CORRENTE" (ícone fechado âmbar), não PAGA
    expect(current.status).toBe('CORRENTE');
    expect(current.openAmount).toBe(100);
    expect(result.current.openTotalByCurrency).toEqual({ BRL: 100 });
  });

  it('agendamento PENDENTE não zera "a pagar" (fatura só zera com PAGO)', async () => {
    rows = [purchase, { ...payment, id: 'tx-sched', status: 'PENDENTE' }];
    const { result } = renderUpcoming();

    await waitFor(() =>
      expect(result.current.items[0]?.current?.total).toBe(100)
    );
    // agendado não abate (dinheiro só sai no vencimento): a fatura
    // corrente segue inteira em "A pagar"…
    expect(result.current.openTotalByCurrency).toEqual({ BRL: 100 });
    // …e a próxima também conta a fatura cheia
    expect(result.current.upcomingTotalByCurrency).toEqual({ BRL: 100 });
  });
});
