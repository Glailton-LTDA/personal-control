import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarDays, CreditCard, Wallet, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  usePayCardInvoice,
  useMFAccounts,
  buildCardPaymentTx,
  buildCardChargesTx,
  buildCardInstallmentPlan,
  cardCycles,
  addMonthsISO,
  parseMoney,
  maskAmount,
  formatMoney,
  toISODate,
} from '../../hooks/useMinhasFinancas';
import MFSelect from './MFSelect';

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const maskFromCents = (value) =>
  Number(value) > 0 ? Number(value).toFixed(2).replace('.', ',') : '';

/**
 * Pagamento de fatura (corrente ou fechada): valor editável (pagamento
 * parcial é permitido, até o em aberto) e o payload sai como DESPESA na
 * conta vinculada ao cartão: agendada no vencimento (PENDENTE) ou paga na
 * hora quando o vencimento já passou. `invoice_close` amarra o pagamento
 * à fatura certa para ela reagir imediatamente. O cartão não recebe
 * transação própria (só "fatura paga + valor pago" via vínculo).
 *
 * Também concentra os dois fluxos de pagamento atrasado:
 * - "Encargos": despesa separada na conta vinculada, sem entrar na fatura;
 * - "Parcelar fatura": entrada + parcelas nas próximas faturas, com um
 *   crédito no ciclo atual para zerar a parte financiada.
 */
