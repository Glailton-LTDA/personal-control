import React from 'react';
import { formatMoney } from '../../hooks/useMinhasFinancas';

/**
 * Totais por moeda empilhados (uma moeda por linha, BRL primeiro) —
 * alternativa legível ao `formatTotals` ("R$ · US$ · € · £" lado a lado
 * estoura o card com muitas moedas). `totals` = { BRL: n, USD: n }.
 * Cada linha ganha `${testId}-line-${code}` quando há testId.
 */
export default function MFTotalsStack({
  totals = {},
  showValues = true,
  prefix = '',
  testId,
  fontSize,
  align = 'left',
  lineHeight = 1.35,
}) {
  const codes = Object.keys(totals).sort((a, b) =>
    a === 'BRL' ? -1 : b === 'BRL' ? 1 : String(a).localeCompare(String(b))
  );
  if (!showValues) return <span>•••</span>;
  if (codes.length === 0) return <span>{`${prefix}${formatMoney(0)}`}</span>;
  return (
    <span
      data-testid={testId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.15rem',
        align: align === 'right' ? 'flex-end' : 'flex-start',
        textAlign: align,
        fontSize,
        lineHeight,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {codes.map((code) => (
        <span key={code} data-testid={testId ? `${testId}-line-${code}` : undefined}>
          {prefix}
          {formatMoney(totals[code], code)}
        </span>
      ))}
    </span>
  );
}
