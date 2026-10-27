import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import MFAccountIcon from './MFAccountIcon';
import { MF_CATEGORY_ICONS, mfIconMatches, mfNormalize } from './MFCategoryIcons';
import { MF_BRAND_ICONS, MF_GLYPH_FAMILIES, MF_GLYPH_ICONS, MF_GLYPH_KEYWORDS } from './MFIconData';

/**
 * Seletor de ícone (padrão do Minhas Finanças original): busca + grade de
 * emojis + marcas + glifos genéricos. Valor: emoji cru, `brand:<chave>`,
 * `glyph:<chave>` ou null. `testIdPrefix` mantém os testIds de quem monta
 * (ex.: `mf-cat-modal` → `mf-cat-modal-icon-0`).
 */
export default function MFIconPicker({
  icon,
  onChange,
  color,
  testIdPrefix = 'mf-icon',
  showBrands = true,
  showGlyphs = true,
}) {
  const { t } = useTranslation();
  const [iconSearch, setIconSearch] = useState('');
  const visibleIcons = useMemo(
    () => MF_CATEGORY_ICONS.filter((emoji) => mfIconMatches(emoji, iconSearch)),
    [iconSearch]
  );
  const iconNeedle = mfNormalize(iconSearch.trim());
  const visibleBrands = useMemo(
    () =>
      (showBrands
        ? Object.entries(MF_BRAND_ICONS).filter(
            ([key, brand]) =>
              !iconNeedle ||
              mfNormalize(key).includes(iconNeedle) ||
              mfNormalize(brand.name).includes(iconNeedle)
          )
        : []),
    [iconNeedle, showBrands]
  );
  const visibleGlyphs = useMemo(
    () =>
      (showGlyphs
        ? Object.keys(MF_GLYPH_ICONS).filter(
            (key) =>
              !iconNeedle ||
              mfNormalize(key).includes(iconNeedle) ||
              mfNormalize(MF_GLYPH_KEYWORDS[key] ?? '').includes(iconNeedle)
          )
        : []),
    [iconNeedle, showGlyphs]
  );

  const glyphGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(42px, 1fr))',
    gap: '0.4rem',
  };

  const glyphButton = (key) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={icon === `glyph:${key}`}
      aria-label={key}
      title={key}
      data-testid={`${testIdPrefix}-glyph-${key}`}
      onClick={() => onChange(`glyph:${key}`)}
      style={{
        height: 40,
        borderRadius: 10,
        border:
          icon === `glyph:${key}`
            ? '2px solid var(--primary)'
            : '1px solid var(--glass-border)',
        background: 'transparent',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      <MFAccountIcon account={{ icon: `glyph:${key}`, color }} size={24} />
    </button>
  );

  return (
    <div
      style={{
        maxHeight: 220,
        overflowY: 'auto',
        paddingRight: '0.15rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          className="glass-input"
          data-testid={`${testIdPrefix}-icon-search`}
          value={iconSearch}
          onChange={(event) => setIconSearch(event.target.value)}
          placeholder={t('minhasfinancas.cfg_icon_search')}
          style={{ width: '100%', padding: '0.5rem 2.2rem 0.5rem 0.8rem', fontSize: '0.85rem' }}
        />
        {iconSearch !== '' && (
          <button
            type="button"
            className="icon-btn"
            data-testid={`${testIdPrefix}-icon-search-clear`}
            aria-label={t('minhasfinancas.search_clear')}
            title={t('minhasfinancas.search_clear')}
            onClick={() => setIconSearch('')}
            style={{
              position: 'absolute',
              right: '0.35rem',
              top: '50%',
              transform: 'translateY(-60%)',
              padding: '0.25rem',
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Emojis */}
      <div
        role="radiogroup"
        aria-label={t('minhasfinancas.cfg_categories')}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(42px, 1fr))',
          gap: '0.4rem',
        }}
      >
        <button
          type="button"
          role="radio"
          aria-checked={!icon}
          aria-label={t('minhasfinancas.cancel')}
          data-testid={`${testIdPrefix}-icon-none`}
          onClick={() => onChange(null)}
          style={{
            height: 40,
            borderRadius: 10,
            border:
              !icon ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
            background: 'var(--input-bg, transparent)',
            color: 'var(--text-muted)',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          ∅
        </button>
        {visibleIcons.map((emoji, index) => (
          <button
            key={emoji}
            type="button"
            role="radio"
            aria-checked={icon === emoji}
            aria-label={emoji}
            data-testid={`${testIdPrefix}-icon-${index}`}
            onClick={() => onChange(emoji)}
            style={{
              height: 40,
              borderRadius: 10,
              border:
                icon === emoji ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
              background: 'transparent',
              fontSize: '1.15rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Marcas de banco/cartão — logotipo oficial embutido */}
      {visibleBrands.length > 0 && (
        <div
          role="radiogroup"
          aria-label={t('minhasfinancas.icon_brands')}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(42px, 1fr))',
            gap: '0.4rem',
          }}
        >
          {visibleBrands.map(([key, brand]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={icon === `brand:${key}`}
              aria-label={brand.name}
              title={brand.name}
              data-testid={`${testIdPrefix}-brand-${key}`}
              onClick={() => onChange(`brand:${key}`)}
              style={{
                height: 40,
                borderRadius: 10,
                border:
                  icon === `brand:${key}`
                    ? '2px solid var(--primary)'
                    : '1px solid var(--glass-border)',
                background: 'transparent',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              <MFAccountIcon account={{ icon: `brand:${key}`, name: brand.name }} size={26} />
            </button>
          ))}
        </div>
      )}

      {/* Glifos genéricos (lucide) — agrupados por família quando não há
          busca; na busca sai uma grade única com os resultados. */}
      {visibleGlyphs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {iconNeedle ? (
            <div
              role="radiogroup"
              aria-label={t('minhasfinancas.icon_generics')}
              style={glyphGridStyle}
            >
              {visibleGlyphs.map(glyphButton)}
            </div>
          ) : (
            MF_GLYPH_FAMILIES.map((family) => {
              const keys = family.icons.filter((key) => visibleGlyphs.includes(key));
              if (keys.length === 0) return null;
              return (
                <div
                  key={family.key}
                  data-testid={`${testIdPrefix}-glyph-family-${family.key}`}
                >
                  <p
                    style={{
                      margin: '0 0 0.3rem',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {t(family.labelKey)}
                  </p>
                  <div
                    role="radiogroup"
                    aria-label={t(family.labelKey)}
                    style={glyphGridStyle}
                  >
                    {keys.map(glyphButton)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {visibleIcons.length === 0 &&
        visibleBrands.length === 0 &&
        visibleGlyphs.length === 0 && (
          <p
            data-testid={`${testIdPrefix}-icon-empty`}
            style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}
          >
            {t('minhasfinancas.icon_search_empty')}
          </p>
        )}
    </div>
  );
}
