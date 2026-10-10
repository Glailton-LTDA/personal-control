import React from 'react';
import { mfCategoryColor, mfCategoryInitial } from './MFCategoryIcons';

/**
 * Bolha da categoria: emoji no círculo colorido ou a inicial (quando
 * ainda não tem ícone escolhido). Usada no seletor do lançamento e na
 * tela de gerenciar categorias.
 */
export default function MFCategoryAvatar({ category, size = 24 }) {
  const color = mfCategoryColor(category);
  const icon = category?.icon;
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
