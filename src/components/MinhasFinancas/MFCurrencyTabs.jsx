import React from 'react';
import { useTranslation } from 'react-i18next';
import { currencyFlag } from '../../hooks/useMinhasFinancas';

/**
 * Abas de moeda (Contas e Resumo): [Todas] [BRL] [USD]… — a mesma régua
 * do filtro dropdown, mas visível de cara. Com a aba de uma moeda, KPIs
 * e listas mostram SÓ aquela moeda (nunca somamos moedas distintas);
 * "Todas" mantém o comportamento atual (totais separados por moeda).
 * `counts`: { BRL: 12 } opcional (contas não arquivadas por moeda).
 */
export default function MFCurrencyTabs({
  currencies = [],
  counts = {},
  value = 'all',
  onChange,
  testId = 'mf-currency-tabs',
}) {
  const { t } = useTranslation();
  const ordered = [...new Set(currencies)].sort((a, b) =>
    a === 'BRL' ? -1 : b === 'BRL' ? 1 : String(a).localeCompare(String(b))
  );

  const tabStyle = (active) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.5rem 0.9rem',
    borderRadius: 999,
    border: '1px solid var(--glass-border)',
    background: active ? 'color-mix(in srgb, var(--primary) 16%, transparent)' : 'transparent',
    color: active ? 'var(--primary)' : 'var(--text-muted)',
    borderColor: active ? 'var(--primary)' : undefined,
    font: 'inherit',
    fontSize: '0.82rem',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  });

  return (
    <div
      role="tablist"
      aria-label={t('minhasfinancas.currency_label')}
      data-testid={testId}
      style={{
        display: 'flex',
        gap: '0.5rem',
        overflowX: 'auto',
        paddingBottom: '0.15rem',
        maxWidth: '100%',
      }}
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'all'}
        data-testid={`${testId}-all`}
        onClick={() => onChange?.('all')}
        style={tabStyle(value === 'all')}
      >
        {t('minhasfinancas.currency_all')}
      </button>
      {ordered.map((code) => (
        <button
          key={code}
          type="button"
          role="tab"
          aria-selected={value === code}
          data-testid={`${testId}-${code}`}
          onClick={() => onChange?.(code)}
          style={tabStyle(value === code)}
        >
          <span aria-hidden>{currencyFlag(code)}</span>
          {code}
          {counts[code] != null && (
            <span style={{ opacity: 0.75, fontWeight: 600 }}>· {counts[code]}</span>
          )}
        </button>
      ))}
    </div>
  );
}
