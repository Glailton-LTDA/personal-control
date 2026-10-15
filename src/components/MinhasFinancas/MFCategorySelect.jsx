import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, Plus, Search, X } from 'lucide-react';
import MFCategoryAvatar from './MFCategoryAvatar';
import { mfCategoryTree, mfFilterTree, mfNormalize } from './MFCategoryIcons';

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
  gap: '0.55rem',
  width: '100%',
  padding: '0.45rem 0.55rem',
  border: 'none',
  borderRadius: 10,
  background: 'transparent',
  color: 'var(--text-main)',
  fontSize: '0.88rem',
  fontFamily: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
};

/** Fundo da linha: transparente; destacada só quando selecionada. */
const rowBg = (selected) =>
  selected ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'transparent';

/**
 * Seletor de categoria em árvore do formulário de lançamento — replica o
 * Minhas Finanças: gatilho com ícone + lupa, painel inline com busca,
 * raízes (chevron expande as subcategorias) e a check na selecionada.
 * Sem portal: o painel é fluxo normal abaixo do campo (como no app).
 */
export default function MFCategorySelect({
  value,
  onChange,
  categories = [],
  placeholder,
  testId = 'mf-category',
  /**
   * Criação inline: quando informado, o estado vazio da busca ganha o
   * botão Criar "termo" — chamado com o texto digitado (sem acento
   * exato já existente na lista, para não duplicar sem querer).
   */
  onCreate = null,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const rootRef = useRef(null);

  const tree = useMemo(() => mfCategoryTree(categories), [categories]);
  const selected = categories.find((cat) => cat.id === value) || null;

  // Ao abrir, a raiz da categoria selecionada já aparece expandida.
  useEffect(() => {
    if (!open || !selected?.parent_id) return;
    setExpanded((prev) =>
      prev.has(selected.parent_id) ? prev : new Set(prev).add(selected.parent_id)
    );
  }, [open, selected]);

  // Fecha com clique fora ou Escape.
  useEffect(() => {
    if (!open) return undefined;
    const handleDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const term = search.trim();
  // Na busca tudo aparece expandido; sem busca, respeita os chevrons.
  const nodes = useMemo(() => mfFilterTree(tree, term), [tree, term]);
  // Nome já existe (ignora acento/caixa)? Então é só selecionar, sem criar.
  const hasExactMatch =
    term !== '' &&
    categories.some((cat) => mfNormalize(cat.name) === mfNormalize(term));
  const isOpen = (node) => (!!term && term.length > 0) || expanded.has(node.id);

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const select = (id) => {
    onChange?.(id);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'block' }}>
      <button
        type="button"
        className="glass-input"
        data-testid={testId}
        aria-label={placeholder}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => !prev);
          setSearch('');
        }}
        style={{
          ...triggerStyle,
          width: '100%',
          justifyContent: 'space-between',
          ...(open ? { border: '1px solid var(--primary)' } : null),
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
          {selected && <MFCategoryAvatar category={selected} size={20} />}
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
            {selected ? selected.name : placeholder}
          </span>
        </span>
        <Search size={15} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
      </button>

      {open && (
        <div
          role="listbox"
          data-testid={`${testId}-panel`}
          style={{
            marginTop: 6,
            padding: '0.55rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
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
              data-testid={`${testId}-search`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('minhasfinancas.select_search')}
              autoFocus
              style={{ padding: '0.5rem 2.1rem 0.5rem 2rem', fontSize: '0.85rem', width: '100%' }}
            />
            {search !== '' && (
              <button
                type="button"
                className="icon-btn"
                data-testid={`${testId}-search-clear`}
                aria-label={t('minhasfinancas.search_clear')}
                title={t('minhasfinancas.search_clear')}
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: '0.35rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '0.25rem',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', maxHeight: 260 }}>
            {/* Criar no topo: aparece digitando um nome novo (sem
                correspondência exata) — antes ficava no fim da lista e
                passava batido */}
            {onCreate && term !== '' && !hasExactMatch && (
              <button
                type="button"
                data-testid={`${testId}-create`}
                onClick={() => onCreate(term)}
                style={{
                  ...optionStyle,
                  color: 'var(--primary)',
                  fontWeight: 700,
                  background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                }}
              >
                <Plus size={15} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>
                  {t('minhasfinancas.category_create_named', { name: term })}
                </span>
              </button>
            )}
            {/* Limpar seleção */}
            <button
              type="button"
              role="option"
              aria-selected={!value}
              data-testid={`${testId}-option-none`}
              onClick={() => select('')}
              style={{
                ...optionStyle,
                color: 'var(--text-muted)',
                background: rowBg(!value),
              }}
            >
              <X size={16} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontWeight: 600 }}>
                {t('minhasfinancas.tx_category_none')}
              </span>
              {!value && <Check size={14} />}
            </button>

            {nodes.map((node) => (
              <React.Fragment key={node.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={node.id === value}
                    data-testid={`${testId}-option-${node.id}`}
                    onClick={() => select(node.id)}
                    style={{
                      ...optionStyle,
                      flex: 1,
                      background: rowBg(node.id === value),
                    }}
                  >
                    <MFCategoryAvatar category={node} size={22} />
                    <span
                      style={{
                        flex: 1,
                        fontWeight: 700,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {node.name}
                    </span>
                    {node.id === value && <Check size={14} />}
                  </button>
                  {node.children.length > 0 && (
                    <button
                      type="button"
                      className="icon-btn"
                      data-testid={`${testId}-expand-${node.id}`}
                      aria-label={t('minhasfinancas.cfg_add_child')}
                      aria-expanded={isOpen(node)}
                      onClick={() => toggle(node.id)}
                      style={{ flexShrink: 0 }}
                    >
                      <ChevronRight
                        size={15}
                        style={{
                          transition: 'transform .15s',
                          transform: isOpen(node) ? 'rotate(90deg)' : 'none',
                        }}
                      />
                    </button>
                  )}
                </div>

                {isOpen(node) &&
                  node.children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      role="option"
                      aria-selected={child.id === value}
                      data-testid={`${testId}-option-${child.id}`}
                      onClick={() => select(child.id)}
                      style={{
                        ...optionStyle,
                        paddingLeft: '1.7rem',
                        fontSize: '0.85rem',
                        background: rowBg(child.id === value),
                      }}
                    >
                      <MFCategoryAvatar category={child} size={18} />
                      <span
                        style={{
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {child.name}
                      </span>
                      {child.id === value && <Check size={14} />}
                    </button>
                  ))}
              </React.Fragment>
            ))}

            {nodes.length === 0 && !(onCreate && term !== '') && (
              <p
                data-testid={`${testId}-none`}
                style={{ margin: '0.5rem 0.35rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}
              >
                {t('minhasfinancas.select_none')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
