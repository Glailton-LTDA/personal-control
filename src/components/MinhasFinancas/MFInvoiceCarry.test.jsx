import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MFInvoiceCarry from './MFInvoiceCarry';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key, i18n: { language: 'pt-BR' } }) }));
const previous = { closeISO: '2026-11-03', dueISO: '2026-11-10', total: 1000, paid: 400 };
const active = { closeISO: '2026-12-03', total: 200, paid: 0 };
const props = { activeInvoice: active, invoices: [previous], payments: [], refISO: '2026-12-31', showValues: true, currency: 'BRL' };

describe('MFInvoiceCarry', () => {
  it('exibe débito/crédito, total restante e paga o ciclo original', () => {
    const onPay = vi.fn();
    render(<MFInvoiceCarry {...props} onPay={onPay} />);
    expect(screen.getByTestId('mf-invoice-carry-previous')).toHaveTextContent(/-.*1\.000,00/);
    expect(screen.getByTestId('mf-invoice-carry-payment')).toHaveTextContent(/\+.*400,00/);
    expect(screen.getByTestId('mf-invoice-carry-outstanding')).toHaveTextContent('600,00');
    expect(screen.getByTestId('mf-invoice-combined-outstanding')).toHaveTextContent('800,00');
    fireEvent.click(screen.getByRole('button'));
    expect(onPay).toHaveBeenCalledWith(previous);
  });
  it('respeita a ocultação dos valores', () => {
    render(<MFInvoiceCarry {...props} showValues={false} onPay={() => {}} />);
    expect(screen.getByTestId('mf-invoice-carry')).not.toHaveTextContent('1.000,00');
    expect(screen.getByTestId('mf-invoice-combined-outstanding')).toHaveTextContent('•••');
  });
});
