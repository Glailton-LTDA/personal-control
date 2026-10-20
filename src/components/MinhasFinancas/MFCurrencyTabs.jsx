import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { currencyFlag, useMFNarrowScreen } from '../../hooks/useMinhasFinancas';

/**
 * Moedas (Contas e Resumo): no largo, abas visíveis [Todas] [BRL] [USD]…;
 * no estreito (≤768px), um botão com a moeda ativa que abre um
 * bottom-sheet com as opções — a régua de abas vazava da tela e não pode
 * gerar rolagem lateral no mobile. Com a moeda escolhida, KPIs e listas
 * mostram SÓ aquela moeda (nunca somamos moedas distintas); "Todas" mantém
 * o comportamento atual (totais separados por moeda).
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
  const isNarrow = useMFNarrowScreen();
  const [open, setOpen] = useState(false);
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

  const pick = (next) => {
    onChange?.(next);
    setOpen(false);
  };

  const options = [
    { code: 'all', label: t('minhasfinancas.currency_all') },
    ...ordered.map((code) => ({
      code,
      label: (
        <>
          <span aria-hidden>{currencyFlag(code)}</span>
          {code}
          {counts[code] != null && (
            <span style={{ opacity: 0.75, fontWeight: 600 }}>· {counts[code]}</span>
          )}
        </>
      ),
    })),
  ];

  if (isNarrow) {
    const active = options.find((opt) => opt.code === value) ?? options[0];
    return (
      <span style={{ position: 'relative' }}>
        {open && (
          <span
            data-testid={`${testId}-overlay`}
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 89, background: 'rgba(0, 0, 0, 0.55)' }}
          />
        )}
        <button
          type="button"
          data-testid={`${testId}-menu`}
          aria-expanded={open}
          aria-label={t('minhasfinancas.currency_label')}
          onClick={() => setOpen((prev) => !prev)}
          style={{ ...tabStyle(value !== 'all'), maxWidth: '100%' }}
        >
          {active.label}
          <ChevronDown size={14} />
        </button>
        {open && (
          <span
            data-testid={`${testId}-sheet`}
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 90,
              maxHeight: '60vh',
              overflowY: 'auto',
              background: 'var(--glass-bg, #1e293b)',
              border: '1px solid var(--glass-border)',
              borderRadius: '16px 16px 0 0',
              padding: '0.9rem 1rem calc(1rem + env(safe-area-inset-bottom))',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              boxShadow: '0 -12px 32px rgba(0,0,0,0.5)',
            }}
          >
            <span style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0.1rem 0.3rem' }}>
              {t('minhasfinancas.currency_label')}
            </span>
            {options.map((opt) => (
              <button
                key={opt.code}
                type="button"
                role="tab"
                aria-selected={value === opt.code}
                data-testid={`${testId}-${opt.code}`}
                onClick={() => pick(opt.code)}
                style={{
                  ...tabStyle(value === opt.code),
                  justifyContent: 'flex-start',
                  width: '100%',
                }}
              >
                {opt.label}
              </button>
            ))}
          </span>
        )}
      </span>
    );
  }

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
      {options.map((opt) => (
        <button
          key={opt.code}
          type="button"
          role="tab"
          aria-selected={value === opt.code}
          data-testid={`${testId}-${opt.code}`}
          onClick={() => onChange?.(opt.code)}
          style={tabStyle(value === opt.code)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
