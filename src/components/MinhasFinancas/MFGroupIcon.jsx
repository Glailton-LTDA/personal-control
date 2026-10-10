import React from 'react';
import MFAccountIcon from './MFAccountIcon';

/**
 * Ícone de grupo: marca de banco (brand:…) ou glifo (glyph:…) via
 * MFAccountIcon; emoji puro renderizado como texto (padrão do app).
 */
export default function MFGroupIcon({ icon, name, color, size = 26, style, ...rest }) {
  const raw = icon || '';
  if (raw.includes(':')) {
    return (
      <MFAccountIcon
        account={{ icon: raw, name, color }}
        size={size}
        style={style}
        {...rest}
      />
    );
  }
  return (
    <span
      title={name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.66),
        lineHeight: 1,
        ...style,
      }}
      {...rest}
    >
      {raw || '📁'}
    </span>
  );
}
