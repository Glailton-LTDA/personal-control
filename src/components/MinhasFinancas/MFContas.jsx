import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Pencil,
  Plus,
  Search,
  Trash2,
  ArrowLeftRight,
  Wallet,
  Archive,
  ArchiveRestore,
  FolderTree,
  Loader2,
  X,
  FileText,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import {
  useMFMonthSummary,
  useMFAccountTypes,
  useMFGroups,
  useDeleteAccount,
  useUpdateAccount,
  useMFReorder,
  formatMoney,
  groupTotalsByCurrency,
  countableRows,
  currentMonthKey,
  accountTypeInfo,
  currencyFlag,
} from '../../hooks/useMinhasFinancas';
import MFMonthNav from './MFMonthNav';
import MFCurrencyTabs from './MFCurrencyTabs';
import MFTotalsStack from './MFTotalsStack';
import MFAccountModal from './MFAccountModal';
import MFIgnoreDots from './MFIgnoreDots';
import MFAccountIcon from './MFAccountIcon';
import MFTransferModal from './MFTransferModal';
import MFGroupModal from './MFGroupModal';
import MFGroupIcon from './MFGroupIcon';
import MFAccountDetail from './MFAccountDetail';
import { hasNewAccountRequest, clearNewAccountRequest } from './mfViewState';

/** Id sentinela de "Sem grupo" (nunca colide com uuid real). */
const UNGROUPED_ID = 'mf-ungrouped';

/**
 * Último grupo aberto no desktop. A rota do detalhe da conta
 * (`accounts/{id}`) não carrega o grupo; sem essa memória, ao voltar o
 * master-detail cairia no primeiro grupo da lista (Nubank).
 */
const LAST_GROUP_KEY = 'mf_accounts_last_group';
const lastGroupStorageKey = (userId) => `${LAST_GROUP_KEY}.${userId ?? 'anon'}`;

const readLastGroupId = (userId) => {
  try {
    return sessionStorage.getItem(lastGroupStorageKey(userId));
  } catch {
    return null;
  }
};

const rememberLastGroupId = (userId, groupId) => {
  try {
    sessionStorage.setItem(lastGroupStorageKey(userId), groupId);
  } catch {
    /* storage indisponível */
  }
};

/** Paleta dos grupos/contas sem cor própria — estável e sem vermelho. */
const GROUP_ACCENTS = [
  '#6366f1',
  '#22c55e',
  '#06b6d4',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#84cc16',
  '#38bdf8',
];

const badgeStyle = {
  fontSize: '0.66rem',
  fontWeight: 800,
  color: 'var(--text-muted)',
  border: '1px solid var(--glass-border)',
  borderRadius: 999,
  padding: '0.1rem 0.42rem',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  whiteSpace: 'nowrap',
};

/** Cor estável por grupo (cor própria > paleta). */
const groupAccent = (group) => {
  if (group?.color) return group.color;
  const id = String(group?.id ?? '');
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return GROUP_ACCENTS[hash % GROUP_ACCENTS.length];
};

/** Totais por moeda com diferença relevante (>= 0.005) em alguma moeda. */
const totalsDiffer = (a, b) => {
  const codes = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const code of codes) {
    if (Math.abs((Number(a?.[code]) || 0) - (Number(b?.[code]) || 0)) >= 0.005) {
      return true;
    }
  }
  return false;
};

const sumMap = (map) => Object.values(map || {}).reduce((sum, value) => sum + value, 0);

/** Remove moedas zeradas de um mapa de totais (movimento do mês). */
const nonZeroTotals = (map) =>
  Object.fromEntries(
    Object.entries(map || {}).filter(([, value]) => Math.abs(Number(value) || 0) >= 0.005)
  );

const fmtPct = (value, total) =>
  total > 0 ? `${((value / total) * 100).toFixed(1).replace('.', ',')}%` : '0%';

/** Aba de filtro por tipo (modo estreito). */
const narrowTypeTabStyle = (active) => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.45rem 0.8rem',
  borderRadius: 999,
  border: '1px solid var(--glass-border)',
  background: active ? 'var(--primary)' : 'transparent',
  color: active ? '#fff' : 'var(--text-muted)',
  borderColor: active ? 'var(--primary)' : undefined,
  font: 'inherit',
  fontSize: '0.78rem',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
});

/**
 * Contas — master-detail.
 *
 * Coluna esquerda: instituições/grupos raiz com saldo consolidado.
 * Direita: o grupo selecionado, com contas diretas, KPIs, subgrupos em
 * cartões e distribuição de capital. "Sem grupo" é um grupo virtual.
 *
 * A rota do grupo é `minhasfinancas/accounts/grupo/<id>`; a seleção é
 * restaurada no refresh e ao voltar do detalhe da conta (memória da sessão).
 * O detalhe da conta continua em `/accounts/<id>`.
 */
