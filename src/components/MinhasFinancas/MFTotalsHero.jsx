import React from 'react';
import { formatMoney } from '../../hooks/useMinhasFinancas';

/**
 * Valor de KPI no formato do mock de referência: a moeda principal (BRL,
 * ou a primeira do objeto) sai em destaque grande; as demais moedas viram
 * chips pequenos numa linha de baixo — só a sigla, sem bandeiras.
 * `totals` = { BRL: n, USD: n }. Cada linha ganha `${testId}-hero` e
 * `${testId}-chip-${code}` quando há testId.
 */
export default function MFTotalsHero({
  totals = {},
  showValues = true,
  testId,
  align = 'left',
}) {
  const codes = Object.keys(totals).sort((a, b) =>
    a === 'BRL' ? -1 : b === 'BRL' ? 1 : String(a).localeCompare(String(b))
  );
  if (!showValues) return <span>•••</span>;
  if (codes.length === 0) return <span>{formatMoney(0)}</span>;

  const [heroCode, ...restCodes] = codes;
  return (
    <span
      data-testid={testId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        alignItems: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        textAlign: align,
        minWidth: 0,
      }}
    >
      <span
        data-testid={testId ? `${testId}-hero` : undefined}
        style={{
          fontSize: '1.8rem',
          fontWeight: 800,
          lineHeight: 1.15,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatMoney(totals[heroCode], heroCode)}
      </span>
      {restCodes.length > 0 && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {restCodes.map((code) => (
            <span
              key={code}
              data-testid={testId ? `${testId}-chip-${code}` : undefined}
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                background: 'var(--card-action-bg, rgba(255, 255, 255, 0.06))',
                border: '1px solid var(--glass-border)',
                borderRadius: 999,
                padding: '0.15rem 0.55rem',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {formatMoney(totals[code], code)}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
