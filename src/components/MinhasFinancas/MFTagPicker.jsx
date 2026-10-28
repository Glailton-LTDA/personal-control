import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Search, Tag as TagIcon, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCreateMFTag } from '../../hooks/useMinhasFinancas';
import { MF_CATEGORY_COLORS, mfNormalize } from './MFCategoryIcons';

/** Cor automática da tag criada pelo seletor (editável em Ajustes → Tags). */
const autoColor = (name) => {
  const seed = [...String(name).toLowerCase()].reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0
  );
  return MF_CATEGORY_COLORS[seed % MF_CATEGORY_COLORS.length];
};

/**
 * Seletor de tags com um único campo: digita → filtra as existentes; se o
 * texto não corresponder a nenhuma, oferece "Criar a tag <termo>", que cria
 * na hora (cor automática), já marca e entra no cache.
 *
 * Controlado: `value` (ids) + `onChange(nextIds)`. A tela dona mantém os
 * chips das selecionadas e decide quando fechar (`onDone`).
 */
export default function MFTagPicker({
  user,
  tags = [],
  value = [],
  onChange = () => {},
  testId = 'mf-tag-picker',
  onDone = null,
  autoFocus = true,
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const createTag = useCreateMFTag();
  const [term, setTerm] = useState('');
  const [creating, setCreating] = useState(false);

  const needle = mfNormalize(term.trim());
  const filtered = useMemo(
    () =>
      needle
        ? tags.filter((tag) => mfNormalize(tag.name).includes(needle))
        : tags,
    [tags, needle]
  );
  const exact = tags.find((tag) => mfNormalize(tag.name) === needle) ?? null;
  const canCreate = term.trim() !== '' && !exact;

  const toggle = (id) => {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  };

  const create = async () => {
    const name = term.trim();
    if (!name || creating) return;
    // Nome já existe (sem acento/caixa): só marca, não duplica.
    const dupe = tags.find((tag) => mfNormalize(tag.name) === mfNormalize(name));
    if (dupe) {
      if (!value.includes(dupe.id)) toggle(dupe.id);
      setTerm('');
      return;
    }
    setCreating(true);
    try {
      const created = await createTag.mutateAsync({
        user_id: user.id,
        name,
        color: autoColor(name),
      });
      const row = Array.isArray(created) ? created[0] : created;
      if (row?.id) {
        // Otimista: a tag nova aparece no seletor/chips antes do refetch.
        queryClient.setQueryData(['mf-tags', user?.id], (old) =>
          Array.isArray(old) && !old.some((tag) => tag.id === row.id)
            ? [...old, row]
            : old
        );
        onChange([...value, row.id]);
      }
      setTerm('');
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.55rem',
        border: '1px solid var(--glass-border)',
        borderRadius: 12,
        background: 'rgba(255, 255, 255, 0.02)',
        padding: '0.7rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          background: 'var(--input-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: 10,
          padding: '0.45rem 0.65rem',
        }}
      >
        <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          type="text"
          data-testid={`${testId}-search`}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (canCreate) create();
            }
          }}
          placeholder={t('minhasfinancas.tag_search_or_create')}
          autoFocus={autoFocus}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-main)',
            fontFamily: 'inherit',
            fontSize: '0.85rem',
          }}
        />
        {term !== '' && (
          <button
            type="button"
            className="icon-btn"
            data-testid={`${testId}-search-clear`}
            aria-label={t('minhasfinancas.search_clear')}
            onClick={() => setTerm('')}
            style={{ padding: '0.15rem', flexShrink: 0 }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.1rem',
          maxHeight: 210,
          overflowY: 'auto',
        }}
      >
        {filtered.map((tag) => {
          const active = value.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              role="option"
              aria-selected={active}
              data-testid={`${testId}-option-${tag.id}`}
              onClick={() => toggle(tag.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
                width: '100%',
                padding: '0.42rem 0.45rem',
                border: 'none',
                borderRadius: 9,
                background: active
                  ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
                  : 'transparent',
                color: 'var(--text-main)',
                fontFamily: 'inherit',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: 999,
                  background: tag.color || 'var(--text-muted)',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {tag.name}
              </span>
              {active && <Check size={14} style={{ color: 'var(--success)' }} />}
            </button>
          );
        })}

        {canCreate && (
          <button
            type="button"
            data-testid={`${testId}-create`}
            onClick={create}
            disabled={creating}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              width: '100%',
              padding: '0.48rem 0.55rem',
              border: '1px dashed color-mix(in srgb, var(--primary) 55%, transparent)',
              borderRadius: 9,
              background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
              color: 'var(--text-main)',
              fontFamily: 'inherit',
              fontSize: '0.83rem',
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Plus size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              {t('minhasfinancas.tag_create_named', { name: term.trim() })}
            </span>
          </button>
        )}

        {filtered.length === 0 && !canCreate && (
          <p
            data-testid={`${testId}-empty`}
            style={{
              margin: '0.35rem 0.45rem',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
            }}
          >
            {t('minhasfinancas.tx_no_tags')}
          </p>
        )}
      </div>

      {onDone && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid={`${testId}-done`}
            onClick={onDone}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              border: 'none',
              borderRadius: 9,
              padding: '0.42rem 0.9rem',
              background: 'color-mix(in srgb, var(--primary) 16%, transparent)',
              color: 'var(--text-main)',
              fontFamily: 'inherit',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <TagIcon size={13} />
            {t('minhasfinancas.tag_done')}
          </button>
        </div>
      )}
    </div>
  );
}
