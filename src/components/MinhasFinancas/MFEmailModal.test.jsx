import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFEmailModal from './MFEmailModal';

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

// Mock Supabase: responsáveis + insert/update ok.
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
      maybeSingle: vi.fn().mockReturnThis(),
      then: vi.fn((onFulfilled, onRejected) =>
        Promise.resolve(typeof result === 'function' ? result() : result).then(
          onFulfilled,
          onRejected
        )
      ),
    };
    return chain;
  };
  const responsibles = makeChain({
    data: [
      { id: 'resp-1', name: 'Deisianne', email: 'dei@test.com', is_main: false },
      { id: 'resp-2', name: 'Glailton', email: 'glai@test.com', is_main: true },
    ],
    error: null,
  });
  const ok = makeChain({ data: { id: 'new-1' }, error: null });
  const settings = makeChain({
    data: { recipient_email: 'dest@test.com', bcc_email: null },
    error: null,
  });
  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'finance_responsibles') return responsibles;
        if (table === 'notification_settings') return settings;
        return ok;
      }),
      functions: {
        invoke: vi.fn().mockResolvedValue({ error: null }),
      },
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
  };
});

const tx = {
  id: 'tx-1',
  account_id: 'acc-1',
  type: 'DESPESA',
  description: 'Mercado',
  amount: 100,
  payment_date: '2026-10-05',
  status: 'PAGO',
};

const renderModal = (overrides = {}) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = { tx, categoryName: 'Alimentação', onClose: vi.fn(), ...overrides };
  render(
    <QueryClientProvider client={queryClient}>
      <MFEmailModal {...props} />
    </QueryClientProvider>
  );
  return props;
};

describe('MFEmailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista os responsáveis e envia ao escolhido', async () => {
    const props = renderModal();

    await waitFor(() => {
      expect(screen.getByTestId('mf-email-resp-resp-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mf-email-resp-resp-2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-email-resp-resp-1'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        'send-finance-email',
        expect.objectContaining({
          body: expect.objectContaining({ to: 'dei@test.com' }),
        })
      );
    });
    await waitFor(() => {
      expect(props.onClose).toHaveBeenCalled();
    });
  });
});
