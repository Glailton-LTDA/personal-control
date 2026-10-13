import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeftRight, Calculator } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useCreateTransfer, useCreateMFTransaction, parseMoney, maskAmount, toISODate, addMonthsISO, shiftRecurrenceDate, formatMoney } from '../../hooks/useMinhasFinancas';
import MFSelect from './MFSelect';
import MFRepeatModal from './MFRepeatModal';
import MFCalculator from './MFCalculator';

/**
 * Modal de transferência entre contas (mf_transactions.type = 'TRANSFERENCIA').
 * Montado via portal no body (o `.modal-overlay` fixed recortaria dentro de
 * `.glass-card`s — backdrop-filter cria containing block). `onSuccess` é
 * chamado depois do fechamento quando a transferência é criada (o chamador
 * decide se volta pra lista; cancelar só fecha).
 */
export default function MFTransferModal({ isOpen, onClose, accounts = [], user, onSuccess }) {
  const { t } = useTranslation();
  const createTransfer = useCreateTransfer();
  const createTx = useCreateMFTransaction();
  const [saving, setSaving] = useState(false);
  const [repeat, setRepeat] = useState(null); // null | { initial, count, periodicity }
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [amountCalcOpen, setAmountCalcOpen] = useState(false);
  const [form, setForm] = useState({
    from: '',
    to: '',
    amount: '',
    payment_date: toISODate(new Date()),
    description: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    const origin = accounts[0];
    const originCurrency = origin?.currency || 'BRL';
    const sameCurrency = accounts.filter(
      (account) => account.id !== origin?.id && (account.currency || 'BRL') === originCurrency
    );
    setForm({
      from: origin?.id ?? '',
      to: sameCurrency[0]?.id ?? '',
      amount: '',
      payment_date: toISODate(new Date()),
      description: t('minhasfinancas.transfer_default'),
    });
    setRepeat(null);
    setRepeatOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, accounts.length]);

  if (!isOpen) return null;

  const set = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const origin = accounts.find((account) => account.id === form.from);
  const originCurrency = origin?.currency || 'BRL';
  // Sem cotação: transferências só acontecem entre contas da mesma moeda.
  const destinationOptions = accounts.filter(
    (account) => account.id !== form.from && (account.currency || 'BRL') === originCurrency
  );

  const handleFromChange = (event) => {
    const from = event.target.value;
    setForm((prev) => {
      const nextOrigin = accounts.find((account) => account.id === from);
      const nextCurrency = nextOrigin?.currency || 'BRL';
      const candidates = accounts.filter(
        (account) => account.id !== from && (account.currency || 'BRL') === nextCurrency
      );
      const keep = candidates.some((account) => account.id === prev.to);
      return { ...prev, from, to: keep ? prev.to : (candidates[0]?.id ?? '') };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const amount = parseMoney(form.amount);

    if (!form.from || !form.to || form.from === form.to) {
      toast.error(t('minhasfinancas.transfer_invalid_accounts'));
      return;
    }
    const destination = accounts.find((account) => account.id === form.to);
    if (!destination || (destination.currency || 'BRL') !== originCurrency) {
      toast.error(t('minhasfinancas.transfer_currency_mismatch'));
      return;
    }
    if (amount <= 0) {
      toast.error(t('minhasfinancas.transfer_invalid_amount'));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        account_id: form.from,
        transfer_account_id: form.to,
        type: 'TRANSFERENCIA',
        description: form.description?.trim() || t('minhasfinancas.transfer_default'),
        amount,
        payment_date: form.payment_date,
        status: 'PAGO',
      };
      if (!repeat || repeat.count < 2) {
        await createTransfer.mutateAsync(payload);
      } else if (repeat.periodicity === 'MONTHLY') {
        // Parcelamento numerado (1/N…): cabeça + filhas pendentes vinculadas.
        const { initial, count } = repeat;
        const total = initial + count - 1;
        const [first] = await createTx.mutateAsync({
          ...payload,
          installments_current: initial,
          installments_total: total,
        });
        const children = [];
        for (let i = 1; i < count; i += 1) {
          children.push({
            ...payload,
            payment_date: addMonthsISO(payload.payment_date, i),
            status: 'PENDENTE',
            effective_date: null,
            installments_current: initial + i,
            installments_total: total,
            parent_transaction_id: first?.id ?? null,
          });
        }
        if (children.length > 0) await createTx.mutateAsync(children);
      } else {
        // Repetição finita semanal/anual (sem numeração de parcela).
        const { count, periodicity } = repeat;
        const [first] = await createTx.mutateAsync({ ...payload, recurrence: periodicity });
        const children = [];
        for (let i = 1; i < count; i += 1) {
          children.push({
            ...payload,
            payment_date: shiftRecurrenceDate(payload.payment_date, periodicity, i),
            status: 'PENDENTE',
            effective_date: null,
            recurrence: periodicity,
            parent_transaction_id: first?.id ?? null,
          });
        }
        if (children.length > 0) await createTx.mutateAsync(children);
      }
      toast.success(t('minhasfinancas.transfer_success'));
      onClose();
      onSuccess?.();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  const hasAccounts = accounts.length >= 2;

  return createPortal(
    <div className="modal-overlay" data-testid="mf-transfer-modal" onClick={onClose}>
      <div className="glass-card modal-content" onClick={(event) => event.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
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
              <ArrowLeftRight size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {t('minhasfinancas.transfer_title')}
              </h3>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {t('minhasfinancas.transfer_desc')}
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={22} />
          </button>
        </div>

        {!hasAccounts ? (
          <p data-testid="mf-transfer-no-accounts" style={{ color: 'var(--text-muted)', margin: 0 }}>
            {t('minhasfinancas.transfer_need_accounts')}
          </p>
        ) : (
          <form onSubmit={handleSubmit} data-testid="mf-transfer-form">
            <div className="form-grid">
              <div className="input-group">
                <label>{t('minhasfinancas.transfer_from')}</label>
                <MFSelect
                  testId="mf-transfer-from"
                  value={form.from}
                  onChange={(next) => handleFromChange({ target: { value: next } })}
                  placeholder={t('minhasfinancas.transfer_from')}
                  options={accounts.map((account) => ({
                    value: account.id,
                    label: account.name,
                    meta: `(${account.currency || 'BRL'})`,
                    color: account.color,
                  }))}
                />
              </div>
              <div className="input-group">
                <label>{t('minhasfinancas.transfer_to')}</label>
                <MFSelect
                  testId="mf-transfer-to"
                  value={form.to}
                  onChange={(next) => set('to')({ target: { value: next } })}
                  placeholder={t('minhasfinancas.transfer_to')}
                  options={destinationOptions.map((account) => ({
                    value: account.id,
                    label: account.name,
                    meta: `(${account.currency || 'BRL'})`,
                    color: account.color,
                  }))}
                />
                {destinationOptions.length === 0 && (
                  <p
                    data-testid="mf-transfer-same-currency"
                    style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: '#f59e0b' }}
                  >
                    {t('minhasfinancas.transfer_same_currency')}
                  </p>
                )}
              </div>
            </div>

            <div className="form-grid">
              <div className="input-group">
                <label>
                  {t('minhasfinancas.transfer_amount')} ({originCurrency})
                </label>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'stretch' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={form.amount}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, amount: maskAmount(event.target.value) }))
                    }
                    placeholder="0,00"
                    data-testid="mf-transfer-amount"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    data-testid="mf-transfer-amount-calc"
                    aria-label={t('minhasfinancas.calc_title')}
                    title={t('minhasfinancas.calc_title')}
                    onClick={() => setAmountCalcOpen(true)}
                    style={{ flexShrink: 0 }}
                  >
                    <Calculator size={16} />
                  </button>
                </div>
                {amountCalcOpen && (
                  <MFCalculator
                    testId="mf-transfer-calc"
                    title={t('minhasfinancas.calc_title')}
                    initial={form.amount}
                    onConfirm={(value) => {
                      setForm((prev) => ({ ...prev, amount: value }));
                      setAmountCalcOpen(false);
                    }}
                    onClose={() => setAmountCalcOpen(false)}
                  />
                )}
              </div>
              <div className="input-group">
                <label>{t('minhasfinancas.transfer_date')}</label>
                <input type="date" required value={form.payment_date} onChange={set('payment_date')} />
              </div>
            </div>

            <div className="input-group">
              <label>{t('minhasfinancas.transfer_description')}</label>
              <input type="text" value={form.description} onChange={set('description')} />
            </div>

            <div className="input-group" style={{ marginTop: '1rem' }}>
              <label>{t('minhasfinancas.tx_repeat_label')}</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  data-testid="mf-transfer-repeat-open"
                  onClick={() => setRepeatOpen(true)}
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.8rem' }}
                >
                  {t('minhasfinancas.tx_repeat_open')}
                </button>
                {repeat && (
                  <>
                    <span data-testid="mf-transfer-repeat-summary" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {t('minhasfinancas.tx_repeat_summary', {
                        count: repeat.count,
                        amount: formatMoney(parseMoney(form.amount) || 0, originCurrency),
                        periodicity: t(`minhasfinancas.tx_recurrence_${repeat.periodicity.toLowerCase()}`),
                      })}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      data-testid="mf-transfer-repeat-clear"
                      aria-label={t('minhasfinancas.delete')}
                      title={t('minhasfinancas.delete')}
                      onClick={() => setRepeat(null)}
                      style={{ padding: '0.3rem' }}
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {repeatOpen && (
              <MFRepeatModal
                initial={repeat?.initial ?? 1}
                count={repeat?.count ?? 2}
                periodicity={repeat?.periodicity ?? 'MONTHLY'}
                amountMode="parcela"
                showAmountToggle={false}
                amount={parseMoney(form.amount) || 0}
                currency={originCurrency}
                onApply={(next) => {
                  setRepeat(next);
                  setRepeatOpen(false);
                }}
                onClose={() => setRepeatOpen(false)}
              />
            )}

            <div className="modal-footer" style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn-cancel"
                data-testid="mf-transfer-cancel"
                onClick={onClose}
                style={{ flex: 1 }}
              >
                {t('minhasfinancas.cancel')}
              </button>
              <button
                type="submit"
                className="btn-primary"
                data-testid="mf-transfer-confirm"
                disabled={saving}
                style={{ flex: 2 }}
              >
                {saving ? '…' : t('minhasfinancas.transfer_confirm')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
