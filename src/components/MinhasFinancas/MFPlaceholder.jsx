import React from 'react';
import { useTranslation } from 'react-i18next';
import { Construction } from 'lucide-react';

/**
 * Placeholder das abas que ainda serão implementadas nas próximas fases.
 */
export default function MFPlaceholder({ mode }) {
  const { t } = useTranslation();
  const tabLabel = t(`nav.sub.minhasfinancas.${mode}`);

  return (
    <div
      className="glass-card"
      data-testid={`mf-placeholder-${mode}`}
      style={{ padding: '4rem 2rem', textAlign: 'center' }}
    >
      <div style={{
        width: 64,
        height: 64,
        borderRadius: 18,
        background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--primary)',
        margin: '0 auto 1.25rem'
      }}>
        <Construction size={30} />
      </div>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        {t('minhasfinancas.coming_soon')}
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: 0 }}>
        {t('minhasfinancas.coming_soon_desc', { tab: tabLabel })}
      </p>
    </div>
  );
}
