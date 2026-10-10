import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Globe, Search } from 'lucide-react';
import {
  MF_CURRENCIES,
  currencyFlag,
  currencyName,
  currencySymbol,
} from '../../hooks/useMinhasFinancas';

const normalize = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const triggerStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  background: 'var(--input-bg)',
  border: '1px solid var(--glass-border)',
  borderRadius: 12,
  padding: '0.65rem 0.9rem',
  color: 'var(--text-main)',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  cursor: 'pointer',
  maxWidth: 280,
};

const optionStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  width: '100%',
  padding: '0.5rem 0.6rem',
  border: 'none',
  borderRadius: 10,
  background: 'transparent',
  color: 'var(--text-main)',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
};

/**
 * Seletor de moeda melhorado (substitui o <select> simples):
 * botão com bandeira + código + nome e popover com busca,
 * bandeira, nome localizado e símbolo de cada moeda.
 */
export default function MFCurrencySelect({
  value = 'all',
  onChange,
  currencies = MF_CURRENCIES,
  includeAll = false,
  allLabel,
  label,
  testId = 'mf-currency-select',
  style,
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const popRef = useRef(null);

  /**
   * Ancora o popover no gatilho com `position: fixed` (portal no body).
   * O `absolute` original morria dentro de `.glass-card`/modais
   * (backdrop-filter cria stacking context): o z-index do popover ficava
   * preso no contexto do cabeçalho e o conteúdo irmão (KPIs) pintava por
   * cima. Com fixed no body o popover disputa z-index na raiz (1100).
   */
  const place = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(320, window.innerWidth - 16);
    let right = window.innerWidth - rect.right;
    if (right < 8) right = 8;
    else if (right + width > window.innerWidth - 8) right = window.innerWidth - width - 8;
    let top = rect.bottom + 6;
    const maxH = 348; // altura aproximada do popover (busca + lista)
    if (top + maxH > window.innerHeight - 8) {
      const above = rect.top - maxH - 6;
      top = above >= 8 ? above : Math.max(8, window.innerHeight - maxH - 8);
    }
    setPos({ top, right });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handleMouseDown = (event) => {
      const inRoot = rootRef.current?.contains(event.target);
      const inPopover = popRef.current?.contains(event.target);
      if (!inRoot && !inPopover) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const handleReposition = () => place();
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    // captura: reposiciona quando QUALQUER área com scroll rolar
    document.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      document.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, place]);

  const language = i18n.language;
  const isAll = value === 'all';

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    if (!term) return currencies;
    return currencies.filter(
      (code) => normalize(code).includes(term) || normalize(currencyName(code, language)).includes(term)
    );
  }, [currencies, search, language]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      setSearch('');
      return;
    }
    place(); // ancora antes de abrir (mesmo batch de render)
    setSearch('');
    setOpen(true);
  };

  const select = (code) => {
    onChange?.(code);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block', ...style }}>
      <button
        type="button"
        className="glass-input"
        data-testid={testId}
        aria-label={label ?? t('minhasfinancas.currency_label')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        style={{
          ...triggerStyle,
          width: '100%',
          justifyContent: 'space-between',
          ...(open ? { border: '1px solid var(--primary)' } : null),
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          {isAll ? (
            <Globe size={16} style={{ flexShrink: 0 }} />
          ) : (
            <span style={{ fontSize: '1.05rem', lineHeight: 1, flexShrink: 0 }}>{currencyFlag(value)}</span>
          )}
          <span style={{ fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.03em' }}>
            {isAll ? null : value}
          </span>
          <span
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {isAll ? allLabel ?? t('minhasfinancas.currency_all') : currencyName(value, language)}
          </span>
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          role="listbox"
          data-testid="mf-currency-popover"
          style={{
            position: 'fixed',
            top: pos.top,
            right: pos.right,
            zIndex: 1100,
            width: 320,
            maxWidth: '90vw',
            padding: '0.6rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--glass-border)',
            borderRadius: 14,
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
          }}
        >
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '0.7rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              className="glass-input"
              data-testid="mf-currency-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('minhasfinancas.currency_search')}
              autoFocus
              style={{ padding: '0.5rem 0.75rem 0.5rem 2rem', fontSize: '0.85rem' }}
            />
          </div>

          <div style={{ overflowY: 'auto', maxHeight: 260 }}>
            {includeAll && (
              <button
                type="button"
                role="option"
                aria-selected={isAll}
                data-testid="mf-currency-option-all"
                onClick={() => select('all')}
                style={{
                  ...optionStyle,
                  background: isAll ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'transparent',
                }}
              >
                <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>💱</span>
                <span style={{ flex: 1, fontWeight: 700 }}>
                  {allLabel ?? t('minhasfinancas.currency_all')}
                </span>
                {isAll && <Check size={14} />}
              </button>
            )}

            {filtered.map((code) => {
              const selected = code === value;
              return (
                <button
                  key={code}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid={`mf-currency-option-${code}`}
                  onClick={() => select(code)}
                  style={{
                    ...optionStyle,
                    background: selected
                      ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
                      : 'transparent',
                  }}
                >
                  <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>{currencyFlag(code)}</span>
                  <span style={{ fontWeight: 800, fontSize: '0.78rem', width: 36 }}>{code}</span>
                  <span
                    style={{
                      flex: 1,
                      color: 'var(--text-muted)',
                      fontSize: '0.85rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {currencyName(code, language)}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {currencySymbol(code)}
                  </span>
                  {selected && <Check size={14} />}
                </button>
              );
            })}

            {filtered.length === 0 && (
              <p
                data-testid="mf-currency-empty"
                style={{
                  margin: '0.5rem 0.35rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                }}
              >
                {t('minhasfinancas.currency_none')}
              </p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
