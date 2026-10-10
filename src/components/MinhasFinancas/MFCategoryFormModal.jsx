import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Trash2 } from 'lucide-react';
import MFSelect from './MFSelect';
import { MF_CATEGORY_ICONS, MF_CATEGORY_COLORS, mfIconMatches } from './MFCategoryIcons';

/**
 * Modal "Nova categoria / Nova subcategoria / Editar" — replica o seletor
 * de ícone + cor do Minhas Finanças (paleta de cores, grade de emojis e
 * nome). Componente apresentacional: validação (nome/duplicado) e
 * persistência ficam em quem o monta (MFCategoriesScreen).
 *
 * - `new`: nome + tipo + ícone/cor (raiz).
 * - `new-sub`: pai pré-selecionado + nome + ícone/cor (tipo herdado do pai).
 * - `edit`: nome + tipo + pai (move de nível) + ícone/cor + excluir.
 */
export default function MFCategoryFormModal({
  mode,
  category = null,
  parent = null,
  categories = [],
  onSave,
  onCancel,
  onDelete,
}) {
  const { t } = useTranslation();
  const isSub = mode === 'new-sub' || (mode === 'edit' && !!category?.parent_id);
  const [name, setName] = useState(category?.name ?? '');
  const [type, setType] = useState(category?.type ?? parent?.type ?? 'DESPESA');
  const [parentId, setParentId] = useState(
    mode === 'new-sub' ? parent?.id ?? '' : category?.parent_id ?? ''
  );
  const [color, setColor] = useState(category?.color || MF_CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState(category?.icon ?? null);
  const [iconSearch, setIconSearch] = useState('');
  const visibleIcons = useMemo(
    () => MF_CATEGORY_ICONS.filter((emoji) => mfIconMatches(emoji, iconSearch)),
    [iconSearch]
  );

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const title = (() => {
    if (mode === 'edit') {
      return t(isSub ? 'minhasfinancas.cat_edit_sub_title' : 'minhasfinancas.cat_edit_title');
    }
    return t(isSub ? 'minhasfinancas.cat_new_sub_title' : 'minhasfinancas.cat_new_title');
  })();

  const hint = t(
    isSub ? 'minhasfinancas.cat_icon_hint_sub' : 'minhasfinancas.cat_icon_hint'
  );

  // Raízes candidatas a pai (nunca a própria categoria em edição).
  const roots = categories.filter((cat) => !cat.parent_id && cat.id !== category?.id);

  const handleParentChange = (nextId) => {
    setParentId(nextId);
    // tipo acompanha o pai escolhido (subcategorias herdam do pai)
    const chosen = categories.find((cat) => cat.id === nextId);
    if (chosen) setType(chosen.type);
  };

  return (
    <div className="modal-overlay" data-testid="mf-cat-modal" onClick={onCancel}>
      <div
        className="glass-card modal-content"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        style={{ padding: '1.25rem 1.5rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, flex: 1 }}>{title}</h3>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-cat-modal-cancel"
            aria-label={t('minhasfinancas.cancel')}
            onClick={onCancel}
          >
            <X size={16} />
          </button>
        </div>

        <p
          style={{
            margin: '0 0 0.6rem',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
          }}
        >
          {hint}
        </p>

        {/* Cores */}
        <div
          role="radiogroup"
          aria-label={t('minhasfinancas.cfg_color')}
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}
        >
          {MF_CATEGORY_COLORS.map((swatch, index) => (
            <button
              key={swatch}
              type="button"
              role="radio"
              aria-checked={color === swatch}
              aria-label={swatch}
              data-testid={`mf-cat-modal-color-${index}`}
              onClick={() => setColor(swatch)}
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                border:
                  color === swatch
                    ? '2px solid var(--primary)'
                    : '2px solid transparent',
                outline: color === swatch ? '1px solid var(--glass-border)' : 'none',
                background: swatch,
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>

        {/* Ícones */}
        <input
          type="text"
          className="glass-input"
          data-testid="mf-cat-modal-icon-search"
          value={iconSearch}
          onChange={(event) => setIconSearch(event.target.value)}
          placeholder={t('minhasfinancas.cfg_icon_search')}
          style={{ width: '100%', padding: '0.5rem 0.8rem', fontSize: '0.85rem', marginBottom: '0.5rem' }}
        />
        <div
          role="radiogroup"
          aria-label={t('minhasfinancas.cfg_categories')}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(42px, 1fr))',
            gap: '0.4rem',
            marginBottom: '0.9rem',
            maxHeight: 210,
            overflowY: 'auto',
            paddingRight: '0.15rem',
          }}
        >
          <button
            type="button"
            role="radio"
            aria-checked={!icon}
            aria-label={t('minhasfinancas.cancel')}
            data-testid="mf-cat-modal-icon-none"
            onClick={() => setIcon(null)}
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
              data-testid={`mf-cat-modal-icon-${index}`}
              onClick={() => setIcon(emoji)}
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
          {visibleIcons.length === 0 && (
            <p
              data-testid="mf-cat-modal-icon-empty"
              style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}
            >
              {t('minhasfinancas.icon_search_empty')}
            </p>
          )}
        </div>

        {/* Nome */}
        <div className="input-group" style={{ marginBottom: '0.75rem' }}>
          <label>{t('minhasfinancas.cfg_name')}</label>
          <input
            type="text"
            className="glass-input"
            style={{ width: '100%', padding: '0.55rem 0.8rem', fontSize: '0.88rem' }}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t(isSub ? 'minhasfinancas.cfg_add_child' : 'minhasfinancas.cfg_categories')}
            data-testid="mf-cat-modal-name"
            autoFocus
          />
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
          {/* Tipo: só para raízes (subcategoria herda do pai) */}
          {mode !== 'new-sub' && (
            <div className="input-group" style={{ flex: '1 1 140px' }}>
              <label>{t('minhasfinancas.cfg_type')}</label>
              <MFSelect
                style={{ width: '100%' }}
                testId="mf-cat-modal-type"
                value={type}
                onChange={setType}
                searchable={false}
                options={[
                  { value: 'DESPESA', label: t('minhasfinancas.type_despesa') },
                  { value: 'RECEITA', label: t('minhasfinancas.type_receita') },
                  { value: 'AMBAS', label: t('minhasfinancas.type_ambas') },
                ]}
              />
            </div>
          )}

          {/* Pai: escolha em "nova subcategoria" e movimentação na edição */}
          {(mode === 'new-sub' || mode === 'edit') && (
            <div className="input-group" style={{ flex: '2 1 180px' }}>
              <label>{t('minhasfinancas.cfg_parent')}</label>
              <MFSelect
                style={{ width: '100%' }}
                testId="mf-cat-modal-parent"
                value={parentId}
                onChange={handleParentChange}
                placeholder={t('minhasfinancas.cfg_parent_root')}
                options={[
                  ...(mode === 'edit' ? [{ value: '', label: t('minhasfinancas.cfg_parent_root') }] : []),
                  ...roots.map((cat) => ({ value: cat.id, label: cat.name })),
                ]}
              />
            </div>
          )}
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginTop: '1rem' }}>
          {mode === 'edit' && (
            <button
              type="button"
              data-testid="mf-cat-modal-delete"
              onClick={onDelete}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'none',
                border: '1px solid color-mix(in srgb, #ef4444 45%, transparent)',
                color: '#ef4444',
                borderRadius: 10,
                padding: '0.55rem 0.8rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Trash2 size={14} />
              {t('minhasfinancas.delete')}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn-cancel"
            data-testid="mf-cat-modal-cancel-btn"
            onClick={onCancel}
            style={{ padding: '0.55rem 0.9rem', fontSize: '0.85rem' }}
          >
            {t('minhasfinancas.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-cat-modal-save"
            onClick={() => onSave({ name, type, parent_id: parentId || null, color, icon })}
            style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}
          >
            {mode === 'edit' ? t('minhasfinancas.save') : t('minhasfinancas.cat_add_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}