export default function MFContas({
  user,
  monthKey = currentMonthKey(),
  onChangeMonth = () => {},
  showValues = true,
  initialGroupId = null,
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useMFMonthSummary(user, monthKey);
  const { data: customTypes = [] } = useMFAccountTypes(user);
  const { data: groups = [] } = useMFGroups(user);
  const deleteMutation = useDeleteAccount();
  const updateMutation = useUpdateAccount();
  const reorderAccounts = useMFReorder('mf_accounts');
  const reorderGroups = useMFReorder('mf_account_groups');

  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [groupedView, setGroupedView] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId ?? null);
  const [accountModal, setAccountModal] = useState(null); // null | 'new' | conta
  const [accountDefaultGroupId, setAccountDefaultGroupId] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupParentId, setGroupParentId] = useState(null);
  const [groupEdit, setGroupEdit] = useState(null);
  const [reordering, setReordering] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null); // drill-down da conta
  const [typeFilter, setTypeFilter] = useState('all');

  // Telas estreitas: lista → detalhe (não master-detail lado a lado).
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 768px)').matches
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(max-width: 768px)');
    const onChange = (event) => setIsNarrow(event.matches);
    query.addEventListener?.('change', onChange);
    setIsNarrow(query.matches);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  // A rota é a fonte da verdade do grupo selecionado (refresh/voltar).
  useEffect(() => {
    setSelectedGroupId(initialGroupId ?? null);
  }, [initialGroupId]);

  const groupsById = useMemo(
    () => new Map((groups ?? []).map((group) => [group.id, group])),
    [groups]
  );
  const childrenMap = useMemo(() => {
    const map = new Map();
    (groups ?? []).forEach((group) => {
      const parentKey =
        group.parent_id && groupsById.has(group.parent_id) ? group.parent_id : null;
      if (!map.has(parentKey)) map.set(parentKey, []);
      map.get(parentKey).push(group);
    });
    return map;
  }, [groups, groupsById]);
  const rootGroups = useMemo(() => childrenMap.get(null) ?? [], [childrenMap]);

  // A tela Contas lista apenas contas: cartões moram na aba Cartões.
  const rows = useMemo(
    () => (data?.rows ?? []).filter((row) => row.account_type !== 'CARTAO'),
    [data]
  );
  const currencyOptions = useMemo(
    () => [...new Set(rows.map((row) => row.currency))],
    [rows]
  );
  const currencyCounts = useMemo(() => {
    const counts = {};
    rows.forEach((row) => {
      if (row.archived_at) return;
      const code = row.currency || 'BRL';
      counts[code] = (counts[code] || 0) + 1;
    });
    return counts;
  }, [rows]);

  const accounts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (showArchived || !row.archived_at) &&
        (currency === 'all' || row.currency === currency) &&
        row.name.toLowerCase().includes(term)
    );
  }, [rows, search, currency, showArchived]);

  const activeRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          !row.archived_at && (currency === 'all' || row.currency === currency)
      ),
    [rows, currency]
  );
  const kpis = useMemo(() => {
    const counted = countableRows(activeRows);
    return {
      saldo: groupTotalsByCurrency(counted, 'saldo'),
      receitas: groupTotalsByCurrency(counted, 'receitas'),
      despesas: groupTotalsByCurrency(counted, 'despesas'),
      previsto: groupTotalsByCurrency(counted, 'previsto'),
    };
  }, [activeRows]);
  const groupsWithAccounts = useMemo(() => {
    const ids = new Set(
      activeRows
        .map((row) => (row.group_id && groupsById.has(row.group_id) ? row.group_id : null))
        .filter(Boolean)
    );
    return ids.size;
  }, [activeRows, groupsById]);

  // Tipos de conta (chips do modo estreito).
  const typeOptions = useMemo(() => {
    const seen = new Map();
    rows.forEach((row) => {
      const code = row.account_type ?? '';
      if (!seen.has(code)) {
        const info = accountTypeInfo(row.account_type, customTypes);
        seen.set(code, info.builtin ? t(info.key) : info.label);
      }
    });
    return [...seen.entries()];
  }, [rows, customTypes, t]);

  const scopedAccounts = useMemo(() => {
    if (!isNarrow || typeFilter === 'all') return accounts;
    return accounts.filter((row) => (row.account_type ?? '') === typeFilter);
  }, [accounts, isNarrow, typeFilter]);

  const accountsByGroup = useMemo(() => {
    const map = new Map();
    scopedAccounts.forEach((row) => {
      const key =
        row.group_id && groupsById.has(row.group_id) ? row.group_id : UNGROUPED_ID;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return map;
  }, [scopedAccounts, groupsById]);
  const ungroupedAccounts = accountsByGroup.get(UNGROUPED_ID) ?? [];

  const subtreeGroupIds = (groupId) => {
    if (groupId === UNGROUPED_ID) return [];
    const ids = [groupId];
    const queue = [groupId];
    const seen = new Set([groupId]);
    while (queue.length) {
      const id = queue.shift();
      (childrenMap.get(id) ?? []).forEach((child) => {
        if (seen.has(child.id)) return;
        seen.add(child.id);
        ids.push(child.id);
        queue.push(child.id);
      });
    }
    return ids;
  };

  const subtreeAccountsFor = (groupId) => {
    if (groupId === UNGROUPED_ID) return ungroupedAccounts;
    const out = [];
    subtreeGroupIds(groupId).forEach((id) => {
      const list = accountsByGroup.get(id);
      if (list?.length) out.push(...list);
    });
    return out;
  };
  const directAccountsFor = (groupId) => accountsByGroup.get(groupId) ?? [];
  const childGroupsFor = (groupId) => {
    if (groupId === UNGROUPED_ID) return [];
    return (childrenMap.get(groupId) ?? []).filter(
      (child) => subtreeAccountsFor(child.id).length > 0
    );
  };

  const railItems = useMemo(
    () =>
      rootGroups
        .map((group) => ({ id: group.id, group, rows: subtreeAccountsFor(group.id) }))
        .filter((item) => item.rows.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rootGroups, accountsByGroup, scopedAccounts, groupsById]
  );
  const showUngrouped = ungroupedAccounts.length > 0;

  const requestedGroupId =
    selectedGroupId &&
    (selectedGroupId === UNGROUPED_ID || groupsById.has(selectedGroupId))
      ? selectedGroupId
      : null;
  // A memória só vale para grupos que ainda existem e têm contas no filtro
  // atual; caso contrário, cai no primeiro grupo do rail.
  const rememberedGroupId = !isNarrow ? readLastGroupId(user?.id) : null;
  const rememberedGroupExists =
    rememberedGroupId === UNGROUPED_ID
      ? showUngrouped
      : !!rememberedGroupId &&
        groupsById.has(rememberedGroupId) &&
        subtreeAccountsFor(rememberedGroupId).length > 0;
  const fallbackGroupId = rememberedGroupExists
    ? rememberedGroupId
    : railItems[0]?.id ?? (showUngrouped ? UNGROUPED_ID : null);
  // Mobile: sem grupo na rota = lista. Desktop: último grupo (ou o primeiro).
  const effectiveGroupId = requestedGroupId ?? (isNarrow ? null : fallbackGroupId);
  const effectiveGroup =
    effectiveGroupId && effectiveGroupId !== UNGROUPED_ID
      ? groupsById.get(effectiveGroupId) ?? null
      : null;

  // Volta do detalhe da conta: a rota perde o grupo, então lembramos a
  // última seleção no desktop.
  useEffect(() => {
    if (isNarrow || !effectiveGroupId) return;
    rememberLastGroupId(user?.id, effectiveGroupId);
  }, [effectiveGroupId, isNarrow, user?.id]);

  const detailGroup = effectiveGroupId
    ? {
        id: effectiveGroupId,
        name:
          effectiveGroupId === UNGROUPED_ID
            ? t('minhasfinancas.group_ungrouped')
            : effectiveGroup?.name ?? '',
        icon: effectiveGroup?.icon,
        color: effectiveGroup?.color,
        ungrouped: effectiveGroupId === UNGROUPED_ID,
        parent: effectiveGroup?.parent_id
          ? groupsById.get(effectiveGroup.parent_id) ?? null
          : null,
      }
    : null;

  const detailRows = effectiveGroupId ? subtreeAccountsFor(effectiveGroupId) : [];
  const detailDirect = effectiveGroupId ? directAccountsFor(effectiveGroupId) : [];
  const detailChildren = effectiveGroupId ? childGroupsFor(effectiveGroupId) : [];

  const detailRef = useRef(null);

  /** Garante que o painel de detalhe apareça quando o card clicado está
   *  fora da viewport (lista longa no rail ou layout de uma coluna). */
  const revealDetail = () => {
    if (isNarrow) return;
    const el = detailRef.current;
    if (!el || typeof el.getBoundingClientRect !== 'function') return;
    const { top } = el.getBoundingClientRect();
    const headerOffset = 86; // header fixo (70) + respiro
    // Só rola se o topo do painel estiver escondido (acima do header ou
    // abaixo da dobra). Parte de baixo visível não basta: o usuário
    // precisa ver o cabeçalho do grupo que acabou de selecionar.
    const visible = top >= headerOffset && top < window.innerHeight;
    if (!visible) el.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const groupPath = (groupId) => `minhasfinancas/accounts/grupo/${groupId}`;
  const selectGroup = (groupId) => {
    setSelectedGroupId(groupId);
    setQuickOpen(false);
    if (!isNarrow) rememberLastGroupId(user?.id, groupId);
    window.dispatchEvent(
      new CustomEvent('set-active-tab', { detail: { tab: groupPath(groupId) } })
    );
    revealDetail();
  };
  const backToList = () => {
    setSelectedGroupId(null);
    setQuickOpen(false);
    window.dispatchEvent(
      new CustomEvent('set-active-tab', { detail: { tab: 'minhasfinancas/accounts' } })
    );
  };

  // Conta selecionada no drill-down. O ref mantém a conta visível durante a
  // troca de mês (rows fica vazio enquanto o resumo recarrega).
  const lastSelectedRef = useRef(null);
  const foundSelected = selectedId ? rows.find((row) => row.id === selectedId) : null;
  if (foundSelected) lastSelectedRef.current = foundSelected;
  const selectedRow = selectedId ? foundSelected || lastSelectedRef.current : null;
  useEffect(() => {
    if (!selectedId) return;
    window.dispatchEvent(
      new CustomEvent('set-active-tab', {
        detail: { tab: `minhasfinancas/accounts/${selectedId}` },
      })
    );
  }, [selectedId]);

  // Pedido de "nova conta" vindo do FAB global.
  const openNewAccount = (groupId = null) => {
    setAccountDefaultGroupId(
      groupId && groupId !== UNGROUPED_ID ? groupId : null
    );
    setAccountModal('new');
    setQuickOpen(false);
  };
  useEffect(() => {
    if (hasNewAccountRequest()) {
      setAccountModal('new');
      setAccountDefaultGroupId(null);
      return undefined;
    }
    const onRequest = () => {
      setAccountModal('new');
      setAccountDefaultGroupId(null);
    };
    window.addEventListener('mf-new-account', onRequest);
    return () => window.removeEventListener('mf-new-account', onRequest);
  }, []);

  // Fecha o menu de ações rápidas ao clicar fora.
  useEffect(() => {
    if (!quickOpen) return undefined;
    const onDown = (event) => {
      if (!event.target.closest?.('.mf-accounts-quick-wrap')) setQuickOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [quickOpen]);

  const nativeMoney = (value, rowCurrency) =>
    showValues ? formatMoney(value, rowCurrency) : '•••';

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
      toast.success(
        t(archiving ? 'minhasfinancas.archived_done' : 'minhasfinancas.unarchived_done')
      );
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const moveAccount = async (rowId, direction) => {
    const index = accounts.findIndex((row) => row.id === rowId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= accounts.length) return;
    try {
      await reorderAccounts.mutateAsync([
        { id: accounts[index].id, sort_order: target },
        { id: accounts[target].id, sort_order: index },
      ]);
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const moveGroup = async (groupId, direction) => {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    const parentKey = group.parent_id ?? null;
    const siblings = groups.filter((item) => (item.parent_id ?? null) === parentKey);
    const index = siblings.findIndex((item) => item.id === groupId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    const next = [...siblings];
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await reorderGroups.mutateAsync(
        next.map((item, position) => ({ id: item.id, sort_order: position }))
      );
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const labelForCount = (directCount, subgroupCount, totalCount) => {
    const direct = t('minhasfinancas.accounts_direct_count', { count: directCount });
    if (!subgroupCount) return direct;
    return [
      direct,
      t('minhasfinancas.accounts_subgroup_count', { count: subgroupCount }),
      t('minhasfinancas.group_count', { count: totalCount }),
    ].join(' · ');
  };

  const openNewGroup = (parentId = null) => {
    setGroupParentId(parentId);
    setGroupModalOpen(true);
    setQuickOpen(false);
  };

  /** Cabeçalho de grupo no rail (desktop) ou na lista (mobile). */
  const renderGroupCard = ({ id, group, rows: groupRows }) => {
    const isUngrouped = id === UNGROUPED_ID;
    const directCount = directAccountsFor(id).length;
    const childCount = childGroupsFor(id).length;
    const saldo = groupTotalsByCurrency(groupRows, 'saldo');
    const previsto = groupTotalsByCurrency(groupRows, 'previsto');
    const selected = effectiveGroupId === id;
    const siblings = isUngrouped
      ? []
      : (rootGroups ?? []).filter((item) => (item.parent_id ?? null) === (group.parent_id ?? null));
    const position = siblings.findIndex((item) => item.id === id);
    return (
      <div
        key={id}
        role="button"
        tabIndex={0}
        className={`mf-accounts-group-card${selected ? ' is-selected' : ''}`}
        data-testid={isUngrouped ? 'mf-ungrouped-card' : `mf-group-card-${id}`}
        aria-pressed={selected}
        onClick={() => selectGroup(id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectGroup(id);
          }
        }}
      >
        <div className="mf-accounts-group-top">
          {isUngrouped ? (
            <span className="mf-accounts-group-icon">
              <FolderTree size={20} />
            </span>
          ) : (
            <MFGroupIcon
              icon={group.icon}
              name={group.name}
              color={group.color}
              size={34}
            />
          )}
          <div className="mf-accounts-group-main">
            <div className="mf-accounts-group-name">
              {isUngrouped ? t('minhasfinancas.group_ungrouped') : group.name}
            </div>
            <span className="mf-accounts-group-badge">
              {isUngrouped
                ? t('minhasfinancas.accounts_ungrouped_badge')
                : t('minhasfinancas.accounts_institution_badge')}
            </span>
          </div>
          {reordering && !isUngrouped && (
            <span className="mf-accounts-move">
              <button
                type="button"
                className="icon-btn"
                aria-label={t('minhasfinancas.move_up')}
                data-testid={`mf-group-move-up-${id}`}
                disabled={position <= 0}
                onClick={(event) => {
                  event.stopPropagation();
                  moveGroup(id, -1);
                }}
              >
                <ChevronLeft size={14} style={{ transform: 'rotate(90deg)' }} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={t('minhasfinancas.move_down')}
                data-testid={`mf-group-move-down-${id}`}
                disabled={position < 0 || position >= siblings.length - 1}
                onClick={(event) => {
                  event.stopPropagation();
                  moveGroup(id, 1);
                }}
              >
                <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
              </button>
            </span>
          )}
        </div>
        <div
          className="mf-accounts-group-meta"
          data-testid={isUngrouped ? 'mf-ungrouped-count' : `mf-group-count-${id}`}
        >
          {labelForCount(directCount, childCount, groupRows.length)}
        </div>
        <div className="mf-accounts-group-bottom">
          <span className="mf-accounts-group-label">
            {t('minhasfinancas.accounts_consolidated')}
          </span>
          <span className="mf-accounts-group-value">
            <MFTotalsStack
              totals={saldo}
              showValues={showValues}
              testId={isUngrouped ? 'mf-ungrouped-total' : `mf-group-total-${id}`}
              align="right"
              fontSize="inherit"
              lineHeight={1.3}
              redNegative
            />
          </span>
        </div>
        {totalsDiffer(previsto, saldo) && (
          <div className="mf-accounts-group-prev">
            {t('minhasfinancas.accounts_table_forecast')}:{' '}
            <MFTotalsStack
              totals={previsto}
              showValues={showValues}
              align="right"
              fontSize="inherit"
              lineHeight={1.3}
              mutedNegative
            />
          </div>
        )}
      </div>
    );
  };

  /** Resumo geral (topo do rail no desktop / topo da lista no mobile). */
  const renderSummary = (mobile = false) => (
    <div
      className={`mf-accounts-summary${mobile ? ' is-mobile' : ''}`}
      data-testid={mobile ? 'mf-contas-narrow-summary' : 'mf-contas-kpi-balance'}
    >
      <div className="mf-accounts-summary-label">
        {t('minhasfinancas.accounts_consolidated')} ·{' '}
        {currency === 'all' ? t('minhasfinancas.currency_all') : currency}
      </div>
      <div
        className="mf-accounts-summary-value"
        data-testid={mobile ? 'mf-contas-narrow-summary-saldo' : 'mf-contas-kpi-balance-value'}
      >
        <MFTotalsStack
          totals={kpis.saldo}
          showValues={showValues}
          testId="mf-contas-kpi-balance-stack"
          fontSize="inherit"
          lineHeight={1.25}
          redNegative
        />
      </div>
      <div className="mf-accounts-summary-row" data-testid={mobile ? 'mf-contas-narrow-summary-previsto' : 'mf-contas-kpi-forecast'}>
        <span>{t('minhasfinancas.accounts_forecast_end')}</span>
        <b>
          <MFTotalsStack
            totals={kpis.previsto}
            showValues={showValues}
            align="right"
            fontSize="inherit"
            lineHeight={1.25}
            mutedNegative
          />
        </b>
      </div>
      <div className="mf-accounts-summary-flow" data-testid="mf-contas-kpi-movement">
        <span className="in">
          <MFTotalsStack
            totals={nonZeroTotals(kpis.receitas)}
            showValues={showValues}
            prefix="+"
            align="left"
            fontSize="inherit"
            lineHeight={1.2}
          />
        </span>
        <span className="out">
          <MFTotalsStack
            totals={nonZeroTotals(kpis.despesas)}
            showValues={showValues}
            prefix="−"
            align="left"
            fontSize="inherit"
            lineHeight={1.2}
          />
        </span>
        <span className="muted">{t('minhasfinancas.accounts_in_month')}</span>
      </div>
      <div className="mf-accounts-summary-chips">
        <span>{t('minhasfinancas.kpi_active_accounts', { count: countableRows(activeRows).length })}</span>
        {groupsWithAccounts > 0 && (
          <span>{t('minhasfinancas.groups_count', { count: groupsWithAccounts })}</span>
        )}
      </div>
      <div className="mf-accounts-summary-hint">
        {t('minhasfinancas.accounts_ignore_hint')}
      </div>
    </div>
  );

  const renderAccountActions = (row) => {
    const index = accounts.findIndex((acc) => acc.id === row.id);
    if (reordering) {
      return (
        <span className="mf-accounts-row-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={t('minhasfinancas.move_up')}
            title={t('minhasfinancas.move_up')}
            data-testid={`mf-move-up-${row.id}`}
            disabled={index <= 0}
            onClick={(event) => {
              event.stopPropagation();
              moveAccount(row.id, -1);
            }}
          >
            <ChevronLeft size={15} style={{ transform: 'rotate(90deg)' }} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('minhasfinancas.move_down')}
            title={t('minhasfinancas.move_down')}
            data-testid={`mf-move-down-${row.id}`}
            disabled={index < 0 || index >= accounts.length - 1}
            onClick={(event) => {
              event.stopPropagation();
              moveAccount(row.id, 1);
            }}
          >
            <ChevronRight size={15} style={{ transform: 'rotate(90deg)' }} />
          </button>
        </span>
      );
    }
    return (
      <span className="mf-accounts-row-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label={t('minhasfinancas.row_open')}
          title={t('minhasfinancas.row_open')}
          data-testid={`mf-statement-account-${row.id}`}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedId(row.id);
          }}
        >
          <FileText size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t(row.archived_at ? 'minhasfinancas.unarchive' : 'minhasfinancas.archive')}
          title={t(row.archived_at ? 'minhasfinancas.unarchive' : 'minhasfinancas.archive')}
          data-testid={`mf-archive-account-${row.id}`}
          onClick={(event) => {
            event.stopPropagation();
            handleArchive(row);
          }}
          style={{ color: row.archived_at ? 'var(--success, #10b981)' : undefined }}
        >
          {row.archived_at ? <ArchiveRestore size={15} /> : <Archive size={15} />}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('minhasfinancas.edit')}
          title={t('minhasfinancas.edit')}
          data-testid={`mf-edit-account-${row.id}`}
          onClick={(event) => {
            event.stopPropagation();
            setAccountModal(row);
          }}
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('minhasfinancas.delete')}
          title={t('minhasfinancas.delete')}
          data-testid={`mf-delete-account-${row.id}`}
          onClick={(event) => {
            event.stopPropagation();
            handleDelete(row);
          }}
        >
          <Trash2 size={15} />
        </button>
      </span>
    );
  };

  const renderAccountBadges = (row) => {
    const info = accountTypeInfo(row.account_type, customTypes);
    const typeLabel = info.builtin ? t(info.key) : info.label;
    return (
      <span className="mf-accounts-badges">
        <MFIgnoreDots show={row.ignore_in_totals} />
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
    );
  };

  const renderDesktopAccountRow = (row) => {
    return (
      <tr
        key={row.id}
        data-testid="mf-account-row"
        className="table-row-hover mf-accounts-table-row"
        style={{ cursor: 'pointer', opacity: row.archived_at ? 0.6 : 1 }}
        onClick={() => setSelectedId(row.id)}
      >
        <td className="mf-accounts-name-cell">
          <div className="mf-accounts-acc-name">
            <MFAccountIcon account={row} size={30} data-testid={`mf-account-icon-${row.id}`} />
            <div className="mf-accounts-acc-info">
              <button
                type="button"
                data-testid={`mf-open-account-${row.id}`}
                className="mf-accounts-acc-link"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedId(row.id);
                }}
              >
                {row.name}
              </button>
              {renderAccountBadges(row)}
            </div>
          </div>
        </td>
        <td className="mf-accounts-num muted">
          {nativeMoney(row.saldoPrev ?? row.initial_balance ?? 0, row.currency)}
        </td>
        <td
          className={`mf-accounts-num${row.saldo < 0 ? ' negative' : ' positive'}`}
          data-testid={`mf-account-saldo-${row.id}`}
        >
          {nativeMoney(row.saldo, row.currency)}
        </td>
        <td
          className={`mf-accounts-num${row.previsto < 0 ? ' negative' : ' muted'}`}
          data-testid={`mf-account-forecast-${row.id}`}
        >
          {nativeMoney(row.previsto, row.currency)}
        </td>
        <td className="mf-accounts-actions-cell">{renderAccountActions(row)}</td>
      </tr>
    );
  };

  const renderMobileAccount = (row, subtitle = null) => {
    const forecastShown =
      Math.abs((Number(row.previsto) || 0) - (Number(row.saldo) || 0)) >= 0.005;
    return (
      <div
        key={row.id}
        data-testid="mf-account-row"
        role="button"
        tabIndex={0}
        className="mf-accounts-mobile-account"
        style={{ opacity: row.archived_at ? 0.6 : 1 }}
        onClick={() => setSelectedId(row.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSelectedId(row.id);
          }
        }}
      >
        <div className="mf-accounts-acc-top">
          <MFAccountIcon
            account={row}
            size={42}
            data-testid={`mf-account-icon-${row.id}`}
          />
          <div className="mf-accounts-acc-info">
            <button
              type="button"
              data-testid={`mf-open-account-${row.id}`}
              className="mf-accounts-acc-link"
              onClick={(event) => {
                event.stopPropagation();
                setSelectedId(row.id);
              }}
            >
              {row.name}
            </button>
            {subtitle && <div className="mf-accounts-acc-sub">{subtitle}</div>}
            {renderAccountBadges(row)}
          </div>
          {!reordering && (
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
              <Pencil size={15} />
            </button>
          )}
        </div>
        <div className="mf-accounts-mobile-values">
          <span>
            {t('minhasfinancas.accounts_table_balance')}:{' '}
            <b
              data-testid={`mf-account-saldo-${row.id}`}
              className={row.saldo < 0 ? 'negative' : 'positive'}
            >
              {nativeMoney(row.saldo, row.currency)}
            </b>
          </span>
          {forecastShown && (
            <span
              data-testid={`mf-account-forecast-${row.id}`}
              className={row.previsto < 0 ? 'negative' : 'muted'}
            >
              {t('minhasfinancas.accounts_table_forecast')}: {nativeMoney(row.previsto, row.currency)}
            </span>
          )}
          {reordering && renderAccountActions(row)}
        </div>
      </div>
    );
  };

  const renderGroupKpis = () => {
    const initial = groupTotalsByCurrency(detailRows, 'saldoPrev');
    const saldo = groupTotalsByCurrency(detailRows, 'saldo');
    const forecast = groupTotalsByCurrency(detailRows, 'previsto');
    const income = groupTotalsByCurrency(detailRows, 'receitas');
    const expense = groupTotalsByCurrency(detailRows, 'despesas');
    const hasFlow = sumMap(income) > 0 || sumMap(expense) > 0;
    const prevDiff = totalsDiffer(forecast, saldo);
    return (
      <div className="mf-accounts-kpis">
        <div className="mf-accounts-kpi is-initial" data-testid="mf-group-kpi-initial">
          <div className="mf-accounts-kpi-label">{t('minhasfinancas.accounts_initial_total')}</div>
          <div className="mf-accounts-kpi-value">
            <MFTotalsStack
              totals={initial}
              showValues={showValues}
              fontSize="inherit"
              lineHeight={1.25}
            />
          </div>
          <div className="mf-accounts-kpi-hint">{t('minhasfinancas.accounts_initial_hint')}</div>
        </div>
        <div className="mf-accounts-kpi is-balance" data-testid="mf-group-kpi-saldo">
          <div className="mf-accounts-kpi-label">{t('minhasfinancas.accounts_consolidated')}</div>
          <div className="mf-accounts-kpi-value">
            <MFTotalsStack
              totals={saldo}
              showValues={showValues}
              fontSize="inherit"
              lineHeight={1.25}
              redNegative
            />
          </div>
          <div className="mf-accounts-kpi-hint">{t('minhasfinancas.accounts_consolidated_hint')}</div>
          {hasFlow && (
            <div className="mf-accounts-kpi-flow">
              <span className="in">
                <MFTotalsStack
                  totals={nonZeroTotals(income)}
                  showValues={showValues}
                  prefix="+"
                  align="left"
                  fontSize="inherit"
                  lineHeight={1.2}
                />
              </span>
              <span className="out">
                <MFTotalsStack
                  totals={nonZeroTotals(expense)}
                  showValues={showValues}
                  prefix="−"
                  align="left"
                  fontSize="inherit"
                  lineHeight={1.2}
                />
              </span>
              <span className="muted">{t('minhasfinancas.accounts_in_month')}</span>
            </div>
          )}
        </div>
        <div className="mf-accounts-kpi is-forecast" data-testid="mf-group-kpi-forecast">
          <div className="mf-accounts-kpi-label">{t('minhasfinancas.accounts_forecast_end')}</div>
          <div className="mf-accounts-kpi-value">
            <MFTotalsStack
              totals={forecast}
              showValues={showValues}
              fontSize="inherit"
              lineHeight={1.25}
              mutedNegative
            />
          </div>
          <div className="mf-accounts-kpi-hint">
            {prevDiff
              ? t('minhasfinancas.accounts_forecast_hint')
              : t('minhasfinancas.accounts_no_pending')}
          </div>
        </div>
      </div>
    );
  };

  const renderDirectTable = () => {
    if (detailDirect.length === 0) {
      return <p className="mf-accounts-empty-line">{t('minhasfinancas.accounts_no_direct')}</p>;
    }
    const initial = groupTotalsByCurrency(detailRows, 'saldoPrev');
    const saldo = groupTotalsByCurrency(detailRows, 'saldo');
    const forecast = groupTotalsByCurrency(detailRows, 'previsto');
    return (
      <div className="mf-accounts-table-wrap">
        <table className="mf-accounts-table">
          <thead>
            <tr>
              <th>{t('minhasfinancas.accounts_table_account')}</th>
              <th>{t('minhasfinancas.accounts_table_initial')}</th>
              <th>{t('minhasfinancas.accounts_table_balance')}</th>
              <th>{t('minhasfinancas.accounts_table_forecast')}</th>
              <th>{t('minhasfinancas.accounts_table_actions')}</th>
            </tr>
          </thead>
          <tbody data-testid="mf-accounts-body">
            {detailDirect.map(renderDesktopAccountRow)}
          </tbody>
          <tfoot>
            <tr>
              <td>
                {t('minhasfinancas.total')}{' '}
                <span className="mf-accounts-foot-note">
                  ({t('minhasfinancas.accounts_count', { count: detailRows.length })})
                </span>
              </td>
              <td className="mf-accounts-num muted">
                <MFTotalsStack
                  totals={initial}
                  showValues={showValues}
                  testId="mf-contas-foot-initial"
                  align="right"
                  fontSize="inherit"
                  lineHeight={1.25}
                />
              </td>
              <td className="mf-accounts-num">
                <MFTotalsStack
                  totals={saldo}
                  showValues={showValues}
                  testId="mf-contas-foot-saldo"
                  align="right"
                  fontSize="inherit"
                  lineHeight={1.25}
                  redNegative
                />
              </td>
              <td className="mf-accounts-num muted">
                <MFTotalsStack
                  totals={forecast}
                  showValues={showValues}
                  testId="mf-contas-foot-previsto"
                  align="right"
                  fontSize="inherit"
                  lineHeight={1.25}
                  mutedNegative
                />
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  const renderSubgroup = (child, mobile = false) => {
    const childRows = subtreeAccountsFor(child.id);
    const direct = directAccountsFor(child.id);
    const initial = groupTotalsByCurrency(childRows, 'saldoPrev');
    const saldo = groupTotalsByCurrency(childRows, 'saldo');
    const forecast = groupTotalsByCurrency(childRows, 'previsto');
    const siblings = (childrenMap.get(child.parent_id ?? null) ?? []).filter((item) =>
      (item.parent_id ?? null) === (child.parent_id ?? null)
    );
    const position = siblings.findIndex((item) => item.id === child.id);
    return (
      <div
        key={child.id}
        className="mf-accounts-subgroup"
        data-testid={`mf-subgroup-${child.id}`}
      >
        <div className="mf-accounts-subgroup-head">
          <div className="mf-accounts-subgroup-title">
            <MFGroupIcon icon={child.icon} name={child.name} color={child.color} size={30} />
            <div>
              <div className="mf-accounts-subgroup-name">{child.name}</div>
              <div className="mf-accounts-subgroup-meta">
                <span className="mf-accounts-subgroup-badge">
                  {t('minhasfinancas.accounts_subgroup_badge_short')}
                </span>
                <span
                  data-testid={`mf-group-count-${child.id}`}
                  className="mf-accounts-subgroup-count"
                >
                  {labelForCount(direct.length, childGroupsFor(child.id).length, childRows.length)}
                </span>
              </div>
            </div>
          </div>
          {mobile && (
            <div className="mf-accounts-subgroup-totals">
              <div>
                <span>{t('minhasfinancas.accounts_table_initial')}</span>
                <b className="muted">
                  <MFTotalsStack
                    totals={initial}
                    showValues={showValues}
                    align="right"
                    fontSize="inherit"
                    lineHeight={1.2}
                  />
                </b>
              </div>
              <div>
                <span>{t('minhasfinancas.accounts_table_balance')}</span>
                <b className="positive">
                  <MFTotalsStack
                    totals={saldo}
                    showValues={showValues}
                    testId={`mf-subgroup-total-${child.id}`}
                    align="right"
                    fontSize="inherit"
                    lineHeight={1.2}
                    redNegative
                  />
                </b>
              </div>
              <div>
                <span>{t('minhasfinancas.accounts_table_forecast')}</span>
                <b className="muted">
                  <MFTotalsStack
                    totals={forecast}
                    showValues={showValues}
                    align="right"
                    fontSize="inherit"
                    lineHeight={1.2}
                    mutedNegative
                  />
                </b>
              </div>
            </div>
          )}
          <div className="mf-accounts-subgroup-actions">
            {reordering && (
              <>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('minhasfinancas.move_up')}
                  data-testid={`mf-group-move-up-${child.id}`}
                  disabled={position <= 0}
                  onClick={() => moveGroup(child.id, -1)}
                >
                  <ChevronLeft size={14} style={{ transform: 'rotate(90deg)' }} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('minhasfinancas.move_down')}
                  data-testid={`mf-group-move-down-${child.id}`}
                  disabled={position < 0 || position >= siblings.length - 1}
                  onClick={() => moveGroup(child.id, 1)}
                >
                  <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
                </button>
              </>
            )}
            <button
              type="button"
              className="icon-btn"
              aria-label={t('minhasfinancas.group_edit_action')}
              title={t('minhasfinancas.group_edit_action')}
              data-testid={`mf-group-edit-${child.id}`}
              onClick={() => setGroupEdit(child)}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={t('minhasfinancas.new_account')}
              title={t('minhasfinancas.new_account')}
              data-testid={`mf-new-account-in-${child.id}`}
              onClick={() => openNewAccount(child.id)}
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={t('minhasfinancas.accounts_open_group')}
              title={t('minhasfinancas.accounts_open_group')}
              data-testid={`mf-open-subgroup-${child.id}`}
              onClick={() => selectGroup(child.id)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        {mobile ? (
          <div className="mf-accounts-subgroup-body">
            {childGroupsFor(child.id).map((grandchild) => (
              <button
                type="button"
                key={grandchild.id}
                className="mf-accounts-grandchild"
                onClick={() => selectGroup(grandchild.id)}
              >
                <MFGroupIcon
                  icon={grandchild.icon}
                  name={grandchild.name}
                  color={grandchild.color}
                  size={24}
                />
                <span>{grandchild.name}</span>
                <ChevronRight size={14} />
              </button>
            ))}
            {direct.map((row) => renderMobileAccount(row, child.name))}
          </div>
        ) : (
          <div className="mf-accounts-subgroup-body">
            {childGroupsFor(child.id).map((grandchild) => (
              <button
                type="button"
                key={grandchild.id}
                className="mf-accounts-grandchild"
                onClick={() => selectGroup(grandchild.id)}
              >
                <MFGroupIcon
                  icon={grandchild.icon}
                  name={grandchild.name}
                  color={grandchild.color}
                  size={24}
                />
                <span>{grandchild.name}</span>
                <ChevronRight size={14} />
              </button>
            ))}
            <table className="mf-accounts-table is-subgroup">
              <tbody>
                {direct.map((row) => renderDesktopAccountRow(row))}
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    {t('minhasfinancas.total')}{' '}
                    <span className="mf-accounts-foot-note">
                      ({t('minhasfinancas.accounts_count', { count: childRows.length })})
                    </span>
                  </td>
                  <td className="mf-accounts-num muted">
                    <MFTotalsStack
                      totals={initial}
                      showValues={showValues}
                      testId={`mf-subgroup-initial-${child.id}`}
                      align="right"
                      fontSize="inherit"
                      lineHeight={1.25}
                    />
                  </td>
                  <td className="mf-accounts-num">
                    <MFTotalsStack
                      totals={saldo}
                      showValues={showValues}
                      testId={`mf-subgroup-total-${child.id}`}
                      align="right"
                      fontSize="inherit"
                      lineHeight={1.25}
                      redNegative
                    />
                  </td>
                  <td className="mf-accounts-num muted">
                    <MFTotalsStack
                      totals={forecast}
                      showValues={showValues}
                      testId={`mf-subgroup-forecast-${child.id}`}
                      align="right"
                      fontSize="inherit"
                      lineHeight={1.25}
                      mutedNegative
                    />
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    );
  };

  const distributionBuckets = useMemo(() => {
    if (!detailGroup || currency === 'all') return [];
    const buckets = [];
    detailChildren.forEach((child) => {
      const value = sumMap(groupTotalsByCurrency(subtreeAccountsFor(child.id), 'saldo'));
      buckets.push({
        label: child.name,
        value,
        color: groupAccent(child),
      });
    });
    detailDirect.forEach((row, index) => {
      buckets.push({
        label: row.name,
        value: Number(row.saldo) || 0,
        color: GROUP_ACCENTS[(detailChildren.length + index) % GROUP_ACCENTS.length],
      });
    });
    return buckets.filter((bucket) => bucket.value > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailGroup?.id, currency, detailChildren, detailDirect, accountsByGroup]);

  const renderDistribution = () => {
    if (distributionBuckets.length < 2) return null;
    const total = distributionBuckets.reduce((sum, bucket) => sum + bucket.value, 0);
    if (total <= 0) return null;
    return (
      <div className="mf-accounts-dist" data-testid="mf-group-distribution">
        <div className="mf-accounts-dist-head">
          <span className="mf-accounts-dist-icon">
            <ArrowUpDown size={15} />
          </span>
          <div>
            <h4>
              {detailGroup?.ungrouped
                ? t('minhasfinancas.accounts_distribution_ungrouped')
                : t('minhasfinancas.accounts_distribution_title', { name: detailGroup?.name })}
            </h4>
            <p>{t('minhasfinancas.accounts_distribution_hint')}</p>
          </div>
        </div>
        <div className="mf-accounts-dist-bar">
          {distributionBuckets.map((bucket) => (
            <span
              key={bucket.label}
              style={{
                width: `${(bucket.value / total) * 100}%`,
                background: bucket.color,
              }}
              title={bucket.label}
            />
          ))}
        </div>
        <div className="mf-accounts-dist-legend">
          {distributionBuckets.map((bucket) => (
            <span key={bucket.label} className="mf-accounts-dist-item">
              <span className="dot" style={{ background: bucket.color }} />
              {bucket.label} <b>{fmtPct(bucket.value, total)}</b>
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderQuickItems = () => (
    <>
      {detailGroup && !detailGroup.ungrouped && (
        <button
          type="button"
          role="menuitem"
          data-testid="mf-quick-edit-group"
          onClick={() => {
            setGroupEdit(effectiveGroup);
            setQuickOpen(false);
          }}
        >
          <Pencil size={14} /> {t('minhasfinancas.group_edit_action')}
        </button>
      )}
      {detailGroup && !detailGroup.ungrouped && (
        <button
          type="button"
          role="menuitem"
          data-testid="mf-quick-new-subgroup"
          onClick={() => openNewGroup(effectiveGroupId)}
        >
          <Plus size={14} /> {t('minhasfinancas.group_new_sub')}
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        data-testid="mf-quick-new-account"
        onClick={() => openNewAccount(effectiveGroupId)}
      >
        <Plus size={14} /> {t('minhasfinancas.new_account')}
      </button>
      <button
        type="button"
        role="menuitem"
        data-testid="mf-quick-reorder"
        onClick={() => {
          setReordering(true);
          setQuickOpen(false);
        }}
      >
        <ArrowUpDown size={14} /> {t('minhasfinancas.accounts_reorder')}
      </button>
      <button
        type="button"
        role="menuitem"
        data-testid="mf-quick-archived"
        onClick={() => {
          setShowArchived((prev) => !prev);
          setQuickOpen(false);
        }}
      >
        <Archive size={14} /> {t('minhasfinancas.show_archived')}
      </button>
    </>
  );

  const renderQuickMenu = () => (
    <div className="mf-accounts-quick-menu" role="menu" data-testid="mf-quick-menu">
      {renderQuickItems()}
    </div>
  );

  const renderQuickSheet = () =>
    createPortal(
      <div
        className="mf-accounts-sheet-overlay"
        data-testid="mf-quick-sheet"
        onClick={() => setQuickOpen(false)}
      >
        <div
          className="mf-accounts-sheet"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="mf-accounts-sheet-handle" />
          <h3>{t('minhasfinancas.accounts_quick_actions')}</h3>
          <p className="mf-accounts-sheet-sub">{detailGroup?.name}</p>
          <div className="mf-accounts-sheet-items" role="menu">
            {renderQuickItems()}
          </div>
          <button
            type="button"
            className="btn-cancel"
            onClick={() => setQuickOpen(false)}
          >
            {t('minhasfinancas.cancel')}
          </button>
        </div>
      </div>,
      document.body
    );

  const renderDetail = (mobile = false) => {
    if (!detailGroup) {
      return (
        <section className="mf-accounts-detail" data-testid="mf-accounts-detail-empty">
          <p className="mf-accounts-empty-line">{t('minhasfinancas.accounts_empty')}</p>
        </section>
      );
    }
    const directCount = detailDirect.length;
    const childCount = detailChildren.length;
    return (
      <section ref={detailRef} className="mf-accounts-detail is-master" data-testid="mf-accounts-detail">
        <div className="mf-accounts-detail-head">
          <div className="mf-accounts-detail-title">
            {detailGroup.ungrouped ? (
              <span className="mf-accounts-detail-icon">
                <FolderTree size={24} />
              </span>
            ) : (
              <MFGroupIcon
                icon={detailGroup.icon}
                name={detailGroup.name}
                color={detailGroup.color}
                size={mobile ? 44 : 54}
              />
            )}
            <div className="mf-accounts-detail-info">
              <h2>
                {detailGroup.name}
                <span className="mf-accounts-group-badge">
                  {detailGroup.ungrouped
                    ? t('minhasfinancas.accounts_ungrouped_badge')
                    : detailGroup.parent
                    ? t('minhasfinancas.accounts_subgroup_badge_short')
                    : t('minhasfinancas.accounts_institution_badge')}
                </span>
              </h2>
              <p>
                {labelForCount(directCount, childCount, detailRows.length)} ·{' '}
                {currency === 'all' ? t('minhasfinancas.currency_all') : currency}
              </p>
            </div>
          </div>
          <div className="mf-accounts-detail-actions">
            <button
              type="button"
              className="btn-secondary"
              data-testid="mf-transfer-detail"
              onClick={() => setTransferOpen(true)}
            >
              <ArrowLeftRight size={15} />
              {t('minhasfinancas.transfer')}
            </button>
            <div className="mf-accounts-quick-wrap">
              <button
                type="button"
                className="btn-secondary"
                data-testid="mf-quick-actions"
                aria-expanded={quickOpen}
                onClick={() => setQuickOpen((prev) => !prev)}
              >
                <MoreHorizontal size={15} />
                {t('minhasfinancas.accounts_quick_actions')}
              </button>
              {quickOpen && !isNarrow && renderQuickMenu()}
            </div>
            {!detailGroup.ungrouped && (
              <button
                type="button"
                className="btn-secondary"
                data-testid="mf-new-subgroup"
                onClick={() => openNewGroup(detailGroup.id)}
              >
                <Plus size={15} />
                {t('minhasfinancas.group_new_sub')}
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              data-testid="mf-new-account-detail"
              onClick={() => openNewAccount(detailGroup.id)}
            >
              <Plus size={15} />
              {t('minhasfinancas.new_account')}
            </button>
            {!detailGroup.ungrouped && (
              <button
                type="button"
                className="icon-btn"
                aria-label={t('minhasfinancas.group_edit_action')}
                title={t('minhasfinancas.group_edit_action')}
                data-testid={`mf-group-edit-${detailGroup.id}`}
                onClick={() => setGroupEdit(effectiveGroup)}
              >
                <Pencil size={15} />
              </button>
            )}
          </div>
        </div>

        {renderGroupKpis()}

        <div className="mf-accounts-detail-body">
          <div className="mf-accounts-section-head">
            <h3>{t('minhasfinancas.accounts_direct_accounts')}</h3>
            <span>
              {t('minhasfinancas.accounts_count', { count: directCount })}
            </span>
          </div>
          {mobile ? (
            <div className="mf-accounts-mobile-accounts">
              {detailDirect.length === 0 ? (
                <p className="mf-accounts-empty-line">
                  {t('minhasfinancas.accounts_no_direct')}
                </p>
              ) : (
                detailDirect.map((row) => renderMobileAccount(row))
              )}
            </div>
          ) : (
            renderDirectTable()
          )}

          {childCount > 0 && (
            <>
              <div className="mf-accounts-section-head">
                <h3>{t('minhasfinancas.accounts_subgroups')}</h3>
                <span>
                  {t('minhasfinancas.accounts_subgroup_count', { count: childCount })}
                </span>
              </div>
              <div className="mf-accounts-subgroups">
                {detailChildren.map((child) => renderSubgroup(child, mobile))}
              </div>
            </>
          )}

          {renderDistribution()}
        </div>
      </section>
    );
  };

  const renderLinear = (mobile = false) => {
    const list = scopedAccounts;
    if (mobile) {
      return (
        <div className="mf-accounts-mobile" data-testid="mf-contas-cards">
          {renderSummary(true)}
          <div className="mf-accounts-section-head">
            <h3>{t('minhasfinancas.accounts_all')}</h3>
            <span>{t('minhasfinancas.accounts_count', { count: list.length })}</span>
          </div>
          {list.map((row) => renderMobileAccount(row, row.group_id ? groupsById.get(row.group_id)?.name : null))}
        </div>
      );
    }
    return (
      <section className="mf-accounts-detail" data-testid="mf-accounts-detail">
        <div className="mf-accounts-detail-head">
          <div className="mf-accounts-detail-title">
            <span className="mf-accounts-detail-icon">
              <Wallet size={24} />
            </span>
            <div className="mf-accounts-detail-info">
              <h2>{t('minhasfinancas.accounts_all')}</h2>
              <p>
                {t('minhasfinancas.accounts_count', { count: list.length })} ·{' '}
                {currency === 'all' ? t('minhasfinancas.currency_all') : currency}
              </p>
            </div>
          </div>
          <div className="mf-accounts-detail-actions">
            <button
              type="button"
              className="btn-secondary"
              data-testid="mf-transfer-detail"
              onClick={() => setTransferOpen(true)}
            >
              <ArrowLeftRight size={15} />
              {t('minhasfinancas.transfer')}
            </button>
            <button
              type="button"
              className="btn-primary"
              data-testid="mf-new-account-detail"
              onClick={() => openNewAccount(null)}
            >
              <Plus size={15} />
              {t('minhasfinancas.new_account')}
            </button>
          </div>
        </div>
        <div className="mf-accounts-detail-body">
          {list.length === 0 ? (
            <p className="mf-accounts-empty-line">{t('minhasfinancas.accounts_empty')}</p>
          ) : (
            <div className="mf-accounts-table-wrap">
              <table className="mf-accounts-table">
                <thead>
                  <tr>
                    <th>{t('minhasfinancas.accounts_table_account')}</th>
                    <th>{t('minhasfinancas.accounts_table_initial')}</th>
                    <th>{t('minhasfinancas.accounts_table_balance')}</th>
                    <th>{t('minhasfinancas.accounts_table_forecast')}</th>
                    <th>{t('minhasfinancas.accounts_table_actions')}</th>
                  </tr>
                </thead>
                <tbody data-testid="mf-accounts-body">
                  {list.map((row) => (
                    <React.Fragment key={row.id}>
                      {renderDesktopAccountRow(row)}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>
                      {t('minhasfinancas.total')}{' '}
                      <span className="mf-accounts-foot-note">
                        ({t('minhasfinancas.accounts_count', { count: list.length })})
                      </span>
                    </td>
                    <td className="mf-accounts-num muted">
                      <MFTotalsStack
                        totals={groupTotalsByCurrency(list, 'saldoPrev')}
                        showValues={showValues}
                        testId="mf-contas-foot-initial"
                        align="right"
                        fontSize="inherit"
                        lineHeight={1.25}
                      />
                    </td>
                    <td className="mf-accounts-num">
                      <MFTotalsStack
                        totals={groupTotalsByCurrency(list, 'saldo')}
                        showValues={showValues}
                        testId="mf-contas-foot-saldo"
                        align="right"
                        fontSize="inherit"
                        lineHeight={1.25}
                        redNegative
                      />
                    </td>
                    <td className="mf-accounts-num muted">
                      <MFTotalsStack
                        totals={groupTotalsByCurrency(list, 'previsto')}
                        showValues={showValues}
                        testId="mf-contas-foot-previsto"
                        align="right"
                        fontSize="inherit"
                        lineHeight={1.25}
                        mutedNegative
                      />
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </section>
    );
  };

  const renderMobileList = () => (
    <div className="mf-accounts-mobile" data-testid="mf-contas-cards">
      {renderSummary(true)}
      <div
        role="tablist"
        aria-label={t('minhasfinancas.report_type')}
        data-testid="mf-contas-narrow-types"
        className="mf-accounts-type-tabs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={typeFilter === 'all'}
          data-testid="mf-narrow-type-all"
          onClick={() => setTypeFilter('all')}
          style={narrowTypeTabStyle(typeFilter === 'all')}
        >
          {t('minhasfinancas.report_type_all')} ({accounts.length})
        </button>
        {typeOptions.map(([code, label]) => (
          <button
            key={code || 'none'}
            type="button"
            role="tab"
            aria-selected={typeFilter === code}
            data-testid={`mf-narrow-type-${code || 'none'}`}
            onClick={() => setTypeFilter(code)}
            style={narrowTypeTabStyle(typeFilter === code)}
          >
            {label} ({accounts.filter((row) => (row.account_type ?? '') === code).length})
          </button>
        ))}
      </div>
      <div className="mf-accounts-section-head">
        <h3>{t('minhasfinancas.accounts_rail_title')}</h3>
        <span>
          {t('minhasfinancas.accounts_count', {
            count: railItems.length + (showUngrouped ? 1 : 0),
          })}
        </span>
      </div>
      <div className="mf-accounts-group-list">
        {railItems.map((item) => renderGroupCard(item))}
        {showUngrouped && (
          <React.Fragment>
            {renderGroupCard({ id: UNGROUPED_ID, group: null, rows: ungroupedAccounts })}
          </React.Fragment>
        )}
        <button
          type="button"
          className="mf-accounts-create"
          onClick={() => openNewGroup(null)}
        >
          <Plus size={15} />
          {t('minhasfinancas.accounts_create_group')}
        </button>
      </div>
      {railItems.length === 0 && !showUngrouped && (
        <p className="mf-accounts-empty-line">{t('minhasfinancas.accounts_empty')}</p>
      )}
    </div>
  );

  // No mobile, o detalhe (grupo ou conta) tem a própria barra de voltar:
  // esconder cabeçalho/toolbar libera a tela para o conteúdo.
  const hideChromeOnMobile = isNarrow && groupedView && (!!effectiveGroupId || !!selectedRow);

  return (
    <div data-testid="mf-contas" className="mf-accounts-page">
      {/* Cabeçalho */}
      {!hideChromeOnMobile && (
        <div className="mf-accounts-head">
          <div className="mf-accounts-title">
            <span className="mf-accounts-title-icon">
              <Wallet size={21} />
            </span>
            <div>
              <h2>{t('nav.sub.minhasfinancas.accounts')}</h2>
              <p>{t('minhasfinancas.accounts_desc')}</p>
            </div>
          </div>
          <div className="mf-accounts-head-actions">
            <MFMonthNav monthKey={monthKey} onChange={onChangeMonth} />
            <button
              type="button"
              className="btn-secondary"
              data-testid="mf-new-transfer"
              onClick={() => setTransferOpen(true)}
            >
              <ArrowLeftRight size={16} />
              {t('minhasfinancas.transfer')}
            </button>
            <button
              type="button"
              className="btn-primary"
              data-testid="mf-new-account"
              onClick={() => openNewAccount(effectiveGroupId)}
            >
              <Plus size={16} />
              {t('minhasfinancas.new_account')}
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {!hideChromeOnMobile && !isLoading && !isError && rows.length > 0 && (
        <div className="mf-accounts-toolbar">
          <MFCurrencyTabs
            currencies={currencyOptions}
            counts={currencyCounts}
            value={currency}
            onChange={setCurrency}
            testId="mf-contas-currency-tabs"
          />
          <div className="mf-accounts-toolbar-row">
            <div className="mf-accounts-search">
              <Search size={15} />
              <input
                type="text"
                data-testid="mf-accounts-search"
                placeholder={t('minhasfinancas.search_placeholder')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search !== '' && (
                <button
                  type="button"
                  className="icon-btn"
                  data-testid="mf-accounts-search-clear"
                  aria-label={t('minhasfinancas.search_clear')}
                  title={t('minhasfinancas.search_clear')}
                  onClick={() => setSearch('')}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="mf-accounts-view">
              <button
                type="button"
                className="btn-option"
                data-testid="mf-group-toggle"
                aria-pressed={groupedView}
                onClick={() => setGroupedView(true)}
              >
                <FolderTree size={14} />
                {t('minhasfinancas.accounts_hierarchy')}
              </button>
              <button
                type="button"
                className="btn-option"
                data-testid="mf-linear-toggle"
                aria-pressed={!groupedView}
                onClick={() => setGroupedView(false)}
              >
                <FileText size={14} />
                {t('minhasfinancas.accounts_linear')}
              </button>
            </div>
            <button
              type="button"
              className="btn-option"
              data-testid="mf-show-archived"
              aria-pressed={showArchived}
              onClick={() => setShowArchived((prev) => !prev)}
            >
              <Archive size={14} />
              {t('minhasfinancas.show_archived')}
            </button>
            <button
              type="button"
              className="btn-option"
              data-testid="mf-reorder-toggle"
              aria-pressed={reordering}
              onClick={() => setReordering((prev) => !prev)}
            >
              <ArrowUpDown size={14} />
              {t('minhasfinancas.accounts_reorder')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              data-testid="mf-new-group"
              onClick={() => openNewGroup(null)}
            >
              <FolderTree size={15} />
              {t('minhasfinancas.group_new_short')}
            </button>
          </div>
        </div>
      )}

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
            onClick={() => openNewAccount(null)}
            style={{ display: 'inline-flex' }}
          >
            <Plus size={16} />
            {t('minhasfinancas.create_first_account')}
          </button>
        </div>
      )}

      {isLoading && (
        <div className="glass-card" data-testid="mf-contas-loading" style={{ padding: '2rem', textAlign: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-muted)' }}>
            <Loader2 size={18} className="animate-spin" />
            {t('minhasfinancas.loading')}
          </span>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <>
          {selectedRow ? (
            <MFAccountDetail
              account={selectedRow}
              user={user}
              monthKey={monthKey}
              onChangeMonth={onChangeMonth}
              showValues={showValues}
              onClose={() => {
                setSelectedId(null);
                if (effectiveGroupId) selectGroup(effectiveGroupId);
                else backToList();
              }}
              onEdit={(row) => setAccountModal(row)}
              onOpenCard={(card) => {
                window.dispatchEvent(
                  new CustomEvent('set-active-tab', {
                    detail: { tab: `minhasfinancas/cards/${card.id}` },
                  })
                );
              }}
              onOpenAccount={(row) => setSelectedId(row.id)}
            />
          ) : groupedView ? (
            isNarrow ? (
              effectiveGroupId ? (
                <div className="mf-accounts-mobile-detail">
                  <button
                    type="button"
                    className="mf-accounts-back"
                    data-testid="mf-group-back"
                    onClick={backToList}
                  >
                    <ChevronLeft size={16} />
                    {t('minhasfinancas.accounts_back')}
                  </button>
                  {renderDetail(true)}
                </div>
              ) : (
                renderMobileList()
              )
            ) : (
              <div className="mf-accounts-layout">
                <aside className="mf-accounts-rail">
                  <div className="mf-accounts-rail-head">
                    <span>{t('minhasfinancas.accounts_rail_title')}</span>
                    <span className="mf-accounts-rail-count">
                      {t('minhasfinancas.accounts_count', {
                        count: railItems.length + (showUngrouped ? 1 : 0),
                      })}
                    </span>
                  </div>
                  {renderSummary(false)}
                  <div className="mf-accounts-group-list">
                    {railItems.map((item) => renderGroupCard(item))}
                    {showUngrouped && (
                      <React.Fragment>
                        {renderGroupCard({
                          id: UNGROUPED_ID,
                          group: null,
                          rows: ungroupedAccounts,
                        })}
                      </React.Fragment>
                    )}
                  </div>
                  <button
                    type="button"
                    className="mf-accounts-create"
                    onClick={() => openNewGroup(null)}
                  >
                    <Plus size={15} />
                    {t('minhasfinancas.accounts_create_group')}
                  </button>
                </aside>
                {renderDetail(false)}
              </div>
            )
          ) : (
            renderLinear(isNarrow)
          )}
        </>
      )}

      {quickOpen && isNarrow && renderQuickSheet()}

      <MFAccountModal
        isOpen={accountModal !== null}
        account={accountModal && accountModal !== 'new' ? accountModal : null}
        user={user}
        defaultGroupId={accountModal === 'new' ? accountDefaultGroupId : null}
        onClose={() => {
          clearNewAccountRequest();
          setAccountModal(null);
          setAccountDefaultGroupId(null);
        }}
      />
      {groupModalOpen && (
        <MFGroupModal
          user={user}
          defaultParentId={groupParentId}
          onClose={() => {
            setGroupModalOpen(false);
            setGroupParentId(null);
          }}
        />
      )}
      {groupEdit && (
        <MFGroupModal
          group={groupEdit}
          user={user}
          onClose={() => setGroupEdit(null)}
        />
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
