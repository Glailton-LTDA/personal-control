import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FastForward } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useMFSeriesRows,
  useCreateMFTransaction,
  useUpdateMFTransaction,
  planCardAnticipation,
  orderSeries,
  cardCycles,
  parseMoney,
  maskAmount,
  formatMoney,
  toISODate,
} from '../../hooks/useMinhasFinancas';
import MFSelect from './MFSelect';

/**
 * Antecipação de parcelas de CARTÃO: N parcelas após a atual mudam para a
 * fatura escolhida e as restantes sobem (shift reverso); se N cobre todas,
 * as faturas futuras esvaziam. As parcelas mantêm o valor original — o
 * desconto vira um estorno separado na fatura destino. Só monta para
 * despesa parcelada (`installments_total > 1`); o pai decide a visibilidade.
 */
export default function MFCardAnticipateModal({ tx, card, user, onClose }) {
  const { t, i18n } = useTranslation();
  const createMutation = useCreateMFTransaction();
  const updateMutation = useUpdateMFTransaction();
  const [count, setCount] = useState('');
  const [discount, setDiscount] = useState('');
  const [targetClose, setTargetClose] = useState('');
  const [saving, setSaving] = useState(false);

  const rootId = tx ? (tx.parent_transaction_id ?? tx.id) : null;
  // Só a série (raiz + irmãs) — antes a tela baixava a tabela inteira.
  const { data: allTx = [], isLoading } = useMFSeriesRows(user, rootId);

  /** Série completa em ordem de parcela. */
  const series = useMemo(
    () =>
      !tx
        ? []
        : orderSeries(
            allTx.filter((row) => row.id === rootId || row.parent_transaction_id === rootId)
          ),
    [allTx, tx, rootId]
  );
  const anchorIdx = series.findIndex((row) => row.id === tx?.id);
  const futureCount = anchorIdx >= 0 ? series.length - anchorIdx - 1 : 0;

  /** Faturas do picker no padrão do original ("Outubro, 2026"). */
  const cycles = useMemo(
    () =>
      card
        ? cardCycles(card, toISODate(new Date()), 13, 12)
            .slice()
            .sort((a, b) => a.closeISO.localeCompare(b.closeISO))
        : [],
    [card]
  );
  const monthYear = (iso) => {
    if (!iso) return '—';
    const [y, m] = iso.split('-').map(Number);
    try {
      const month = new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(
        new Date(y, m - 1, 1)
      );
      return `${month.charAt(0).toUpperCase() + month.slice(1)}, ${y}`;
    } catch {
      return `${String(m).padStart(2, '0')}/${y}`;
    }
  };

  // Padrão: destino = fatura corrente (vence no mês atual); N = todas.
  useEffect(() => {
    if (!tx || !card || cycles.length === 0) return;
    const todayMonth = toISODate(new Date()).slice(0, 7);
    const current = cycles.find((cycle) => cycle.dueISO.slice(0, 7) === todayMonth);
    setTargetClose((current ?? cycles[cycles.length - 1]).closeISO);
  }, [tx, card, cycles]);
  useEffect(() => {
    if (futureCount > 0) setCount(String(futureCount));
  }, [futureCount]);
  useEffect(() => {
    setDiscount('');
  }, [tx?.id]);

  const chosenCount = Math.min(Math.max(Number(count) || 0, 0), futureCount);
  const discountValue = parseMoney(discount) || 0;
  const plan = useMemo(
    () =>
      planCardAnticipation({
        series,
        anchorId: tx?.id,
        count: chosenCount,
        targetClose,
      }),
    [series, tx, chosenCount, targetClose]
  );
  const movedSum = useMemo(
    () => plan.moved.reduce((sum, row) => sum + Math.abs(Number(row.amount) || 0), 0),
    [plan]
  );

  const handleConfirm = async () => {
    if (plan.moves.length === 0 || saving) return;
    setSaving(true);
    try {
      await Promise.all(
        plan.moves.map((move) =>
          updateMutation.mutateAsync({ id: move.id, invoice_close: move.invoice_close })
        )
      );
      if (discountValue > 0) {
        await createMutation.mutateAsync({
          user_id: user.id,
          account_id: tx.account_id,
          type: 'DESPESA',
          description: t('minhasfinancas.card_anticipate_estorno_desc'),
          amount: -Math.abs(discountValue),
          payment_date: toISODate(new Date()),
          due_date: null,
          effective_date: toISODate(new Date()),
          status: 'PAGO',
          category_id: tx.category_id ?? null,
          notes: null,
          attachment_path: null,
          recurrence: 'NONE',
          invoice_close: targetClose,
        });
      }
      toast.success(t('minhasfinancas.card_anticipate_done'));
      onClose();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  if (!tx) return null;
  const currency = card?.currency || 'BRL';
  const money = (value) => formatMoney(value, currency);

  return (
    <div className="modal-overlay" data-testid="mf-card-anticipate-modal" onClick={onClose}>
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
              <FastForward size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {t('minhasfinancas.card_anticipate_title')}
              </h3>
              <p
                style={{
                  margin: '0.2rem 0 0',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                }}
              >
                {tx.description}
                {` · ${tx.installments_current}/${tx.installments_total}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-card-anticipate-close"
            onClick={onClose}
            aria-label={t('minhasfinancas.close')}
          >
            <X size={22} />
          </button>
        </div>

        {isLoading ? (
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            {t('minhasfinancas.loading')}
          </p>
        ) : futureCount === 0 ? (
          <p
            data-testid="mf-card-anticipate-none"
            style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}
          >
            {t('minhasfinancas.card_anticipate_none')}
          </p>
        ) : (
          <>
            <p
              style={{
                margin: '0 0 1rem',
                fontSize: '0.82rem',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              {t('minhasfinancas.card_anticipate_desc')}
            </p>

            <div className="form-grid" style={{ marginBottom: '0.75rem' }}>
              <div className="input-group">
                <label>{t('minhasfinancas.card_anticipate_count')}</label>
                <input
                  type="number"
                  min="1"
                  max={futureCount}
                  value={count}
                  data-testid="mf-card-anticipate-count"
                  onChange={(event) => setCount(event.target.value)}
                />
              </div>
              <div className="input-group">
                <label>{t('minhasfinancas.card_anticipate_discount')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={discount}
                  data-testid="mf-card-anticipate-discount"
                  onChange={(event) => setDiscount(maskAmount(event.target.value))}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: '0.75rem' }}>
              <label>{t('minhasfinancas.card_anticipate_target')}</label>
              <MFSelect
                testId="mf-card-anticipate-target"
                value={targetClose}
                onChange={setTargetClose}
                searchable={false}
                options={cycles.map((cycle) => ({
                  value: cycle.closeISO,
                  label: monthYear(cycle.dueISO),
                }))}
              />
            </div>

            <div
              data-testid="mf-card-anticipate-preview"
              style={{
                border: '1px solid var(--glass-border)',
                borderRadius: 12,
                padding: '0.85rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                fontSize: '0.88rem',
                background: 'rgba(255, 255, 255, 0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  {t('minhasfinancas.card_anticipate_moved', { count: plan.moved.length })}
                </span>
                <strong>{money(movedSum)}</strong>
              </div>
              {discountValue > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {t('minhasfinancas.card_anticipate_estorno_note')}
                </div>
              )}
            </div>
          </>
        )}

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
            data-testid="mf-card-anticipate-cancel"
            onClick={onClose}
            style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}
          >
            {t('minhasfinancas.cancel')}
          </button>
          {!isLoading && futureCount > 0 && (
            <button
              type="button"
              className="btn-primary"
              data-testid="mf-card-anticipate-confirm"
              disabled={saving || plan.moves.length === 0}
              onClick={handleConfirm}
              style={{
                padding: '0.6rem 1rem',
                fontSize: '0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                opacity: saving || plan.moves.length === 0 ? 0.6 : 1,
              }}
            >
              <FastForward size={15} />
              {t('minhasfinancas.card_pay_continue')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
