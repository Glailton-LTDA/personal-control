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
 * Nova/Editar tag (padrão do Minhas Finanças original): nome + cor
 * personalizada na grade. Usado nos Ajustes e na criação inline.
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
    <div className="modal-overlay" data-testid="mf-tag-modal" onClick={onClose}>
      <div
        className="glass-card modal-content"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 440 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-tag-modal-close"
            aria-label={t('minhasfinancas.close')}
            onClick={onClose}
          >
            <X size={20} />
          </button>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, flex: 1 }}>
            {isEdit ? t('minhasfinancas.tag_edit_title') : t('minhasfinancas.tag_new_title')}
          </h3>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-tag-modal-save"
            disabled={saving}
            onClick={save}
            style={{ padding: '0.5rem 1.1rem', fontSize: '0.85rem' }}
          >
            {t('minhasfinancas.save')}
          </button>
        </div>
        <div className="input-group" style={{ marginBottom: '0.9rem' }}>
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
          />
        </div>
        <div className="input-group">
          <label>{t('minhasfinancas.tag_custom_color')}</label>
          <MFColorGrid
            value={color}
            onChange={setColor}
            testId="mf-tag-modal-color"
            size={30}
          />
        </div>
      </div>
    </div>
  );
}
