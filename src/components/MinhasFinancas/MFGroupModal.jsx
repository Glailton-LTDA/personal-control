import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, FolderTree, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useMFGroups,
  useMFAccounts,
  useCreateMFGroup,
  useUpdateMFGroup,
  useUpdateAccount,
  MF_ACCOUNT_TYPE_ICONS,
} from '../../hooks/useMinhasFinancas';
import { MF_CATEGORY_ICONS } from './MFCategoryIcons';
import { MF_BRAND_ICONS } from './MFIconData';
import MFAccountIcon from './MFAccountIcon';
import MFGroupIcon from './MFGroupIcon';
import MFSelect from './MFSelect';

/** Emojis do seletor de ícone do grupo (tipos padrão + categorias). */
const GROUP_EMOJIS = [
  ...new Set([...Object.values(MF_ACCOUNT_TYPE_ICONS), ...MF_CATEGORY_ICONS]),
];

/** Switch estilizado (print: "Exibir na tela de Resumo"). */
function Switch({ checked, onChange, testId }) {
  return (
    <span
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onChange(!checked);
        }
      }}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: 40,
        height: 22,
        borderRadius: 999,
        background: checked ? 'var(--primary)' : 'var(--glass-border)',
        transition: 'background 0.2s',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
        }}
      />
    </span>
  );
}

/**
 * Modal "Novo/Editar Grupo de Contas" (print do app original):
 * nome + ícone, flags (exibir no Resumo / somar totais), grupo pai
 * (com guarda de ciclo) e a lista de contas do grupo. As alterações
 * de vínculo das contas só são gravadas ao confirmar (Salvar).
 */
