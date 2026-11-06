import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MFCardInvoices from './MFCardInvoices';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key, i18n: { language: 'pt-BR' } }) }));
vi.mock('../../hooks/useMinhasFinancas', async (importOriginal) => ({
  ...await importOriginal(),
  useMFCardTransactions: () => ({ data: { transactions }, isLoading: false }),
  useMFCategories: () => ({ data: [] }),
  useMFInvoices: () => ({ data: [] }),
  useUpdateMFTransaction: () => ({ mutateAsync: vi.fn() }),
}));
const transactions = [
  { id: 'nov', account_id: 'card', type: 'DESPESA', amount: 1000, payment_date: '2026-10-20', invoice_close: '2026-11-03', status: 'PAGO', description: 'Compras novembro' },
  { id: 'dec', account_id: 'card', type: 'DESPESA', amount: 200, payment_date: '2026-11-20', invoice_close: '2026-12-03', status: 'PAGO', description: 'Compras dezembro' },
  { id: 'payment', account_id: 'bank', type: 'DESPESA', amount: 400, payment_date: '2026-11-20', invoice_close: '2026-11-03', status: 'PAGO', description: 'Pagamento novembro' },
];

describe('faturas anteriores na tela do cartão', () => {
  it('integra dívida de novembro, crédito recebido e compras de dezembro', () => {
    render(<MFCardInvoices card={{ id: 'card', name: 'Nubank', closing_day: 3, due_day: 10, currency: 'BRL', linked_account_id: 'bank' }} user={{ id: 'u1' }} monthKey="2026-12" />);
    expect(screen.getByTestId('mf-invoice-carry-previous')).toHaveTextContent(/-.*1\.000,00/);
    expect(screen.getByTestId('mf-invoice-carry-payment')).toHaveTextContent(/\+.*400,00/);
    expect(screen.getByTestId('mf-invoice-carry-outstanding')).toHaveTextContent('600,00');
    expect(screen.getByTestId('mf-invoice-combined-outstanding')).toHaveTextContent('800,00');
    expect(screen.getByText('Compras dezembro')).toBeInTheDocument();
  });
});
