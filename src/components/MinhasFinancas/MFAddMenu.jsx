import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  CreditCard,
  MinusCircle,
  Plus,
  PlusCircle,
  RotateCcw,
} from 'lucide-react';

/**
 * Opções do menu "+" — mesmos ícones/cores do app original:
 * despesa (− vermelho), despesa no cartão (💳), receita (+ verde),
 * transferência (⇄ índigo) e estorno (↺ verde).
 */
const MF_ADD_OPTIONS = {
  expense: { Icon: MinusCircle, color: '#ef4444', labelKey: 'minhasfinancas.add_expense' },
  cardExpense: { Icon: CreditCard, color: '#3b82f6', labelKey: 'minhasfinancas.add_card_expense' },
  income: { Icon: PlusCircle, color: '#10b981', labelKey: 'minhasfinancas.add_income' },
  transfer: { Icon: ArrowLeftRight, color: '#6366f1', labelKey: 'minhasfinancas.add_transfer' },
  estorno: { Icon: RotateCcw, color: '#10b981', labelKey: 'minhasfinancas.add_estorno' },
};

/** Menu completo: FAB global e botão da tela de Lançamentos. */
const MF_ADD_ALL = ['expense', 'cardExpense', 'income', 'transfer'];

/** FAB circular fixo (só no módulo Minhas Finanças). */
const FAB_STYLE = {
  position: 'fixed',
  right: '1.5rem',
  bottom: '1.5rem',
  width: 56,
  height: 56,
  borderRadius: 999,
  zIndex: 1200,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 14px 34px rgba(0, 0, 0, 0.4)',
};

/**
 * Menu "+" do módulo Minhas Finanças: gatilho (botão de texto com rótulo
 * ou FAB circular fixo via `variant="fab"`) + popover em portal
 * — mesmo motivo do MFSelect: dentro de `.glass-card` o backdrop-filter
 * cria stacking context e o conteúdo irmão taparia o menu.
 * O FAB abre o menu **centralizado na tela** (meio exato, sem depender
 * do wrapper que fica no fluxo); a variante botão continua ancorada.
 * `items` define as opções contextuais; `onSelect(kind)` recebe a chave
 * ('expense' | 'cardExpense' | 'income' | 'transfer' | 'estorno').
 */
export default function MFAddMenu({
  items = MF_ADD_ALL,
  onSelect,
  label = null,
  variant = 'button',
  triggerStyle = null,
  triggerTestId = 'mf-add',
  testId = 'mf-add-menu',
}) {
  const { t } = useTranslation();
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
    const height = items.length * 44 + 14; // aprox. altura do menu
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - 8) {
      const above = rect.top - height - 6;
      top = above >= 8 ? above : Math.max(8, window.innerHeight - height - 8);
    }
    setPos({ top, right });
  }, [items.length]);

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

  const isFab = variant === 'fab';

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="btn-primary"
        data-testid={triggerTestId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label ?? t('minhasfinancas.tx_new')}
        onClick={() => setOpen((prev) => !prev)}
        style={
          isFab
            ? { ...FAB_STYLE, ...triggerStyle }
            : { padding: '0.65rem 1rem', fontSize: '0.85rem', ...triggerStyle }
        }
      >
        <Plus size={isFab ? 26 : 16} aria-hidden />
        {label && <span>{label}</span>}
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
              ...(isFab
                ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
                : { top: pos.top, right: pos.right }),
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
            {items.map((kind) => {
              const meta = MF_ADD_OPTIONS[kind];
              if (!meta) return null;
              const { Icon } = meta;
              return (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  className="mf-add-item"
                  data-testid={`mf-add-opt-${kind}`}
                  onClick={() => {
                    setOpen(false);
                    onSelect?.(kind);
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
                    color: 'var(--text-main)',
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
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: meta.color,
                      background: `color-mix(in srgb, ${meta.color} 16%, transparent)`,
                    }}
                  >
                    <Icon size={16} />
                  </span>
                  {t(meta.labelKey)}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
