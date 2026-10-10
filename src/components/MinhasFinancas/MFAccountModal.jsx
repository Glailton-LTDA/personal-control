import React, { useEffect, useState } from 'react';
import { X, Landmark, Plus, Search, ChevronDown, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  useCreateAccount,
  useUpdateAccount,
  useMFAccounts,
  useMFAccountTypes,
  useCreateAccountType,
  useMFProfiles,
  useMFGroups,
  parseMoney,
  maskAmount,
  MF_BUILTIN_ACCOUNT_TYPES,
  MF_ACCOUNT_TYPE_ICONS,
} from '../../hooks/useMinhasFinancas';
import { useMFProfileScope } from '../../hooks/mfProfileContext';
import MFCurrencySelect from './MFCurrencySelect';
import MFAccountIcon from './MFAccountIcon';
import MFGroupIcon from './MFGroupIcon';
import { MF_BRAND_ICONS, MF_GLYPH_ICONS } from './MFIconData';
import { MF_CATEGORY_ICONS } from './MFCategoryIcons';
import MFSelect from './MFSelect';
import MFCardBrandIcon from './MFCardBrandIcon';
import MFGroupModal from './MFGroupModal';

const COLORS = [
  '#6366f1',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#3b82f6',
  '#f43f5e',
];

const CARD_BRANDS = ['visa', 'mastercard', 'elo', 'amex', 'hipercard', 'outro'];

/**
 * Emojis do seletor de ícone de um tipo novo de conta: os ícones dos tipos
 * padrão primeiro (🏦🐷💵💳📈📦) e depois a grade curada das categorias.
 */
const MF_TYPE_EMOJIS = [
  ...new Set([...Object.values(MF_ACCOUNT_TYPE_ICONS), ...MF_CATEGORY_ICONS]),
];

const emptyForm = {
  name: '',
  account_type: 'CORRENTE',
  currency: 'BRL',
  initial_balance: '',
  color: COLORS[0],
  icon: '',
  card_brand: '',
  closing_day: '',
  due_day: '',
  credit_limit: '',
  linked_account_id: '',
  profile_id: '',
  group_id: '',
  ignore_in_totals: false,
};

