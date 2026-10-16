import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Plus, Pencil, Trash2, Tag, Users, FolderTree, Landmark, Star, History, RotateCcw, Save, Layers, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import MFCategoriesScreen from './MFCategoriesScreen';
import MFTagsManager from './MFTagsManager';
import { MF_CATEGORY_ICONS } from './MFCategoryIcons';
import {
  MF_ACCOUNT_TYPE_ICONS,
  MF_BUILTIN_ACCOUNT_TYPES,
  useMFCategories,
  useMFResponsibles,
  useCreateMFResponsible,
  useUpdateMFResponsible,
  useDeleteMFResponsible,
  useMFRestorePoints,
  useSaveMFRestorePoint,
  useRestoreMFRestorePoint,
  useDeleteMFRestorePoint,
  useMFProfiles,
  useCreateMFProfile,
  useUpdateMFProfile,
  useDeleteMFProfile,
  useMFAccountTypes,
  useCreateAccountType,
  useDeleteAccountType,
} from '../../hooks/useMinhasFinancas';

const emptyResponsible = { name: '', email: '', color: '#6366f1', is_main: false };
const emptyProfile = { name: '', color: '#6366f1' };
const emptyType = { name: '', icon: '💳' };

// Ícones do seletor de ícone do tipo (padrões + categorias), igual ao modal da conta
const MF_TYPE_EMOJIS = [...new Set([...Object.values(MF_ACCOUNT_TYPE_ICONS), ...MF_CATEGORY_ICONS])];

const sectionTitle = {
  margin: '0 0 0.2rem',
  fontSize: '1rem',
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
};

const sectionDesc = {
  margin: '0 0 1rem',
  fontSize: '0.82rem',
  color: 'var(--text-muted)',
};

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '0.55rem 0',
  borderBottom: '1px solid var(--glass-border)',
  fontSize: '0.88rem',
};

const inputStyle = { width: '100%', padding: '0.55rem 0.8rem', fontSize: '0.88rem' };

const colorDot = (color) => ({
  width: 12,
  height: 12,
  borderRadius: '50%',
  background: color || 'var(--primary)',
  flexShrink: 0,
});

/**
 * Ajustes do módulo (Fase 3): tags, responsáveis, perfis e pontos de
 * restauração — CRUD com formulários inline. Categorias (2 níveis + ícone
 * e cor) ganharam tela própria acessada pelo card "Gerenciar categorias".
 */
