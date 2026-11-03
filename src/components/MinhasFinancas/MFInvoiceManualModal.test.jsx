import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MFInvoiceManualModal from './MFInvoiceManualModal';

const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: 'pt-BR', changeLanguage: vi.fn() },
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('../../hooks/useMinhasFinancas', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useUpsertMFInvoice: () => ({
      mutateAsync: upsertMock,
      isPending: false,
    }),
  };
});

describe('MFInvoiceManualModal', () => {
  it('salva total oficial e valor pago em mf_invoices, sem criar transação', async () => {
    upsertMock.mockResolvedValue({ id: 'inv-1' });
    const onClose = vi.fn();

    render(
      <MFInvoiceManualModal
        card={{ id: 'card-1', name: 'Itaú', currency: 'BRL' }}
        invoice={{
          closeISO: '2025-10-15',
          dueISO: '2025-10-22',
          total: 1114.52,
          paid: 0,
        }}
        user={{ id: 'user-1' }}
        onClose={onClose}
      />
    );

    fireEvent.change(screen.getByTestId('mf-invoice-manual-paid'), {
      target: { value: '111452' },
    });
    fireEvent.click(screen.getByTestId('mf-invoice-manual-save'));

    await waitFor(() => {
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          card_id: 'card-1',
          close_date: '2025-10-15',
          total: 1114.52,
          total_source: 'manual',
          paid_total: 1114.52,
          status: 'PAID',
        })
      );
    });
    expect(onClose).toHaveBeenCalled();
  });
});
