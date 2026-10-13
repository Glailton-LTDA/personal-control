import React from 'react';
import { mfCategoryColor, mfCategoryInitial } from './MFCategoryIcons';
import MFAccountIcon from './MFAccountIcon';

/**
 * Bolha da categoria: emoji no círculo colorido, marca de banco
 * (brand:…) / glifo (glyph:…) via MFAccountIcon, ou a inicial (quando
 * ainda não tem ícone escolhido). Usada no seletor do lançamento e na
 * tela de gerenciar categorias.
 */
export default function MFCategoryAvatar({ category, size = 24 }) {
  const color = mfCategoryColor(category);
  const icon = category?.icon;

  // Marca/glifo: mesmo render das contas (logotipo embutido ou lucide).
  if (typeof icon === 'string' && icon.includes(':')) {
    return (
      <MFAccountIcon
        account={{ icon, name: category?.name, color }}
        size={size}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: color,
        color: '#fff',
        fontSize: Math.round(size * 0.52),
        fontWeight: 800,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {icon || mfCategoryInitial(category?.name)}
    </span>
  );
}
