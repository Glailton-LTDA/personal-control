import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import MFSelect from './MFSelect';
import { formatMoney } from '../../hooks/useMinhasFinancas';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Stepper com valor + chevrons (repete o visual dos prints originais). */
function Stepper({ label, value, onChange, testId }) {
  const clamp = (next) => Math.max(1, Math.min(999, next));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}
    >
      <span style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span
          data-testid={testId}
          style={{
            minWidth: '2.4rem',
            textAlign: 'center',
            fontWeight: 800,
            fontSize: '1.05rem',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <button
            type="button"
            className="icon-btn"
            data-testid={`${testId}-inc`}
            aria-label={`${label} +`}
            onClick={() => onChange(clamp(value + 1))}
          >
            <ChevronUp size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            data-testid={`${testId}-dec`}
            aria-label={`${label} -`}
            onClick={() => onChange(clamp(value - 1))}
          >
            <ChevronDown size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal "Configurar Repetição" (opção "Parcelar ou repetir"): parcela
 * inicial + quantidade + periodicidade + alternador "Valor total | Valor
 * parcela" (padrão do app original). Com "Valor total", o digitado é
 * dividido entre as parcelas; com "Valor parcela", cada parcela tem o
 * valor digitado. "Concluir" aplica e seleciona o modo repetição.
 * Montado condicionalmente pelo pai (estado fresco a cada abertura).
 */
export default function MFRepeatModal({
  initial = 1,
  count = 2,
  periodicity = 'MONTHLY',
  amountMode = 'parcela',
  amount = 0,
  currency = 'BRL',
  onApply,
  onClose,
}) {
  const { t } = useTranslation();
  const [initialValue, setInitialValue] = useState(initial);
  const [quantity, setQuantity] = useState(count);
  const [period, setPeriod] = useState(periodicity);
  const [mode, setMode] = useState(amountMode);

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    padding: '1rem 0',
    borderBottom: '1px solid var(--glass-border)',
  };

  const per = quantity > 0 && mode === 'total' ? round2(amount / quantity) : amount;

  return createPortal(
    <div className="modal-overlay" data-testid="mf-repeat-modal" onClick={onClose}>
      <div
        className="glass-card modal-content"
        style={{ maxWidth: 480 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-repeat-close"
            aria-label={t('minhasfinancas.close')}
            onClick={onClose}
          >
            <X size={18} />
          </button>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
            {t('minhasfinancas.tx_repeat_modal_title')}
          </h3>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-repeat-confirm"
            onClick={() =>
              onApply({ initial: initialValue, count: quantity, periodicity: period, amountMode: mode })
            }
          >
            {t('minhasfinancas.tx_repeat_done')}
          </button>
        </div>

        <div style={rowStyle}>
          <Stepper
            label={t('minhasfinancas.tx_repeat_initial')}
            value={initialValue}
            onChange={setInitialValue}
            testId="mf-repeat-initial"
          />
        </div>
        <div style={rowStyle}>
          <Stepper
            label={t('minhasfinancas.tx_repeat_quantity')}
            value={quantity}
            onChange={setQuantity}
            testId="mf-repeat-quantity"
          />
        </div>

        <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: '0.6rem' }}>
          <div style={{ display: 'flex', border: '1px solid var(--glass-border)', borderRadius: 10, overflow: 'hidden' }}>
            {[
              { id: 'total', label: t('minhasfinancas.tx_repeat_total') },
              { id: 'parcela', label: t('minhasfinancas.tx_repeat_parcela') },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`mf-repeat-mode-${opt.id}`}
                aria-pressed={mode === opt.id}
                onClick={() => setMode(opt.id)}
                style={{
                  flex: 1,
                  padding: '0.6rem 0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  background: mode === opt.id ? 'var(--primary)' : 'transparent',
                  color: mode === opt.id ? '#fff' : 'var(--text-muted)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p
            data-testid="mf-repeat-preview"
            style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}
          >
            {t('minhasfinancas.tx_repeat_preview', {
              count: quantity,
              amount: formatMoney(per, currency),
            })}
          </p>
        </div>

        <div
          style={{
            ...rowStyle,
            borderBottom: 'none',
            paddingBottom: '0.4rem',
          }}
        >
          <span style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>
            {t('minhasfinancas.tx_repeat_periodicity')}
          </span>
          <div style={{ minWidth: 170 }}>
            <MFSelect
              testId="mf-repeat-periodicity"
              value={period}
              onChange={setPeriod}
              searchable={false}
              options={[
                { value: 'WEEKLY', label: t('minhasfinancas.tx_recurrence_weekly') },
                { value: 'MONTHLY', label: t('minhasfinancas.tx_recurrence_monthly') },
                { value: 'YEARLY', label: t('minhasfinancas.tx_recurrence_yearly') },
              ]}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
