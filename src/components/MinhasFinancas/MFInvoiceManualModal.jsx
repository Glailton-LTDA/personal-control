import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useUpsertMFInvoice,
  maskAmount,
  parseMoney,
  toISODate,
  formatMoney,
} from '../../hooks/useMinhasFinancas';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const toMasked = (value) => {
  const cents = Math.round((Number(value) || 0) * 100);
  return maskAmount(String(Math.abs(cents))) || '0,00';
};

/**
 * Baixa manual da fatura: grava o total oficial e quanto foi pago em
 * `mf_invoices`, SEM criar lançamento na conta. Serve para cartões cujo
 * pagamento real não está no histórico (ex.: Itaú sem extrato).
 */
export default function MFInvoiceManualModal({
  card,
  invoice,
  record = null,
  user,
  onClose,
  onSaved,
}) {
  const { t } = useTranslation();
  const upsert = useUpsertMFInvoice();
  const [total, setTotal] = useState(() =>
    toMasked(record?.total ?? invoice?.total ?? 0)
  );
  const [paid, setPaid] = useState(() =>
    toMasked(record?.paid_total ?? invoice?.paid ?? 0)
  );
  const [paidAt, setPaidAt] = useState(
    record?.paid_at ?? invoice?.dueISO ?? toISODate(new Date())
  );
  const [notes, setNotes] = useState(record?.notes ?? '');
  const today = toISODate(new Date());
  const totalValue = parseMoney(total);
  const paidValue = parseMoney(paid);
  const isPaid = totalValue > 0 && paidValue >= totalValue - 0.005;
  const status = isPaid
    ? 'PAID'
    : invoice?.dueISO && invoice.dueISO < today
      ? 'OVERDUE'
      : 'OPEN';

  const save = async () => {
    if (!(totalValue > 0)) {
      toast.error(t('minhasfinancas.inv_manual_total_required'));
      return;
    }
    try {
      const data = await upsert.mutateAsync({
        user_id: user.id,
        card_id: card.id,
        close_date: invoice.closeISO,
        due_date: invoice.dueISO ?? null,
        total: round2(totalValue),
        total_source: 'manual',
        paid_total: round2(paidValue),
        status,
        paid_at: isPaid ? paidAt || today : null,
        notes: notes.trim() || null,
      });
      toast.success(t('minhasfinancas.inv_manual_saved'));
      onSaved?.(data);
      onClose();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  return createPortal(
    <div className="modal-overlay" data-testid="mf-invoice-manual-modal" onClick={onClose}>
      <div
        className="glass-card modal-content"
        style={{ maxWidth: 420 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
              {t('minhasfinancas.inv_manual_title')}
            </h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {card?.name} · {invoice?.closeISO} · {t('minhasfinancas.inv_manual_desc')}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-invoice-manual-close"
            aria-label={t('minhasfinancas.cancel')}
            title={t('minhasfinancas.cancel')}
            onClick={onClose}
            style={{ padding: '0.2rem' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '1rem' }}>
          <label className="input-group" style={{ margin: 0 }}>
            <span>{t('minhasfinancas.inv_manual_total')}</span>
            <input
              type="text"
              inputMode="numeric"
              data-testid="mf-invoice-manual-total"
              value={total}
              onChange={(event) => setTotal(maskAmount(event.target.value) || '0,00')}
              placeholder="0,00"
            />
          </label>
          <label className="input-group" style={{ margin: 0 }}>
            <span>{t('minhasfinancas.inv_manual_paid')}</span>
            <input
              type="text"
              inputMode="numeric"
              data-testid="mf-invoice-manual-paid"
              value={paid}
              onChange={(event) => setPaid(maskAmount(event.target.value) || '0,00')}
              placeholder="0,00"
            />
          </label>
          <label className="input-group" style={{ margin: 0 }}>
            <span>{t('minhasfinancas.inv_manual_paid_at')}</span>
            <input
              type="date"
              data-testid="mf-invoice-manual-date"
              value={paidAt}
              disabled={!isPaid}
              onChange={(event) => setPaidAt(event.target.value)}
            />
          </label>
          <label className="input-group" style={{ margin: 0 }}>
            <span>{t('minhasfinancas.inv_manual_notes')}</span>
            <input
              type="text"
              data-testid="mf-invoice-manual-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t('minhasfinancas.inv_manual_notes_placeholder')}
            />
          </label>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {t('minhasfinancas.inv_manual_hint')}
          </p>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap',
              marginTop: '0.25rem',
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.inv_manual_open')}:{' '}
              <strong style={{ color: isPaid ? '#10b981' : '#ef4444' }}>
                {formatMoney(Math.max(0, totalValue - paidValue), card?.currency || 'BRL')}
              </strong>
            </span>
            <span style={{ display: 'inline-flex', gap: '0.5rem' }}>
              <button type="button" className="btn-cancel" onClick={onClose} style={{ padding: '0.55rem 0.9rem' }}>
                {t('minhasfinancas.cancel')}
              </button>
              <button
                type="button"
                className="btn-primary"
                data-testid="mf-invoice-manual-save"
                disabled={upsert.isPending}
                onClick={save}
                style={{ padding: '0.55rem 0.9rem' }}
              >
                {t('minhasfinancas.inv_manual_save')}
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
