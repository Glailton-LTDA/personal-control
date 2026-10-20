import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Search, Trash2, ArrowLeftRight, Wallet, Archive, ArchiveRestore, FolderTree, Loader2, ChevronDown, ChevronUp, X, TrendingUp, CalendarClock, FileText, ArrowUpDown } from 'lucide-react';
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
  formatTotals,
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
import { readDrill, writeDrill, hasNewAccountRequest, clearNewAccountRequest } from './mfViewState';

const cellBase = {
  padding: '0.65rem 0.55rem',
  fontSize: '0.85rem',
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

/** Aba de filtro por tipo (modo estreito): pílula ativa/inativa. */
const narrowTypeTabStyle = (active) => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.5rem 0.9rem',
  borderRadius: 999,
  border: '1px solid var(--glass-border)',
  background: active ? 'var(--primary)' : 'transparent',
  color: active ? '#fff' : 'var(--text-muted)',
  borderColor: active ? 'var(--primary)' : undefined,
  font: 'inherit',
  fontSize: '0.82rem',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
});

/** Caixinha do ícone nos cards de KPI da tela de Contas. */
const kpiIconBox = {
  width: 34,
  height: 34,
  borderRadius: 10,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'color-mix(in srgb, currentColor 14%, transparent)',
  flexShrink: 0,
};

/** Chip de destaque dos cards de KPI ("4 ativas", "Projetado"). */
const kpiChipStyle = {
  fontSize: '0.72rem',
  fontWeight: 800,
  padding: '0.15rem 0.5rem',
  borderRadius: 999,
  color: 'var(--primary)',
  background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
  border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
};