export default function MFPaymentModal({ card, invoice, user, onClose }) {
  const { t } = useTranslation();
  const payInvoice = usePayCardInvoice();
  const { data: accounts = [] } = useMFAccounts(user);
  const [mode, setMode] = useState('pay');
  const [amount, setAmount] = useState('');
  const [charges, setCharges] = useState('');
  const [entry, setEntry] = useState('');
  const [count, setCount] = useState('12');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [firstDueISO, setFirstDueISO] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [saving, setSaving] = useState(false);

  const open = Number(invoice?.openAmount) || 0;
  const pendingBound = Number(invoice?.pendingBound) || 0;
  // Quanto ainda pode ser pago/realocado: em aberto + o que já está agendado
  // (espelho, item 30). Com a fatura agendada, confirmar reajusta A MESMA
  // linha — nunca um segundo débito.
  const payable = round(open + pendingBound);
  const today = toISODate(new Date());
  const dueISO = invoice?.dueISO || '';
  const scheduled = !!dueISO && dueISO > today;
  const overdue = !!dueISO && dueISO < today;
  const linkedAccount = accounts.find((row) => row.id === card?.linked_account_id) ?? null;

  // Fatura seguinte à que está sendo parcelada (não basta ser futura: a
  // corrente também é). Respeita o dia de vencimento cadastrado.
  const futureCycles = useMemo(() => {
    if (!card || !dueISO) return [];
    return cardCycles(card, today, 1, 13)
      .filter((cycle) => cycle.dueISO > dueISO && cycle.dueISO > today)
      .sort((a, b) => a.dueISO.localeCompare(b.dueISO));
  }, [card, dueISO, today]);
  const defaultFirstDue = futureCycles[0]?.dueISO || addMonthsISO(dueISO || today, 1);

  // Padrão: valor integral da fatura (máscara de centavos).
  useEffect(() => {
    setAmount(payable > 0 ? payable.toFixed(2).replace('.', ',') : '');
  }, [payable]);

  useEffect(() => {
    setEffectiveDate(today);
    setFirstDueISO(defaultFirstDue);
  }, [today, defaultFirstDue]);

  if (!card || !invoice) return null;

  const value = parseMoney(amount);
  const invalid = !(value > 0) || value > payable + 0.004;
  const chargesValue = round(parseMoney(charges));
  const totalDebit = round(value + chargesValue);

  const entryValue = round(parseMoney(entry));
  const countValue = Math.floor(Number(count) || 0);
  const eachValue = round(parseMoney(installmentAmount));
  const plan = buildCardInstallmentPlan({
    userId: user.id,
    card,
    invoice: { ...invoice, openAmount: payable },
    entry: entryValue,
    count: countValue,
    installmentAmount: eachValue,
    firstDueISO: firstDueISO || defaultFirstDue,
    effectiveDate: effectiveDate || today,
    description: t('minhasfinancas.card_installments_label'),
  });
  const installmentsInvalid = !plan || entryValue > payable + 0.004;

  const recalcInstallment = (nextEntry, nextCount) => {
    const remaining = round(payable - (parseMoney(nextEntry) || 0));
    const n = Math.floor(Number(nextCount) || 0);
    return n >= 2 && remaining > 0 ? maskFromCents(remaining / n) : '';
  };

  const openInstallments = () => {
    const nextCount = count || '12';
    setInstallmentAmount(recalcInstallment(entry, nextCount));
    if (!firstDueISO) setFirstDueISO(defaultFirstDue);
    if (!effectiveDate) setEffectiveDate(today);
    setMode('installments');
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
      const chargesPayload =
        overdue && chargesValue > 0
          ? buildCardChargesTx({
              userId: user.id,
              card,
              amount: chargesValue,
              description: t('minhasfinancas.card_charges_label'),
              date: today,
            })
          : null;
      await payInvoice.mutateAsync({
        card,
        invoice,
        payload,
        extraRows: chargesPayload ? [chargesPayload] : [],
      });
      toast.success(t('minhasfinancas.card_paid_toast'));
      onClose();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleInstallments = async () => {
    if (saving || installmentsInvalid) return;
    setSaving(true);
    try {
      await payInvoice.mutateAsync({
        card,
        invoice,
        payload: plan.entryPayload,
        extraRows: plan.extraRows,
      });
      toast.success(t('minhasfinancas.card_installments_done'));
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
              {mode === 'installments' ? <CreditCard size={22} /> : <Wallet size={22} />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {mode === 'installments'
                  ? t('minhasfinancas.card_installments_title')
                  : t('minhasfinancas.card_pay_amount_title')}
              </h3>
              <p
                style={{
                  margin: '0.2rem 0 0',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                }}
              >
                {card.name}
                {dueISO
                  ? ` · ${t('minhasfinancas.card_due_label')} ${fmtDate(dueISO)}`
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

        {mode === 'pay' ? (
          <>
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

            {overdue && (
              <div
                className="input-group"
                style={{ marginBottom: '0.75rem' }}
                data-testid="mf-pay-charges-wrap"
              >
                <label>{t('minhasfinancas.card_charges_label')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={charges}
                  data-testid="mf-pay-charges"
                  onChange={(event) => setCharges(maskAmount(event.target.value))}
                  placeholder="0,00"
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  {t('minhasfinancas.card_charges_hint')}
                </small>
              </div>
            )}

            {chargesValue > 0 && (
              <p
                data-testid="mf-pay-total-debit"
                style={{
                  margin: '0 0 0.6rem',
                  fontSize: '0.78rem',
                  color: '#f59e0b',
                  lineHeight: 1.5,
                }}
              >
                {t('minhasfinancas.card_charges_total', {
                  amount: formatMoney(totalDebit, card.currency || 'BRL'),
                  account: linkedAccount?.name || card.name,
                })}
              </p>
            )}

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
                    date: fmtDate(dueISO),
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
                flexWrap: 'wrap',
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
              {payable > 0 && (
                <button
                  type="button"
                  className="btn-cancel"
                  data-testid="mf-pay-installments-open"
                  onClick={openInstallments}
                  style={{
                    padding: '0.6rem 1rem',
                    fontSize: '0.85rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <CreditCard size={15} />
                  {t('minhasfinancas.card_installments_label')}
                </button>
              )}
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
          </>
        ) : (
          <>
            <p
              style={{
                margin: '0 0 0.9rem',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              {t('minhasfinancas.card_installments_desc')}
            </p>

            <div className="input-group" style={{ marginBottom: '0.7rem' }}>
              <label>{t('minhasfinancas.card_installments_entry')}</label>
              <input
                type="text"
                inputMode="numeric"
                value={entry}
                data-testid="mf-pay-installments-entry"
                onChange={(event) => {
                  const next = maskAmount(event.target.value);
                  setEntry(next);
                  setInstallmentAmount(recalcInstallment(next, count));
                }}
                placeholder="0,00"
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.7rem',
                marginBottom: '0.7rem',
              }}
            >
              <div className="input-group">
                <label>{t('minhasfinancas.card_installments_count')}</label>
                <MFSelect
                  testId="mf-pay-installments-count"
                  value={String(countValue)}
                  onChange={(next) => {
                    setCount(next);
                    setInstallmentAmount(recalcInstallment(entry, next));
                  }}
                  searchable={false}
                  options={Array.from({ length: 23 }, (_, index) => {
                    const n = index + 2;
                    return { value: String(n), label: `${n}x` };
                  })}
                />
              </div>
              <div className="input-group">
                <label>{t('minhasfinancas.card_installments_amount')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={installmentAmount}
                  data-testid="mf-pay-installments-amount"
                  onChange={(event) => setInstallmentAmount(maskAmount(event.target.value))}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.7rem',
                marginBottom: '0.7rem',
              }}
            >
              <div className="input-group">
                <label>{t('minhasfinancas.card_installments_first')}</label>
                <input
                  type="date"
                  value={firstDueISO}
                  data-testid="mf-pay-installments-first"
                  onChange={(event) => setFirstDueISO(event.target.value)}
                />
              </div>
              <div className="input-group">
                <label>{t('minhasfinancas.card_installments_effective')}</label>
                <input
                  type="date"
                  value={effectiveDate}
                  data-testid="mf-pay-installments-effective"
                  onChange={(event) => setEffectiveDate(event.target.value)}
                />
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: '0.7rem' }}>
              <label>{t('minhasfinancas.card_installments_account')}</label>
              <input
                type="text"
                value={linkedAccount?.name || card.name}
                readOnly
                disabled
                data-testid="mf-pay-installments-account"
              />
            </div>

            <div
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: 12,
                padding: '0.7rem 0.85rem',
                fontSize: '0.8rem',
                lineHeight: 1.6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  {t('minhasfinancas.card_installments_financed')}
                </span>
                <strong>
                  {formatMoney(Math.max(0, payable - entryValue), card.currency || 'BRL')}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  {t('minhasfinancas.card_installments_total')}
                </span>
                <strong>
                  {plan
                    ? formatMoney(plan.total, card.currency || 'BRL')
                    : formatMoney(entryValue, card.currency || 'BRL')}
                </strong>
              </div>
              {plan && (
                <div
                  data-testid="mf-pay-installments-preview"
                  style={{ marginTop: '0.35rem', color: 'var(--text-muted)' }}
                >
                  {t('minhasfinancas.card_installments_preview', {
                    count: plan.count,
                    amount: formatMoney(plan.installmentAmount, card.currency || 'BRL'),
                    date: fmtDate(plan.firstDueISO),
                  })}
                </div>
              )}
            </div>

            {!plan && payable > 0 && entryValue >= payable - 0.004 && (
              <p
                data-testid="mf-pay-installments-error"
                style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: '#ef4444' }}
              >
                {t('minhasfinancas.card_installments_invalid_entry')}
              </p>
            )}

            <div
              className="modal-footer"
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.6rem',
                marginTop: '1.25rem',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                className="btn-cancel"
                data-testid="mf-pay-installments-back"
                onClick={() => setMode('pay')}
                style={{
                  padding: '0.6rem 1rem',
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <ArrowLeft size={15} />
                {t('minhasfinancas.card_installments_back')}
              </button>
              <button
                type="button"
                className="btn-primary"
                data-testid="mf-pay-installments-confirm"
                disabled={saving || installmentsInvalid}
                onClick={handleInstallments}
                style={{
                  padding: '0.6rem 1rem',
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  opacity: saving || installmentsInvalid ? 0.6 : 1,
                }}
              >
                <CalendarDays size={15} />
                {t('minhasfinancas.card_installments_confirm')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