export default function MFConfig({ user }) {
  const { t, i18n } = useTranslation();

  const { data: categories = [] } = useMFCategories(user);
  const { data: responsibles = [] } = useMFResponsibles(user);

  const createResponsible = useCreateMFResponsible();
  const updateResponsible = useUpdateMFResponsible();
  const deleteResponsible = useDeleteMFResponsible();
  const { data: profiles = [] } = useMFProfiles(user);
  const createProfile = useCreateMFProfile();
  const updateProfile = useUpdateMFProfile();
  const deleteProfile = useDeleteMFProfile();
  const { data: customTypes = [] } = useMFAccountTypes(user);
  const createType = useCreateAccountType();
  const deleteType = useDeleteAccountType();

  const [respForm, setRespForm] = useState(emptyResponsible);
  const [respEditingId, setRespEditingId] = useState(null);
  const [pfForm, setPfForm] = useState(emptyProfile);
  const [pfEditingId, setPfEditingId] = useState(null);
  const [typeForm, setTypeForm] = useState(emptyType);
  const [typeIconOpen, setTypeIconOpen] = useState(false);

  /* ── Tipos de conta ─────────────────────────────────────── */

  const saveAccountType = async () => {
    const name = typeForm.name.trim();
    if (!name) {
      toast.error(t('minhasfinancas.type_name_required'));
      return;
    }
    if (MF_BUILTIN_ACCOUNT_TYPES.some((type) => type.toLowerCase() === name.toLowerCase())) {
      toast.error(t('minhasfinancas.type_reserved'));
      return;
    }
    if (customTypes.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      toast.error(t('minhasfinancas.type_duplicate'));
      return;
    }
    try {
      await createType.mutateAsync({
        user_id: user.id,
        name,
        icon: typeForm.icon.trim() || '💳',
      });
      toast.success(t('minhasfinancas.type_saved'));
      setTypeForm(emptyType);
      setTypeIconOpen(false);
    } catch (error) {
      if (error?.code === '23505') toast.error(t('minhasfinancas.type_duplicate'));
      else toast.error(t('minhasfinancas.save_error'));
    }
  };

  const removeAccountType = (item) => {
    confirmToast(
      t('minhasfinancas.type_delete_confirm', { name: item.name }),
      async () => {
        try {
          await deleteType.mutateAsync(item.id);
          toast.success(t('minhasfinancas.type_deleted'));
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.delete') }
    );
  };

  /* ── Responsáveis ───────────────────────────────────────── */

  const startEditResponsible = (resp) => {
    setRespEditingId(resp.id);
    setRespForm({
      name: resp.name,
      email: resp.email || '',
      color: resp.color || '#6366f1',
      is_main: !!resp.is_main,
    });
  };

  const saveResponsible = async () => {
    const name = respForm.name.trim();
    if (!name) {
      toast.error(t('minhasfinancas.cfg_name_required'));
      return;
    }
    const payload = {
      user_id: user.id,
      name,
      email: respForm.email.trim() || null,
      color: respForm.color,
      is_main: respForm.is_main,
    };
    try {
      if (respEditingId) {
        await updateResponsible.mutateAsync({ id: respEditingId, ...payload });
      } else {
        await createResponsible.mutateAsync(payload);
      }
      toast.success(t('minhasfinancas.cfg_saved'));
      setRespForm(emptyResponsible);
      setRespEditingId(null);
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const removeResponsible = (resp) => {
    confirmToast(t('minhasfinancas.cfg_del_resp_confirm', { name: resp.name }), async () => {
      try {
        await deleteResponsible.mutateAsync(resp.id);
        toast.success(t('minhasfinancas.cfg_deleted'));
      } catch {
        toast.error(t('minhasfinancas.save_error'));
      }
    }, { danger: true, confirmText: t('minhasfinancas.delete') });
  };

  /* ── Perfis (Fase 9) ────────────────────────────────────── */

  const startEditProfile = (profile) => {
    setPfEditingId(profile.id);
    setPfForm({ name: profile.name, color: profile.color || '#6366f1' });
  };

  const saveProfile = async () => {
    const name = pfForm.name.trim();
    if (!name) {
      toast.error(t('minhasfinancas.cfg_name_required'));
      return;
    }
    if (
      profiles.some(
        (profile) =>
          profile.id !== pfEditingId && profile.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      toast.error(t('minhasfinancas.cfg_duplicate_profile'));
      return;
    }
    try {
      if (pfEditingId) {
        await updateProfile.mutateAsync({ id: pfEditingId, name, color: pfForm.color });
      } else {
        await createProfile.mutateAsync({
          user_id: user.id,
          name,
          color: pfForm.color,
          sort_order: profiles.length,
        });
      }
      toast.success(t('minhasfinancas.cfg_saved'));
      setPfForm(emptyProfile);
      setPfEditingId(null);
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const removeProfile = (profile) => {
    confirmToast(
      t('minhasfinancas.pf_del_confirm', { name: profile.name }),
      async () => {
        try {
          await deleteProfile.mutateAsync(profile.id);
          toast.success(t('minhasfinancas.cfg_deleted'));
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.delete') }
    );
  };

  const cancelResp = () => {
    setRespForm(emptyResponsible);
    setRespEditingId(null);
  };
  const cancelProfile = () => {
    setPfForm(emptyProfile);
    setPfEditingId(null);
  };

  /* ── Pontos de restauração (Fase 9) ────────────────────── */

  const [rpLabel, setRpLabel] = useState('');
  const { data: restorePoints = [] } = useMFRestorePoints(user);
  const savePoint = useSaveMFRestorePoint();
  const restoreMutation = useRestoreMFRestorePoint();
  const deletePoint = useDeleteMFRestorePoint();

  const pointDate = (iso) => {
    try {
      return new Date(iso).toLocaleString(i18n.language, {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  };

  const saveRestorePoint = async () => {
    const label = rpLabel.trim();
    if (!label) {
      toast.error(t('minhasfinancas.cfg_name_required'));
      return;
    }
    try {
      await savePoint.mutateAsync(label);
      toast.success(t('minhasfinancas.rp_saved'));
      setRpLabel('');
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const handleRestorePoint = (point) => {
    confirmToast(
      t('minhasfinancas.rp_restore_confirm', { label: point.label }),
      async () => {
        try {
          await restoreMutation.mutateAsync(point);
          toast.success(t('minhasfinancas.rp_restored'));
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.rp_restore') }
    );
  };

  const removeRestorePoint = (point) => {
    confirmToast(
      t('minhasfinancas.rp_del_confirm', { label: point.label }),
      async () => {
        try {
          await deletePoint.mutateAsync(point.id);
          toast.success(t('minhasfinancas.cfg_deleted'));
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.delete') }
    );
  };

  const header = (
    <div
      className="glass-card"
      style={{
        padding: '1.25rem 1.5rem',
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          padding: '0.6rem',
          borderRadius: 14,
          background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
          color: 'var(--primary)',
        }}
      >
        <Settings size={22} />
      </div>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
          {t('nav.sub.minhasfinancas.settings')}
        </h2>
        <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {t('minhasfinancas.settings_desc')}
        </p>
      </div>
    </div>
  );

  const [view, setView] = useState('main');

  // Tela dedicada de categorias (replica o Minhas Finanças)
  if (view === 'categories') {
    return <MFCategoriesScreen user={user} onBack={() => setView('main')} />;
  }

  return (
    <div data-testid="mf-config" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {header}

      {/* ── Categorias ── */}
      <div className="glass-card" data-testid="mf-cfg-section-categories" style={{ padding: '1.25rem 1.5rem' }}>
        <h3 style={sectionTitle}>
          <FolderTree size={17} /> {t('minhasfinancas.cfg_categories')}
        </h3>
        <p style={sectionDesc}>{t('minhasfinancas.cfg_categories_desc')}</p>

        {/* Card que leva para a tela dedicada de categorias */}
        <button
          type="button"
          className="btn-secondary"
          data-testid="mf-cfg-open-categories"
          onClick={() => setView('categories')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            width: '100%',
            justifyContent: 'space-between',
            padding: '0.7rem 1rem',
            fontWeight: 700,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <FolderTree size={15} />
            {t('minhasfinancas.cfg_manage_categories')}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              color: 'var(--text-muted)',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            {categories.length}
            <ChevronRight size={15} />
          </span>
        </button>
      </div>

      {/* ── Tipos de conta ── */}
      <div className="glass-card" data-testid="mf-cfg-section-types" style={{ padding: '1.25rem 1.5rem' }}>
        <h3 style={sectionTitle}>
          <Landmark size={17} /> {t('minhasfinancas.cfg_types')}
        </h3>
        <p style={sectionDesc}>{t('minhasfinancas.cfg_types_desc')}</p>

        <div
          style={{
            display: 'flex',
            gap: '0.6rem',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            marginBottom: '0.75rem',
          }}
        >
          <button
            type="button"
            aria-label={t('minhasfinancas.type_icon')}
            aria-expanded={typeIconOpen}
            data-testid="mf-cfg-type-icon"
            onClick={() => setTypeIconOpen((prev) => !prev)}
            style={{
              width: 54,
              minHeight: 40,
              fontSize: '1.35rem',
              lineHeight: 1,
              textAlign: 'center',
              border: '1px solid var(--glass-border)',
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.04)',
              cursor: 'pointer',
            }}
          >
            {typeForm.icon}
          </button>
          <div className="input-group" style={{ flex: '2 1 200px', margin: 0 }}>
            <label>{t('minhasfinancas.type_name')}</label>
            <input
              type="text"
              style={inputStyle}
              value={typeForm.name}
              onChange={(event) => setTypeForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={t('minhasfinancas.type_name')}
              data-testid="mf-cfg-type-name"
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-cfg-type-save"
            onClick={saveAccountType}
            disabled={createType.isPending}
            style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
          >
            <Plus size={15} />
            {t('minhasfinancas.save')}
          </button>
        </div>

        {typeIconOpen && (
          <div
            role="listbox"
            aria-label={t('minhasfinancas.type_icon')}
            data-testid="mf-cfg-type-icon-picker"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
              gap: '0.4rem',
              marginBottom: '0.75rem',
              padding: '0.6rem',
              maxHeight: 170,
              overflowY: 'auto',
              border: '1px dashed var(--glass-border)',
              borderRadius: 10,
            }}
          >
            {MF_TYPE_EMOJIS.map((emoji, index) => (
              <button
                type="button"
                key={`${emoji}-${index}`}
                role="option"
                aria-selected={typeForm.icon === emoji}
                data-testid={`mf-cfg-type-icon-opt-${index}`}
                onClick={() => {
                  setTypeForm((prev) => ({ ...prev, icon: emoji }));
                  setTypeIconOpen(false);
                }}
                style={{
                  padding: '0.4rem 0',
                  fontSize: '1.35rem',
                  lineHeight: 1,
                  borderRadius: 8,
                  border: `1px solid ${typeForm.icon === emoji ? 'var(--primary)' : 'transparent'}`,
                  background:
                    typeForm.icon === emoji
                      ? 'color-mix(in srgb, var(--primary) 18%, transparent)'
                      : 'transparent',
                  cursor: 'pointer',
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {customTypes.length === 0 && (
          <p
            data-testid="mf-cfg-empty-types"
            style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.5rem 0' }}
          >
            {t('minhasfinancas.cfg_empty_types')}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {customTypes.map((item) => (
            <span
              key={item.id}
              data-testid="mf-cfg-type-row"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                border: '1px solid var(--glass-border)',
                borderRadius: '999px',
                padding: '0.3rem 0.7rem',
              }}
            >
              {item.icon} {item.name}
              <button
                type="button"
                className="icon-btn"
                aria-label={t('minhasfinancas.delete')}
                data-testid={`mf-cfg-type-del-${item.id}`}
                onClick={() => removeAccountType(item)}
                style={{ padding: 2, width: 20, height: 20 }}
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* ── Tags (gestão completa: busca, utilização, lançamentos) ── */}
      <div className="glass-card" data-testid="mf-cfg-section-tags" style={{ padding: '1.25rem 1.5rem' }}>
        <h3 style={sectionTitle}>
          <Tag size={17} /> {t('minhasfinancas.cfg_tags')}
        </h3>
        <p style={sectionDesc}>{t('minhasfinancas.cfg_tags_desc')}</p>
        <MFTagsManager user={user} />
      </div>

      {/* ── Responsáveis ── */}
      <div className="glass-card" data-testid="mf-cfg-section-responsibles" style={{ padding: '1.25rem 1.5rem' }}>
        <h3 style={sectionTitle}>
          <Users size={17} /> {t('minhasfinancas.cfg_responsibles')}
        </h3>
        <p style={sectionDesc}>{t('minhasfinancas.cfg_responsibles_desc')}</p>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
          <div className="input-group" style={{ flex: '2 1 170px' }}>
            <label>{t('minhasfinancas.cfg_name')}</label>
            <input
              type="text"
              style={inputStyle}
              value={respForm.name}
              onChange={(event) => setRespForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={t('minhasfinancas.cfg_name')}
              data-testid="mf-cfg-resp-name"
            />
          </div>
          <div className="input-group" style={{ flex: '2 1 200px' }}>
            <label>{t('minhasfinancas.cfg_email')}</label>
            <input
              type="email"
              style={inputStyle}
              value={respForm.email}
              onChange={(event) => setRespForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="email@exemplo.com"
              data-testid="mf-cfg-resp-email"
            />
          </div>
          <div className="input-group" style={{ flex: '0 0 auto' }}>
            <label>{t('minhasfinancas.cfg_color')}</label>
            <input
              type="color"
              value={respForm.color}
              onChange={(event) => setRespForm((prev) => ({ ...prev, color: event.target.value }))}
              data-testid="mf-cfg-resp-color"
              style={{ width: 44, height: 34, padding: 2, border: '1px solid var(--glass-border)', borderRadius: 10, background: 'transparent' }}
            />
          </div>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={respForm.is_main}
              onChange={(event) => setRespForm((prev) => ({ ...prev, is_main: event.target.checked }))}
              data-testid="mf-cfg-resp-main"
            />
            <Star size={13} /> {t('minhasfinancas.cfg_main')}
          </label>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-cfg-resp-save"
            onClick={saveResponsible}
            style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
          >
            <Plus size={15} />
            {t('minhasfinancas.save')}
          </button>
          {respEditingId && (
            <button type="button" className="btn-cancel" onClick={cancelResp} style={{ padding: '0.55rem 0.8rem' }}>
              {t('minhasfinancas.cancel')}
            </button>
          )}
        </div>

        {responsibles.length === 0 && (
          <p data-testid="mf-cfg-empty-responsibles" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.5rem 0' }}>
            {t('minhasfinancas.cfg_empty_responsibles')}
          </p>
        )}

        {responsibles.map((resp) => (
          <div key={resp.id} data-testid="mf-cfg-resp-row" style={rowStyle}>
            <span style={colorDot(resp.color)} />
            <span style={{ fontWeight: 700, flex: 1 }}>{resp.name}</span>
            {resp.email && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{resp.email}</span>
            )}
            {resp.is_main && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  color: '#f59e0b',
                  border: '1px solid color-mix(in srgb, #f59e0b 40%, transparent)',
                  background: 'color-mix(in srgb, #f59e0b 12%, transparent)',
                  borderRadius: 999,
                  padding: '0.1rem 0.5rem',
                }}
              >
                <Star size={11} /> {t('minhasfinancas.cfg_main')}
              </span>
            )}
            <button
              type="button"
              className="icon-btn"
              data-testid={`mf-cfg-resp-edit-${resp.id}`}
              aria-label={t('minhasfinancas.edit')}
              onClick={() => startEditResponsible(resp)}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="icon-btn"
              data-testid={`mf-cfg-resp-del-${resp.id}`}
              aria-label={t('minhasfinancas.delete')}
              onClick={() => removeResponsible(resp)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* ── Perfis ── */}
      <div className="glass-card" data-testid="mf-cfg-section-profiles" style={{ padding: '1.25rem 1.5rem' }}>
        <h3 style={sectionTitle}>
          <Layers size={17} /> {t('minhasfinancas.pf_section')}
        </h3>
        <p style={sectionDesc}>{t('minhasfinancas.pf_section_desc')}</p>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
          <div className="input-group" style={{ flex: '2 1 200px' }}>
            <label>{t('minhasfinancas.pf_name')}</label>
            <input
              type="text"
              style={inputStyle}
              value={pfForm.name}
              onChange={(event) => setPfForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={t('minhasfinancas.pf_name')}
              data-testid="mf-profile-name"
            />
          </div>
          <div className="input-group" style={{ flex: '0 0 auto' }}>
            <label>{t('minhasfinancas.cfg_color')}</label>
            <input
              type="color"
              value={pfForm.color}
              onChange={(event) => setPfForm((prev) => ({ ...prev, color: event.target.value }))}
              data-testid="mf-profile-color"
              style={{ width: 44, height: 34, padding: 2, border: '1px solid var(--glass-border)', borderRadius: 10, background: 'transparent' }}
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-profile-save"
            onClick={saveProfile}
            style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
          >
            <Plus size={15} />
            {t('minhasfinancas.save')}
          </button>
          {pfEditingId && (
            <button type="button" className="btn-cancel" onClick={cancelProfile} style={{ padding: '0.55rem 0.8rem' }}>
              {t('minhasfinancas.cancel')}
            </button>
          )}
        </div>

        {profiles.length === 0 && (
          <p data-testid="mf-profile-empty" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.5rem 0' }}>
            {t('minhasfinancas.pf_empty')}
          </p>
        )}

        {profiles.map((profile) => (
          <div key={profile.id} data-testid="mf-profile-row" style={rowStyle}>
            <span style={colorDot(profile.color)} />
            <span style={{ fontWeight: 700, flex: 1 }}>{profile.name}</span>
            <button
              type="button"
              className="icon-btn"
              data-testid={`mf-profile-edit-${profile.id}`}
              aria-label={t('minhasfinancas.edit')}
              onClick={() => startEditProfile(profile)}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="icon-btn"
              data-testid={`mf-profile-del-${profile.id}`}
              aria-label={t('minhasfinancas.delete')}
              onClick={() => removeProfile(profile)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* ── Pontos de restauração ── */}
      <div className="glass-card" data-testid="mf-cfg-section-restore" style={{ padding: '1.25rem 1.5rem' }}>
        <h3 style={sectionTitle}>
          <History size={17} /> {t('minhasfinancas.rp_title')}
        </h3>
        <p style={sectionDesc}>{t('minhasfinancas.rp_desc')}</p>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
          <div className="input-group" style={{ flex: '3 1 220px' }}>
            <label>{t('minhasfinancas.rp_label')}</label>
            <input
              type="text"
              style={inputStyle}
              value={rpLabel}
              onChange={(event) => setRpLabel(event.target.value)}
              placeholder={t('minhasfinancas.rp_placeholder')}
              data-testid="mf-rp-label"
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-rp-save"
            onClick={saveRestorePoint}
            disabled={savePoint.isPending}
            style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
          >
            <Save size={15} />
            {t('minhasfinancas.rp_save')}
          </button>
        </div>

        {restorePoints.length === 0 && (
          <p data-testid="mf-rp-empty" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.5rem 0' }}>
            {t('minhasfinancas.rp_empty')}
          </p>
        )}

        {restorePoints.map((point) => (
          <div key={point.id} data-testid="mf-rp-point" style={rowStyle}>
            <History size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ fontWeight: 700, flex: 1 }}>{point.label}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {pointDate(point.created_at)}
            </span>
            <button
              type="button"
              className="btn-secondary"
              data-testid={`mf-rp-restore-${point.id}`}
              onClick={() => handleRestorePoint(point)}
              disabled={restoreMutation.isPending}
              style={{ padding: '0.4rem 0.7rem', fontSize: '0.78rem' }}
            >
              <RotateCcw size={13} />
              {t('minhasfinancas.rp_restore')}
            </button>
            <button
              type="button"
              className="icon-btn"
              data-testid={`mf-rp-del-${point.id}`}
              aria-label={t('minhasfinancas.delete')}
              onClick={() => removeRestorePoint(point)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
