import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

/**
 * Menu "⋯" do detalhe de conta/cartão: gatilho de ícone + popover em
 * portal — mesmo motivo do MFAddMenu/MFSelect: dentro de `.glass-card` o
 * backdrop-filter cria stacking context e o conteúdo irmão taparia o menu.
 * Centraliza as ações do cabeçalho (editar, reajustar, arquivar, excluir)
 * num único lugar, deixando o header leve no mobile (padrão do app de
 * referência). `items` = [{ key, Icon, label, danger, testId, onSelect }];
 * `title` opcional vira cabeçalho ("Gerenciar conta"/"Gerenciar cartão").
 */
export default function MFManageMenu({
  title = null,
  items = [],
  triggerTestId = 'mf-manage',
  testId = 'mf-manage-menu',
  triggerLabel = null,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const popRef = useRef(null);

  /** Ancora o popover no gatilho, com flip vertical e clamp horizontal. */
  const place = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(260, window.innerWidth - 16);
    let right = window.innerWidth - rect.right;
    if (right < 8) right = 8;
    else if (right + width > window.innerWidth - 8) right = window.innerWidth - width - 8;
    const height = (items.length + (title ? 1 : 0)) * 44 + 14; // aprox. altura
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - 8) {
      const above = rect.top - height - 6;
      top = above >= 8 ? above : Math.max(8, window.innerHeight - height - 8);
    }
    setPos({ top, right });
  }, [items.length, title]);

  useEffect(() => {
    if (!open) return undefined;
    place();
    const handleMouseDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      if (popRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="icon-btn"
        data-testid={triggerTestId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        title={triggerLabel}
        onClick={() => setOpen((prev) => !prev)}
      >
        <MoreVertical size={16} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            role="menu"
            data-testid={testId}
            style={{
              position: 'fixed',
              top: pos.top,
              right: pos.right,
              zIndex: 1150,
              minWidth: 230,
              padding: '0.4rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.15rem',
              background: 'var(--bg-card)',
              border: '1px solid var(--glass-border)',
              borderRadius: 14,
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
            }}
          >
            {title && (
              <div
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                  padding: '0.5rem 0.7rem 0.3rem',
                }}
              >
                {title}
              </div>
            )}
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className="mf-add-item"
                data-testid={item.testId}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.7rem',
                  width: '100%',
                  padding: '0.6rem 0.7rem',
                  border: 'none',
                  borderRadius: 10,
                  background: 'transparent',
                  color: item.danger ? 'var(--danger)' : 'var(--text-main)',
                  font: 'inherit',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: item.danger ? 'var(--danger)' : 'var(--text-muted)',
                    background: item.danger
                      ? 'color-mix(in srgb, var(--danger) 14%, transparent)'
                      : 'color-mix(in srgb, var(--text-muted) 14%, transparent)',
                  }}
                >
                  <item.Icon size={16} />
                </span>
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
