import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Search, Trash2, ArrowLeftRight, Wallet, Archive, ArchiveRestore, FolderTree, Loader2, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import {
  useMFMonthSummary,
  useMFAccountTypes,
  useMFGroups,
  useDeleteAccount,
  useUpdateAccount,
  formatMoney,
  groupTotalsByCurrency,
  countableRows,
  formatTotals,
  currentMonthKey,
  accountTypeInfo,
  currencyFlag,
} from '../../hooks/useMinhasFinancas';
import MFMonthNav from './MFMonthNav';
import MFCurrencyFilter from './MFCurrencyFilter';
import MFAccountModal from './MFAccountModal';
import MFAccountIcon from './MFAccountIcon';
import MFTransferModal from './MFTransferModal';
import MFGroupModal from './MFGroupModal';
import MFGroupIcon from './MFGroupIcon';
import MFAccountDetail from './MFAccountDetail';

const cellBase = {
  padding: '0.85rem 1rem',
  fontSize: '0.9rem',
  whiteSpace: 'nowrap',
};

const badgeStyle = {
  fontSize: '0.7rem',
  fontWeight: 800,
  color: 'var(--text-muted)',
  border: '1px solid var(--glass-border)',
  borderRadius: '6px',
  padding: '0.05rem 0.35rem',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  whiteSpace: 'nowrap',
};

/** Id sentinela da sanfona de "Sem grupo" (nunca colide com uuid real). */
const UNGROUPED_ID = 'mf-ungrouped';

/**
 * Tela de Contas: tabela por mês (saldo inicial, receitas, despesas,
 * transferências, saldo e previsão) com CRUD e transferências.
 */
