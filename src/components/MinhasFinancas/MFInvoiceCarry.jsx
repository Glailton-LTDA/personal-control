import React from 'react';
import { useTranslation } from 'react-i18next';
import { buildInvoiceCarry, invoiceOutstanding } from '../../lib/mfInvoiceCarry';
import { formatMoney, formatMonthLabel } from '../../hooks/useMinhasFinancas';

export default function MFInvoiceCarry({ activeInvoice, invoices, payments, refISO, currency, showValues, onPay }) {
  const { t, i18n } = useTranslation();
  const carry = buildInvoiceCarry(activeInvoice, invoices, payments, refISO);
  if (!carry.rows.length) return null;
  const money = (value) => showValues ? formatMoney(value, currency || 'BRL') : '•••';
  return <section data-testid="mf-invoice-carry" style={{ marginBottom: '1rem', padding: '0.8rem', border: '1px solid var(--glass-border)', borderRadius: 12 }}>
    <h4 style={{ margin: '0 0 0.6rem' }}>{t('minhasfinancas.inv_previous_activity')}</h4>
    {carry.rows.map((row) => <div key={row.id} data-testid={`mf-invoice-carry-${row.kind}`} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--glass-border)', flexWrap: 'wrap' }}>
      <span style={{ flex: 1 }}>{t(row.kind === 'previous' ? 'minhasfinancas.inv_previous_debit' : 'minhasfinancas.inv_payment_received')}
        <small style={{ display: 'block', color: 'var(--text-muted)' }}>{formatMonthLabel(row.invoice.dueISO?.slice(0, 7) || row.invoice.closeISO.slice(0, 7), i18n.language)}{row.kind === 'payment' && row.date ? ` · ${String(row.date).slice(0, 10).split('-').reverse().join('/')}` : ''}</small>
      </span>
      <strong style={{ color: row.amount < 0 ? '#ef4444' : '#10b981', whiteSpace: 'nowrap' }}>{row.amount > 0 && showValues ? '+' : ''}{money(row.amount)}</strong>
      {row.kind === 'previous' && row.outstanding > 0 && <button type="button" onClick={() => onPay(row.invoice)} className="btn-secondary">{t('minhasfinancas.inv_pay_previous')}</button>}
    </div>)}
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.75rem' }}>
      <span>{t('minhasfinancas.inv_previous_remaining')}</span><strong data-testid="mf-invoice-carry-outstanding">{money(carry.outstanding)}</strong>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.5rem' }}>
      <span>{t('minhasfinancas.inv_combined_remaining')}</span><strong data-testid="mf-invoice-combined-outstanding">{money(carry.outstanding + invoiceOutstanding(activeInvoice))}</strong>
    </div>
  </section>;
}
