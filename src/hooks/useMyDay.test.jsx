import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, it, expect, vi } from 'vitest';
import { useMyDay, useMyDayInvalidation } from './useMyDay';
import { loadMyDay } from '../lib/myDay';
vi.mock('../lib/myDay', async (original) => ({
  ...(await original()),
  loadMyDay: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  loadMyDay.mockResolvedValue({ day: '2026-11-27', sections: {} });
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}
it('never requests the preview without identity or with every source hidden', () => {
  const { wrapper } = setup();
  const { rerender } = renderHook(({ id, modules }) => useMyDay(id, modules), {
    wrapper,
    initialProps: { id: null, modules: ['health'] },
  });
  expect(loadMyDay).not.toHaveBeenCalled();
  rerender({ id: 'owner', modules: [] });
  expect(loadMyDay).not.toHaveBeenCalled();
});
it('shares fresh results, ignores focus and refetches only on explicit refresh', async () => {
  const { wrapper } = setup();
  const first = renderHook(() => useMyDay('owner', ['health']), { wrapper });
  await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
  const second = renderHook(() => useMyDay('owner', ['health']), { wrapper });
  await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
  act(() => window.dispatchEvent(new Event('focus')));
  expect(loadMyDay).toHaveBeenCalledTimes(1);
  await act(async () => {
    await first.result.current.refetch();
  });
  expect(loadMyDay).toHaveBeenCalledTimes(2);
});
it('separates users and module selections in the query cache', async () => {
  const { wrapper } = setup();
  const view = renderHook(({ id, modules }) => useMyDay(id, modules), {
    wrapper,
    initialProps: { id: 'owner', modules: ['health'] },
  });
  await waitFor(() => expect(loadMyDay).toHaveBeenCalledTimes(1));
  view.rerender({ id: 'other', modules: ['health'] });
  await waitFor(() => expect(loadMyDay).toHaveBeenCalledTimes(2));
  view.rerender({ id: 'other', modules: ['trips'] });
  await waitFor(() => expect(loadMyDay).toHaveBeenCalledTimes(3));
});
it('does not automatically retry a failing data request', async () => {
  loadMyDay.mockRejectedValue(new Error('denied'));
  const { wrapper } = setup();
  const view = renderHook(() => useMyDay('owner'), { wrapper });
  await waitFor(() => expect(view.result.current.isError).toBe(true));
  expect(loadMyDay).toHaveBeenCalledTimes(1);
});
it('marks previews stale after writes without causing an inactive read', () => {
  const { client, wrapper } = setup();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = renderHook(({ id }) => useMyDayInvalidation(id), {
    wrapper,
    initialProps: { id: 'owner' },
  });
  act(() =>
    client
      .getMutationCache()
      .notify({ type: 'updated', action: { type: 'success' } })
  );
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['my-day', 'owner'],
    refetchType: 'none',
  });
  expect(loadMyDay).not.toHaveBeenCalled();
  view.rerender({ id: null });
  invalidate.mockClear();
  act(() =>
    client
      .getMutationCache()
      .notify({ type: 'updated', action: { type: 'success' } })
  );
  expect(invalidate).not.toHaveBeenCalled();
});
it('updates the local clock without polling and reloads only when the date changes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 27, 10, 0));
  const { wrapper } = setup();
  const view = renderHook(() => useMyDay('owner'), { wrapper });
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(loadMyDay).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180000);
    });
    expect(loadMyDay).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(2026, 10, 28, 0, 0));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(loadMyDay).toHaveBeenCalledTimes(2);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it('does not invalidate again after a treatment write has already refreshed the preview', () => {
 const {client,wrapper}=setup();const invalidate=vi.spyOn(client,'invalidateQueries');renderHook(()=>useMyDayInvalidation('owner'),{wrapper});
 act(()=>client.getMutationCache().notify({type:'updated',action:{type:'success'},mutation:{options:{meta:{refreshesMyDay:true}}}}));
 expect(invalidate).not.toHaveBeenCalled();
});
