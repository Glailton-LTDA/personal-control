import React from 'react';
import { MF_BRAND_ICONS, MF_BRAND_FILES, MF_GLYPH_ICONS } from './MFIconData';

// Marcas cujo logotipo oficial é um SVG preto (monocromático). O chip claro
// padrão deixaria o C6 "branco"; no chip escuro da marca o logo é invertido
// para branco — igual ao app de referência (quadrado preto, logo claro).
const DARK_CHIP_LOGOS = new Set(['c6']);

/** Tamanho da fonte do glifo de marca conforme o comprimento. */
const brandFontSize = (size, glyph) => {
  const len = glyph.length;
  return Math.round(size * (len <= 2 ? 0.42 : len === 3 ? 0.33 : 0.27));
};

/** Marca de fundo escuro (preto puro, #1C1C1C, Safra…) precisa de anel
 *  interno claro para não sumir no card do tema noturno. */
const isDarkBg = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 64;
};

/**
 * Ícone da conta/cartão: logotipo oficial embutido (quando existe),
 * marca aproximada, glifo genérico ou — sem ícone — a inicial do nome
 * com a cor da conta.
 */
export default function MFAccountIcon({ account, size = 26, style, ...rest }) {
  const raw = account?.icon || '';
  const [kind, key] = raw.includes(':') ? raw.split(':') : [null, null];
  const box = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.32),
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    lineHeight: 1,
    ...style,
  };

  if (kind === 'brand' && MF_BRAND_ICONS[key]) {
    const brand = MF_BRAND_ICONS[key];
    const file = MF_BRAND_FILES[key];
    if (file) {
      const darkChip = DARK_CHIP_LOGOS.has(key);
      // Chip claro com o logotipo oficial na cor original da marca; para
      // marcas de logo preto (C6) o fundo vira o da marca e o logo inverte
      // para branco — igual ao app de referência.
      return (
        <span
          title={account?.name}
          style={{
            ...box,
            background: darkChip ? brand.bg || '#000000' : '#ffffff',
            boxShadow: darkChip
              ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.18)'
              : 'inset 0 0 0 1px rgba(15, 23, 42, 0.12)',
            overflow: 'hidden',
          }}
          {...rest}
        >
          <img
            src={`${import.meta.env.BASE_URL || '/'}mf-brands/${file}`}
            alt=""
            style={{
              width: Math.round(size * 0.74),
              height: Math.round(size * 0.74),
              objectFit: 'contain',
              display: 'block',
              ...(darkChip ? { filter: 'invert(1)' } : {}),
            }}
          />
        </span>
      );
    }
    return (
      <span
        title={account?.name}
        style={{
          ...box,
          background: brand.bg,
          color: brand.fg,
          fontWeight: 800,
          fontSize: brandFontSize(size, brand.glyph),
          letterSpacing: '-0.03em',
          ...(isDarkBg(brand.bg)
            ? { boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.18)' }
            : {}),
        }}
        {...rest}
      >
        {brand.glyph}
      </span>
    );
  }

  if (kind === 'glyph' && MF_GLYPH_ICONS[key]) {
    const Glyph = MF_GLYPH_ICONS[key];
    const tint = account?.color || 'var(--primary)';
    return (
      <span
        title={account?.name}
        style={{
          ...box,
          background: `color-mix(in srgb, ${tint} 22%, transparent)`,
          color: tint,
        }}
        {...rest}
      >
        <Glyph size={Math.max(13, Math.round(size * 0.55))} />
      </span>
    );
  }

  // Fallback: inicial com a cor da conta
  const initial = (account?.name || '?').trim().charAt(0).toUpperCase();
  return (
    <span
      title={account?.name}
      style={{
        ...box,
        background: account?.color || 'var(--primary)',
        color: '#fff',
        fontWeight: 800,
        fontSize: Math.round(size * 0.44),
      }}
      {...rest}
    >
      {initial}
    </span>
  );
}
