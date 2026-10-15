import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useInvalidateAll, useMFRefreshPending } from './useMinhasFinancas';

// O hook real roda aqui (só o supabase é mockado; nenhuma query dele é chamada).
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
  getSignedUrl: vi.fn(),
}));

let resolveFetch;
function Probe() {
  const pending = useMFRefreshPending();
  const invalidate = useInvalidateAll();
  useQuery({
    queryKey: ['mf-probe'],
    queryFn: () =>
      new Promise((res) => {
        resolveFetch = res;
      }),
  });
  return (
    <>
      <span data-testid="mf-probe-pending">{pending ? 'yes' : 'no'}</span>
      <button type="button" data-testid="mf-probe-invalidate" onClick={() => invalidate()} />
    </>
  );
}

const renderProbe = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>
  );
};

describe('useMFRefreshPending', () => {
  it('acende ao invalidar e apaga quando o refetch assenta', async () => {
    renderProbe();
    expect(screen.getByTestId('mf-probe-pending')).toHaveTextContent('no');

    fireEvent.click(screen.getByTestId('mf-probe-invalidate'));
    // acendeu na hora (síncrono no clique, cobre a janela do debounce)
    expect(screen.getByTestId('mf-probe-pending')).toHaveTextContent('yes');

    await act(async () => {
      resolveFetch([]);
    });
    await waitFor(() => {
      expect(screen.getByTestId('mf-probe-pending')).toHaveTextContent('no');
    });
  });
});
