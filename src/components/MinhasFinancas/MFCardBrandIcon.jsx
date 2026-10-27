import React from 'react';
import { CreditCard } from 'lucide-react';
import MFAccountIcon from './MFAccountIcon';
import { MF_BRAND_ICONS } from './MFIconData';

/**
 * Ícone da bandeira do cartão (`mf_accounts.card_brand`): reusa o sistema
 * do MFAccountIcon — logotipo oficial embutido (public/mf-brands/ via
 * MF_BRAND_FILES) quando existe, senão o quadradinho da marca
 * (MF_BRAND_ICONS). Marcas fora do catálogo (ex.: 'outro') caem num
 * genérico de cartão.
 */
export default function MFCardBrandIcon({ brand, size = 18, title }) {
  if (!brand) return null;
  // O banco guarda a bandeira com capitalização variada ("Mastercard",
  // "mastercard"); o catálogo é minúsculo.
  const key = String(brand).toLowerCase();

  if (MF_BRAND_ICONS[key]) {
    return (
      <MFAccountIcon
        account={{ icon: `brand:${key}`, name: title || brand }}
        size={size}
        data-testid={`mf-brand-icon-${key}`}
      />
    );
  }

  return (
    <span
      data-testid={`mf-brand-fallback-${key}`}
      title={title || brand}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: 'color-mix(in srgb, var(--primary) 20%, transparent)',
        color: 'var(--primary)',
      }}
    >
      <CreditCard size={Math.max(11, Math.round(size * 0.6))} />
    </span>
  );
}
