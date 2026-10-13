import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import {
  useMFCategories,
  useCreateMFCategory,
  useUpdateMFCategory,
  useDeleteMFCategory,
} from '../../hooks/useMinhasFinancas';
import MFCategoryAvatar from './MFCategoryAvatar';
import MFCategoryFormModal from './MFCategoryFormModal';
import { mfCategoryTree, mfFilterTree, mfNormalize } from './MFCategoryIcons';

/** Chave de switch ativa/desativa (arquiva) a categoria e seus filhos. */
function SwitchControl({ testId, checked, label, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      onClick={onChange}
      style={{
        position: 'relative',
        width: 36,
        height: 20,
        borderRadius: 999,
        border: 'none',
        padding: 0,
        flexShrink: 0,
        cursor: 'pointer',
        background: checked ? 'var(--primary)' : 'var(--glass-border)',
        transition: 'background .15s',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .15s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        }}
      />
    </button>
  );
}

/**
 * "Gerenciar categorias" — tela dedicada nas Configurações (replica a
 * tela de categorias do Minhas Finanças): busca, árvore com ícones,
 * expandir/recolher, ativar/desativar (arquiva com os filhos) e as
 * ações Adicionar categoria / Adicionar subcategoria com o modal de
 * ícone + cor.
 */
export default function MFCategoriesScreen({ user, onBack }) {
  const { t } = useTranslation();
  const { data: categories = [] } = useMFCategories(user);
  const createCategory = useCreateMFCategory();
  const updateCategory = useUpdateMFCategory();
  const deleteCategory = useDeleteMFCategory();

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [modal, setModal] = useState(null); // { mode: 'new'|'new-sub'|'edit', category?, parent? }

  const tree = useMemo(() => mfCategoryTree(categories), [categories]);
  const visible = useMemo(() => mfFilterTree(tree, search), [tree, search]);
  const term = mfNormalize(search.trim());

  const toggleExpand = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Ativa/desativa — no raiz, os filhos acompanham (evita órfãs soltas). */
  const toggleActive = async (cat) => {
    const archived = !cat.is_archived;
    const children = cat.parent_id
      ? []
      : tree.find((node) => node.id === cat.id)?.children ?? [];
    try {
      for (const row of [cat, ...children]) {
        await updateCategory.mutateAsync({ id: row.id, is_archived: archived });
      }
      toast.success(t('minhasfinancas.cfg_saved'));
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const openNewSub = (parent) => {
    if (parent) setExpanded((prev) => new Set(prev).add(parent.id));
    setModal({ mode: 'new-sub', parent });
  };

  const handleSave = async (fields) => {
    const name = fields.name.trim();
    if (!name) {
      toast.error(t('minhasfinancas.cfg_name_required'));
      return;
    }
    const parentId = fields.parent_id || null;
    const duplicate = categories.some(
      (cat) =>
        cat.id !== modal.category?.id &&
        (cat.parent_id || null) === parentId &&
        mfNormalize(cat.name) === mfNormalize(name)
    );
    if (duplicate) {
      toast.error(t('minhasfinancas.cfg_duplicate_category'));
      return;
    }
    const payload = {
      user_id: user.id,
      name,
      type: fields.type,
      parent_id: parentId,
      color: fields.color,
      icon: fields.icon,
    };
    try {
      if (modal.mode === 'edit') {
        await updateCategory.mutateAsync({ id: modal.category.id, ...payload });
      } else {
        await createCategory.mutateAsync(payload);
        if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
      }
      toast.success(t('minhasfinancas.cfg_saved'));
      setModal(null);
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const handleDelete = (cat) => {
    confirmToast(
      t('minhasfinancas.cfg_del_category_confirm', { name: cat.name }),
      async () => {
        const children = cat.parent_id
          ? []
          : tree.find((node) => node.id === cat.id)?.children ?? [];
        try {
          // filhos antes do pai (FK)
          for (const child of children) {
            await deleteCategory.mutateAsync(child.id);
          }
          await deleteCategory.mutateAsync(cat.id);
          toast.success(t('minhasfinancas.cfg_deleted'));
          setModal(null);
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.delete') }
    );
  };

  // "Adicionar subcategoria" do rodapé: prioriza a raiz expandida.
  const expandedRoot = tree.find((node) => expanded.has(node.id));
  const nextSubParent = expandedRoot ?? tree[0] ?? null;

  const rowButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    flex: 1,
    minWidth: 0,
    background: 'none',
    border: 'none',
    padding: '0.25rem 0',
    color: 'var(--text-main)',
    fontFamily: 'inherit',
    fontSize: '0.9rem',
    cursor: 'pointer',
    textAlign: 'left',
  };

  const renderRow = (cat, isChild) => (
    <div
      key={cat.id}
      data-testid={`mf-cat-root-${cat.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.45rem',
        padding: isChild ? '0.3rem 0 0.3rem 2.1rem' : '0.45rem 0',
        borderBottom: '1px solid var(--glass-border)',
        opacity: cat.is_archived ? 0.62 : 1,
      }}
    >
      {!isChild ? (
        <button
          type="button"
          className="icon-btn"
          data-testid={`mf-cat-expand-${cat.id}`}
          aria-label={cat.name}
          aria-expanded={expanded.has(cat.id)}
          onClick={() => toggleExpand(cat.id)}
          style={{ flexShrink: 0 }}
        >
          <ChevronRight
            size={15}
            style={{
              transition: 'transform .15s',
              transform: expanded.has(cat.id) ? 'rotate(90deg)' : 'none',
            }}
          />
        </button>
      ) : (
        <span style={{ width: 26, flexShrink: 0 }} />
      )}

      <button
        type="button"
        data-testid={`mf-cat-row-${cat.id}`}
        onClick={() => setModal({ mode: 'edit', category: cat })}
        style={{ ...rowButtonStyle, ...(isChild ? { paddingLeft: 0 } : null) }}
      >
        <MFCategoryAvatar category={cat} size={26} />
        <span
          style={{
            fontWeight: isChild ? 500 : 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {cat.name}
        </span>
      </button>

      {!isChild && (
        <button
          type="button"
          className="icon-btn"
          data-testid={`mf-cat-add-child-${cat.id}`}
          aria-label={t('minhasfinancas.cfg_add_child')}
          title={t('minhasfinancas.cfg_add_child')}
          onClick={() => setModal({ mode: 'new-sub', parent: cat })}
          style={{
            flexShrink: 0,
            color: 'var(--primary)',
            border: '1px solid color-mix(in srgb, var(--primary) 45%, transparent)',
            borderRadius: '50%',
          }}
        >
          <Plus size={14} />
        </button>
      )}

      <SwitchControl
        testId={`mf-cat-active-${cat.id}`}
        checked={!cat.is_archived}
        label={`${t('minhasfinancas.cat_active')}: ${cat.name}`}
        onChange={() => toggleActive(cat)}
      />
    </div>
  );

  return (
    <div
      data-testid="mf-cat-screen"
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minHeight: 0 }}
    >
      {/* Cabeçalho */}
      <div className="glass-card" style={{ padding: '1.1rem 1.5rem', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
        <button
          type="button"
          className="icon-btn"
          data-testid="mf-cat-back"
          aria-label={t('minhasfinancas.back')}
          onClick={onBack}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
            {t('minhasfinancas.cfg_manage_categories')}
          </h2>
          <p style={{ margin: '0.1rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {t('minhasfinancas.cfg_categories_desc')}
          </p>
        </div>
      </div>

      {/* Lista + ações */}
      <div
        className="glass-card"
        style={{
          padding: '1.1rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Busca */}
        <div style={{ position: 'relative' }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            className="glass-input"
            data-testid="mf-cat-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('minhasfinancas.cat_search')}
            aria-label={t('minhasfinancas.cat_search')}
            style={{ width: '100%', padding: '0.55rem 2.2rem 0.55rem 2.1rem', fontSize: '0.88rem' }}
          />
          {search !== '' && (
            <button
              type="button"
              className="icon-btn"
              data-testid="mf-cat-search-clear"
              aria-label={t('minhasfinancas.search_clear')}
              title={t('minhasfinancas.search_clear')}
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: '0.45rem',
                top: '50%',
                transform: 'translateY(-50%)',
                padding: '0.25rem',
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Árvore */}
        <div style={{ overflowY: 'auto', maxHeight: '54vh' }}>
          {visible.length === 0 && (
            <p
              data-testid="mf-cat-empty"
              style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.5rem 0' }}
            >
              {term
                ? t('minhasfinancas.cat_empty')
                : t('minhasfinancas.cfg_empty_categories')}
            </p>
          )}

          {visible.map((node) => (
            <React.Fragment key={node.id}>
              {renderRow({ ...node, children: undefined }, false)}
              {expanded.has(node.id) &&
                node.children.map((child) => renderRow(child, true))}
            </React.Fragment>
          ))}
        </div>

        {/* Barra de ações */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            data-testid="mf-cat-new"
            onClick={() => setModal({ mode: 'new' })}
            style={{ padding: '0.6rem 1rem', fontSize: '0.85rem', fontWeight: 700 }}
          >
            <Plus size={15} />
            {t('minhasfinancas.cat_add')}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-cat-new-sub"
            disabled={!tree.length}
            onClick={() => openNewSub(nextSubParent)}
            style={{
              padding: '0.6rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              ...(tree.length ? null : { opacity: 0.55, cursor: 'not-allowed' }),
            }}
          >
            <Plus size={15} />
            {t('minhasfinancas.cfg_add_child')}
          </button>
        </div>
      </div>

      {/* Modal de ícone + cor */}
      {modal && (
        <MFCategoryFormModal
          mode={modal.mode}
          category={modal.category}
          parent={modal.parent}
          categories={categories}
          onSave={handleSave}
          onCancel={() => setModal(null)}
          onDelete={() => handleDelete(modal.category)}
        />
      )}
    </div>
  );
}
