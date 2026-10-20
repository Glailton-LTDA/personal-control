import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// O alvo é a camada OTIMISTA da reordenação: o clique da seta reordena os
// caches MF na hora (sem esperar o refetch da RPC do resumo, que varre
// todos os lançamentos — a sensação de "travar" denunciada no suporte),
// grava via supabase e, em erro, restaura os snapshots e invalida tudo.
const mocks = vi.hoisted(() => {
  const eq = vi.fn();
  const update = vi.fn(() => ({ eq }));
  return { update, eq, from: vi.fn(() => ({ update })) };
});

vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }));
vi.mock('../lib/offline/mfOffline', () => ({
  mfSelect: vi.fn(),
  mfSelectAll: vi.fn(),
  // online: o run() do mfMutate executa direto (o wrapper real só muda o
  // caminho de gravação offline — irrelevante aqui).
  mfMutate: vi.fn((options) => options.run()),
}));

import { useMFReorder } from './useMinhasFinancas';

const SUMMARY_KEY = ['mf-month-summary', 'u1', '2026-10', 'all'];
const TXS_KEY = ['mf-recent-transactions', 'u1'];
const OTHER_KEY = ['other-things'];

const wrapper = (queryClient) =>
  function Wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };

let queryClient;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eq.mockResolvedValue({ data: null, error: null });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Cache do resumo (rows na ordem do banco) + array MF sem item tocado
  // (transações — não pode reordenar por acaso) + cache fora de MF.
  queryClient.setQueryData(SUMMARY_KEY, {
    rows: [
      { id: 'acc-a', name: 'A', sort_order: 0 },
      { id: 'acc-b', name: 'B', sort_order: 1 },
    ],
    chartTxs: [{ id: 'tx-1' }],
  });
  queryClient.setQueryData(TXS_KEY, [
    { id: 'tx-1', sort_order: 9 },
    { id: 'tx-2', sort_order: 2 },
  ]);
  queryClient.setQueryData(OTHER_KEY, [{ id: 'acc-a', sort_order: 5 }]);
});

describe('useMFReorder — reordenação otimista', () => {
  it('troca a posição nos caches MF na hora, sem invalidar nem refetchar', async () => {
    const invalidated = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useMFReorder('mf_accounts'), {
      wrapper: wrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync([
        { id: 'acc-a', sort_order: 1 },
        { id: 'acc-b', sort_order: 0 },
      ]);
    });

    // UI moveu na hora: rows reordenadas pela régua do banco (sort_order, id)
    const summary = queryClient.getQueryData(SUMMARY_KEY);
    expect(summary.rows.map((row) => row.id)).toEqual(['acc-b', 'acc-a']);
    expect(summary.rows[0].sort_order).toBe(0);
    expect(summary.rows[1].sort_order).toBe(1);
    // o resto do payload fica intacto
    expect(summary.chartTxs).toEqual([{ id: 'tx-1' }]);
    // array MF sem item tocado (transações) e cache fora de MF: intactos
    expect(queryClient.getQueryData(TXS_KEY)).toEqual([
      { id: 'tx-1', sort_order: 9 },
      { id: 'tx-2', sort_order: 2 },
    ]);
    expect(queryClient.getQueryData(OTHER_KEY)).toEqual([{ id: 'acc-a', sort_order: 5 }]);
    // gravação seguiu em paralelo (2 updates, um por conta)
    expect(mocks.update).toHaveBeenCalledWith({ sort_order: 1 });
    expect(mocks.update).toHaveBeenCalledWith({ sort_order: 0 });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'acc-a');
    expect(mocks.eq).toHaveBeenCalledWith('id', 'acc-b');
    // sucesso NÃO invalida: reordenação não muda valores (sem refetch da RPC)
    expect(invalidated).not.toHaveBeenCalled();
  });

  it('em erro, restaura os snapshots e invalida tudo (rollback)', async () => {
    mocks.eq.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    const invalidated = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useMFReorder('mf_accounts'), {
      wrapper: wrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync([
          { id: 'acc-a', sort_order: 1 },
          { id: 'acc-b', sort_order: 0 },
        ])
      ).rejects.toThrow('boom');
    });

    // snapshots restaurados: ordem original de volta
    const summary = queryClient.getQueryData(SUMMARY_KEY);
    expect(summary.rows.map((row) => row.id)).toEqual(['acc-a', 'acc-b']);
    // e a invalidação geral converge com o servidor
    expect(invalidated).toHaveBeenCalled();
  });
});
