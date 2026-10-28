import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Search, Trash2, Eye, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import {
  useMFTags,
  useDeleteMFTag,
  useMFTagUsage,
} from '../../hooks/useMinhasFinancas';
import MFTagModal from './MFTagModal';
import MFTagTransactionsModal from './MFTagTransactionsModal';

/**
 * Gestão de tags nos Ajustes (padrão do Minhas Finanças original): busca,
 * lista com utilização, ver lançamentos, editar (modal) e excluir.
 */
export default function MFTagsManager({ user, testId = 'mf-tags-manager' }) {
  const { t } = useTranslation();
  const { data: tags = [] } = useMFTags(user);
  const { data: usage } = useMFTagUsage(user);
  const deleteTag = useDeleteMFTag();
  const [search, setSearch] = useState('');
  const [modalTag, setModalTag] = useState(null); // undefined = fechado
  const [modalOpen, setModalOpen] = useState(false);
  const [viewTag, setViewTag] = useState(null);
  const counts = usage?.counts ?? {};

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const ordered = [...tags].sort((a, b) =>
      String(a.name).localeCompare(String(b.name), 'pt-BR')
    );
    if (!term) return ordered;
    return ordered.filter((tag) => tag.name.toLowerCase().includes(term));
  }, [tags, search]);

  const openNew = () => {
    setModalTag(null);
    setModalOpen(true);
  };

  const openEdit = (tag) => {
    setModalTag(tag);
    setModalOpen(true);
  };

  const removeTag = (tag) => {
    confirmToast(
      t('minhasfinancas.cfg_del_tag_confirm', { name: tag.name }),
      async () => {
        try {
          await deleteTag.mutateAsync(tag.id);
          toast.success(t('minhasfinancas.cfg_deleted'));
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.delete') }
    );
  };

  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search
            size={15}
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
            placeholder={t('minhasfinancas.tag_search_placeholder')}
            style={{ width: '100%', paddingLeft: '2.2rem', fontSize: '0.85rem' }}
          />
          {search !== '' && (
            <button
              type="button"
              className="icon-btn"
              data-testid={`${testId}-search-clear`}
              aria-label={t('minhasfinancas.search_clear')}
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: '0.35rem', top: '50%', transform: 'translateY(-50%)', padding: '0.25rem' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn-primary"
          data-testid={`${testId}-new`}
          onClick={openNew}
          style={{ padding: '0.55rem 1rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <Plus size={15} />
          {t('minhasfinancas.tag_new_title')}
        </button>
      </div>

      {filtered.length === 0 && (
        <p data-testid={`${testId}-empty`} style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>
          {t(tags.length === 0 ? 'minhasfinancas.cfg_empty_tags' : 'minhasfinancas.select_none')}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {filtered.map((tag) => {
          return (
            <div
              key={tag.id}
              data-testid={`${testId}-row-${tag.id}`}
              className="glass-card"
              style={{ padding: '0.6rem 0.8rem' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span
                  aria-hidden
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: tag.color || 'var(--primary)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  # {tag.name}
                </span>
                <span
                  data-testid={`${testId}-usage-${tag.id}`}
                  title={t('minhasfinancas.tag_usage')}
                  style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
                >
                  {counts[tag.id] ?? 0}
                </span>
                <span style={{ display: 'inline-flex', gap: '0.15rem', flexShrink: 0 }}>
                  <button
                    type="button"
                    className="icon-btn"
                    data-testid={`${testId}-view-${tag.id}`}
                    aria-label={t('minhasfinancas.tag_view_transactions')}
                    title={t('minhasfinancas.tag_view_transactions')}
                    onClick={() => setViewTag(tag)}
                    style={{ padding: '0.3rem' }}
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    data-testid={`${testId}-edit-${tag.id}`}
                    aria-label={t('minhasfinancas.edit')}
                    onClick={() => openEdit(tag)}
                    style={{ padding: '0.3rem' }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    data-testid={`${testId}-del-${tag.id}`}
                    aria-label={t('minhasfinancas.delete')}
                    onClick={() => removeTag(tag)}
                    style={{ padding: '0.3rem' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {viewTag && (
        <MFTagTransactionsModal
          user={user}
          tag={viewTag}
          onClose={() => setViewTag(null)}
        />
      )}
      {modalOpen && (
        <MFTagModal tag={modalTag} user={user} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}