export default function MFGroupModal({ group = null, user, onClose, onSaved, defaultParentId = null }) {
  const { t } = useTranslation();
  const { data: groups = [] } = useMFGroups(user);
  const { data: accounts = [] } = useMFAccounts(user);
  const createMutation = useCreateMFGroup();
  const updateMutation = useUpdateMFGroup();
  const updateAccountMutation = useUpdateAccount();

  const [name, setName] = useState(group?.name ?? '');
  const [icon, setIcon] = useState(group?.icon || '📁');
  const [showSummary, setShowSummary] = useState(group?.show_in_summary ?? true);
  const [sumTotals, setSumTotals] = useState(group?.sum_totals ?? true);
  const [parentId, setParentId] = useState(group?.parent_id ?? defaultParentId ?? '');
  // Alterações de vínculo por conta; quem não aparece aqui mantém o
  // vínculo atual (account.group_id) — funciona mesmo com as contas
  // chegando depois, sem resetar o que o usuário já clicou.
  const [membership, setMembership] = useState({});
  const [iconOpen, setIconOpen] = useState(false);
  const [iconTab, setIconTab] = useState('emoji'); // 'emoji' | 'banks'
  const [brandQuery, setBrandQuery] = useState('');
  const [accountQuery, setAccountQuery] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const isMember = (account) =>
    membership[account.id] ?? (group?.id ? account.group_id === group.id : false);

  const toggleAccount = (account) =>
    setMembership((prev) => ({ ...prev, [account.id]: !isMember(account) }));

  // Guarda de ciclo: exclui o próprio grupo e TODOS os descendentes
  // das opções de "grupo pai" (dependência cíclica impossível).
  const excluded = new Set();
  if (group?.id) {
    excluded.add(group.id);
    let grew = true;
    while (grew) {
      grew = false;
      groups.forEach((candidate) => {
        if (candidate.parent_id && excluded.has(candidate.parent_id) && !excluded.has(candidate.id)) {
          excluded.add(candidate.id);
          grew = true;
        }
      });
    }
  }
  const byId = new Map(groups.map((item) => [item.id, item]));
  const depthOf = (item) => {
    let depth = 0;
    let cursor = item;
    while (cursor?.parent_id && byId.has(cursor.parent_id) && depth < 10) {
      depth += 1;
      cursor = byId.get(cursor.parent_id);
    }
    return depth;
  };
  const parentOptions = [
    { value: '', label: t('minhasfinancas.group_parent_none') },
    ...groups
      .filter((item) => !excluded.has(item.id))
      .map((item) => ({
        value: item.id,
        icon: <MFGroupIcon icon={item.icon} name={item.name} size={18} />,
        label: `${'\u00A0\u00A0\u00A0'.repeat(depthOf(item))}${item.name}`,
      })),
  ];

  // Marcas de banco disponíveis no seletor de ícone (com busca)
  const brandQueryKey = brandQuery.trim().toLowerCase();
  const brandOptions = Object.entries(MF_BRAND_ICONS).filter(
    ([key, brand]) =>
      !brandQueryKey ||
      key.includes(brandQueryKey) ||
      brand.name.toLowerCase().includes(brandQueryKey)
  );

  const swatchStyle = (active) => ({
    width: 34,
    height: 34,
    borderRadius: 8,
    border: active ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
    background: 'transparent',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    padding: 0,
  });

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    padding: '0.8rem 0',
    borderBottom: '1px solid var(--glass-border)',
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t('minhasfinancas.name_required'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        name: trimmed,
        icon: icon.trim() || '📁',
        show_in_summary: showSummary,
        sum_totals: sumTotals,
        parent_id: parentId || null,
      };
      let saved;
      if (group) {
        saved = await updateMutation.mutateAsync({ id: group.id, ...payload });
      } else {
        saved = await createMutation.mutateAsync(payload);
      }
      const groupId = saved?.id ?? group?.id;
      // Vínculos das contas: só mexe em quem foi clicado ou já está
      // neste grupo — contas de OUTROS grupos ficam intactas.
      const changes = [];
      accounts.forEach((account) => {
        const override = membership[account.id];
        const currentlyIn = group?.id ? account.group_id === group.id : false;
        if (override === undefined && !currentlyIn) return;
        const should = (override ?? currentlyIn) ? groupId : null;
        if ((account.group_id ?? null) !== should) {
          changes.push({ id: account.id, group_id: should });
        }
      });
      for (const change of changes) {
        await updateAccountMutation.mutateAsync(change);
      }
      toast.success(
        t(group ? 'minhasfinancas.group_updated' : 'minhasfinancas.group_saved')
      );
      onSaved?.(saved ?? { id: groupId });
      onClose();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  // Só contas comuns entram em grupos: nada de cartões nem de arquivadas.
  const sortedAccounts = accounts
    .filter(
      (account) => account.account_type !== 'CARTAO' && !account.archived_at
    )
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  // Filtro da lista de contas (por nome) + ações em massa sobre o que
  // está visível — só mexe no rascunho de vínculo (membership).
  const accountQueryKey = accountQuery.trim().toLowerCase();
  const filteredAccounts = accountQueryKey
    ? sortedAccounts.filter((account) =>
        String(account.name).toLowerCase().includes(accountQueryKey)
      )
    : sortedAccounts;
  const bulkMembership = (value) =>
    setMembership((prev) => {
      const next = { ...prev };
      filteredAccounts.forEach((account) => {
        next[account.id] = value;
      });
      return next;
    });
  const selectedCount = sortedAccounts.filter((account) => isMember(account)).length;

  return createPortal(
    <div className="modal-overlay" data-testid="mf-group-modal" onClick={onClose}>
      <div
        className="glass-card modal-content"
        style={{ maxWidth: 520 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
          }}
        >
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-group-close"
            aria-label={t('minhasfinancas.close')}
            onClick={onClose}
          >
            <X size={18} />
          </button>
          <h3
            data-testid="mf-group-title"
            style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}
          >
            {t(
              group ? 'minhasfinancas.group_edit_title' : 'minhasfinancas.group_new_title'
            )}
          </h3>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-group-save"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? '…' : t('minhasfinancas.save')}
          </button>
        </div>

        {/* Nome + ícone */}
        <div className="input-group">
          <label>{t('minhasfinancas.group_name')}</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="icon-btn"
              data-testid="mf-group-icon"
              aria-label={t('minhasfinancas.group_icon')}
              onClick={() => {
                setIconOpen((prev) => !prev);
                setBrandQuery('');
              }}
              style={{
                width: 42,
                height: 42,
                fontSize: '1.1rem',
                border: '1px solid var(--glass-border)',
                borderRadius: 12,
              }}
            >
              <MFGroupIcon icon={icon} name={name} size={26} />
            </button>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('minhasfinancas.group_name_placeholder')}
              data-testid="mf-group-name"
              style={{ flex: 1 }}
            />
          </div>
          {iconOpen && (
            <div
              data-testid="mf-group-icon-picker"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.55rem',
                marginTop: '0.5rem',
                padding: '0.5rem',
                border: '1px solid var(--glass-border)',
                borderRadius: 12,
                background: 'var(--input-bg)',
              }}
            >
              {/* Abas: emojis (catálogo original) × marcas de banco */}
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  className="btn-cancel"
                  data-testid="mf-group-tab-emoji"
                  aria-pressed={iconTab === 'emoji'}
                  onClick={() => setIconTab('emoji')}
                  style={{
                    padding: '0.3rem 0.7rem',
                    fontSize: '0.78rem',
                    fontWeight: iconTab === 'emoji' ? 800 : 600,
                    borderRadius: 999,
                    border:
                      iconTab === 'emoji'
                        ? '1px solid var(--primary)'
                        : '1px solid var(--glass-border)',
                    background:
                      iconTab === 'emoji'
                        ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
                        : 'transparent',
                    color: 'var(--text-main)',
                  }}
                >
                  {t('minhasfinancas.group_icon_emojis')}
                </button>
                <button
                  type="button"
                  className="btn-cancel"
                  data-testid="mf-group-tab-banks"
                  aria-pressed={iconTab === 'banks'}
                  onClick={() => setIconTab('banks')}
                  style={{
                    padding: '0.3rem 0.7rem',
                    fontSize: '0.78rem',
                    fontWeight: iconTab === 'banks' ? 800 : 600,
                    borderRadius: 999,
                    border:
                      iconTab === 'banks'
                        ? '1px solid var(--primary)'
                        : '1px solid var(--glass-border)',
                    background:
                      iconTab === 'banks'
                        ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
                        : 'transparent',
                    color: 'var(--text-main)',
                  }}
                >
                  {t('minhasfinancas.icon_brands')}
                </button>
              </div>

              {iconTab === 'banks' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                      data-testid="mf-group-brand-search"
                      value={brandQuery}
                      onChange={(event) => setBrandQuery(event.target.value)}
                      placeholder={t('minhasfinancas.icon_search')}
                      style={{ padding: '0.5rem 0.75rem 0.5rem 2rem', fontSize: '0.85rem' }}
                    />
                  </div>
                  {brandOptions.length > 0 ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(34px, 1fr))',
                        gap: '0.35rem',
                        maxHeight: 160,
                        overflowY: 'auto',
                      }}
                    >
                      {brandOptions.map(([key, brand]) => (
                        <button
                          key={key}
                          type="button"
                          aria-label={brand.name}
                          title={brand.name}
                          data-testid={`mf-group-brand-opt-${key}`}
                          onClick={() => {
                            setIcon(`brand:${key}`);
                            setIconOpen(false);
                            setBrandQuery('');
                          }}
                          style={swatchStyle(icon === `brand:${key}`)}
                        >
                          <MFGroupIcon icon={`brand:${key}`} name={brand.name} size={26} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p
                      data-testid="mf-group-brand-empty"
                      style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}
                    >
                      {t('common.no_results')}
                    </p>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(34px, 1fr))',
                    gap: '0.35rem',
                    maxHeight: 160,
                    overflowY: 'auto',
                  }}
                >
                  {GROUP_EMOJIS.map((emoji, index) => (
                    <button
                      key={`${emoji}-${index}`}
                      type="button"
                      data-testid={`mf-group-icon-opt-${index}`}
                      aria-label={emoji}
                      onClick={() => {
                        setIcon(emoji);
                        setIconOpen(false);
                      }}
                      style={swatchStyle(emoji === icon)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Grupo pai (hierarquia) */}
        <div className="input-group" style={{ marginTop: '0.75rem' }}>
          <label>{t('minhasfinancas.group_parent')}</label>
          <MFSelect
            testId="mf-group-parent"
            value={parentId}
            onChange={setParentId}
            options={parentOptions}
          />
        </div>

        {/* Flags */}
        <div style={{ marginTop: '0.5rem' }}>
          <div style={rowStyle}>
            <span style={{ fontSize: '0.9rem' }}>
              {t('minhasfinancas.group_show_summary')}
            </span>
            <Switch
              checked={showSummary}
              onChange={setShowSummary}
              testId="mf-group-show-summary"
            />
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: '0.9rem' }}>
              {t('minhasfinancas.group_sum_totals')}
            </span>
            <Switch checked={sumTotals} onChange={setSumTotals} testId="mf-group-sum-totals" />
          </div>
        </div>

        {/* Info */}
        <p
          data-testid="mf-group-info"
          style={{
            margin: '1rem 0 0',
            fontSize: '0.8rem',
            lineHeight: 1.5,
            color: 'var(--text-muted)',
            background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
            border: '1px solid var(--glass-border)',
            borderRadius: 10,
            padding: '0.7rem 0.85rem',
          }}
        >
          {t('minhasfinancas.group_accounting_info')}
        </p>

        {/* Contas do grupo */}
        <div style={{ marginTop: '1.1rem' }}>
          <p
            style={{
              margin: '0 0 0.35rem',
              fontSize: '0.85rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <FolderTree size={14} />
            {t('minhasfinancas.group_accounts')}
          </p>
          <p
            style={{
              margin: '0 0 0.6rem',
              fontSize: '0.76rem',
              color: 'var(--text-muted)',
            }}
          >
            {t('minhasfinancas.group_accounts_hint')}
          </p>
          {/* Filtro + ações em massa sobre as contas filtradas */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
              margin: '0 0 0.5rem',
            }}
          >
            <div style={{ position: 'relative', flex: '1 1 160px' }}>
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
                data-testid="mf-group-accounts-search"
                value={accountQuery}
                onChange={(event) => setAccountQuery(event.target.value)}
                placeholder={t('minhasfinancas.group_accounts_search')}
                style={{ padding: '0.45rem 0.7rem 0.45rem 2rem', fontSize: '0.82rem' }}
              />
            </div>
            <button
              type="button"
              className="btn-cancel"
              data-testid="mf-group-accounts-select-all"
              disabled={filteredAccounts.length === 0}
              onClick={() => bulkMembership(true)}
              style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem' }}
            >
              {t('minhasfinancas.group_accounts_select_all')}
            </button>
            <button
              type="button"
              className="btn-cancel"
              data-testid="mf-group-accounts-clear"
              disabled={filteredAccounts.length === 0}
              onClick={() => bulkMembership(false)}
              style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem' }}
            >
              {t('minhasfinancas.group_accounts_clear')}
            </button>
            <span
              data-testid="mf-group-accounts-selected"
              style={{
                marginLeft: 'auto',
                fontSize: '0.74rem',
                fontWeight: 700,
                color: selectedCount > 0 ? 'var(--primary)' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              {t('minhasfinancas.group_accounts_selected', { count: selectedCount })}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.15rem',
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            {sortedAccounts.length === 0 && (
              <p
                data-testid="mf-group-accounts-empty"
                style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0' }}
              >
                {t('minhasfinancas.accounts_count', { count: 0 })}
              </p>
            )}
            {sortedAccounts.length > 0 && filteredAccounts.length === 0 && (
              <p
                data-testid="mf-group-accounts-no-results"
                style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0' }}
              >
                {t('common.no_results')}
              </p>
            )}
            {filteredAccounts.map((account) => (
              <label
                key={account.id}
                data-testid={`mf-group-account-${account.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.5rem 0.4rem',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: '0.88rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={isMember(account)}
                  onChange={() => toggleAccount(account)}
                  style={{ accentColor: 'var(--primary)', width: 16, height: 16 }}
                />
                <MFAccountIcon account={account} size={18} aria-hidden="true" />
                <span style={{ flex: 1 }}>{account.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
