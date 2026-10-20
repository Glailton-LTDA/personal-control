import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Pontos de "Ignorar nos totais" (Ponto 3): conta marcada fica fora dos
 * KPIs do Resumo — o ponto vermelho avisa e o âmbar ecoa a cor do toggle
 * no formulário. Renderiza nada quando a conta não está marcada; o
 * tooltip/aria-label explica a marca (`minhasfinancas.ignore_in_totals`).
 */
export default function MFIgnoreDots({ show, style }) {
  const { t } = useTranslation();
  if (!show) return null;
  const label = t('minhasfinancas.ignore_in_totals');
  return (
    <span
      data-testid="mf-ignore-dots"
      title={label}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.2rem',
        flexShrink: 0,
        ...style,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b' }} />
    </span>
  );
}
