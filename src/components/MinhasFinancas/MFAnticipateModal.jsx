import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FastForward } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useMFAllTransactions,
  useCreateMFTransaction,
  useUpdateMFTransaction,
  buildAnticipateTx,
  parseMoney,
  maskAmount,
  formatMoney,
} from '../../hooks/useMinhasFinancas';

/**
 * Antecipação de parcelas: o usuário escolhe QUANTAS das próximas parcelas
 * (em aberto) antecipar e o desconto aplicado. A confirmação cria UMA
 * transação PAGO pelo valor líquido (soma − desconto) e cancela as parcelas
 * escolhidas — o histórico fica visível, mas fora dos totais.
 *
 * Montagem condicional pelo pai: só busca os lançamentos quando aberto.
 */
export default function MFAnticipateModal({ tx, user, currency = 'BRL', onClose }) {
  const { t } = useTranslation();
  const { data: allTx = [], isLoading } = useMFAllTransactions(user);
  const createMutation = useCreateMFTransaction();
  const updateMutation = useUpdateMFTransaction();
  const [count, setCount] = useState('');
  const [discount, setDiscount] = useState('');
  const [saving, setSaving] = useState(false);

  const rootId = tx ? (tx.parent_transaction_id ?? tx.id) : null;

  /** Série completa da parcela (raiz + filhas), em ordem de parcela. */
  const series = useMemo(
    () =>
      !tx
        ? []
        : allTx
            .filter((row) => row.id === rootId || row.parent_transaction_id === rootId)
            .sort((a, b) => (a.installments_current ?? 0) - (b.installments_current ?? 0)),
    [allTx, tx, rootId]
  );
  const remaining = useMemo(() => series.filter((row) => row.status === 'PENDENTE'), [series]);
  const maxCount = remaining.length;

  const chosenCount = Math.min(Math.max(Number(count) || 0, 0), maxCount);
  const chosen = useMemo(
    () => remaining.slice(0, chosenCount),
    [remaining, chosenCount]
  );
  const sum = chosen.reduce((acc, row) => acc + Math.abs(Number(row.amount) || 0), 0);
  const discountValue = parseMoney(discount) || 0;
  const net = Math.round((sum - discountValue) * 100) / 100;

  // Padrão: antecipar todas as parcelas em aberto.
  useEffect(() => {
    if (maxCount > 0) setCount(String(maxCount));
  }, [maxCount]);
  useEffect(() => {
    setDiscount('');
  }, [tx?.id]);

  const handleConfirm = async () => {
    if (chosen.length === 0 || !(net > 0) || saving) return;
    setSaving(true);
    try {
      await createMutation.mutateAsync(
        buildAnticipateTx({
          userId: user.id,
          tx,
          net,
          description: t('minhasfinancas.tx_anticipate_of', {
            count: chosen.length,
            name: tx.description,
          }),
          notes: t('minhasfinancas.tx_anticipate_notes', {
            name: tx.description,
            from: chosen[0].installments_current ?? '?',
            to: chosen[chosen.length - 1].installments_current ?? '?',
            discount: formatMoney(discountValue, currency),
          }),
        })
      );
      for (const row of chosen) {
        await updateMutation.mutateAsync({ id: row.id, status: 'CANCELADO' });
      }
      toast.success(t('minhasfinancas.anticipate_done'));
      onClose();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  if (!tx) return null;

  const money = (value) => formatMoney(value, currency);
  const invalid = sum > 0 && !(net > 0);

  return (
    <div className="modal-overlay" data-testid="mf-anticipate-modal" onClick={onClose}>
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
                {t('minhasfinancas.anticipate_title')}
              </h3>
              <p
                style={{
                  margin: '0.2rem 0 0',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                }}
              >
                {tx.description}
                {tx.installments_total > 1 &&
                  ` · ${tx.installments_current}/${tx.installments_total}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-anticipate-close"
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
        ) : maxCount === 0 ? (
          <p
            data-testid="mf-anticipate-none"
            style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}
          >
            {t('minhasfinancas.anticipate_none')}
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
              {t('minhasfinancas.anticipate_desc')}
            </p>

            <div className="form-grid" style={{ marginBottom: '0.75rem' }}>
              <div className="input-group">
                <label>{t('minhasfinancas.anticipate_count')}</label>
                <input
                  type="number"
                  min="1"
                  max={maxCount}
                  value={count}
                  data-testid="mf-anticipate-count"
                  onChange={(event) => setCount(event.target.value)}
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  {t('minhasfinancas.anticipate_open_installments')}: {maxCount}
                </small>
              </div>
              <div className="input-group">
                <label>{t('minhasfinancas.anticipate_discount')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={discount}
                  data-testid="mf-anticipate-discount"
                  onChange={(event) => setDiscount(maskAmount(event.target.value))}
                  placeholder="0,00"
                />
              </div>
            </div>

            {/* Resumo: soma, desconto e valor líquido */}
            <div
              data-testid="mf-anticipate-preview"
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
                  {t('minhasfinancas.anticipate_sum')} ({chosen.length}×)
                </span>
                <strong>{money(sum)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  {t('minhasfinancas.anticipate_discount')}
                </span>
                <strong style={{ color: discountValue > 0 ? '#ef4444' : undefined }}>
                  − {money(discountValue)}
                </strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--glass-border)',
                  paddingTop: '0.4rem',
                  marginTop: '0.15rem',
                }}
              >
                <span style={{ fontWeight: 700 }}>
                  {t('minhasfinancas.anticipate_net')}
                </span>
                <strong
                  data-testid="mf-anticipate-net"
                  style={{ fontSize: '1.02rem', color: net > 0 ? '#10b981' : '#ef4444' }}
                >
                  {money(net)}
                </strong>
              </div>
            </div>

            {invalid && (
              <p
                data-testid="mf-anticipate-invalid"
                style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: '#ef4444' }}
              >
                {t('minhasfinancas.anticipate_invalid')}
              </p>
            )}
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
            data-testid="mf-anticipate-cancel"
            onClick={onClose}
            style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}
          >
            {t('minhasfinancas.cancel')}
          </button>
          {!isLoading && maxCount > 0 && (
            <button
              type="button"
              className="btn-primary"
              data-testid="mf-anticipate-confirm"
              disabled={saving || chosen.length === 0 || invalid}
              onClick={handleConfirm}
              style={{
                padding: '0.6rem 1rem',
                fontSize: '0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                opacity: saving || chosen.length === 0 || invalid ? 0.6 : 1,
              }}
            >
              <FastForward size={15} />
              {t('minhasfinancas.anticipate_action')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
