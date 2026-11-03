import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, Delete } from 'lucide-react';
import { formatMoney, parseMoney } from '../../hooks/useMinhasFinancas';

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
  ['00', '0', ',', '='],
];

const OP_TEST = { '÷': 'div', '×': 'mul', '−': 'sub', '+': 'add' };

const keyTestId = (key) => {
  if (key === 'C') return 'mf-calc-clear';
  if (key === '⌫') return 'mf-calc-backspace';
  if (key === '%') return 'mf-calc-percent';
  if (key === '=') return 'mf-calc-equals';
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
  balance = null,
  balanceLabel = '',
  balanceCurrency = 'BRL',
  accounts = null,
  balances = {},
  selectedAccountId = '',
  onSelectAccount = null,
}) {
  const { t } = useTranslation();
  const dialogRef = useRef(null);
  const [calc, setCalc] = useState(() => ({
    acc: null,
    op: null,
    entry: initial || '',
    justEvaluated: false,
  }));

  const { acc, op, entry, justEvaluated } = calc;
  const canConfirm = entry !== '' || acc !== null;

  const calcAccounts = Array.isArray(accounts) ? accounts : [];
  const selectedAccount =
    calcAccounts.find((account) => account.id === selectedAccountId) ?? null;
  const contextBalance = calcAccounts.length > 0
    ? balances?.[selectedAccountId]
    : balance;
  const contextCurrency = selectedAccount?.currency || balanceCurrency || 'BRL';
  const contextLabel = selectedAccount?.name || balanceLabel;
  const hasContext =
    calcAccounts.length > 0 ||
    (balance !== null && balance !== undefined && Number.isFinite(Number(balance)));

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const pressBalance = () => {
    const value = Number(contextBalance);
    if (!Number.isFinite(value)) return;
    setCalc((prev) => ({
      ...prev,
      entry: fmtEntry(value),
      justEvaluated: false,
    }));
  };

  const pressDigit = (d) =>
    setCalc((prev) => {
      if (prev.justEvaluated) {
        return {
          acc: null,
          op: null,
          entry: d === '00' ? '0' : d,
          justEvaluated: false,
        };
      }
      if (prev.entry.replace(/\D/g, '').length >= 12) return prev;
      let next = prev.entry;
      if (d === '00') {
        next = next === '' || next === '0' ? '0' : `${next}00`;
      } else if (next === '' || next === '0') {
        next = d;
      } else {
        next = `${next}${d}`;
      }
      return { ...prev, entry: next, justEvaluated: false };
    });

  const pressComma = () =>
    setCalc((prev) => {
      if (prev.justEvaluated) {
        return { acc: null, op: null, entry: '0,', justEvaluated: false };
      }
      if (prev.entry.includes(',')) return prev;
      return {
        ...prev,
        entry: prev.entry === '' ? '0,' : `${prev.entry},`,
        justEvaluated: false,
      };
    });

  const pressOperator = (o) =>
    setCalc((prev) => {
      if (prev.entry !== '') {
        const value = parseMoney(prev.entry);
        if (prev.acc !== null && prev.op) {
          return {
            acc: calcApply(prev.acc, prev.op, value),
            op: o,
            entry: '',
            justEvaluated: false,
          };
        }
        return { acc: value, op: o, entry: '', justEvaluated: false };
      }
      if (prev.acc === null) {
        return { acc: 0, op: o, entry: '', justEvaluated: false };
      }
      return { ...prev, op: o, justEvaluated: false }; // troca o operador pendente
    });

  const pressPercent = () =>
    setCalc((prev) => {
      const current = parseMoney(prev.entry || '0');
      const relative = prev.acc !== null && (prev.op === '+' || prev.op === '−');
      const out = relative ? (prev.acc * current) / 100 : current / 100;
      return { ...prev, entry: fmtEntry(out), justEvaluated: false };
    });

  const pressBackspace = () =>
    setCalc((prev) => ({
      ...prev,
      entry: prev.entry.slice(0, -1),
      justEvaluated: false,
    }));

  const pressClear = () =>
    setCalc({ acc: null, op: null, entry: '', justEvaluated: false });

  /** `=` calcula e mantém a calculadora aberta; o check aplica e fecha. */
  const pressEquals = () =>
    setCalc((prev) => {
      let result = null;
      if (prev.entry !== '' && prev.acc !== null && prev.op) {
        result = calcApply(prev.acc, prev.op, parseMoney(prev.entry));
      } else if (prev.entry !== '') {
        result = parseMoney(prev.entry);
      } else if (prev.acc !== null) {
        result = prev.acc;
      }
      if (result === null || !Number.isFinite(result)) return prev;
      return {
        acc: null,
        op: null,
        entry: fmtEntry(result),
        justEvaluated: true,
      };
    });

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
    if (key === '=') return pressEquals();
    if (OP_TEST[key]) return pressOperator(key);
    return pressDigit(key);
  };

  /** Teclado físico: números, operadores, Enter confirma, Esc limpa/fecha. */
  const onDialogKeyDown = (event) => {
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key;
    let handled = true;
    if (/^[0-9]$/.test(key)) pressDigit(key);
    else if (key === ',' || key === '.') pressComma();
    else if (key === '+') pressOperator('+');
    else if (key === '-') pressOperator('−');
    else if (key === '*' || key.toLowerCase() === 'x') pressOperator('×');
    else if (key === '/') pressOperator('÷');
    else if (key === '%') pressPercent();
    else if (key === 'Backspace') pressBackspace();
    else if (key === 'Enter') pressConfirm();
    else if (key === '=') pressEquals();
    else if (key === 'Escape') {
      if (entry === '' && acc === null && op === null) onClose();
      else pressClear();
    } else handled = false;

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const display = entry !== '' ? entry : acc !== null ? fmtPreview(acc) : '0';
  const expr = justEvaluated
    ? '='
    : op && acc !== null
      ? `${fmtPreview(acc)} ${op}`
      : ' ';

  const keyAria = (key) => {
    if (key === 'C') return t('minhasfinancas.calc_clear');
    if (key === '⌫') return t('minhasfinancas.calc_backspace');
    if (key === '%') return t('minhasfinancas.calc_percent');
    if (key === '=') return t('minhasfinancas.calc_equals');
    return key;
  };

  return createPortal(
    <div className="modal-overlay" data-testid={testId} onClick={onClose}>
      <div
        ref={dialogRef}
        className="glass-card modal-content"
        style={{ maxWidth: 340 }}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? t('minhasfinancas.calc_title')}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <h3
          data-testid={`${testId}-title`}
          style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 800 }}
        >
          {title ?? t('minhasfinancas.calc_title')}
        </h3>

        {hasContext && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.45rem',
              alignItems: 'stretch',
              marginBottom: '0.75rem',
            }}
          >
            {calcAccounts.length > 0 && (
              <select
                className="glass-input"
                data-testid="mf-calc-account"
                aria-label={t('minhasfinancas.tx_account_label')}
                value={selectedAccountId}
                onChange={(event) => onSelectAccount?.(event.target.value)}
                style={{ flex: 1, minWidth: 130, padding: '0.45rem 0.55rem', fontSize: '0.8rem' }}
              >
                {calcAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="btn-cancel"
              data-testid="mf-calc-balance"
              disabled={!Number.isFinite(Number(contextBalance))}
              onClick={pressBalance}
              title={`${t('minhasfinancas.calc_insert_balance')}${
                contextLabel && calcAccounts.length === 0 ? ` (${contextLabel})` : ''
              }`}
              style={{
                padding: '0.45rem 0.65rem',
                fontSize: '0.75rem',
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              {t('minhasfinancas.calc_insert_balance')}
              {contextLabel && calcAccounts.length === 0 ? ` (${contextLabel})` : ''}:{' '}
              {Number.isFinite(Number(contextBalance))
                ? formatMoney(contextBalance, contextCurrency)
                : '—'}
            </button>
          </div>
        )}

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
            const isOperator = Boolean(OP_TEST[key]);
            const isEquals = key === '=';
            return (
              <button
                key={key}
                type="button"
                className={isEquals ? 'btn-primary' : 'btn-cancel'}
                data-testid={keyTestId(key)}
                aria-label={keyAria(key)}
                title={keyAria(key)}
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

        <button
          type="button"
          className="btn-primary"
          data-testid="mf-calc-confirm"
          aria-label={t('minhasfinancas.calc_confirm')}
          title={t('minhasfinancas.calc_confirm')}
          disabled={!canConfirm}
          onClick={pressConfirm}
          style={{
            marginTop: '0.5rem',
            width: '100%',
            padding: '0.7rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            fontWeight: 800,
          }}
        >
          <Check size={16} />
          {t('minhasfinancas.calc_confirm')}
        </button>
      </div>
    </div>,
    document.body
  );
}