export default function MFContas({
  user,
  monthKey = currentMonthKey(),
  onChangeMonth = () => {},
  showValues = true,
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useMFMonthSummary(user, monthKey);
  const { data: customTypes = [] } = useMFAccountTypes(user);
  const { data: groups = [] } = useMFGroups(user);
  const deleteMutation = useDeleteAccount();
  const updateMutation = useUpdateAccount();

  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  // Visão agrupada é o padrão (toggle liga/desliga); sanfona: grupos
  // recolhidos ficam só com o cabeçalho (ids sentinel p/ "Sem grupo").
  const [groupedView, setGroupedView] = useState(true);
  const [folded, setFolded] = useState(() => new Set());
  const [accountModal, setAccountModal] = useState(null); // null | 'new' | conta
  const [transferOpen, setTransferOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null); // drill-down da conta

  // A tela Contas lista apenas contas: cartões moram na aba Cartões.
  const rows = useMemo(
    () => (data?.rows ?? []).filter((row) => row.account_type !== 'CARTAO'),
    [data]
  );
  const currencyOptions = useMemo(() => [...new Set(rows.map((row) => row.currency))], [rows]);
  const accounts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (showArchived || !row.archived_at) &&
        (currency === 'all' || row.currency === currency) &&
        row.name.toLowerCase().includes(term)
    );
  }, [rows, search, currency, showArchived]);

  // Itens da tabela: visão agrupada (padrão) — cada grupo vira um cabeçalho
  // (sanfona + ícone + nome + contagem + total das contas diretas) com suas
  // contas logo abaixo; subgrupos aninhados; contas fora de grupo no fim.
  // A visão plana volta pelo toggle; grupos recolhidos escondem os itens
  // sob eles (o próprio cabeçalho sempre fica).
  const renderItems = useMemo(() => {
    const flat = accounts.map((row) => ({ kind: 'account', row, depth: 0 }));
    if (!groupedView || groups.length === 0) return flat;

    const byId = new Map(groups.map((group) => [group.id, group]));
    const childrenOf = (id) => groups.filter((group) => group.parent_id === id);
    const roots = groups.filter((group) => !group.parent_id || !byId.has(group.parent_id));

    const membersByGroup = new Map();
    const ungrouped = [];
    accounts.forEach((row) => {
      if (row.group_id && byId.has(row.group_id)) {
        const list = membersByGroup.get(row.group_id) ?? [];
        list.push(row);
        membersByGroup.set(row.group_id, list);
      } else {
        ungrouped.push(row);
      }
    });

    // A subárvore tem contas visíveis? (com guarda de ciclo nos dados)
    const subtreeHas = (group, seen = new Set()) => {
      if (seen.has(group.id)) return false;
      seen.add(group.id);
      if ((membersByGroup.get(group.id) ?? []).length > 0) return true;
      return childrenOf(group.id).some((child) => subtreeHas(child, seen));
    };

    const items = [];
    const walked = new Set();
    // `ancestors` = grupos acima do item; recolher um esconde os filhos,
    // mas não o próprio cabeçalho (que não leva o próprio id).
    const walk = (group, depth, ancestors) => {
      if (walked.has(group.id)) return;
      walked.add(group.id);
      const members = membersByGroup.get(group.id) ?? [];
      const children = childrenOf(group.id);
      // Grupo sem nenhuma conta visível (inclusive nas filhas): não polui
      if (members.length === 0 && !children.some((child) => subtreeHas(child))) return;
      items.push({ kind: 'group', group, depth, count: members.length, rows: members, ancestors });
      const branch = [...ancestors, group.id];
      members.forEach((row) => items.push({ kind: 'account', row, depth: depth + 1, ancestors: branch }));
      children.forEach((child) => walk(child, depth + 1, branch));
    };
    roots.forEach((root) => walk(root, 0, []));

    if (ungrouped.length > 0) {
      items.push({ kind: 'ungrouped', depth: 0, count: ungrouped.length, rows: ungrouped, ancestors: [] });
      ungrouped.forEach((row) =>
        items.push({ kind: 'account', row, depth: 0, ancestors: [UNGROUPED_ID] })
      );
    }
    return items.filter(
      (item) => !(item.ancestors ?? []).some((id) => folded.has(id))
    );
  }, [groupedView, folded, accounts, groups]);

  /** Sanfona: recolhe/expande o grupo (ou "Sem grupo") na visão agrupada. */
  const toggleFold = (id) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Linha da conta selecionada no drill-down. O ref mantém a conta visível
  // durante a troca de mês (rows fica vazio enquanto o resumo recarrega).
  const lastSelectedRef = useRef(null);
  const foundSelected = selectedId ? rows.find((row) => row.id === selectedId) : null;
  if (foundSelected) lastSelectedRef.current = foundSelected;
  const selectedRow = selectedId ? foundSelected || lastSelectedRef.current : null;

  const nativeMoney = (value, rowCurrency) =>
    showValues ? formatMoney(value, rowCurrency) : '•••';
  const totalOf = (field) =>
    formatTotals(groupTotalsByCurrency(countableRows(accounts), field), showValues);

  const handleDelete = (account) => {
    confirmToast(
      t('minhasfinancas.delete_account_confirm', { name: account.name }),
      async () => {
        try {
          await deleteMutation.mutateAsync(account.id);
          toast.success(t('minhasfinancas.account_deleted'));
        } catch {
          toast.error(t('minhasfinancas.account_in_use'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.delete') }
    );
  };

  const handleArchive = async (account) => {
    const archiving = !account.archived_at;
    try {
      await updateMutation.mutateAsync({
        id: account.id,
        archived_at: archiving ? new Date().toISOString() : null,
      });
      toast.success(t(archiving ? 'minhasfinancas.archived_done' : 'minhasfinancas.unarchived_done'));
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const headers = [
    'accounts_table_initial',
    'accounts_table_income',
    'accounts_table_expense',
    'accounts_table_transf_in',
    'accounts_table_transf_out',
    'accounts_table_balance',
    'accounts_table_forecast',
  ];

  return (
    <div data-testid="mf-contas" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Cabeçalho */}
      <div
        className="glass-card"
        style={{
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
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
            <Wallet size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
              {t('nav.sub.minhasfinancas.accounts')}
            </h2>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.accounts_desc')}
            </p>
          </div>
        </div>

        {!selectedRow && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <MFCurrencyFilter currencies={currencyOptions} value={currency} onChange={setCurrency} />
            <MFMonthNav monthKey={monthKey} onChange={onChangeMonth} />
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            data-testid="mf-new-transfer"
            onClick={() => setTransferOpen(true)}
            style={{ padding: '0.65rem 1rem', fontSize: '0.85rem' }}
          >
            <ArrowLeftRight size={16} />
            {t('minhasfinancas.transfer')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            data-testid="mf-new-group"
            onClick={() => setGroupModalOpen(true)}
            style={{ padding: '0.65rem 1rem', fontSize: '0.85rem' }}
          >
            <FolderTree size={16} />
            {t('minhasfinancas.group_new_short')}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-new-account"
            onClick={() => setAccountModal('new')}
            style={{ padding: '0.65rem 1rem', fontSize: '0.85rem' }}
          >
            <Plus size={16} />
            {t('minhasfinancas.new_account')}
          </button>
        </div>
      </div>

      {/* Drill-down: detalhe da conta ou lista de contas */}
      {selectedRow ? (
        <MFAccountDetail
          account={selectedRow}
          user={user}
          monthKey={monthKey}
          onChangeMonth={onChangeMonth}
          showValues={showValues}
          onClose={() => setSelectedId(null)}
          onEdit={(row) => setAccountModal(row)}
        />
      ) : (
        <>
      {/* Busca + lista de arquivadas */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '0.85rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            className="glass-input"
            data-testid="mf-accounts-search"
            placeholder={t('minhasfinancas.search_placeholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ paddingLeft: '2.5rem', width: '100%' }}
          />
        </div>
        <button
          type="button"
          className="btn-cancel"
          data-testid="mf-show-archived"
          aria-pressed={showArchived}
          onClick={() => setShowArchived((prev) => !prev)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.6rem 0.95rem',
            fontSize: '0.82rem',
            background: showArchived
              ? 'color-mix(in srgb, var(--primary) 16%, transparent)'
              : undefined,
            color: showArchived ? 'var(--primary)' : undefined,
            borderColor: showArchived ? 'var(--primary)' : undefined,
          }}
        >
          <Archive size={14} />
          {t('minhasfinancas.show_archived')}
        </button>
        {groups.length > 0 && (
          <button
            type="button"
            className="btn-cancel"
            data-testid="mf-group-toggle"
            aria-pressed={groupedView}
            onClick={() => setGroupedView((prev) => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.6rem 0.95rem',
              fontSize: '0.82rem',
              background: groupedView
                ? 'color-mix(in srgb, var(--primary) 16%, transparent)'
                : undefined,
              color: groupedView ? 'var(--primary)' : undefined,
              borderColor: groupedView ? 'var(--primary)' : undefined,
            }}
          >
            <FolderTree size={14} />
            {t('minhasfinancas.accounts_group_view')}
          </button>
        )}
      </div>

      {/* Estados */}
      {isError && (
        <div className="glass-card" data-testid="mf-contas-error" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--danger)', margin: 0 }}>{t('minhasfinancas.load_error')}</p>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="glass-card" data-testid="mf-contas-empty" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 1.25rem' }}>
            {t('minhasfinancas.accounts_empty')}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setAccountModal('new')}
            style={{ display: 'inline-flex' }}
          >
            <Plus size={16} />
            {t('minhasfinancas.create_first_account')}
          </button>
        </div>
      )}

      {/* Tabela */}
      {(isLoading || accounts.length > 0) && (
        <div className="glass-card" style={{ padding: '0.5rem', overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: 860,
            }}
          >
            <thead>
              <tr>
                {/* Coluna da conta (ícone + nome): sem rótulo */}
                <th
                  aria-hidden
                  style={{
                    ...cellBase,
                    borderBottom: '1px solid var(--glass-border)',
                  }}
                />
                {headers.map((key) => (
                  <th
                    key={key}
                    style={{
                      ...cellBase,
                      textAlign: 'right',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--glass-border)',
                    }}
                  >
                    {t(`minhasfinancas.${key}`)}
                  </th>
                ))}
                <th
                  style={{
                    ...cellBase,
                    textAlign: 'right',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    borderBottom: '1px solid var(--glass-border)',
                  }}
                >
                  {t('minhasfinancas.accounts_table_actions')}
                </th>
              </tr>
            </thead>
            <tbody data-testid="mf-accounts-body">
              {isLoading && (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      ...cellBase,
                      borderBottom: '1px solid var(--glass-border)',
                      textAlign: 'center',
                      padding: '2rem 1rem',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        color: 'var(--text-muted)',
                        fontSize: '0.9rem',
                      }}
                    >
                      <Loader2 size={18} className="animate-spin" />
                      {t('minhasfinancas.loading')}
                    </span>
                  </td>
                </tr>
              )}

              {!isLoading &&
                renderItems.map((item) => {
                  if (item.kind === 'group' || item.kind === 'ungrouped') {
                    const isGroup = item.kind === 'group';
                    const group = item.group;
                    return (
                      <tr
                        key={isGroup ? `group-${group.id}` : 'ungrouped'}
                        data-testid={
                          isGroup ? `mf-group-header-${group.id}` : 'mf-ungrouped-header'
                        }
                        style={{
                          background: isGroup
                            ? 'color-mix(in srgb, var(--primary) 8%, transparent)'
                            : 'rgba(255, 255, 255, 0.035)',
                        }}
                      >
                        <td
                          colSpan={9}
                          style={{
                            ...cellBase,
                            borderBottom: '1px solid var(--glass-border)',
                            padding: '0.55rem 1rem',
                            fontWeight: 800,
                          }}
                        >
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.6rem',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.55rem',
                                minWidth: 0,
                                paddingLeft: `${item.depth * 1.1}rem`,
                              }}
                            >
                              <button
                                type="button"
                                data-testid={
                                  isGroup ? `mf-group-fold-${group.id}` : 'mf-ungrouped-fold'
                                }
                                aria-expanded={!folded.has(isGroup ? group.id : UNGROUPED_ID)}
                                aria-label={t(
                                  folded.has(isGroup ? group.id : UNGROUPED_ID)
                                    ? 'minhasfinancas.group_show_accounts'
                                    : 'minhasfinancas.group_hide_accounts'
                                )}
                                onClick={() => toggleFold(isGroup ? group.id : UNGROUPED_ID)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  display: 'inline-flex',
                                  cursor: 'pointer',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                <ChevronDown
                                  size={16}
                                  style={{
                                    transform: folded.has(isGroup ? group.id : UNGROUPED_ID)
                                      ? 'rotate(-90deg)'
                                      : 'none',
                                    transition: 'transform 0.15s',
                                  }}
                                />
                              </button>
                              {isGroup ? (
                                <MFGroupIcon
                                  icon={group.icon}
                                  name={group.name}
                                  color={group.color}
                                  size={17}
                                />
                              ) : (
                                <FolderTree size={16} style={{ color: 'var(--text-muted)' }} />
                              )}
                              <span>
                                {isGroup ? group.name : t('minhasfinancas.group_ungrouped')}
                              </span>
                              <span
                                style={badgeStyle}
                                data-testid={
                                  isGroup ? `mf-group-count-${group.id}` : 'mf-ungrouped-count'
                                }
                              >
                                {t('minhasfinancas.group_count', { count: item.count })}
                              </span>
                            </span>
                            <span
                              style={{ fontWeight: 800 }}
                              data-testid={
                                isGroup ? `mf-group-total-${group.id}` : 'mf-ungrouped-total'
                              }
                            >
                              {formatTotals(
                                groupTotalsByCurrency(countableRows(item.rows), 'saldo'),
                                showValues
                              )}
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  const row = item.row;
                  const info = accountTypeInfo(row.account_type, customTypes);
                  const typeLabel = info.builtin ? t(info.key) : info.label;
                  return (
                  <tr
                    key={row.id}
                    data-testid="mf-account-row"
                    className="table-row-hover"
                    style={{ cursor: 'pointer', opacity: row.archived_at ? 0.6 : 1 }}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td
                      style={{
                        ...cellBase,
                        paddingLeft: `${1 + item.depth * 1.1}rem`,
                        borderBottom: '1px solid var(--glass-border)',
                        fontWeight: 700,
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <MFAccountIcon
                          account={row}
                          size={22}
                          data-testid={`mf-account-icon-${row.id}`}
                        />
                        <button
                          type="button"
                          data-testid={`mf-open-account-${row.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(row.id);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            font: 'inherit',
                            fontWeight: 700,
                            color: 'inherit',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          {row.name}
                        </button>
                        <span style={badgeStyle} data-testid="mf-account-type-badge">
                          <span aria-hidden>{info.icon}</span>
                          {typeLabel}
                        </span>
                        <span style={badgeStyle} data-testid="mf-account-currency-badge">
                          <span aria-hidden>{currencyFlag(row.currency)}</span>
                          {row.currency}
                        </span>
                        {row.archived_at && (
                          <span style={badgeStyle} data-testid="mf-account-archived-badge">
                            {t('minhasfinancas.account_archived')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={{ ...cellBase, textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}>
                      {nativeMoney(row.initial_balance ?? 0, row.currency)}
                    </td>
                    <td style={{ ...cellBase, textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--success, #10b981)' }}>
                      {nativeMoney(row.receitas, row.currency)}
                    </td>
                    <td style={{ ...cellBase, textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--danger, #ef4444)' }}>
                      {nativeMoney(row.despesas, row.currency)}
                    </td>
                    <td style={{ ...cellBase, textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--success, #10b981)' }}>
                      {nativeMoney(row.transfCredito, row.currency)}
                    </td>
                    <td style={{ ...cellBase, textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--danger, #ef4444)' }}>
                      {nativeMoney(row.transfDebito, row.currency)}
                    </td>
                    <td
                      style={{
                        ...cellBase,
                        textAlign: 'right',
                        borderBottom: '1px solid var(--glass-border)',
                        fontWeight: 800,
                      }}
                    >
                      {nativeMoney(row.saldo, row.currency)}
                    </td>
                    <td style={{ ...cellBase, textAlign: 'right', borderBottom: '1px solid var(--glass-border)', fontWeight: 700, color: 'var(--text-muted)' }}>
                      {nativeMoney(row.previsto, row.currency)}
                    </td>
                    <td style={{ ...cellBase, textAlign: 'right', borderBottom: '1px solid var(--glass-border)' }}>
                      <span style={{ display: 'inline-flex', gap: '0.35rem' }}>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={t(row.archived_at ? 'minhasfinancas.unarchive' : 'minhasfinancas.archive')}
                          data-testid={`mf-archive-account-${row.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleArchive(row);
                          }}
                          style={{ color: row.archived_at ? 'var(--success, #10b981)' : undefined }}
                        >
                          {row.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={t('minhasfinancas.edit')}
                          data-testid={`mf-edit-account-${row.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setAccountModal(row);
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={t('minhasfinancas.delete')}
                          data-testid={`mf-delete-account-${row.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDelete(row);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </span>
                    </td>
                  </tr>
                  );
                })}
            </tbody>
            {!isLoading && accounts.length > 0 && (
              <tfoot>
                <tr>
                  <td
                    style={{
                      ...cellBase,
                      textAlign: 'left',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {t('minhasfinancas.total')}
                  </td>
                  <td style={{ ...cellBase, textAlign: 'right', color: 'var(--text-muted)' }}>
                    {totalOf('initial_balance')}
                  </td>
                  <td style={{ ...cellBase, textAlign: 'right', color: 'var(--success, #10b981)', fontWeight: 700 }}>
                    {totalOf('receitas')}
                  </td>
                  <td style={{ ...cellBase, textAlign: 'right', color: 'var(--danger, #ef4444)', fontWeight: 700 }}>
                    {totalOf('despesas')}
                  </td>
                  <td style={{ ...cellBase, textAlign: 'right', color: 'var(--success, #10b981)', fontWeight: 700 }}>
                    {totalOf('transfCredito')}
                  </td>
                  <td style={{ ...cellBase, textAlign: 'right', color: 'var(--danger, #ef4444)', fontWeight: 700 }}>
                    {totalOf('transfDebito')}
                  </td>
                  <td style={{ ...cellBase, textAlign: 'right', fontWeight: 800 }}>
                    {totalOf('saldo')}
                  </td>
                  <td style={{ ...cellBase, textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)' }}>
                    {totalOf('previsto')}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
        </>
      )}

      <MFAccountModal
        isOpen={accountModal !== null}
        account={accountModal && accountModal !== 'new' ? accountModal : null}
        user={user}
        onClose={() => setAccountModal(null)}
      />
      {groupModalOpen && (
        <MFGroupModal user={user} onClose={() => setGroupModalOpen(false)} />
      )}
      <MFTransferModal
        isOpen={transferOpen}
        accounts={rows.filter((row) => !row.archived_at)}
        user={user}
        onClose={() => setTransferOpen(false)}
      />
    </div>
  );
}