/** Célula numérica dos cabeçalhos de grupo ("Sem grupo" e grupos). */
const groupCellStyle = {
  ...cellBase,
  textAlign: 'right',
  borderBottom: '1px solid var(--glass-border)',
  padding: '0.55rem 0.6rem',
  fontSize: '0.78rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

/** Id sentinela da sanfona de "Sem grupo" (nunca colide com uuid real). */
const UNGROUPED_ID = 'mf-ungrouped';

/** Paleta do trilho colorido dos cabeçalhos de grupo (cor própria > paleta). */
const GROUP_ACCENTS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#84cc16'];

/** Cor estável por grupo (hash do id) quando o grupo não tem cor própria. */
const groupAccent = (group) => {
  if (group?.color) return group.color;
  const id = String(group?.id ?? '');
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return GROUP_ACCENTS[hash % GROUP_ACCENTS.length];
};

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
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useMFMonthSummary(user, monthKey);
  const { data: customTypes = [] } = useMFAccountTypes(user);
  const { data: groups = [] } = useMFGroups(user);
  const deleteMutation = useDeleteAccount();
  const updateMutation = useUpdateAccount();
  // Reordenação OTIMISTA de contas e grupos: o sort_order novo vai para os
  // caches MF na hora do clique (a UI move sem esperar) e a gravação
  // corre em paralelo — antes cada clique refetchava tudo (incluindo a
  // RPC pesada do resumo) e dava a sensação de travar.
  const reorderAccounts = useMFReorder('mf_accounts');
  const reorderGroups = useMFReorder('mf_account_groups');

  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  // Visão agrupada é o padrão (toggle liga/desliga); sanfona: grupos
  // recolhidos ficam só com o cabeçalho (ids sentinel p/ "Sem grupo").
  const [groupedView, setGroupedView] = useState(true);
  const [folded, setFolded] = useState(() => new Set());
  // Grupos começam recolhidos (web e mobile): o cabeçalho mostra o total
  // e o clique/toque abre subgrupos e contas. Só na primeira carga — depois
  // o usuário manda na sanfona.
  const foldedInit = useRef(false);
  useEffect(() => {
    if (foldedInit.current || groups.length === 0) return;
    foldedInit.current = true;
    setFolded(new Set(groups.map((group) => group.id)));
  }, [groups]);
  const [accountModal, setAccountModal] = useState(null); // null | 'new' | conta
  const [transferOpen, setTransferOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupEdit, setGroupEdit] = useState(null); // grupo em edição
  // Modo reordenar: cada linha mostra ↑/↓ e troca o sort_order com o
  // vizinho (a mesma ordem vale no Resumo — tudo ordena por sort_order).
  const [reordering, setReordering] = useState(false);
  const [selectedId, setSelectedId] = useState(null); // drill-down da conta
  // Telas estreitas (tablet retrato/mobile): a tabela de 8 colunas quebra
  // letra por letra — troca por cards compactos (mesmos dados e ações
  // essenciais; o detalhe completo abre no toque).
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

  // A tela Contas lista apenas contas: cartões moram na aba Cartões.
  const rows = useMemo(
    () => (data?.rows ?? []).filter((row) => row.account_type !== 'CARTAO'),
    [data]
  );
  const currencyOptions = useMemo(() => [...new Set(rows.map((row) => row.currency))], [rows]);
  // Abas por moeda: contagem de contas ativas por moeda (KPIs e tabela
  // já filtram pela aba — com uma moeda, some a mistura "R$ · US$ · €").
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

  // Base dos cards de KPI: contas ativas da moeda selecionada (a busca
  // afeta só a tabela — os totais não piscam enquanto o usuário digita).
  const activeRows = useMemo(
    () =>
      rows.filter(
        (row) => !row.archived_at && (currency === 'all' || row.currency === currency)
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

  // Itens da tabela: visão agrupada (padrão) — cada grupo vira um cabeçalho
  // (sanfona + ícone + nome + contagem + total das contas diretas) com suas
  // contas logo abaixo; subgrupos aninhados; contas fora de grupo no fim.
  // A visão plana volta pelo toggle; grupos recolhidos escondem os itens
  // sob eles (o próprio cabeçalho sempre fica).
  const buildItems = (list) => {
    const flat = list.map((row) => ({ kind: 'account', row, depth: 0 }));
    if (!groupedView || groups.length === 0) return flat;

    const byId = new Map(groups.map((group) => [group.id, group]));
    const childrenOf = (id) => groups.filter((group) => group.parent_id === id);
    const roots = groups.filter((group) => !group.parent_id || !byId.has(group.parent_id));

    const membersByGroup = new Map();
    const ungrouped = [];
    list.forEach((row) => {
      if (row.group_id && byId.has(row.group_id)) {
        const members = membersByGroup.get(row.group_id) ?? [];
        members.push(row);
        membersByGroup.set(row.group_id, members);
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
  };
  const renderItems = useMemo(
    () => buildItems(accounts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupedView, folded, accounts, groups]
  );

  // Filtro por tipo (chips do modo estreito): vale só na lista de cards —
  // a tabela e os KPIs seguem o filtro de moeda/busca.
  const [typeFilter, setTypeFilter] = useState('all');
  const narrowAccounts = useMemo(
    () =>
      typeFilter === 'all'
        ? accounts
        : accounts.filter((row) => (row.account_type ?? '') === typeFilter),
    [accounts, typeFilter]
  );
  const narrowItems = useMemo(
    () => buildItems(narrowAccounts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupedView, folded, narrowAccounts, groups]
  );
  // Tipos presentes na moeda/busca (chips, inclui arquivadas para não
  // sumir o chip ao arquivar — a contagem respeita o toggle).
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
  /** Nome do grupo pai (legenda do card no modo estreito). */
  const groupNameOf = (row) =>
    groups.find((group) => group.id === row.group_id)?.name ?? null;
  /** Contas já aninhadas no cartão do grupo (não repetem soltas). */
  const nestedIds = useMemo(() => {
    const ids = new Set();
    narrowItems.forEach((item) => {
      if (item.kind === 'group' && !folded.has(item.group.id)) {
        item.rows.forEach((row) => ids.add(row.id));
      }
    });
    return ids;
  }, [narrowItems, folded]);

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

  // Drill-down sobrevive ao F5: grava ao abrir, limpa ao fechar e
  // restaura uma vez (quando as linhas chegam) se a conta existir.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (selectedId) {
      writeDrill({ tab: 'accounts', id: selectedId });
      return;
    }
    if (restoredRef.current) {
      writeDrill(null);
      return;
    }
    if (rows.length === 0) return;
    restoredRef.current = true;
    const saved = readDrill();
    if (saved?.tab === 'accounts' && saved?.id && rows.some((row) => row.id === saved.id)) {
      setSelectedId(saved.id);
    }
  }, [selectedId, rows]);

  // Pedido de "nova conta" vindo do FAB global: abre o modal no mount ou
  // pelo evento. O pedido só é limpo quando o modal fecha — assim ele
  // sobrevive aos remounts do Dashboard (refreshKey).
  useEffect(() => {
    if (hasNewAccountRequest()) {
      setAccountModal('new');
      return undefined;
    }
    const onRequest = () => setAccountModal('new');
    window.addEventListener('mf-new-account', onRequest);
    return () => window.removeEventListener('mf-new-account', onRequest);
  }, []);

  const nativeMoney = (value, rowCurrency) =>
    showValues ? formatMoney(value, rowCurrency) : '•••';
  // Rodapé da tabela: soma TUDO que está listado (inclusive "Ignorar nos
  // totais") — só os cards de KPI excluem as ignoradas. Renderizado via
  // MFTotalsStack (uma moeda por linha); os helpers de string saíram.

  // Soma bruta de um mapa por moeda — usada só para decidir o sinal.
  const sumMap = (map) => Object.values(map).reduce((sum, value) => sum + value, 0);

  /** Transferência líquida de uma linha: crédito − débito, com sinal. */
  const netCellText = (value, rowCurrency) => {
    if (!showValues) return '•••';
    if (value > 0) return `+${formatMoney(value, rowCurrency)}`;
    if (value < 0) return `−${formatMoney(-value, rowCurrency)}`;
    return formatMoney(0, rowCurrency);
  };

  /** Total líquido de transferências de um conjunto de contas (por moeda). */
  const netTotalsText = (list) => {
    if (!showValues) return '•••';
    const credit = groupTotalsByCurrency(list, 'transfCredito');
    const debit = groupTotalsByCurrency(list, 'transfDebito');
    const net = {};
    new Set([...Object.keys(credit), ...Object.keys(debit)]).forEach((cur) => {
      net[cur] = (credit[cur] ?? 0) - (debit[cur] ?? 0);
    });
    const value = sumMap(net);
    const magnitude = Object.fromEntries(
      Object.entries(net).map(([cur, amount]) => [cur, Math.abs(amount)])
    );
    const body = formatTotals(magnitude, true);
    if (value < 0) return `−${body}`;
    if (value > 0) return `+${body}`;
    return body;
  };

  /** "Novembro de 2026" no idioma ativo (rótulo do card de movimento). */
  const monthLabel = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1));

  /** Grupos com pelo menos uma conta ativa (subtítulo do card de saldo). */
  const activeGroupIds = new Set(
    activeRows.map((row) => row.group_id).filter(Boolean)
  );
  const groupsWithAccounts = [...activeGroupIds].filter((id) =>
    groups.some((group) => group.id === id)
  ).length;

  // Totais do rodapé da tabela (base: contas listadas, com a busca aplicada).
  const listedNetTransfer =
    sumMap(groupTotalsByCurrency(accounts, 'transfCredito')) -
    sumMap(groupTotalsByCurrency(accounts, 'transfDebito'));
  const listedGroupCount = new Set(
    accounts.map((row) => row.group_id).filter(Boolean)
  ).size;

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

  /** Reordena: sobe (−1) ou desce (+1) trocando o sort_order com o vizinho visível. */
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

  /** Reordena grupos: sobe/desce entre irmãos (mesmo pai). Reescreve a
   * posição de todos os irmãos — cura o "0 em tudo" que deixava a ordem
   * alfabética sem controle do usuário. Vale no Resumo também (mesmo sort). */
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

  const headers = [
    'accounts_table_initial',
    'accounts_table_income',
    'accounts_table_expense',
    'accounts_table_transf',
    'accounts_table_balance',
    'accounts_table_forecast',
  ];

  /** Card de conta no modo estreito (layout do mockup: ícone + nome +
   * SALDO à direita, badges + previsão abaixo). `subtitle` = grupo pai. */
  const renderNarrowAccount = (row, subtitle = null) => {
    const typeInfo = accountTypeInfo(row.account_type, customTypes);
    const typeLabel = typeInfo.builtin ? t(typeInfo.key) : typeInfo.label;
    return (
      <div
        key={row.id}
        data-testid="mf-account-row"
        role="button"
        tabIndex={0}
        onClick={() => setSelectedId(row.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSelectedId(row.id);
          }
        }}
        className="glass-card-flat table-row-hover"
        style={{
          padding: '0.9rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          cursor: 'pointer',
          opacity: row.archived_at ? 0.6 : 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
          <MFAccountIcon
            account={row}
            size={44}
            data-testid={`mf-account-icon-${row.id}`}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
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
                fontSize: '0.95rem',
                lineHeight: 1.3,
                color: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'block',
                overflowWrap: 'break-word',
              }}
            >
              {row.name}
            </button>
            {subtitle && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {subtitle}
              </div>
            )}
          </div>
          {reordering ? (
            <span style={{ display: 'inline-flex', gap: '0.25rem', flexShrink: 0 }}>
              <button
                type="button"
                className="icon-btn"
                aria-label={t('minhasfinancas.move_up')}
                data-testid={`mf-move-up-${row.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  moveAccount(row.id, -1);
                }}
                style={{ padding: '0.35rem' }}
              >
                <ChevronUp size={15} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={t('minhasfinancas.move_down')}
                data-testid={`mf-move-down-${row.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  moveAccount(row.id, 1);
                }}
                style={{ padding: '0.35rem' }}
              >
                <ChevronDown size={15} />
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="icon-btn"
              aria-label={t('minhasfinancas.edit')}
              data-testid={`mf-edit-account-${row.id}`}
              onClick={(event) => {
                event.stopPropagation();
                setAccountModal(row);
              }}
              style={{ padding: '0.45rem', flexShrink: 0 }}
            >
              <Pencil size={15} />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('minhasfinancas.accounts_table_balance')}
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', fontVariantNumeric: 'tabular-nums' }}>
              {nativeMoney(row.saldo, row.currency)}
            </div>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
            {t('minhasfinancas.accounts_table_forecast')}: {nativeMoney(row.previsto, row.currency)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MFIgnoreDots show={row.ignore_in_totals} />
          <span style={badgeStyle} data-testid="mf-account-type-badge">
            <span aria-hidden>{typeInfo.icon}</span>
            {typeLabel}
          </span>
          <span style={badgeStyle} data-testid="mf-account-currency-badge">
            <span aria-hidden>{currencyFlag(row.currency)}</span>
            {row.currency}
          </span>
        </div>
      </div>
    );
  };

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
          onOpenCard={(card) => {
            // A aba Contas não guarda cartão no drill (lista só contas
            // comuns) — salva o alvo e pula para a aba Cartões, que
            // restaura o drill salvo ao montar.
            writeDrill({ tab: 'cards', id: card.id });
            window.dispatchEvent(
              new CustomEvent('set-active-tab', { detail: { tab: 'minhasfinancas-cards' } })
            );
          }}
          onOpenAccount={(row) => setSelectedId(row.id)}
        />
      ) : (
        <>
      {/* Cards de KPI: saldo, movimento do mês e previsão */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '1rem',
        }}
      >
        <div
          className="glass-card"
          data-testid="mf-contas-kpi-balance"
          style={{ padding: '1.1rem 1.25rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <span style={{ ...kpiIconBox, color: 'var(--primary)' }}>
              <Wallet size={18} />
            </span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              {t('minhasfinancas.kpi_balance')}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>
            {isLoading ? '…' : isError ? '—' : (
              <MFTotalsStack
                totals={kpis.saldo}
                showValues={showValues}
                testId="mf-contas-kpi-balance-value"
                fontSize="inherit"
              />
            )}
          </p>
          <div style={{ marginTop: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={kpiChipStyle}>
              {t('minhasfinancas.kpi_active_accounts', { count: countableRows(activeRows).length })}
            </span>
            {groupsWithAccounts > 0 && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {t('minhasfinancas.groups_count', { count: groupsWithAccounts })}
              </span>
            )}
          </div>
        </div>

        <div
          className="glass-card"
          data-testid="mf-contas-kpi-movement"
          style={{ padding: '1.1rem 1.25rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <span style={{ ...kpiIconBox, color: '#10b981' }}>
              <TrendingUp size={18} />
            </span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              {t('minhasfinancas.kpi_movement', { month: monthLabel })}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.9rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: sumMap(kpis.receitas) > 0 ? 'var(--success, #10b981)' : 'var(--text-muted)',
                }}
              />
              <span
                style={{
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  color: sumMap(kpis.receitas) > 0 ? 'var(--success, #10b981)' : 'var(--text-muted)',
                }}
              >
                <MFTotalsStack
                  totals={kpis.receitas}
                  showValues={showValues}
                  prefix={sumMap(kpis.receitas) > 0 && showValues ? '+' : ''}
                  testId="mf-contas-kpi-receitas-value"
                  fontSize="inherit"
                />
              </span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: sumMap(kpis.despesas) > 0 ? 'var(--danger, #ef4444)' : 'var(--text-muted)',
                }}
              />
              <span
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: sumMap(kpis.despesas) > 0 ? 'var(--danger, #ef4444)' : 'var(--text-muted)',
                }}
              >
                <MFTotalsStack
                  totals={kpis.despesas}
                  showValues={showValues}
                  prefix={sumMap(kpis.despesas) > 0 && showValues ? '−' : ''}
                  testId="mf-contas-kpi-despesas-value"
                  fontSize="inherit"
                />
              </span>
            </span>
          </div>
          <p style={{ margin: '0.55rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {t('minhasfinancas.kpi_movement_hint')}
          </p>
        </div>

        <div
          className="glass-card"
          data-testid="mf-contas-kpi-forecast"
          style={{ padding: '1.1rem 1.25rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <span style={{ ...kpiIconBox, color: '#06b6d4' }}>
              <CalendarClock size={18} />
            </span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              {t('minhasfinancas.kpi_forecast')}
            </span>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: '1.6rem',
              fontWeight: 800,
              color: '#06b6d4',
            }}
          >
            {isLoading ? '…' : isError ? '—' : (
              <MFTotalsStack
                totals={kpis.previsto}
                showValues={showValues}
                testId="mf-contas-kpi-forecast-value"
                fontSize="inherit"
              />
            )}
          </p>
          <div style={{ marginTop: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span
              style={{
                ...kpiChipStyle,
                color: '#06b6d4',
                background: 'rgba(6, 182, 212, 0.12)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
              }}
            >
              {t('minhasfinancas.kpi_projected')}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.kpi_forecast_hint')}
            </span>
          </div>
        </div>
      </div>

      {/* Barra de ferramentas: busca, visão, moeda/mês e ações */}
      <div
        className="glass-card"
        style={{
          padding: '0.85rem 1rem',
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
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
            style={{ paddingLeft: '2.5rem', paddingRight: search !== '' ? '2.2rem' : undefined, width: '100%' }}
          />
          {search !== '' && (
            <button
              type="button"
              className="icon-btn"
              data-testid="mf-accounts-search-clear"
              aria-label={t('minhasfinancas.search_clear')}
              title={t('minhasfinancas.search_clear')}
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                padding: '0.25rem',
              }}
            >
              <X size={15} />
            </button>
          )}
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
            padding: '0.55rem 0.9rem',
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
              padding: '0.55rem 0.9rem',
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
        <button
          type="button"
          className="btn-cancel"
          data-testid="mf-reorder-toggle"
          aria-pressed={reordering}
          onClick={() => setReordering((prev) => !prev)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.55rem 0.9rem',
            fontSize: '0.82rem',
            background: reordering
              ? 'color-mix(in srgb, var(--primary) 16%, transparent)'
              : undefined,
            color: reordering ? 'var(--primary)' : undefined,
            borderColor: reordering ? 'var(--primary)' : undefined,
          }}
        >
          <ArrowUpDown size={14} />
          {t('minhasfinancas.accounts_reorder')}
        </button>

        <span style={{ flex: '1 1 auto' }} />
        <MFMonthNav monthKey={monthKey} onChange={onChangeMonth} />
        <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--glass-border)' }} />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            data-testid="mf-new-transfer"
            onClick={() => setTransferOpen(true)}
            style={{ padding: '0.6rem 0.9rem', fontSize: '0.85rem' }}
          >
            <ArrowLeftRight size={16} />
            {t('minhasfinancas.transfer')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            data-testid="mf-new-group"
            onClick={() => setGroupModalOpen(true)}
            style={{ padding: '0.6rem 0.9rem', fontSize: '0.85rem' }}
          >
            <FolderTree size={16} />
            {t('minhasfinancas.group_new_short')}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-new-account"
            onClick={() => setAccountModal('new')}
            style={{ padding: '0.6rem 0.9rem', fontSize: '0.85rem' }}
          >
            <Plus size={16} />
            {t('minhasfinancas.new_account')}
          </button>
        </div>
      </div>

      {/* Abas por moeda: com uma moeda selecionada, KPIs e tabela mostram
          só ela — o header deixa de concatenar "R$ · US$ · € · £". */}
      <MFCurrencyTabs
        currencies={currencyOptions}
        counts={currencyCounts}
        value={currency}
        onChange={setCurrency}
        testId="mf-contas-currency-tabs"
      />

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

      {/* Tabela (cabe na largura: colunas fixas, sem scroll lateral) */}
      {(isLoading || accounts.length > 0) && (isNarrow ? (
        <div data-testid="mf-contas-cards" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingBottom: '5.5rem' }}>
          {/* Consolidado + filtro por tipo (mockup mobile) */}
          <div
            className="glass-card"
            data-testid="mf-contas-narrow-summary"
            style={{
              padding: '1rem 1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 22%, transparent), color-mix(in srgb, #8b5cf6 16%, transparent))',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {t('minhasfinancas.kpi_balance')}
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.3rem' }}>
                <MFTotalsStack
                  totals={groupTotalsByCurrency(narrowAccounts, 'saldo')}
                  showValues={showValues}
                  testId="mf-contas-narrow-summary-saldo"
                  fontSize="inherit"
                  hero
                />
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {t('minhasfinancas.accounts_table_forecast')}
              </div>
              <div style={{ fontWeight: 800 }}>
                <MFTotalsStack
                  totals={groupTotalsByCurrency(narrowAccounts, 'previsto')}
                  showValues={showValues}
                  testId="mf-contas-narrow-summary-previsto"
                  align="right"
                  fontSize="inherit"
                />
              </div>
            </div>
          </div>
          <div
            role="tablist"
            aria-label={t('minhasfinancas.report_type')}
            data-testid="mf-contas-narrow-types"
            style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.15rem' }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={typeFilter === 'all'}
              data-testid="mf-narrow-type-all"
              onClick={() => setTypeFilter('all')}
              style={narrowTypeTabStyle(typeFilter === 'all')}
            >
              {t('minhasfinancas.report_type_all')} ({narrowAccounts.length})
            </button>
            {typeOptions.map(([code, label]) => {
              const count = narrowAccounts.filter((row) => (row.account_type ?? '') === code).length;
              const shown = typeFilter === 'all'
                ? accounts.filter((row) => (row.account_type ?? '') === code).length
                : count;
              return (
                <button
                  key={code || 'none'}
                  type="button"
                  role="tab"
                  aria-selected={typeFilter === code}
                  data-testid={`mf-narrow-type-${code || 'none'}`}
                  onClick={() => setTypeFilter(code)}
                  style={narrowTypeTabStyle(typeFilter === code)}
                >
                  {label} ({shown})
                </button>
              );
            })}
          </div>
          {narrowItems.map((item) => {
            if (item.kind === 'account') {
              if (nestedIds.has(item.row.id)) return null;
              return renderNarrowAccount(item.row, groupNameOf(item.row));
            }
            // Cabeçalho de grupo / "Sem grupo" (mockup): linha com total +
            // filhas aninhadas com trilho (recolhe na sanfona).
            const isGroup = item.kind === 'group';
            const group = item.group;
            const foldId = isGroup ? group.id : UNGROUPED_ID;
            const collapsed = folded.has(foldId);
            const rail = isGroup && group.color ? group.color : 'var(--glass-border)';
            return (
              <div
                key={isGroup ? group.id : UNGROUPED_ID}
                data-testid={isGroup ? `mf-group-header-${group.id}` : 'mf-ungrouped-header'}
                className="glass-card-flat"
                style={{
                  padding: '0.9rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: collapsed ? 0 : '0.6rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <button
                    type="button"
                    aria-label={collapsed ? t('minhasfinancas.group_show_accounts') : t('minhasfinancas.group_hide_accounts')}
                    data-testid={isGroup ? `mf-group-fold-${group.id}` : 'mf-ungrouped-fold'}
                    onClick={() => toggleFold(foldId)}
                    style={{ background: 'none', border: 'none', padding: 0, display: 'inline-flex', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}
                  >
                    <ChevronDown
                      size={16}
                      style={{
                        transform: collapsed ? 'rotate(-90deg)' : 'none',
                        transition: 'transform 0.15s',
                      }}
                    />
                  </button>
                  {isGroup ? (
                    <MFGroupIcon icon={group.icon} name={group.name} color={group.color} size={30} />
                  ) : (
                    <FolderTree size={22} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'break-word' }}>
                      {isGroup ? group.name : t('minhasfinancas.group_ungrouped')}
                    </div>
                  </div>
                  <span
                    data-testid={isGroup ? `mf-group-count-${group.id}` : 'mf-ungrouped-count'}
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      background: 'rgba(255, 255, 255, 0.07)',
                      borderRadius: 999,
                      padding: '0.25rem 0.65rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {t('minhasfinancas.group_count', { count: item.count })}
                  </span>
                  {isGroup && !reordering && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('minhasfinancas.group_edit_action')}
                      data-testid={`mf-group-edit-${group.id}`}
                      onClick={() => setGroupEdit(group)}
                      style={{ padding: '0.3rem', flexShrink: 0 }}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {reordering && isGroup && (
                    <span style={{ display: 'inline-flex', gap: '0.25rem', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={t('minhasfinancas.move_up')}
                        data-testid={`mf-group-move-up-${group.id}`}
                        onClick={() => moveGroup(group.id, -1)}
                        style={{ padding: '0.35rem' }}
                      >
                        <ChevronUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={t('minhasfinancas.move_down')}
                        data-testid={`mf-group-move-down-${group.id}`}
                        onClick={() => moveGroup(group.id, 1)}
                        style={{ padding: '0.35rem' }}
                      >
                        <ChevronDown size={15} />
                      </button>
                    </span>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <MFTotalsStack
                    totals={groupTotalsByCurrency(item.rows, 'saldo')}
                    showValues={showValues}
                    testId={isGroup ? `mf-group-total-${group.id}` : 'mf-ungrouped-total'}
                    align="right"
                    fontSize="1rem"
                    lineHeight={1.35}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    {t('minhasfinancas.accounts_table_forecast')}:{' '}
                    <MFTotalsStack
                      totals={groupTotalsByCurrency(item.rows, 'previsto')}
                      showValues={showValues}
                      align="right"
                      fontSize="inherit"
                      lineHeight={1.35}
                    />
                  </div>
                </div>
                {!collapsed && isGroup && item.rows.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {item.rows.map((row) => (
                      <div
                        key={row.id}
                        style={{
                          borderLeft: `3px solid ${rail}`,
                          borderRadius: 12,
                          paddingLeft: '0.6rem',
                        }}
                      >
                        {renderNarrowAccount(row, group.name)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!isLoading && accounts.length > 0 && (
            <div
              data-testid="mf-contas-narrow-total"
              className="glass-card"
              style={{ padding: '0.8rem 0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}
            >
              <span style={{ fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {t('minhasfinancas.total')}
              </span>
              <span style={{ textAlign: 'right' }}>
                <MFTotalsStack
                  totals={groupTotalsByCurrency(narrowAccounts, 'saldo')}
                  showValues={showValues}
                  align="right"
                  fontSize="inherit"
                  lineHeight={1.35}
                />
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  {t('minhasfinancas.accounts_table_forecast')}:{' '}
                  <MFTotalsStack
                    totals={groupTotalsByCurrency(narrowAccounts, 'previsto')}
                    showValues={showValues}
                    align="right"
                    fontSize="inherit"
                    lineHeight={1.35}
                  />
                </span>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '0.5rem 0.75rem', overflowX: 'auto', width: '100%', maxWidth: '100%' }}>
          <table
            style={{
              width: '100%',
              maxWidth: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
            }}
          >
            <colgroup>
              <col />
              <col style={{ width: 102 }} />
              <col style={{ width: 102 }} />
              <col style={{ width: 102 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 102 }} />
              <col style={{ width: 102 }} />
              {/* 4 botões (~28px) + gaps + padding da célula */}
              <col style={{ width: 146 }} />
            </colgroup>
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
                    colSpan={8}
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
                    const itemNet =
                      sumMap(groupTotalsByCurrency(item.rows, 'transfCredito')) -
                      sumMap(groupTotalsByCurrency(item.rows, 'transfDebito'));
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
                          borderLeft: `3px solid ${
                            isGroup ? groupAccent(group) : 'var(--glass-border)'
                          }`,
                        }}
                      >
                        <td
                          style={{
                            ...cellBase,
                            borderBottom: '1px solid var(--glass-border)',
                            padding: '0.55rem 0.6rem',
                            fontWeight: 800,
                            whiteSpace: 'normal',
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.55rem',
                              minWidth: 0,
                              flexWrap: 'wrap',
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
                              title={t(
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
                            {isGroup && (
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label={t('minhasfinancas.group_edit_action')}
                                title={t('minhasfinancas.group_edit_action')}
                                data-testid={`mf-group-edit-${group.id}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setGroupEdit(group);
                                }}
                                style={{ padding: '0.2rem', borderRadius: 8 }}
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                          </span>
                        </td>
                        <td style={{ ...groupCellStyle, color: 'var(--text-muted)' }}>
                          <MFTotalsStack
                            totals={groupTotalsByCurrency(item.rows, 'initial_balance')}
                            showValues={showValues}
                            align="right"
                            fontSize="inherit"
                          />
                        </td>
                        <td style={{ ...groupCellStyle, color: 'var(--success, #10b981)' }}>
                          <MFTotalsStack
                            totals={groupTotalsByCurrency(item.rows, 'receitas')}
                            showValues={showValues}
                            align="right"
                            fontSize="inherit"
                          />
                        </td>
                        <td style={{ ...groupCellStyle, color: 'var(--danger, #ef4444)' }}>
                          <MFTotalsStack
                            totals={groupTotalsByCurrency(item.rows, 'despesas')}
                            showValues={showValues}
                            align="right"
                            fontSize="inherit"
                          />
                        </td>
                        <td
                          style={{
                            ...groupCellStyle,
                            color:
                              itemNet > 0
                                ? 'var(--success, #10b981)'
                                : itemNet < 0
                                  ? 'var(--danger, #ef4444)'
                                  : 'var(--text-muted)',
                          }}
                        >
                          {netTotalsText(item.rows)}
                        </td>
                        <td style={{ ...groupCellStyle, fontWeight: 800 }}>
                          <MFTotalsStack
                            totals={groupTotalsByCurrency(item.rows, 'saldo')}
                            showValues={showValues}
                            testId={
                              isGroup ? `mf-group-total-${group.id}` : 'mf-ungrouped-total'
                            }
                            align="right"
                            fontSize="inherit"
                            lineHeight={1.3}
                          />
                        </td>
                        <td style={{ ...groupCellStyle, color: 'var(--text-muted)' }}>
                          <MFTotalsStack
                            totals={groupTotalsByCurrency(item.rows, 'previsto')}
                            showValues={showValues}
                            align="right"
                            fontSize="inherit"
                          />
                        </td>
                        <td
                          style={{
                            ...groupCellStyle,
                            textAlign: 'center',
                            fontSize: '0.68rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {reordering && isGroup ? (
                            <span style={{ display: 'inline-flex', gap: '0.25rem', justifyContent: 'center' }}>
                              {(() => {
                                const siblings = groups.filter(
                                  (item) => (item.parent_id ?? null) === (group.parent_id ?? null)
                                );
                                const position = siblings.findIndex((item) => item.id === group.id);
                                const isFirst = position <= 0;
                                const isLast = position < 0 || position >= siblings.length - 1;
                                return (
                                  <>
                                    <button
                                      type="button"
                                      className="icon-btn"
                                      aria-label={t('minhasfinancas.move_up')}
                                      title={t('minhasfinancas.move_up')}
                                      data-testid={`mf-group-move-up-${group.id}`}
                                      disabled={isFirst}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        moveGroup(group.id, -1);
                                      }}
                                      style={{ padding: '0.25rem', opacity: isFirst ? 0.3 : 1 }}
                                    >
                                      <ChevronUp size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      className="icon-btn"
                                      aria-label={t('minhasfinancas.move_down')}
                                      title={t('minhasfinancas.move_down')}
                                      data-testid={`mf-group-move-down-${group.id}`}
                                      disabled={isLast}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        moveGroup(group.id, 1);
                                      }}
                                      style={{ padding: '0.25rem', opacity: isLast ? 0.3 : 1 }}
                                    >
                                      <ChevronDown size={14} />
                                    </button>
                                  </>
                                );
                              })()}
                            </span>
                          ) : (
                            t('minhasfinancas.total')
                          )}
                        </td>
                      </tr>
                    );
                  }

                  const row = item.row;
                  const info = accountTypeInfo(row.account_type, customTypes);
                  const typeLabel = info.builtin ? t(info.key) : info.label;
                  const rowNetTransfer =
                    (row.transfCredito ?? 0) - (row.transfDebito ?? 0);
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
                        whiteSpace: 'normal',
                        minWidth: 0,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                        <MFAccountIcon
                          account={row}
                          size={26}
                          data-testid={`mf-account-icon-${row.id}`}
                        />
                        <span
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.3rem',
                            minWidth: 0,
                          }}
                        >
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
                              whiteSpace: 'normal',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {row.name}
                          </button>
                          <span style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <MFIgnoreDots show={row.ignore_in_totals} style={{ alignSelf: 'center' }} />
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
                        </span>
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
                    <td
                      style={{
                        ...cellBase,
                        textAlign: 'right',
                        borderBottom: '1px solid var(--glass-border)',
                        color:
                          rowNetTransfer > 0
                            ? 'var(--success, #10b981)'
                            : rowNetTransfer < 0
                              ? 'var(--danger, #ef4444)'
                              : 'var(--text-muted)',
                      }}
                    >
                      {netCellText(rowNetTransfer, row.currency)}
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
                      {reordering ? (
                        <span style={{ display: 'inline-flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                          {(() => {
                            const accIndex = accounts.findIndex((acc) => acc.id === row.id);
                            const isFirst = accIndex <= 0;
                            const isLast = accIndex < 0 || accIndex >= accounts.length - 1;
                            return (
                              <>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  aria-label={t('minhasfinancas.move_up')}
                                  title={t('minhasfinancas.move_up')}
                                  data-testid={`mf-move-up-${row.id}`}
                                  disabled={isFirst}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveAccount(row.id, -1);
                                  }}
                                  style={{ padding: '0.35rem', opacity: isFirst ? 0.3 : 1 }}
                                >
                                  <ChevronUp size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  aria-label={t('minhasfinancas.move_down')}
                                  title={t('minhasfinancas.move_down')}
                                  data-testid={`mf-move-down-${row.id}`}
                                  disabled={isLast}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveAccount(row.id, 1);
                                  }}
                                  style={{ padding: '0.35rem', opacity: isLast ? 0.3 : 1 }}
                                >
                                  <ChevronDown size={15} />
                                </button>
                              </>
                            );
                          })()}
                        </span>
                      ) : (
                      <span style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
                          style={{ padding: '0.35rem' }}
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
                          style={{ padding: '0.35rem', color: row.archived_at ? 'var(--success, #10b981)' : undefined }}
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
                          style={{ padding: '0.35rem' }}
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
                          style={{ padding: '0.35rem' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </span>
                      )}
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
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'baseline',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      {t('minhasfinancas.total')}
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          textTransform: 'none',
                          letterSpacing: 0,
                        }}
                      >
                        (
                        {t('minhasfinancas.accounts_count', {
                          count: accounts.length,
                        })}
                        {listedGroupCount > 0 &&
                          ` · ${t('minhasfinancas.groups_count', { count: listedGroupCount })}`}
                        )
                      </span>
                    </span>
                  </td>
                  <td style={{ ...cellBase, textAlign: 'right', color: 'var(--text-muted)' }}>
                    <MFTotalsStack
                      totals={groupTotalsByCurrency(accounts, 'initial_balance')}
                      showValues={showValues}
                      testId="mf-contas-foot-initial"
                      align="right"
                      fontSize="0.75rem"
                      lineHeight={1.25}
                    />
                  </td>
                  <td style={{ ...cellBase, textAlign: 'right', color: 'var(--success, #10b981)', fontWeight: 700 }}>
                    <MFTotalsStack
                      totals={groupTotalsByCurrency(accounts, 'receitas')}
                      showValues={showValues}
                      testId="mf-contas-foot-receitas"
                      align="right"
                      fontSize="0.75rem"
                      lineHeight={1.25}
                    />
                  </td>
                  <td style={{ ...cellBase, textAlign: 'right', color: 'var(--danger, #ef4444)', fontWeight: 700 }}>
                    <MFTotalsStack
                      totals={groupTotalsByCurrency(accounts, 'despesas')}
                      showValues={showValues}
                      testId="mf-contas-foot-despesas"
                      align="right"
                      fontSize="0.75rem"
                      lineHeight={1.25}
                    />
                  </td>
                  <td
                    style={{
                      ...cellBase,
                      textAlign: 'right',
                      fontWeight: 700,
                      color:
                        listedNetTransfer > 0
                          ? 'var(--success, #10b981)'
                          : listedNetTransfer < 0
                            ? 'var(--danger, #ef4444)'
                            : 'var(--text-muted)',
                    }}
                  >
                    {netTotalsText(accounts)}
                  </td>
                  <td style={{ ...cellBase, textAlign: 'right', fontWeight: 800 }}>
                    <MFTotalsStack
                      totals={groupTotalsByCurrency(accounts, 'saldo')}
                      showValues={showValues}
                      testId="mf-contas-foot-saldo"
                      align="right"
                      fontSize="0.78rem"
                      lineHeight={1.25}
                    />
                  </td>
                  <td style={{ ...cellBase, textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)' }}>
                    <MFTotalsStack
                      totals={groupTotalsByCurrency(accounts, 'previsto')}
                      showValues={showValues}
                      testId="mf-contas-foot-previsto"
                      align="right"
                      fontSize="0.75rem"
                      lineHeight={1.25}
                    />
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ))}
        </>
      )}

      <MFAccountModal
        isOpen={accountModal !== null}
        account={accountModal && accountModal !== 'new' ? accountModal : null}
        user={user}
        onClose={() => {
          clearNewAccountRequest();
          setAccountModal(null);
        }}
      />
      {groupModalOpen && (
        <MFGroupModal user={user} onClose={() => setGroupModalOpen(false)} />
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
