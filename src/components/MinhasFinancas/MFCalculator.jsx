import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Delete } from 'lucide-react';
import { parseMoney } from '../../hooks/useMinhasFinancas';

/**
 * Calculadora monetária do Minhas Finanças (print original): display da
 * expressão + teclado
 *
 *   C   %   ⌫   ÷
 *   7   8   9   ×
 *   4   5   6   −
 *   1   2   3   +
 *   00  0   ,   ✓
 *
 * `onConfirm('1234,56')` devolve o resultado com 2 casas (vírgula
 * decimal); `initial` entra como valor de partida (ex.: o valor atual).
 * Portal no body (igual MFChoiceDialog) para não sofrer o
 * containing-block do backdrop-filter dos pais.
 */

const round6 = (n) => Math.round(n * 1e6) / 1e6;

/** Aplica o operador pendente (× e ÷ com 0 evitam NaN/Infinity). */
const calcApply = (a, op, b) => {
  if (op === '+') return round6(a + b);
  if (op === '−') return round6(a - b);
  if (op === '×') return round6(a * b);
  if (op === '÷') return b === 0 ? 0 : round6(a / b);
  return b;
};

/** Entrada numérica ('1234,56') para exibição com separador de milhar. */
const fmtPreview = (n) => {
  try {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(n);
  } catch {
    return String(n);
  }
};

/** Número → entrada da calculadora ('1234,56'). */
const fmtEntry = (n) => String(round6(n)).replace('.', ',');

const KEY_ROWS = [
  ['C', '%', '⌫', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['00', '0', ',', '✓'],
];

const OP_TEST = { '÷': 'div', '×': 'mul', '−': 'sub', '+': 'add' };

const keyTestId = (key) => {
  if (key === 'C') return 'mf-calc-clear';
  if (key === '⌫') return 'mf-calc-backspace';
  if (key === '%') return 'mf-calc-percent';
  if (key === '✓') return 'mf-calc-confirm';
  if (key === ',') return 'mf-calc-comma';
  if (OP_TEST[key]) return `mf-calc-op-${OP_TEST[key]}`;
  return `mf-calc-${key}`;
};

export default function MFCalculator({
  testId = 'mf-calc',
  title,
  initial = '',
  onConfirm,
  onClose,
}) {
  const { t } = useTranslation();
  const [calc, setCalc] = useState(() => ({
    acc: null,
    op: null,
    entry: initial || '',
  }));

  const { acc, op, entry } = calc;
  const canConfirm = entry !== '' || acc !== null;

  const pressDigit = (d) =>
    setCalc((prev) => {
      if (prev.entry.replace(/\D/g, '').length >= 12) return prev;
      let next = prev.entry;
      if (d === '00') {
        next = next === '' || next === '0' ? '0' : `${next}00`;
      } else if (next === '' || next === '0') {
        next = d;
      } else {
        next = `${next}${d}`;
      }
      return { ...prev, entry: next };
    });

  const pressComma = () =>
    setCalc((prev) =>
      prev.entry.includes(',')
        ? prev
        : { ...prev, entry: prev.entry === '' ? '0,' : `${prev.entry},` }
    );

  const pressOperator = (o) =>
    setCalc((prev) => {
      if (prev.entry !== '') {
        const value = parseMoney(prev.entry);
        if (prev.acc !== null && prev.op) {
          return { acc: calcApply(prev.acc, prev.op, value), op: o, entry: '' };
        }
        return { acc: value, op: o, entry: '' };
      }
      if (prev.acc === null) return { acc: 0, op: o, entry: '' };
      return { ...prev, op: o }; // troca o operador pendente
    });

  const pressPercent = () =>
    setCalc((prev) => {
      const current = parseMoney(prev.entry || '0');
      const relative = prev.acc !== null && (prev.op === '+' || prev.op === '−');
      const out = relative ? (prev.acc * current) / 100 : current / 100;
      return { ...prev, entry: fmtEntry(out) };
    });

  const pressBackspace = () =>
    setCalc((prev) => ({ ...prev, entry: prev.entry.slice(0, -1) }));

  const pressClear = () => setCalc({ acc: null, op: null, entry: '' });

  const pressConfirm = () => {
    let result = null;
    if (entry !== '' && acc !== null && op) {
      result = calcApply(acc, op, parseMoney(entry));
    } else if (entry !== '') {
      result = parseMoney(entry);
    } else if (acc !== null) {
      result = acc;
    }
    if (result === null || !Number.isFinite(result)) return;
    onConfirm((Math.round(result * 100) / 100).toFixed(2).replace('.', ','));
  };

  const onKey = (key) => {
    if (key === 'C') return pressClear();
    if (key === '%') return pressPercent();
    if (key === '⌫') return pressBackspace();
    if (key === ',') return pressComma();
    if (key === '✓') return pressConfirm();
    if (OP_TEST[key]) return pressOperator(key);
    return pressDigit(key);
  };

  const display = entry !== '' ? entry : acc !== null ? fmtPreview(acc) : '0';
  const expr = op && acc !== null ? `${fmtPreview(acc)} ${op}` : ' ';

  const keyAria = (key) => {
    if (key === 'C') return t('minhasfinancas.calc_clear');
    if (key === '⌫') return t('minhasfinancas.calc_backspace');
    if (key === '%') return t('minhasfinancas.calc_percent');
    if (key === '✓') return t('minhasfinancas.calc_confirm');
    return key;
  };

  return createPortal(
    <div className="modal-overlay" data-testid={testId} onClick={onClose}>
      <div
        className="glass-card modal-content"
        style={{ maxWidth: 340 }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3
          data-testid={`${testId}-title`}
          style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 800 }}
        >
          {title ?? t('minhasfinancas.calc_title')}
        </h3>

        <div
          data-testid={`${testId}-display`}
          style={{
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid var(--glass-border)',
            borderRadius: 10,
            padding: '0.7rem 0.9rem',
            marginBottom: '0.9rem',
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <div
            data-testid={`${testId}-expr`}
            style={{ fontSize: '0.8rem', color: 'var(--text-muted)', minHeight: '1rem' }}
          >
            {expr}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, overflowX: 'auto' }}>{display}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
          {KEY_ROWS.flat().map((key) => {
            const isConfirm = key === '✓';
            const isOperator = Boolean(OP_TEST[key]);
            return (
              <button
                key={key}
                type="button"
                className={isConfirm ? 'btn-primary' : 'btn-cancel'}
                data-testid={keyTestId(key)}
                aria-label={keyAria(key)}
                title={keyAria(key)}
                disabled={isConfirm && !canConfirm}
                onClick={() => onKey(key)}
                style={{
                  padding: '0.7rem 0',
                  fontSize: key === '⌫' ? '0.95rem' : '1.05rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isOperator ? 'var(--primary)' : undefined,
                }}
              >
                {key === '⌫' ? <Delete size={16} /> : key}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
