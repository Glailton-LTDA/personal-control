import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  usePayCardInvoice,
  buildCardPaymentTx,
  parseMoney,
  maskAmount,
  formatMoney,
  toISODate,
} from '../../hooks/useMinhasFinancas';

/**
 * Pagamento de fatura (corrente ou fechada): valor editável (pagamento
 * parcial é permitido, até o em aberto) e o payload sai como DESPESA na
 * conta vinculada ao cartão: agendada no vencimento (PENDENTE) ou paga na
 * hora quando o vencimento já passou. `invoice_close` amarra o pagamento
 * à fatura certa para ela reagir imediatamente. O cartão não recebe
 * transação própria (só "fatura paga + valor pago" via vínculo).
 */
export default function MFPaymentModal({ card, invoice, user, onClose }) {
  const { t } = useTranslation();
  const payInvoice = usePayCardInvoice();
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const open = Number(invoice?.openAmount) || 0;
  const pendingBound = Number(invoice?.pendingBound) || 0;
  // Quanto ainda pode ser pago/realocado: em aberto + o que já está agendado
  // (espelho, item 30). Com a fatura agendada, confirmar reajusta A MESMA
  // linha — nunca um segundo débito.
  const payable = Math.round((open + pendingBound) * 100) / 100;

  // Padrão: valor integral da fatura (máscara de centavos).
  useEffect(() => {
    setAmount(payable > 0 ? payable.toFixed(2).replace('.', ',') : '');
  }, [payable]);

  if (!card || !invoice) return null;

  const value = parseMoney(amount);
  const invalid = !(value > 0) || value > payable + 0.004;
  const today = toISODate(new Date());
  const scheduled = !!invoice.dueISO && invoice.dueISO > today;
  const formatDate = (iso) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  };

  const handleConfirm = async () => {
    if (saving || invalid) return;
    setSaving(true);
    try {
      const payload = buildCardPaymentTx({
        userId: user.id,
        card,
        invoice: { ...invoice, openAmount: payable },
        amount: value,
        description: t('minhasfinancas.card_payment'),
      });
      if (!payload) {
        setSaving(false);
        return;
      }
      await payInvoice.mutateAsync({ card, invoice, payload, payable });
      toast.success(t('minhasfinancas.card_paid_toast'));
      onClose();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" data-testid="mf-pay-modal" onClick={onClose}>
      <div className="glass-card modal-content" onClick={(event) => event.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                padding: '0.6rem',
                borderRadius: 14,
                background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
                color: 'var(--primary)',
              }}
            >
              <Wallet size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {t('minhasfinancas.card_pay_amount_title')}
              </h3>
              <p
                style={{
                  margin: '0.2rem 0 0',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                }}
              >
                {card.name}
                {invoice.dueISO
                  ? ` · ${t('minhasfinancas.card_due_label')} ${formatDate(invoice.dueISO)}`
                  : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-pay-close"
            onClick={onClose}
            aria-label={t('minhasfinancas.close')}
          >
            <X size={22} />
          </button>
        </div>

        <div className="input-group" style={{ marginBottom: '0.75rem' }}>
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            data-testid="mf-pay-amount"
            onChange={(event) => setAmount(maskAmount(event.target.value))}
            placeholder="0,00"
            autoFocus
            style={{ fontSize: '1.5rem', fontWeight: 800, textAlign: 'center' }}
          />
          <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            {t('minhasfinancas.card_open_amount')}:{' '}
            {formatMoney(payable, card.currency || 'BRL')}
          </small>
        </div>

        <p
          data-testid="mf-pay-partial-hint"
          style={{
            margin: '0 0 0.6rem',
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          {t('minhasfinancas.card_pay_partial_hint')}
        </p>
        <p
          data-testid="mf-pay-note"
          style={{
            margin: 0,
            fontSize: '0.78rem',
            color: scheduled ? '#f59e0b' : 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          {scheduled
            ? t('minhasfinancas.card_pay_schedule_note', {
                date: formatDate(invoice.dueISO),
              })
            : t('minhasfinancas.card_pay_now_note')}
        </p>

        <div
          className="modal-footer"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.6rem',
            marginTop: '1.25rem',
          }}
        >
          <button
            type="button"
            className="btn-cancel"
            data-testid="mf-pay-cancel"
            onClick={onClose}
            style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}
          >
            {t('minhasfinancas.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-pay-continue"
            disabled={saving || invalid}
            onClick={handleConfirm}
            style={{
              padding: '0.6rem 1rem',
              fontSize: '0.85rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              opacity: saving || invalid ? 0.6 : 1,
            }}
          >
            <Wallet size={15} />
            {t('minhasfinancas.card_pay_continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
