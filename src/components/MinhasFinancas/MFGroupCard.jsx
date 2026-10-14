import React from 'react';
import MFGroupIcon from './MFGroupIcon';

/**
 * Card de grupo de contas (padrão único do widget do Resumo e do
 * drill-down): avatar + nome com elipse + subtítulo numa linha só +
 * total à direita. O `trailing` opcional (ex.: seta) vai após o total.
 */
export default function MFGroupCard({
  icon,
  name,
  subtitle,
  total = null,
  trailing = null,
  onOpen,
  testId,
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onOpen}
      title={name}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.7rem',
        padding: '0.9rem 1rem',
        borderRadius: 14,
        border: '1px solid var(--glass-border)',
        background: 'var(--input-bg)',
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        color: 'var(--text-main)',
        width: '100%',
        minWidth: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          display: 'grid',
          placeItems: 'center',
          fontSize: '1.15rem',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--primary) 22%, transparent), color-mix(in srgb, #8b5cf6 18%, transparent))',
          border: '1px solid var(--glass-border)',
          flexShrink: 0,
        }}
      >
        <MFGroupIcon icon={icon} name={name} size={30} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontWeight: 700,
            fontSize: '0.92rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </span>
        <span
          title={typeof subtitle === 'string' ? subtitle : undefined}
          style={{
            display: 'block',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {subtitle}
        </span>
      </span>
      {total != null && (
        <span
          style={{
            fontWeight: 800,
            fontSize: '0.88rem',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {total}
        </span>
      )}
      {trailing}
    </button>
  );
}
