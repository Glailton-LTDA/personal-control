import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from '../lib/supabase';
import { useMFPrefs } from './useMinhasFinancas';
import { MF_DASHBOARD_KEY, MF_ACCOUNTS_SORT_KEY } from '../lib/mfPrefs';

const REMOTO = {
  dashboard: {
    order: ['kpis', 'groups', 'accounts', 'recent', 'pending', 'charts', 'budgets', 'goals'],
    hidden: ['charts'],
    hiddenAccounts: ['acc-9'],
    hiddenCharts: [],
  },
  accountsSort: 'name',
};

let remoteRow = null;
let upserts = [];

const makeChain = (result) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(() => Promise.resolve(result)),
  upsert: vi.fn((payload) => {
    upserts.push(payload);
    return Promise.resolve({ data: payload, error: null });
  }),
  then: vi.fn((onFulfilled, onRejected) =>
    Promise.resolve(result).then(onFulfilled, onRejected)
  ),
});

const renderPrefs = (user = { id: 'u1' }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useMFPrefs(user), { wrapper });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  remoteRow = null;
  upserts = [];
  localStorage.clear();
  supabase.from.mockImplementation(() =>
    makeChain({ data: remoteRow, error: remoteRow ? null : { message: 'sem registro' } })
  );
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('useMFPrefs — preferências sincronizadas entre aparelhos', () => {
  it('começa pelo cache local (painel e ordenação)', () => {
    localStorage.setItem(
      MF_DASHBOARD_KEY,
      JSON.stringify({ ...REMOTO.dashboard, hidden: ['goals'] })
    );
    localStorage.setItem(MF_ACCOUNTS_SORT_KEY, 'balance_asc');

    const { result } = renderPrefs();

    expect(result.current.prefs.accountsSort).toBe('balance_asc');
    expect(result.current.prefs.dashboard.hidden).toEqual(['goals']);
  });

  it('quando a conta tem preferência salva, ela passa a valer (e vai pro cache local)', async () => {
    remoteRow = { data: REMOTO };
    const { result } = renderPrefs();

    await waitFor(() =>
      expect(result.current.prefs.accountsSort).toBe('name')
    );
    expect(result.current.prefs.dashboard.hidden).toEqual(['charts']);
    expect(JSON.parse(localStorage.getItem(MF_DASHBOARD_KEY)).hidden).toEqual(['charts']);
    expect(localStorage.getItem(MF_ACCOUNTS_SORT_KEY)).toBe('name');
  });

  it('salvar grava no cache local na hora e envia para a conta', async () => {
    const { result } = renderPrefs();

    act(() => {
      result.current.save({ accountsSort: 'manual' });
    });
    expect(localStorage.getItem(MF_ACCOUNTS_SORT_KEY)).toBe('manual');

    await vi.advanceTimersByTimeAsync(900);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].user_id).toBe('u1');
    expect(upserts[0].data.accountsSort).toBe('manual');
  });

  it('sem servidor (offline/erro) o cache local continua valendo', async () => {
    supabase.from.mockImplementation(() => {
      throw new Error('sem rede');
    });
    localStorage.setItem(MF_ACCOUNTS_SORT_KEY, 'name');
    const { result } = renderPrefs();

    await waitFor(() => expect(result.current.prefs.accountsSort).toBe('name'));
  });
});