/** Botão quadrado do seletor de ícone (borda branca quando selecionado). */
const iconSwatchStyle = (selected) => ({
  width: 36,
  height: 36,
  padding: 0,
  cursor: 'pointer',
  borderRadius: 10,
  border: selected ? '2px solid var(--text-main)' : '2px solid var(--glass-border)',
  background: 'transparent',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

/**
 * Modal de criação/edição de conta (mf_accounts).
 * Tipos de conta: 6 padrões + personalizados (mf_account_types),
 * com criação/ remoção direto no campo "Tipo".
 */
export default function MFAccountModal({ isOpen, onClose, account = null, user, defaultType = null, defaultGroupId = null }) {
  const { t } = useTranslation();
  const createMutation = useCreateAccount();
  const updateMutation = useUpdateAccount();
  const { data: customTypes = [] } = useMFAccountTypes(user);
  const { data: allAccounts = [] } = useMFAccounts(user);
  const { data: profiles = [] } = useMFProfiles(user);
  const { data: groups = [] } = useMFGroups(user);
  const activeProfileId = useMFProfileScope();
  const createTypeMutation = useCreateAccountType();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showNewType, setShowNewType] = useState(false);
  const [newType, setNewType] = useState({ name: '', icon: '💳' });
  // Seletor de ícone: painel recolhível com busca (catálogo grande de marcas)
  const [iconsOpen, setIconsOpen] = useState(false);
  const [iconQuery, setIconQuery] = useState('');
  // Painel de emojis do tipo novo de conta (fecha ao escolher/fechar o form)
  const [typeIconOpen, setTypeIconOpen] = useState(false);
  // Modal "Novo Grupo de Contas" aberto a partir do campo Grupo
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setShowNewType(false);
    setNewType({ name: '', icon: '💳' });
    setIconsOpen(false);
    setIconQuery('');
    setTypeIconOpen(false);
    setGroupModalOpen(false);
    setForm(
      account
        ? {
            name: account.name ?? '',
            account_type: account.account_type ?? 'CORRENTE',
            currency: account.currency || 'BRL',
            initial_balance: account.initial_balance
              ? (Number(account.initial_balance) || 0).toFixed(2).replace('.', ',')
              : '',
            color: account.color || COLORS[0],
            icon: account.icon ?? '',
            card_brand: account.card_brand ?? '',
            closing_day: account.closing_day ? String(account.closing_day) : '',
            due_day: account.due_day ? String(account.due_day) : '',
            credit_limit: account.credit_limit
              ? (Number(account.credit_limit) || 0).toFixed(2).replace('.', ',')
              : '',
            linked_account_id: account.linked_account_id ?? '',
            profile_id: account.profile_id ?? '',
            group_id: account.group_id ?? '',
            ignore_in_totals: account.ignore_in_totals ?? false,
          }
        : {
            ...emptyForm,
            account_type: defaultType ?? emptyForm.account_type,
            profile_id: activeProfileId ?? '',
            group_id: defaultGroupId ?? '',
          }
    );
  }, [isOpen, account, activeProfileId, defaultType, defaultGroupId]);

  if (!isOpen) return null;

  const set = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  // Seletor de ícone: filtro de busca por chave/nome + rótulo do selecionado
  const iconQueryKey = iconQuery.trim().toLowerCase();
  const brandOptions = Object.entries(MF_BRAND_ICONS).filter(
    ([key, brand]) =>
      !iconQueryKey || key.includes(iconQueryKey) || brand.name.toLowerCase().includes(iconQueryKey)
  );
  const glyphOptions = Object.keys(MF_GLYPH_ICONS).filter(
    (key) => !iconQueryKey || key.includes(iconQueryKey)
  );
  const [iconKind, iconKey] = form.icon.includes(':') ? form.icon.split(':') : ['', ''];
  const selectedIconName = !form.icon
    ? t('minhasfinancas.icon_auto')
    : iconKind === 'brand'
      ? MF_BRAND_ICONS[iconKey]?.name || iconKey
      : iconKind === 'glyph'
        ? iconKey
        : t('minhasfinancas.icon_auto');

  // Opções do campo Tipo: personalizados + eventual tipo já gravado que foi removido do cadastro
  const customOptions = [...customTypes];
  if (
    form.account_type &&
    !MF_BUILTIN_ACCOUNT_TYPES.includes(form.account_type) &&
    !customTypes.some((item) => item.name === form.account_type)
  ) {
    customOptions.push({ id: '__ghost__', name: form.account_type, icon: '🏷️' });
  }

  // Na criação comum (tela Contas) o cartão não é opção: eles nascem na aba
  // Cartões (defaultType trava o tipo e esconde o campo). Na edição todos os
  // tipos seguem válidos (convertível conta ↔ cartão).
  const builtinTypes = MF_BUILTIN_ACCOUNT_TYPES.filter(
    (type) => account || defaultType || type !== 'CARTAO'
  );

  // Opções do campo Grupo: hierarquia indentada (nbsp para não colapsar)
  const groupOptions = (() => {
    const byId = new Map(groups.map((group) => [group.id, group]));
    const depthOf = (group) => {
      let depth = 0;
      let cursor = group;
      while (cursor?.parent_id && byId.has(cursor.parent_id) && depth < 10) {
        depth += 1;
        cursor = byId.get(cursor.parent_id);
      }
      return depth;
    };
    return [
      { value: '', label: t('minhasfinancas.account_group_none') },
      ...groups.map((group) => ({
        value: group.id,
        icon: <MFGroupIcon icon={group.icon} name={group.name} size={18} />,
        label: `${'\u00A0\u00A0\u00A0'.repeat(depthOf(group))}${group.name}`,
      })),
    ];
  })();

  const handleAddType = async () => {
    const name = newType.name.trim();
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
      const created = await createTypeMutation.mutateAsync({
        user_id: user.id,
        name,
        icon: newType.icon.trim() || '💳',
      });
      setForm((prev) => ({ ...prev, account_type: created?.name ?? name }));
      toast.success(t('minhasfinancas.type_saved'));
      setNewType({ name: '', icon: '💳' });
      setShowNewType(false);
    } catch (error) {
      if (error?.code === '23505') toast.error(t('minhasfinancas.type_duplicate'));
      else toast.error(t('minhasfinancas.save_error'));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error(t('minhasfinancas.name_required'));
      return;
    }

    const isCard = form.account_type === 'CARTAO';
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      account_type: form.account_type,
      currency: form.currency,
      initial_balance: parseMoney(form.initial_balance),
      color: form.color,
      icon: form.icon || null,
      card_brand: isCard && form.card_brand ? form.card_brand : null,
      closing_day: isCard && form.closing_day ? Number(form.closing_day) : null,
      due_day: isCard && form.due_day ? Number(form.due_day) : null,
      credit_limit: isCard && form.credit_limit ? parseMoney(form.credit_limit) : null,
      linked_account_id: isCard && form.linked_account_id ? form.linked_account_id : null,
      profile_id: form.profile_id || null,
      // Grupo é só de conta comum — cartão nunca entra em grupo
      group_id: isCard ? null : form.group_id || null,
      // "Ignorar nos totais": saldo fica fora de KPIs e somas de grupo
      ignore_in_totals: !!form.ignore_in_totals,
    };

    setSaving(true);
    try {
      if (account) await updateMutation.mutateAsync({ id: account.id, ...payload });
      else await createMutation.mutateAsync({ ...payload, sort_order: 0 });
      toast.success(t(account ? 'minhasfinancas.account_updated' : 'minhasfinancas.account_saved'));
      onClose();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" data-testid="mf-account-modal" onClick={onClose}>
      <div className="glass-card modal-content" onClick={(event) => event.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                padding: '0.6rem',
                borderRadius: 14,
                background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
                color: 'var(--primary)',
              }}
            >
              <Landmark size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {t(account ? 'minhasfinancas.edit_account' : 'minhasfinancas.new_account')}
              </h3>
              <p
                style={{
                  margin: '0.2rem 0 0',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                }}
              >
                {t('minhasfinancas.account_desc')}
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} data-testid="mf-account-form">
          <div className="input-group">
            <label>{t('minhasfinancas.account_name')}</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={set('name')}
              placeholder={t('minhasfinancas.account_name_placeholder')}
              data-testid="mf-account-name"
            />
          </div>

          {/* Grupo é exclusivo de conta comum — cartão não mostra o campo */}
          {form.account_type !== 'CARTAO' && (
            <div className="input-group">
              <label>{t('minhasfinancas.account_group')}</label>
              <MFSelect
                testId="mf-account-group"
                value={form.group_id}
                onChange={(next) => setForm((prev) => ({ ...prev, group_id: next }))}
                options={groupOptions}
              />
              <button
                type="button"
                className="btn-cancel"
                data-testid="mf-new-group-toggle"
                onClick={() => setGroupModalOpen(true)}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.4rem 0.7rem',
                  fontSize: '0.8rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  width: '100%',
                }}
              >
                <Plus size={14} />
                {t('minhasfinancas.group_create_action')}
              </button>
            </div>
          )}

          <div className="form-grid">
            {!defaultType && (
            <div className="input-group">
              <label>{t('minhasfinancas.account_type')}</label>
              <MFSelect
                testId="mf-account-type"
                value={form.account_type}
                onChange={(next) => set('account_type')({ target: { value: next } })}
                placeholder={t('minhasfinancas.account_type')}
                options={[
                  ...builtinTypes.map((type) => ({
                    value: type,
                    group: t('minhasfinancas.default_types'),
                    label: `${MF_ACCOUNT_TYPE_ICONS[type]} ${t(`minhasfinancas.type_${type.toLowerCase()}`)}`,
                  })),
                  ...customOptions.map((item) => ({
                    value: item.name,
                    group: t('minhasfinancas.custom_types'),
                    label: `${item.icon} ${item.name}`,
                  })),
                ]}
              />

              <button
                type="button"
                className="btn-cancel"
                data-testid="mf-new-type-toggle"
                onClick={() => setShowNewType((prev) => !prev)}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.4rem 0.7rem',
                  fontSize: '0.8rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  width: '100%',
                }}
              >
                <Plus size={14} />
                {t('minhasfinancas.new_type')}
              </button>
            </div>
            )}

            <div className="input-group">
              <label>{t('minhasfinancas.currency_label')}</label>
              <MFCurrencySelect
                value={form.currency}
                onChange={(code) => setForm((prev) => ({ ...prev, currency: code }))}
                includeAll={false}
                label={t('minhasfinancas.currency_label')}
                testId="mf-account-currency"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Perfil (Fase 9): aparece apenas com perfis cadastrados */}
          {profiles.length > 0 && (
            <div className="input-group">
              <label>{t('minhasfinancas.account_profile')}</label>
              <MFSelect
                testId="mf-account-profile"
                value={form.profile_id}
                onChange={(next) => set('profile_id')({ target: { value: next } })}
                searchable={false}
                placeholder={t('minhasfinancas.pf_none')}
                options={[
                  { value: '', label: t('minhasfinancas.pf_none') },
                  ...profiles.map((profile) => ({
                    value: profile.id,
                    label: profile.name,
                  })),
                ]}
              />
            </div>
          )}

          {showNewType && (
            <div
              className="input-group"
              data-testid="mf-new-type-form"
              style={{
                border: '1px dashed var(--glass-border)',
                borderRadius: 12,
                padding: '0.75rem',
                marginTop: '0.5rem',
              }}
            >
              <label>{t('minhasfinancas.type_name')}</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  aria-label={t('minhasfinancas.type_icon')}
                  aria-expanded={typeIconOpen}
                  data-testid="mf-new-type-icon"
                  onClick={() => setTypeIconOpen((prev) => !prev)}
                  style={{
                    width: 64,
                    minHeight: 40,
                    fontSize: '1.5rem',
                    lineHeight: 1,
                    textAlign: 'center',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.04)',
                    cursor: 'pointer',
                  }}
                >
                  {newType.icon}
                </button>
                <input
                  type="text"
                  data-testid="mf-new-type-name"
                  value={newType.name}
                  onChange={(event) =>
                    setNewType((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder={t('minhasfinancas.type_name_placeholder')}
                  style={{ flex: 1 }}
                />
              </div>
              {typeIconOpen && (
                <div
                  role="listbox"
                  aria-label={t('minhasfinancas.type_icon')}
                  data-testid="mf-new-type-icon-picker"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
                    gap: '0.4rem',
                    marginTop: '0.6rem',
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
                      aria-selected={newType.icon === emoji}
                      data-testid={`mf-new-type-icon-opt-${index}`}
                      onClick={() => {
                        setNewType((prev) => ({ ...prev, icon: emoji }));
                        setTypeIconOpen(false);
                      }}
                      style={{
                        padding: '0.4rem 0',
                        fontSize: '1.35rem',
                        lineHeight: 1,
                        borderRadius: 8,
                        border: `1px solid ${
                          newType.icon === emoji ? 'var(--primary)' : 'transparent'
                        }`,
                        background:
                          newType.icon === emoji
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
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                <button
                  type="button"
                  className="btn-primary"
                  data-testid="mf-new-type-save"
                  disabled={createTypeMutation.isPending}
                  onClick={handleAddType}
                  style={{ flex: 1, padding: '0.5rem' }}
                >
                  {createTypeMutation.isPending ? '…' : t('minhasfinancas.save')}
                </button>
                <button
                  type="button"
                  className="btn-cancel"
                  data-testid="mf-new-type-cancel"
                  onClick={() => {
                    setShowNewType(false);
                    setTypeIconOpen(false);
                  }}
                  style={{ flex: 1, padding: '0.5rem' }}
                >
                  {t('minhasfinancas.cancel')}
                </button>
              </div>
            </div>
          )}

          <div className="input-group">
            <label>{t('minhasfinancas.account_initial_balance')}</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.initial_balance}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  initial_balance: maskAmount(event.target.value),
                }))
              }
              placeholder="0,00"
            />
          </div>

          {form.account_type === 'CARTAO' && (
            <div className="form-grid">
              <div className="input-group">
                <label>{t('minhasfinancas.account_closing_day')}</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={form.closing_day}
                  onChange={set('closing_day')}
                  placeholder="1"
                  data-testid="mf-card-closing"
                />
              </div>
              <div className="input-group">
                <label>{t('minhasfinancas.account_due_day')}</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={form.due_day}
                  onChange={set('due_day')}
                  placeholder="10"
                  data-testid="mf-card-due"
                />
              </div>
              <div className="input-group">
                <label>{t('minhasfinancas.account_credit_limit')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.credit_limit}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, credit_limit: maskAmount(event.target.value) }))
                  }
                  placeholder="0,00"
                  data-testid="mf-card-limit"
                />
              </div>
              <div className="input-group">
                <label>{t('minhasfinancas.account_linked')}</label>
                <MFSelect
                  testId="mf-card-linked"
                  value={form.linked_account_id}
                  onChange={(next) => set('linked_account_id')({ target: { value: next } })}
                  placeholder={t('minhasfinancas.account_linked_none')}
                  options={[
                    { value: '', label: t('minhasfinancas.account_linked_none') },
                    ...allAccounts
                      .filter(
                        (item) =>
                          item.account_type !== 'CARTAO' && item.id !== account?.id
                      )
                      .map((item) => ({
                        value: item.id,
                        label: item.name,
                        meta: `(${item.currency || 'BRL'})`,
                        color: item.color,
                      })),
                  ]}
                />
              </div>
              <div className="input-group">
                <label>{t('minhasfinancas.account_card_brand')}</label>
                <MFSelect
                  testId="mf-card-brand"
                  value={form.card_brand}
                  onChange={(next) => set('card_brand')({ target: { value: next } })}
                  searchable={false}
                  placeholder={t('minhasfinancas.account_card_brand_none')}
                  options={[
                    { value: '', label: t('minhasfinancas.account_card_brand_none') },
                    ...CARD_BRANDS.map((brand) => ({
                      value: brand,
                      label: t(`minhasfinancas.card_brand_${brand}`),
                      icon: (
                        <MFCardBrandIcon
                          brand={brand}
                          size={16}
                          title={t(`minhasfinancas.card_brand_${brand}`)}
                        />
                      ),
                    })),
                  ]}
                />
              </div>
            </div>
          )}

          {/* Ícone: seletor recolhível com busca (catálogo grande de marcas) */}
          <div className="input-group" data-testid="mf-account-icon">
            <label>{t('minhasfinancas.account_icon')}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              <button
                type="button"
                data-testid="mf-icon-toggle"
                aria-expanded={iconsOpen}
                onClick={() => {
                  setIconsOpen((prev) => !prev);
                  if (iconsOpen) setIconQuery('');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.4rem 0.7rem',
                  borderRadius: 12,
                  border: '1px solid var(--glass-border)',
                  background: 'var(--input-bg)',
                  cursor: 'pointer',
                  width: 'fit-content',
                  color: 'var(--text-main)',
                }}
              >
                <MFAccountIcon
                  account={{
                    icon: form.icon,
                    name: form.name || account?.name || '?',
                    color: form.color,
                  }}
                  size={30}
                />
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{selectedIconName}</span>
                <ChevronDown
                  size={15}
                  style={{ transform: iconsOpen ? 'rotate(180deg)' : 'none', transition: '0.15s' }}
                />
              </button>

              {iconsOpen && (
                <div
                  data-testid="mf-icon-panel"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.55rem',
                    padding: '0.7rem',
                    borderRadius: 12,
                    border: '1px solid var(--glass-border)',
                    background: 'var(--input-bg)',
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
                      data-testid="mf-icon-search"
                      value={iconQuery}
                      onChange={(event) => setIconQuery(event.target.value)}
                      placeholder={t('minhasfinancas.icon_search')}
                      autoFocus
                      style={{ padding: '0.5rem 0.75rem 0.5rem 2rem', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div
                    style={{
                      maxHeight: 260,
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.6rem',
                    }}
                  >
                    {!iconQueryKey && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: '0.4rem' }}>
                        <button
                          type="button"
                          aria-label={t('minhasfinancas.icon_auto')}
                          title={t('minhasfinancas.icon_auto')}
                          data-testid="mf-icon-auto"
                          onClick={() => setForm((prev) => ({ ...prev, icon: '' }))}
                          style={iconSwatchStyle(form.icon === '')}
                        >
                          <MFAccountIcon
                            account={{
                              icon: '',
                              name: form.name || account?.name || '?',
                              color: form.color,
                            }}
                            size={26}
                          />
                        </button>
                      </div>
                    )}

                    {brandOptions.length > 0 && (
                      <>
                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                          {t('minhasfinancas.icon_brands')}
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: '0.4rem' }}>
                          {brandOptions.map(([key, brand]) => (
                            <button
                              key={key}
                              type="button"
                              aria-label={brand.name}
                              title={brand.name}
                              data-testid={`mf-icon-brand-${key}`}
                              onClick={() => setForm((prev) => ({ ...prev, icon: `brand:${key}` }))}
                              style={iconSwatchStyle(form.icon === `brand:${key}`)}
                            >
                              <MFAccountIcon account={{ icon: `brand:${key}` }} size={26} />
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {glyphOptions.length > 0 && (
                      <>
                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                          {t('minhasfinancas.icon_generics')}
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: '0.4rem' }}>
                          {glyphOptions.map((key) => (
                            <button
                              key={key}
                              type="button"
                              aria-label={key}
                              title={key}
                              data-testid={`mf-icon-glyph-${key}`}
                              onClick={() => setForm((prev) => ({ ...prev, icon: `glyph:${key}` }))}
                              style={iconSwatchStyle(form.icon === `glyph:${key}`)}
                            >
                              <MFAccountIcon
                                account={{ icon: `glyph:${key}`, color: form.color }}
                                size={26}
                              />
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {brandOptions.length === 0 && glyphOptions.length === 0 && (
                      <p
                        data-testid="mf-icon-empty"
                        style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}
                      >
                        {t('common.no_results')}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="input-group">
            <label>{t('minhasfinancas.account_color')}</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  onClick={() => setForm((prev) => ({ ...prev, color }))}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: color,
                    border:
                      form.color === color
                        ? '2px solid var(--text-main)'
                        : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                />
              ))}
              <input
                type="color"
                data-testid="mf-account-color-picker"
                aria-label={t('minhasfinancas.account_color_custom')}
                title={t('minhasfinancas.account_color_custom')}
                value={/^#[0-9a-fA-F]{6}$/.test(form.color) ? form.color : COLORS[0]}
                onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
                style={{
                  width: 28,
                  height: 28,
                  padding: 1,
                  borderRadius: '50%',
                  border: '1px solid var(--glass-border)',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              />
            </div>
          </div>

          {/* Ignorar nos totais: conta listada, mas fora das somas */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              marginTop: '1rem',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: form.ignore_in_totals ? 'var(--primary)' : 'var(--text-main)',
            }}
          >
            <input
              type="checkbox"
              data-testid="mf-account-ignore-totals"
              checked={form.ignore_in_totals}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, ignore_in_totals: event.target.checked }))
              }
              style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
            <Ban size={14} style={{ color: 'var(--text-muted)' }} />
            {t('minhasfinancas.ignore_in_totals')}
          </label>

          <div className="modal-footer" style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" className="btn-cancel" onClick={onClose} style={{ flex: 1 }}>
              {t('minhasfinancas.cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary"
              data-testid="mf-account-save"
              disabled={saving}
              style={{ flex: 2 }}
            >
              {saving ? '…' : t('minhasfinancas.save')}
            </button>
          </div>
        </form>
      </div>

      {/* Criar grupo de contas a partir do campo Grupo */}
      {groupModalOpen && (
        <MFGroupModal
          user={user}
          onClose={() => setGroupModalOpen(false)}
          onSaved={(created) => {
            if (created?.id) {
              setForm((prev) => ({ ...prev, group_id: created.id }));
            }
            setGroupModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
