import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOfflineUpdateExpense, useOfflineUpdateTrip } from './useOfflineTrips';
import { db } from '../lib/offline/db';

const wrapper = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

describe('useOfflineTrips — edição de registro que não está no cache local', () => {
  beforeEach(async () => {
    // Offline: nada vai para o Supabase; o teste olha só o Dexie.
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await db.trip_expenses.clear();
    await db.trips.clear();
    await db.sync_queue.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('atualiza a despesa mesmo sem cópia no Dexie (sem DataError)', async () => {
    const { result } = renderHook(() => useOfflineUpdateExpense('user-1', 'trip-1'), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'exp-1',
        trip_id: 'trip-1',
        user_id: 'user-1',
        description: 'Café da manhã Hotel',
        amount: 30,
        currency: 'EUR',
        date: '2026-12-25',
        paid_by: 'Glailton',
        category_id: null,
        receipt_url: null,
      });
    });

    await waitFor(async () => {
      expect(await db.trip_expenses.get('exp-1')).toMatchObject({
        id: 'exp-1',
        description: 'Café da manhã Hotel',
        paid_by: 'Glailton',
        currency: 'EUR',
        date: '2026-12-25',
      });
    });

    // Fila offline criada para sincronizar depois.
    const queued = await db.sync_queue.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      table_name: 'trip_expenses',
      record_id: 'exp-1',
      action: 'update',
    });
  });

  it('atualiza a viagem mesmo sem cópia no Dexie', async () => {
    const { result } = renderHook(() => useOfflineUpdateTrip('user-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'trip-9', title: 'Gramado 2027' });
    });

    await waitFor(async () => {
      expect(await db.trips.get('trip-9')).toMatchObject({
        id: 'trip-9',
        title: 'Gramado 2027',
      });
    });
  });
});
