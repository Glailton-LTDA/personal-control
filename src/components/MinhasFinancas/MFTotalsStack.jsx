import React from 'react';
import { formatMoney } from '../../hooks/useMinhasFinancas';

/**
 * Totais por moeda empilhados (uma moeda por linha, BRL primeiro) —
 * alternativa legível ao `formatTotals` ("R$ · US$ · € · £" lado a lado
 * estoura o card com muitas moedas). `totals` = { BRL: n, USD: n }.
 * Cada linha ganha `${testId}-line-${code}` quando há testId.
 *
 * - `hero`: a primeira linha (BRL) sai em destaque (peso 800) e as demais
 *   ficam menores e discretas — saldo real em grande, o resto embaixo
 *   (só a sigla, sem bandeira — padrão do mock de referência).
 * - `align`: 'left' | 'center' | 'right'.
 * - `mutedNegative`: valores na cor do rótulo (muted) e vermelhos quando
 *   negativos — lógica de cor da tela Contas (previsão).
 * - `redNegative`: mantém a cor herdada e pinta de vermelho só quando
 *   negativo — saldo na tela Contas.
 */
export default function MFTotalsStack({
  totals = {},
  showValues = true,
  prefix = '',
  testId,
  fontSize,
  align = 'left',
  lineHeight = 1.35,
  hero = false,
  mutedNegative = false,
  redNegative = false,
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
        alignItems:
          align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        textAlign: align,
        fontSize,
        lineHeight,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {codes.map((code, index) => {
        const isRest = hero && index > 0;
        const baseStyle = isRest
          ? { fontSize: '0.66em', color: 'var(--text-muted)', fontWeight: 600 }
          : hero
            ? { fontWeight: 800 }
            : undefined;
        const style =
          mutedNegative || redNegative
            ? {
                ...baseStyle,
                color: totals[code] < 0
                  ? 'var(--danger)'
                  : mutedNegative
                    ? 'var(--text-muted)'
                    : baseStyle?.color,
              }
            : baseStyle;
        return (
          <span
            key={code}
            data-testid={testId ? `${testId}-line-${code}` : undefined}
            style={style}
          >
            {prefix}
            {formatMoney(totals[code], code)}
          </span>
        );
      })}
    </span>
  );
}
