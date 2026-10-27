import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useMFTags,
  useCreateMFTag,
  useUpdateMFTag,
} from '../../hooks/useMinhasFinancas';
import MFColorGrid from './MFColorGrid';

const DEFAULT_TAG_COLOR = '#9e9e9e';

/**
 * Nova/Editar tag (padrão do Minhas Finanças original): nome + cor.
 * Cabeçalho com fechar, corpo rolável, prévia do chip e rodapé fixo com
 * Cancelar/Salvar — no mobile vira bottom sheet (CSS .mf-tag-overlay).
 */
export default function MFTagModal({ tag = null, user, onClose, onSaved }) {
  const { t } = useTranslation();
  const { data: tags = [] } = useMFTags(user);
  const createTag = useCreateMFTag();
  const updateTag = useUpdateMFTag();
  const [name, setName] = useState(tag?.name ?? '');
  const [color, setColor] = useState(tag?.color || DEFAULT_TAG_COLOR);
  const [saving, setSaving] = useState(false);
  const isEdit = !!tag?.id;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t('minhasfinancas.cfg_name_required'));
      return;
    }
    if (
      tags.some(
        (row) =>
          row.id !== tag?.id && row.name.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      toast.error(t('minhasfinancas.cfg_duplicate_tag'));
      return;
    }
    setSaving(true);
    try {
      const saved = isEdit
        ? await updateTag.mutateAsync({ id: tag.id, name: trimmed, color })
        : await createTag.mutateAsync({ user_id: user.id, name: trimmed, color });
      toast.success(t('minhasfinancas.cfg_saved'));
      onSaved?.(saved);
      onClose?.();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay mf-tag-overlay"
      data-testid="mf-tag-modal"
      onClick={onClose}
    >
      <div
        className="glass-card modal-content mf-tag-modal"
        role="dialog"
        aria-modal="true"
        aria-label={
          isEdit ? t('minhasfinancas.tag_edit_title') : t('minhasfinancas.tag_new_title')
        }
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 440, padding: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1.05rem 1.25rem 0.9rem',
            borderBottom: '1px solid var(--glass-border)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, flex: 1 }}>
            {isEdit ? t('minhasfinancas.tag_edit_title') : t('minhasfinancas.tag_new_title')}
          </h3>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-tag-modal-close"
            aria-label={t('minhasfinancas.close')}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            padding: '1rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.95rem',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          <div className="input-group" style={{ margin: 0 }}>
            <label>{t('minhasfinancas.cfg_name')}</label>
            <input
              type="text"
              value={name}
              data-testid="mf-tag-modal-name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  save();
                }
              }}
              placeholder={t('minhasfinancas.tag_name_placeholder')}
              style={{ width: '100%' }}
              autoFocus
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 700,
                marginBottom: '0.45rem',
              }}
            >
              {t('minhasfinancas.tag_custom_color')}
            </label>
            <MFColorGrid
              value={color}
              onChange={setColor}
              testId="mf-tag-modal-color"
              columns={8}
              size={28}
            />
          </div>

          <div
            data-testid="mf-tag-modal-preview"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.6rem',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px dashed var(--glass-border)',
              borderRadius: 12,
              padding: '0.6rem 0.75rem',
            }}
          >
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.tag_preview')}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.78rem',
                fontWeight: 800,
                padding: '0.22rem 0.7rem',
                borderRadius: 999,
                background: color,
                color: '#fff',
                maxWidth: '65%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              # {name.trim() || t('minhasfinancas.tag_name_placeholder')}
            </span>
          </div>
        </div>

        <div className="modal-footer" style={{ padding: '0.85rem 1.25rem 1rem' }}>
          <button
            type="button"
            className="btn-cancel"
            data-testid="mf-tag-modal-cancel"
            onClick={onClose}
            style={{ padding: '0.55rem 0.95rem', fontSize: '0.85rem' }}
          >
            {t('minhasfinancas.cancel')}
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-tag-modal-save"
            disabled={saving}
            onClick={save}
            style={{ padding: '0.55rem 1.2rem', fontSize: '0.85rem' }}
          >
            {t('minhasfinancas.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
