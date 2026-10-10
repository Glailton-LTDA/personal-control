import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Search } from 'lucide-react';

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
  minHeight: '42px',
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
 * Dropdown genérico do módulo Minhas Finanças — substitui TODOS os
 * `<select>` nativos por um gatilho moderno (bolinha de cor opcional +
 * label + meta à direita + chevron) e um popover com busca por nome.
 *
 * - Portal para `document.body` (`position: fixed`, z:1100, ancorado no
 *   gatilho com flip): dentro de `.glass-card` (backdrop-filter) o
 *   absolute ficaria preso no stacking context e o conteúdo irmão
 *   taparia o dropdown — mesmo motivo do MFCurrencySelect.
 * - `options`: `{ value, label, meta?, color?, icon?, group? }`. `value`
 *   pode ser string ou número (meses/anos/índices de coluna); `group`
 *   desenha cabeçalhos de optgroup; `label` também pode ser ReactNode
 *   (busca usa `label`/`meta` como texto — mantenha-os string).
 * - Fecha com clique fora/Escape; reposiciona em scroll/resize.
 */
export default function MFSelect({
  value,
  onChange,
  options = [],
  placeholder,
  searchable = true,
  disabled = false,
  emptyLabel,
  testId = 'mf-select',
  style,
  id,
  ariaLabel,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const popRef = useRef(null);

  /** Ancora o popover no gatilho, com flip vertical e clamp horizontal. */
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
    document.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      document.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, place]);

  const selected = options.find((option) => option.value === value) || null;

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    if (!term) return options;
    return options.filter(
      (option) => normalize(option.label).includes(term) || normalize(option.meta).includes(term)
    );
  }, [options, search]);

  /** Opções intercaladas com cabeçalhos de grupo (optgroups). */
  const grouped = useMemo(() => {
    const out = [];
    let lastGroup = null;
    filtered.forEach((option) => {
      if (option.group && option.group !== lastGroup) {
        out.push({ type: 'header', key: `group-${option.group}`, label: option.group });
        lastGroup = option.group;
      }
      out.push({ type: 'option', key: `opt-${String(option.value)}`, option });
    });
    return out;
  }, [filtered]);

  const toggle = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      setSearch('');
      return;
    }
    place(); // ancora antes de abrir (mesmo batch de render)
    setSearch('');
    setOpen(true);
  };

  const select = (next) => {
    onChange?.(next);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'block' }}>
      <button
        type="button"
        className="glass-input"
        id={id}
        data-testid={testId}
        aria-label={ariaLabel ?? placeholder}
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        disabled={disabled}
        onClick={toggle}
        style={{
          ...triggerStyle,
          width: '100%',
          justifyContent: 'space-between',
          ...(disabled
            ? { opacity: 0.55, cursor: 'not-allowed' }
            : open
              ? { border: '1px solid var(--primary)' }
              : null),
          ...style,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.55rem',
            minWidth: 0,
            flex: 1,
          }}
        >
          {selected?.color ? (
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                flexShrink: 0,
                background: selected.color,
              }}
            />
          ) : null}
          {selected?.icon ? <span style={{ flexShrink: 0 }}>{selected.icon}</span> : null}
          <span
            style={{
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              ...(selected ? null : { color: 'var(--text-muted)', fontWeight: 500 }),
            }}
          >
            {selected ? selected.label : placeholder}
          </span>
          {selected?.meta && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', flexShrink: 0 }}>
              {selected.meta}
            </span>
          )}
        </span>
        <ChevronDown
          size={14}
          style={{ flexShrink: 0, color: 'var(--text-muted)', ...(disabled ? { opacity: 0.6 } : null) }}
        />
      </button>

      {open &&
        !disabled &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            role="listbox"
            data-testid={`${testId}-popover`}
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
            {searchable && options.length > 0 && (
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
                  data-testid={`${testId}-search`}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('minhasfinancas.select_search')}
                  autoFocus
                  style={{ padding: '0.5rem 0.75rem 0.5rem 2rem', fontSize: '0.85rem' }}
                />
              </div>
            )}

            <div style={{ overflowY: 'auto', maxHeight: 260 }}>
              {grouped.map((item) =>
                item.type === 'header' ? (
                  <p
                    key={item.key}
                    data-testid={`${testId}-group-${item.label}`}
                    style={{
                      margin: '0.5rem 0.35rem 0.2rem',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {item.label}
                  </p>
                ) : (
                  (() => {
                    const { option } = item;
                    const isSelected = option.value === value;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        data-testid={`${testId}-option-${option.value}`}
                        onClick={() => select(option.value)}
                        style={{
                          ...optionStyle,
                          background: isSelected
                            ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
                            : 'transparent',
                        }}
                      >
                        {option.color ? (
                          <span
                            aria-hidden="true"
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              flexShrink: 0,
                              background: option.color,
                            }}
                          />
                        ) : null}
                        {option.icon ? <span style={{ flexShrink: 0 }}>{option.icon}</span> : null}
                        <span
                          style={{
                            flex: 1,
                            fontWeight: 700,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {option.label}
                        </span>
                        {option.meta && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            {option.meta}
                          </span>
                        )}
                        {isSelected && <Check size={14} />}
                      </button>
                    );
                  })()
                )
              )}

              {filtered.length === 0 && (
                <p
                  data-testid={`${testId}-none`}
                  style={{
                    margin: '0.5rem 0.35rem',
                    fontSize: '0.85rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  {emptyLabel ?? t('minhasfinancas.select_none')}
                </p>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
