import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MFTagModal from './MFTagModal';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { changeLanguage: vi.fn(), language: 'pt-BR' },
  }),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

// Mock Supabase
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
      eq: vi.fn().mockReturnThis(),
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
  const tags = makeChain({
    data: [{ id: 'tag-1', name: 'Viagem', color: '#06b6d4' }],
    error: null,
  });
  return {
    supabase: {
      from: vi.fn(() => tags),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  };
});

const renderModal = (tag = null, onClose = vi.fn()) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MFTagModal tag={tag} user={{ id: 'test-user' }} onClose={onClose} />
    </QueryClientProvider>
  );
  return onClose;
};

describe('MFTagModal — Nova/Editar tag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('pc_skip_confirmations', 'true');
  });

  it('cria tag com nome e cor da grade', async () => {
    const onClose = renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tag-modal-name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('mf-tag-modal-name'), {
      target: { value: 'Praia' },
    });
    fireEvent.click(screen.getByTestId('mf-tag-modal-color-0'));
    fireEvent.click(screen.getByTestId('mf-tag-modal-save'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_tags').insert).toHaveBeenCalled();
    });
    expect(supabase.from('mf_tags').insert.mock.calls[0][0]).toMatchObject({
      user_id: 'test-user',
      name: 'Praia',
      color: '#f44336',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('bloqueia nome vazio e duplicado', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('mf-tag-modal-name')).toBeInTheDocument();
    });

    const { supabase } = await import('../../lib/supabase');
    fireEvent.click(screen.getByTestId('mf-tag-modal-save'));
    expect(supabase.from('mf_tags').insert).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('mf-tag-modal-name'), {
      target: { value: 'viagem' },
    });
    fireEvent.click(screen.getByTestId('mf-tag-modal-save'));
    expect(supabase.from('mf_tags').insert).not.toHaveBeenCalled();
  });

  it('edita tag existente via update', async () => {
    renderModal({ id: 'tag-1', name: 'Viagem', color: '#06b6d4' });
    await waitFor(() => {
      expect(screen.getByTestId('mf-tag-modal-name')).toHaveValue('Viagem');
    });

    fireEvent.change(screen.getByTestId('mf-tag-modal-name'), {
      target: { value: 'Viagem+' },
    });
    fireEvent.click(screen.getByTestId('mf-tag-modal-save'));

    const { supabase } = await import('../../lib/supabase');
    await waitFor(() => {
      expect(supabase.from('mf_tags').update).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Viagem+' })
      );
    });
  });
});
