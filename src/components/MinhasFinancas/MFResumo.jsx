import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  CalendarClock,
  ArrowRight,
  Plus,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Eye,
  EyeOff,
  FolderTree,
  MoreVertical,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Lock,
  LockOpen,
} from 'lucide-react';
import {
  Legend,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  useMFMonthSummary,
  useMFBudgets,
  useMFBudgetWindow,
  useMFGoals,
  useMFGoalContributions,
  useMFAccountBalances,
  useMFCategories,
  useMFGroups,
  useMFCardUpcoming,
  useMFRecentTransactions,
  useMFNarrowScreen,
  useMFReorder,
  MF_BUILTIN_ACCOUNT_TYPES,
  MF_ACCOUNT_TYPE_ICONS,
  budgetSpent,
  budgetLimit,
  goalCurrentAmount,
  monthBounds,
  formatMoney,
  groupTotalsByCurrency,
  countableRows,
  formatTotals,
  shiftMonth,
  sumField,
  currentMonthKey,
} from '../../hooks/useMinhasFinancas';
import MFMonthNav from './MFMonthNav';
import MFCurrencyTabs from './MFCurrencyTabs';
import MFTotalsStack from './MFTotalsStack';
import MFTotalsHero from './MFTotalsHero';
import MFIgnoreDots from './MFIgnoreDots';
import MFAccountIcon from './MFAccountIcon';
import MFCardBrandIcon from './MFCardBrandIcon';
import MFGroupCard from './MFGroupCard';
import MFAccountDetail from './MFAccountDetail';
import MFGroupDrill from './MFGroupDrill';
import MFGroupModal from './MFGroupModal';
import MFAccountModal from './MFAccountModal';
import MFRemindersBell from './MFRemindersBell';
import MFPendingCard from './MFPendingCard';
import MFTxDetailModal from './MFTxDetailModal';
import {
  MF_CHARTS,
  visibleWidgets,
  visibleCharts,
  toggleWidget,
  toggleChart,
  moveWidget,
  toggleAccountVisible,
  setHiddenAccounts,
  loadWidgetPref,
  saveWidgetPref,
} from './mfDashboard';

const goTo = (tab) => window.dispatchEvent(new CustomEvent('set-active-tab', { detail: { tab } }));

/** '2026-10' → 'out' (rótulo curto do eixo, no idioma informado). */
const shortMonthLabel = (monthKey, language) => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat(language, { month: 'short' })
    .format(new Date(year, month - 1, 1))
    .replace('.', '');
};

const CHART_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#84cc16'];

// Ordenação das contas no Resumo, a critério do usuário (persistida em
// localStorage). `manual` é o padrão: ordem do banco (sort_order) — as
// setas ↑/↓ só aparecem com o modo Reordenar ligado (mesma ordem vale
// na tela Contas).
const ACCOUNT_SORT_OPTIONS = [
  { value: 'manual', labelKey: 'minhasfinancas.sort_manual' },
  { value: 'name', labelKey: 'minhasfinancas.sort_name' },
  { value: 'balance_desc', labelKey: 'minhasfinancas.sort_balance_desc' },
  { value: 'balance_asc', labelKey: 'minhasfinancas.sort_balance_asc' },
  { value: 'forecast_desc', labelKey: 'minhasfinancas.sort_forecast_desc' },
  { value: 'forecast_asc', labelKey: 'minhasfinancas.sort_forecast_asc' },
];

/** '2026-11-30' → '30/11' (dia/mês da próxima fatura). */
const shortDate = (iso) => {
  if (!iso) return '';
  const [, m, d] = String(iso).split('-');
  return `${d}/${m}`;
};

/** '2026-09-30' → '30/09, qua.' (fechamento/vencimento com dia da semana,
 *  como no Minhas Finanças). Sem dia da semana válido, cai no 'dd/mm'. */
const shortDateWeekday = (iso, language) => {
  if (!iso) return '';
  try {
    const wd = new Intl.DateTimeFormat(language, { weekday: 'short' }).format(
      new Date(`${iso}T12:00:00`)
    );
    return `${shortDate(iso)}, ${wd}`;
  } catch {
    return shortDate(iso);
  }
};

/** '2026-10-31' → '31/OUT' (dia + mês abreviado — fechamento/vencimento de fatura). */
const dayMonthLabel = (iso, language) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  const month = new Intl.DateTimeFormat(language, { month: 'short' })
    .format(new Date(y, m - 1, 1))
    .replace('.', '')
    .toUpperCase();
  return `${String(d).padStart(2, '0')}/${month}`;
};

/** Estado visual da fatura corrente: paga (check verde), fechada (cadeado
 *  âmbar — período travado aguardando vencimento/pagamento) ou aberta
 *  (cadeado azul — ciclo ainda acumulando compras). */
const cardInvoiceState = (current) => {
  if (!current) return null;
  if (current.status === 'PAGA')
    return { icon: 'paid', color: '#10b981', labelKey: 'card_status_paid' };
  if (current.status === 'AGENDADA')
    return { icon: 'closed', color: '#f59e0b', labelKey: 'card_status_scheduled' };
  // CORRENTE: fechada quando o ciclo já virou (closeISO hoje ou antes).
  return current.closed
    ? { icon: 'closed', color: '#f59e0b', labelKey: 'inv_status_closed' }
    : { icon: 'open', color: 'var(--primary)', labelKey: 'card_status_open' };
};

const tooltipStyle = {
  background: 'var(--input-bg)',
  border: '1px solid var(--glass-border)',
  borderRadius: 8,
  fontSize: 12,
};

/** Percentual de variação vs mês anterior (null quando não há base). */
const variation = (current, previous) => {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
};

function VariationChip({ value, favorable }) {
  const { t } = useTranslation();
  if (value === null) return null;
  const color = favorable ? '#10b981' : '#ef4444';
  return (
    <span
      data-testid="mf-kpi-variation"
      style={{
        fontSize: '0.72rem',
        fontWeight: 800,
        padding: '0.15rem 0.5rem',
        borderRadius: '999px',
        color,
        background: favorable ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
      }}
    >
      {value >= 0 ? '+' : ''}
      {value}% {t('minhasfinancas.vs_prev_month')}
    </span>
  );
}

/**
 * Resumo do mês (referência: tela "Junho" do Minhas Finanças):
 * navegação de mês, KPIs com variação vs mês anterior e tabela de contas.
 * Painel personalizável (Fase 9): widgets com ordem/visibilidade em
 * localStorage (`mfDashboard.js`).
 */
export default function MFResumo({
  user,
  monthKey = currentMonthKey(),
  onChangeMonth = () => {},
  showValues = true,
}) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useMFMonthSummary(user, monthKey);

  // Cards de Orçamento e Objetivos (Fase 5)
  const { data: budgets = [] } = useMFBudgets(user);
  const { data: budgetWindow } = useMFBudgetWindow(user, 6);
  const { data: allGoals = [] } = useMFGoals(user);
  const { data: allContributions = [] } = useMFGoalContributions(user);
  // Saldos só das contas atreladas a objetivos (o resto não é usado aqui)
  // — evita baixar a tabela inteira de lançamentos a cada abertura.
  const goalAccountIds = useMemo(
    () => allGoals.map((goal) => goal?.account_id).filter(Boolean),
    [allGoals]
  );
  const { data: goalBalances = {} } = useMFAccountBalances(user, goalAccountIds);
  const { data: categories = [] } = useMFCategories(user);
  const { data: groups = [] } = useMFGroups(user);

  // Escopo de moeda por tela: 'all' = todas (totais separados por moeda).
  const [currency, setCurrency] = useState('all');
  // Ordenação das contas no Resumo, a critério do usuário (persistida).
  // Padrão = manual (ordem do banco, reordenável com ↑/↓); 'name' gravado
  // em versões antigas virava "Nome (A–Z)" de fato — antes só rotulava.
  const [accountsSort, setAccountsSort] = useState(
    () => localStorage.getItem('mf_accounts_sort') || 'manual'
  );
  const [sortOpen, setSortOpen] = useState(false);
  // Modo reordenar (setas ↑/↓ nas linhas): só no critério "Manual" e
  // enquanto o botão "Reordenar" estiver ligado — mesmos padrão dos
  // grupos e da tela Contas; escolher outro critério desliga.
  const [accountsReordering, setAccountsReordering] = useState(false);
  const changeAccountsSort = (value) => {
    setAccountsSort(value);
    setAccountsReordering(false);
    localStorage.setItem('mf_accounts_sort', value);
    setSortOpen(false);
  };
  // Estreito (tablet retrato/mobile): cabeçalho compacto sem gráficos.
  const isNarrow = useMFNarrowScreen();

  // Painel personalizável (Fase 9): widgets + contas visíveis
  const [widgetPref, setWidgetPref] = useState(loadWidgetPref);
  const [customizing, setCustomizing] = useState(false);
  // Menu de três pontos do cabeçalho: moedas + personalizar (padrão do app
  // de referência; no estreito vira bottom-sheet, como o sino).
  const [menuOpen, setMenuOpen] = useState(false);
  // Menu em 2 níveis: raiz (Selecionar moeda / Personalizar) → lista de moedas.
  const [menuView, setMenuView] = useState('root');
  const closeMenu = () => {
    setMenuOpen(false);
    setMenuView('root');
  };
  const menuItemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    width: '100%',
    padding: '0.5rem 0.55rem',
    borderRadius: 10,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    fontSize: '0.85rem',
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'left',
  };
  const menuStyle = isNarrow
    ? {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        // Acima do .main-header (z-index 100) — o painel é renderizado via
        // portal no body e precisa cobrir o cabeçalho fixo do app.
        zIndex: 1100,
        maxHeight: '60vh',
        overflowY: 'auto',
        background: 'var(--glass-bg, #1e293b)',
        border: '1px solid var(--glass-border)',
        borderRadius: '16px 16px 0 0',
        padding: '0.9rem 1rem calc(1rem + env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
        boxShadow: '0 -12px 32px rgba(0, 0, 0, 0.5)',
      }
    : {
        position: 'absolute',
        right: 0,
        top: 'calc(100% + 0.4rem)',
        zIndex: 60,
        width: 250,
        background: 'var(--glass-bg, #1e293b)',
        border: '1px solid var(--glass-border)',
        borderRadius: 14,
        padding: '0.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
      };
  const [acctSearch, setAcctSearch] = useState('');
  const updateWidgetPref = (next) => {
    setWidgetPref(next);
    saveWidgetPref(next);
  };
  const orderedWidgets = visibleWidgets(widgetPref);
  const widgetLabel = (id) => t(`minhasfinancas.dash_widget_${id}`);

  // Contas ocultas pelo usuário no "Personalizar painel": filtro VISUAL
  // que afeta só a lista de contas na tela do Resumo — KPIs e gráficos
  // somam todas as contas ativas (ocultas não mudam os totais).
  const hiddenAccountSet = useMemo(
    () => new Set(widgetPref.hiddenAccounts),
    [widgetPref.hiddenAccounts]
  );

  const rows = useMemo(() => data?.rows ?? [], [data]);
  // Próxima fatura por cartão (Fase B): só contas de cartão ativas.
  const cardAccounts = useMemo(
    () => rows.filter((row) => row.account_type === 'CARTAO' && !row.archived_at),
    [rows]
  );
  // Mensal como o resto do Resumo: navegar o mês troca os valores das
  // faturas (mesma convenção da tela de Cartões, via monthRefISO).
  const cardUpcoming = useMFCardUpcoming(user, cardAccounts, monthKey);
  // Feed de recentes (Fase C): 10 últimos lançamentos de todas as contas,
  // independente do mês navegado.
  const { data: recentTxs = [] } = useMFRecentTransactions(user, 10);
  const accountsById = useMemo(
    () => Object.fromEntries(rows.map((row) => [row.id, row])),
    [rows]
  );
  const currencyOptions = useMemo(() => [...new Set(rows.map((row) => row.currency))], [rows]);
  const visibleRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          !row.archived_at &&
          !hiddenAccountSet.has(row.id) &&
          (currency === 'all' || row.currency === currency)
      ),
    [rows, currency, hiddenAccountSet]
  );

  // Contas ativas: não arquivadas e da moeda selecionada — base dos KPIs
  // (todas entram, inclusive as ocultas na tela), dos cards de grupos e do
  // drill. Arquivadas e "Ignorar nos totais" ficam de fora das somas.
  const activeRows = useMemo(
    () =>
      rows.filter(
        (row) => !row.archived_at && (currency === 'all' || row.currency === currency)
      ),
    [rows, currency]
  );

  // Drill-down: clicar numa conta abre o detalhe (padrão da tela Contas).
  const [selectedId, setSelectedId] = useState(null);
  const lastSelectedRef = useRef(null);
  const foundSelected = selectedId ? rows.find((row) => row.id === selectedId) : null;
  if (foundSelected) lastSelectedRef.current = foundSelected;
  const selectedRow = selectedId ? foundSelected || lastSelectedRef.current : null;

  // Drill-down de grupos: caminho clicado no widget "Grupos de contas"
  // (ex.: [Nubank, Caixinhas]) + modal de criação de grupo.
  const [groupPath, setGroupPath] = useState([]);
  // Modal de grupo: `null` = fechado; `{ parentId }` = aberto (o "+"
  // do widget cria uma raiz; o drill cria subgrupo do grupo atual).
  const [groupModal, setGroupModal] = useState(null);
  // Reordenar grupos (raízes) pelos botões ↑/↓ nos cards.
  const [groupsReordering, setGroupsReordering] = useState(false);
  const reorderGroups = useMFReorder('mf_account_groups');
  // Reordenação manual das contas no Resumo (chip Manual + botão
  // Reordenar): ↑/↓ trocam o sort_order com o vizinho — otimista (a UI
  // move na hora, sem esperar o refetch da RPC) e a mesma ordem vale na
  // tela Contas (tudo ordena por sort_order).
  const reorderAccounts = useMFReorder('mf_accounts');
  // Modal de nova conta com o grupo do drill já pré-selecionado
  const [accountModalGroup, setAccountModalGroup] = useState(null);
  // Modal de EDIÇÃO de conta a partir do detalhe (drill ou widget)
  const [accountModalRow, setAccountModalRow] = useState(null);
  // Detalhe do pendente aberto pelo card "Pendentes" (com Efetivar)
  const [pendingTx, setPendingTx] = useState(null);

  /** Reordena grupos-raiz: sobe/desce reescrevendo o sort_order dos
   * irmãos (vale na Contas também — mesma ordenação). */
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

  /** Ids de um grupo + descendentes (totais do subgrupo). */
  const subtreeIds = (rootId) => {
    const ids = new Set([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      groups.forEach((group) => {
        if (group.parent_id && ids.has(group.parent_id) && !ids.has(group.id)) {
          ids.add(group.id);
          grew = true;
        }
      });
    }
    return ids;
  };

  // Contas oferecidas no seletor "Contas visíveis" (sem arquivadas).
  const pickerAccounts = useMemo(() => rows.filter((row) => !row.archived_at), [rows]);
  const pickerQuery = acctSearch.trim().toLowerCase();
  const filteredPickerAccounts = pickerQuery
    ? pickerAccounts.filter((row) => row.name.toLowerCase().includes(pickerQuery))
    : pickerAccounts;

  // Valores: somente somamos moedas iguais; moeda mista aparece agrupada.
  // Saldo total = TODAS as contas ativas, menos "Ignorar nos totais".
  const countedRows = useMemo(() => countableRows(activeRows), [activeRows]);
  const kpis = {
    saldo: groupTotalsByCurrency(countedRows, 'saldo'),
    recebido: groupTotalsByCurrency(countedRows, 'receitas'),
    gasto: groupTotalsByCurrency(countedRows, 'despesas'),
    previsto: groupTotalsByCurrency(countedRows, 'previsto'),
    // "Inicial" = fechamento do mês anterior (saldoPrev, da RPC
    // mf_month_summary), não a soma dos initial_balance — o marcador de
    // configuração não acompanha o movimento já ocorrido.
    initial: groupTotalsByCurrency(countedRows, 'saldoPrev'),
  };
  // Desdobramento do "Total gasto": pagamentos de fatura (DESPESA com
  // invoice_close em conta que não é cartão — régua do campo
  // despesasFatura da RPC mf_month_summary, que inclui PENDENTE) vs o
  // resto do mês (compras e débitos). Sem pagamento de fatura no mês:
  // sem linhas — o card fica como antes.
  const faturaPagamentosRaw = groupTotalsByCurrency(countedRows, 'despesasFatura');
  const showSpentSplit = Object.values(faturaPagamentosRaw).some(
    (value) => Math.abs(value) > 1e-9
  );
  // Só moedas com valor de verdade nas linhas (sem "US$ 0,00" de ruído).
  const keepNonZero = (totals) =>
    Object.fromEntries(
      Object.entries(totals).filter(([, value]) => Math.abs(value) > 1e-9)
    );
  const faturaPagamentos = keepNonZero(faturaPagamentosRaw);
  const gastoMes = keepNonZero(
    Object.fromEntries(
      Object.entries(kpis.gasto).map(([code, value]) => [
        code,
        Math.max(0, value - (faturaPagamentosRaw[code] || 0)),
      ])
    )
  );
  const singleCurrency = new Set(activeRows.map((row) => row.currency)).size <= 1;
  const nativeMoney = (value, rowCurrency) =>
    showValues ? formatMoney(value, rowCurrency) : '•••';

  // — Cards de Orçamento e Objetivos (Fase 5) —
  const budgetAccountsById = useMemo(
    () => Object.fromEntries((data?.accounts ?? []).map((acc) => [acc.id, acc])),
    [data]
  );
  const categoriesById = useMemo(
    () => Object.fromEntries(categories.map((cat) => [cat.id, cat])),
    [categories]
  );

  // — Gráficos do Resumo (KPIs + pizza por categoria + barras mensais) —
  const flowMonths = useMemo(() => {
    const keys = [];
    for (let i = 5; i >= 0; i -= 1) keys.push(shiftMonth(monthKey, -i));
    return keys;
  }, [monthKey]);

  const chartData = useMemo(() => {
    // Gráficos seguem o mesmo universo dos KPIs: todas as contas ativas
    // (inclusive as ocultas na tela) — arquivadas e "Ignorar nos totais" fora.
    const countableIds = new Set(countableRows(activeRows).map((row) => row.id));
    const txs = (data?.chartTxs ?? []).filter(
      (tx) => countableIds.has(tx.a) && (currency === 'all' || tx.c === currency)
    );
    const currencies = [...new Set(txs.map((tx) => tx.c))].sort();
    return currencies.map((cur) => {
      const curTxs = txs.filter((tx) => tx.c === cur);
      // Pizza: despesas realizadas do mês por categoria (top 7 + Outros).
      const pieFor = (type) => {
        const byCat = {};
        curTxs.forEach((tx) => {
          if (tx.t !== type || tx.m !== monthKey) return;
          const id = tx.cat || 'none';
          byCat[id] = (byCat[id] || 0) + tx.v;
        });
        const sorted = Object.entries(byCat)
          .map(([id, value]) => ({
            id,
            name:
              id === 'none' || !categoriesById[id]
                ? t('minhasfinancas.chart_uncategorized')
                : categoriesById[id].name,
            value,
          }))
          .sort((a, b) => b.value - a.value);
        return sorted.length > 8
          ? [
              ...sorted.slice(0, 7),
              {
                id: 'other',
                name: t('common.other'),
                value: sorted.slice(7).reduce((sum, item) => sum + item.value, 0),
              },
            ]
          : sorted;
      };
      const pie = pieFor('DESPESA');
      const pieIncome = pieFor('RECEITA');
      // Barras por tipo de conta: despesas realizadas do mês (top 6 + Outros).
      const accountTypeById = Object.fromEntries(activeRows.map((row) => [row.id, row]));
      const byType = {};
      curTxs.forEach((tx) => {
        if (tx.t !== 'DESPESA' || tx.m !== monthKey) return;
        const key = accountTypeById[tx.a]?.account_type || 'OUTRO';
        byType[key] = (byType[key] || 0) + tx.v;
      });
      const typeSorted = Object.entries(byType)
        .map(([type, value]) => ({ type, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6)
        .map(({ type, value }) => ({
          // rótulo = ícone do tipo + nome (builtin traduzido, custom cru)
          label: `${MF_ACCOUNT_TYPE_ICONS[type] ?? '💰'} ${
            MF_BUILTIN_ACCOUNT_TYPES.includes(type)
              ? t(`minhasfinancas.acct_type_${type.toLowerCase()}`)
              : type
          }`,
          value,
        }));
      // Barras: receitas x despesas realizadas nos últimos 6 meses.
      const flow = flowMonths.map((mk) => {
        let income = 0;
        let expense = 0;
        curTxs.forEach((tx) => {
          if (tx.m !== mk) return;
          if (tx.t === 'RECEITA') income += tx.v;
          else expense += tx.v;
        });
        return {
          key: mk,
          label: shortMonthLabel(mk, i18n.language),
          receitas: income,
          despesas: expense,
        };
      });
      return { currency: cur, pie, pieIncome, flow, byType: typeSorted };
    });
  }, [data, activeRows, currency, monthKey, flowMonths, categoriesById, t, i18n.language]);
  const budgetItems = useMemo(() => {
    const { start, end } = monthBounds(monthKey);
    const txs = budgetWindow?.transactions ?? [];
    const links = budgetWindow?.tagIdsByTx ?? {};
    return budgets
      .filter(
        (b) =>
          typeof b.period_start === 'string' &&
          typeof b.period_end === 'string' &&
          b.period_start <= end &&
          b.period_end >= start
      )
      .map((b) => {
        const spent = budgetSpent({
          budget: b,
          transactions: txs,
          tagIdsByTx: links,
          accountsById: budgetAccountsById,
          categoriesById,
          currency,
        });
        const limit = budgetLimit({
          budget: b,
          transactions: txs,
          accountsById: budgetAccountsById,
          currency,
        });
        return { budget: b, spent, limit, breached: limit > 0 && spent > limit };
      });
  }, [budgets, budgetWindow, budgetAccountsById, categoriesById, monthKey, currency]);
  const budgetBreaches = budgetItems.filter((item) => item.breached).length;

  const activeGoals = useMemo(
    () =>
      allGoals.filter(
        (goal) =>
          goal &&
          goal.status === 'ACTIVE' &&
          typeof goal.name === 'string' &&
          typeof goal.target_amount === 'number'
      ),
    [allGoals]
  );

  const cards = [
    {
      key: 'kpi_balance',
      icon: Wallet,
      valueTotals: kpis.saldo,
      subLabel: t('minhasfinancas.initial'),
      subTotals: kpis.initial,
      color: 'var(--primary)',
    },
    {
      key: 'kpi_received',
      icon: TrendingUp,
      valueTotals: kpis.recebido,
      color: '#10b981',
      // Variação só quando o escopo tem uma única moeda (não cruzamos moedas).
      variation: singleCurrency
        ? variation(sumField(countedRows, 'receitas'), sumField(countedRows, 'receitasPrev'))
        : undefined,
      favorableWhenUp: true,
    },
    {
      key: 'kpi_spent',
      icon: TrendingDown,
      valueTotals: kpis.gasto,
      color: '#ef4444',
      // Desdobramento: gastos do mês + pagamentos de fatura somam o
      // total (Opção B do mockup). Some quando não há pagamento.
      breakdown: showSpentSplit
        ? [
            {
              key: 'gastos',
              color: 'var(--danger)',
              label: t('minhasfinancas.kpi_spent_month'),
              totals: gastoMes,
            },
            {
              key: 'faturas',
              color: 'var(--pending)',
              label: t('minhasfinancas.kpi_spent_faturas'),
              totals: faturaPagamentos,
            },
          ]
        : undefined,
      variation: singleCurrency
        ? variation(sumField(countedRows, 'despesas'), sumField(countedRows, 'despesasPrev'))
        : undefined,
      favorableWhenUp: false,
    },
    {
      key: 'kpi_forecast',
      icon: CalendarClock,
      valueTotals: kpis.previsto,
      subLabel: t('minhasfinancas.accounts_count', { count: countedRows.length }),
      color: '#06b6d4',
    },
  ];

  /** Bloco JSX de cada widget do painel. */
  const renderWidget = (id) => {
    if (id === 'kpis') {
      return (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className="glass-card" data-testid={`mf-kpi-${card.key}`} style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: `color-mix(in srgb, ${card.color} 15%, transparent)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: card.color,
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
                    {t(`minhasfinancas.${card.key}`)}
                  </span>
                </div>
                <div data-testid={`mf-kpi-value-${card.key}`} style={{ margin: 0 }}>
                  {isLoading ? '…' : isError ? '—' : (
                    <MFTotalsHero
                      totals={card.valueTotals}
                      showValues={showValues}
                    />
                  )}
                </div>
                {card.breakdown?.length > 0 && (
                  <div
                    data-testid={`mf-kpi-breakdown-${card.key}`}
                    style={{
                      marginTop: '0.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.3rem',
                    }}
                  >
                    {card.breakdown.map((line) => (
                      <div
                        key={line.key}
                        data-testid={`mf-kpi-breakdown-${card.key}-${line.key}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '1rem',
                        }}
                      >
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.78rem',
                            color: 'var(--text-muted)',
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: line.color,
                              flexShrink: 0,
                            }}
                          />
                          {line.label}
                        </span>
                        <span
                          data-testid={`mf-kpi-breakdown-${card.key}-${line.key}-value`}
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            color: 'var(--text-main)',
                            fontVariantNumeric: 'tabular-nums',
                            textAlign: 'right',
                          }}
                        >
                          <MFTotalsStack
                            totals={line.totals}
                            showValues={showValues}
                            fontSize="inherit"
                            align="right"
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {(card.subLabel || card.subTotals) && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {showValues ? (
                        card.subTotals ? (
                          <>
                            {card.subLabel}
                            {': '}
                            <MFTotalsStack
                              totals={card.subTotals}
                              showValues={showValues}
                              fontSize="inherit"
                            />
                          </>
                        ) : (
                          card.subLabel
                        )
                      ) : (
                        '•••'
                      )}
                    </span>
                  )}
                  {!isLoading && !isError && card.variation !== undefined && (
                    <VariationChip
                      value={card.variation}
                      favorable={
                        card.favorableWhenUp ? card.variation >= 0 : card.variation <= 0
                      }
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (id === 'groups') {
      // Grupos raiz com "Exibir na tela de Resumo" → card com total
      // (quando soma) e drill-down ao clicar.
      const roots = groups.filter((group) => !group.parent_id && group.show_in_summary);
      return (
        <div
          className="glass-card"
          data-testid="mf-groups-section"
          style={{ padding: '1.25rem 1.5rem' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: '0.95rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <FolderTree size={16} />
              {t('minhasfinancas.dash_widget_groups')}
            </h3>
            <button
              type="button"
              className="btn-cancel"
              data-testid="mf-groups-new"
              onClick={() => setGroupModal({ parentId: null })}
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <Plus size={14} />
              {t('minhasfinancas.group_new_short')}
            </button>
            <button
              type="button"
              className="btn-cancel"
              data-testid="mf-groups-reorder-toggle"
              aria-pressed={groupsReordering}
              onClick={() => setGroupsReordering((prev) => !prev)}
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.8rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: groupsReordering
                  ? 'color-mix(in srgb, var(--primary) 16%, transparent)'
                  : undefined,
                color: groupsReordering ? 'var(--primary)' : undefined,
                borderColor: groupsReordering ? 'var(--primary)' : undefined,
              }}
            >
              <ArrowUpDown size={14} />
              {t('minhasfinancas.accounts_reorder')}
            </button>
          </div>

          {roots.length === 0 ? (
            <p
              data-testid="mf-groups-empty"
              style={{ margin: '0.85rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}
            >
              {t('minhasfinancas.groups_empty')}
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
                gap: '0.9rem',
                marginTop: '0.9rem',
              }}
            >
              {roots.map((group) => {
                const ids = subtreeIds(group.id);
                const subRows = activeRows.filter((row) => ids.has(row.group_id));
                const descendantCount = groups.filter(
                  (item) => item.id !== group.id && ids.has(item.id) && item.show_in_summary
                ).length;
                const subtitle =
                  t('minhasfinancas.accounts_count', { count: subRows.length }) +
                  (descendantCount > 0
                    ? ` · ${t('minhasfinancas.groups_count', { count: descendantCount })}`
                    : '');
                const card = (
                  <MFGroupCard
                    key={group.id}
                    icon={group.icon}
                    name={group.name}
                    subtitle={subtitle}
                    total={
                      group.sum_totals ? (
                        <MFTotalsStack
                          totals={groupTotalsByCurrency(subRows, 'saldo')}
                          showValues={showValues}
                          align="right"
                          fontSize="0.88rem"
                          lineHeight={1.4}
                        />
                      ) : null
                    }
                    trailing={
                      group.sum_totals ? null : (
                        <ArrowRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      )
                    }
                    onOpen={() => setGroupPath([group.id])}
                    testId={`mf-group-card-${group.id}`}
                  />
                );
                if (!groupsReordering) return card;
                const position = roots.findIndex((item) => item.id === group.id);
                const isFirst = position <= 0;
                const isLast = position < 0 || position >= roots.length - 1;
                const moveBtn = (dir, testId, label, Icon, disabled) => (
                  <button
                    key={testId}
                    type="button"
                    className="icon-btn"
                    aria-label={label}
                    title={label}
                    data-testid={testId}
                    disabled={disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      moveGroup(group.id, dir);
                    }}
                    style={{ padding: '0.3rem', opacity: disabled ? 0.3 : 1 }}
                  >
                    <Icon size={14} />
                  </button>
                );
                return (
                  <div
                    key={group.id}
                    style={{ display: 'flex', gap: '0.4rem', alignItems: 'stretch' }}
                  >
                    <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>{card}</div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                        justifyContent: 'center',
                      }}
                    >
                      {moveBtn(-1, `mf-group-move-up-${group.id}`, t('minhasfinancas.move_up'), ChevronUp, isFirst)}
                      {moveBtn(1, `mf-group-move-down-${group.id}`, t('minhasfinancas.move_down'), ChevronDown, isLast)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    if (id === 'charts') {
      // Privacidade: valores ocultos → gráficos também ficam ocultos.
      if (!showValues) {
        return (
          <div
            className="glass-card"
            data-testid="mf-charts-hidden"
            style={{ padding: '2.5rem 2rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 800 }}
          >
            •••
          </div>
        );
      }
      const shownCharts = visibleCharts(widgetPref);
      if (chartData.length === 0 || shownCharts.length === 0) {
        return (
          <div
            className="glass-card"
            data-testid="mf-chart-empty"
            style={{ padding: '2.5rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}
          >
            {t('minhasfinancas.chart_no_data')}
          </div>
        );
      }
      return (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: '1.5rem',
          }}
        >
          {chartData.map(({ currency: cur, pie, pieIncome, flow, byType }) => (
            <React.Fragment key={cur}>
              {shownCharts.includes('chart_categories') && (
                <div
                  className="glass-card"
                  data-testid={`mf-chart-categories-${cur}`}
                  style={{ padding: '1.25rem 1.5rem' }}
                >
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 800 }}>
                    {t('minhasfinancas.chart_categories')}
                    {chartData.length > 1 ? ` (${cur})` : ''}
                  </h3>
                  {pie.length === 0 ? (
                    <p
                      data-testid={`mf-chart-pie-empty-${cur}`}
                      style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}
                    >
                      {t('minhasfinancas.chart_no_data')}
                    </p>
                  ) : (
                    <div style={{ height: 230 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pie}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={52}
                            outerRadius={78}
                            paddingAngle={2}
                            isAnimationActive={false}
                          >
                            {pie.map((entry, index) => (
                              <Cell key={entry.id} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value) => formatMoney(value, cur)}
                            contentStyle={tooltipStyle}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
              {shownCharts.includes('chart_income') && (
                <div
                  className="glass-card"
                  data-testid={`mf-chart-income-${cur}`}
                  style={{ padding: '1.25rem 1.5rem' }}
                >
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 800 }}>
                    {t('minhasfinancas.chart_income')}
                    {chartData.length > 1 ? ` (${cur})` : ''}
                  </h3>
                  {pieIncome.length === 0 ? (
                    <p
                      data-testid={`mf-chart-income-empty-${cur}`}
                      style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}
                    >
                      {t('minhasfinancas.chart_no_data')}
                    </p>
                  ) : (
                    <div style={{ height: 230 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieIncome}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={52}
                            outerRadius={78}
                            paddingAngle={2}
                            isAnimationActive={false}
                          >
                            {pieIncome.map((entry, index) => (
                              <Cell key={entry.id} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value) => formatMoney(value, cur)}
                            contentStyle={tooltipStyle}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
              {shownCharts.includes('chart_flow') && (
                <div
                  className="glass-card"
                  data-testid={`mf-chart-flow-${cur}`}
                  style={{ padding: '1.25rem 1.5rem' }}
                >
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 800 }}>
                    {t('minhasfinancas.chart_flow')}
                    {chartData.length > 1 ? ` (${cur})` : ''}
                  </h3>
                  <div style={{ height: 230 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={flow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis hide />
                        <Tooltip
                          formatter={(value) => formatMoney(value, cur)}
                          contentStyle={tooltipStyle}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar
                          dataKey="receitas"
                          name={t('minhasfinancas.accounts_table_income')}
                          fill="#10b981"
                          radius={[3, 3, 0, 0]}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="despesas"
                          name={t('minhasfinancas.accounts_table_expense')}
                          fill="#ef4444"
                          radius={[3, 3, 0, 0]}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {shownCharts.includes('chart_bytype') && (
                <div
                  className="glass-card"
                  data-testid={`mf-chart-bytype-${cur}`}
                  style={{ padding: '1.25rem 1.5rem' }}
                >
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 800 }}>
                    {t('minhasfinancas.chart_bytype')}
                    {chartData.length > 1 ? ` (${cur})` : ''}
                  </h3>
                  {byType.length === 0 ? (
                    <p
                      data-testid={`mf-chart-bytype-empty-${cur}`}
                      style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}
                    >
                      {t('minhasfinancas.chart_no_data')}
                    </p>
                  ) : (
                    <div style={{ height: 230 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={byType} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis hide />
                          <Tooltip
                            formatter={(value) => formatMoney(value, cur)}
                            contentStyle={tooltipStyle}
                          />
                          <Bar
                            dataKey="value"
                            name={t('minhasfinancas.accounts_table_expense')}
                            fill="#6366f1"
                            radius={[3, 3, 0, 0]}
                            isAnimationActive={false}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      );
    }

    if (id === 'accounts') {
      // Cartões (account_type='CARTAO') têm seção própria — nunca se misturam
      // com as contas. Só esta lista segue o filtro visual; KPIs e gráficos
      // somam todas as contas ativas.
      // Ordenação a critério do usuário (persistida): manual (ordem do
      // banco, reordenável com ↑/↓), nome A–Z ou maior/menor saldo e
      // previsto.
      const sortAccounts = (list) => {
        const byNumber = (field) => (a, b) =>
          (Number(b[field]) || 0) - (Number(a[field]) || 0);
        switch (accountsSort) {
          case 'name':
            return [...list].sort((a, b) =>
              String(a.name ?? '').localeCompare(String(b.name ?? ''), i18n.language)
            );
          case 'balance_desc':
            return [...list].sort(byNumber('saldo'));
          case 'balance_asc':
            return [...list].sort((a, b) => (Number(a.saldo) || 0) - (Number(b.saldo) || 0));
          case 'forecast_desc':
            return [...list].sort(byNumber('previsto'));
          case 'forecast_asc':
            return [...list].sort((a, b) => (Number(a.previsto) || 0) - (Number(b.previsto) || 0));
          case 'manual':
          default:
            return list;
        }
      };
      const accountRows = sortAccounts(
        visibleRows.filter((row) => row.account_type !== 'CARTAO')
      );
      const cardRows = visibleRows.filter((row) => row.account_type === 'CARTAO');
      // Modo reordenar (toggle "Reordenar" + critério Manual): ↑/↓ trocam
      // o sort_order (índice na lista COMPLETA de contas — nunca cartões)
      // com o VIZINHO visível. A RPC mf_month_summary ordena por
      // sort_order e o update invalida tudo — a mesma ordem aparece na
      // tela Contas (contas e cartões dividem o espaço de sort_order,
      // mas cada tipo ordena o seu).
      const moveAccount = async (rowId, direction) => {
        const visibleIndex = accountRows.findIndex((row) => row.id === rowId);
        const neighbor = accountRows[visibleIndex + direction];
        if (visibleIndex < 0 || !neighbor) return;
        const allAccounts = rows.filter((row) => row.account_type !== 'CARTAO');
        const fromIndex = allAccounts.findIndex((row) => row.id === rowId);
        const toIndex = allAccounts.findIndex((row) => row.id === neighbor.id);
        if (fromIndex < 0 || toIndex < 0) return;
        try {
          await reorderAccounts.mutateAsync([
            { id: rowId, sort_order: toIndex },
            { id: neighbor.id, sort_order: fromIndex },
          ]);
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      };
      // Próxima fatura por cartão (Fase B) — lookup por id.
      const upcomingById = Object.fromEntries(
        (cardUpcoming?.items ?? []).map((item) => [item.card.id, item])
      );
      const sections = [
        {
          title: 'accounts_title',
          rows: accountRows,
          testid: 'mf-resumo-account-row',
          sectionTestId: 'mf-resumo-accounts-section',
          actionTestId: 'mf-resumo-all-accounts',
          tab: 'minhasfinancas-accounts',
        },
        {
          title: 'cards_title',
          rows: cardRows,
          testid: 'mf-resumo-card-row',
          sectionTestId: 'mf-resumo-cards-section',
          actionTestId: 'mf-resumo-all-cards',
          tab: 'minhasfinancas-cards',
        },
      ].filter((section) => section.rows.length > 0);

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Sem contas ainda */}
          {!isLoading && !isError && rows.length === 0 && (
            <div className="glass-card" data-testid="mf-resumo-empty" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', margin: '0 0 1.25rem' }}>
                {t('minhasfinancas.empty_overview')}
              </p>
              <button
                type="button"
                className="btn-primary"
                data-testid="mf-resumo-create-account"
                onClick={() => goTo('minhasfinancas-accounts')}
                style={{ display: 'inline-flex' }}
              >
                <Plus size={16} />
                {t('minhasfinancas.create_first_account')}
              </button>
            </div>
          )}

          {/* Contas existem, mas nenhuma passa pelos filtros do painel */}
          {!isLoading && !isError && rows.length > 0 && visibleRows.length === 0 && (
            <div className="glass-card" data-testid="mf-resumo-no-visible" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', margin: '0 0 1.25rem' }}>
                {t('minhasfinancas.dash_accts_none_msg')}
              </p>
              {hiddenAccountSet.size > 0 && (
                <button
                  type="button"
                  className="btn-primary"
                  data-testid="mf-resumo-open-customize"
                  onClick={() => setCustomizing(true)}
                  style={{ display: 'inline-flex' }}
                >
                  <SlidersHorizontal size={16} />
                  {t('minhasfinancas.dash_customize')}
                </button>
              )}
            </div>
          )}

          {/* Contas e cartões em seções separadas (cartão nunca mistura com conta) */}
          {!isLoading && !isError && sections.length > 0 && sections.map((section) => (
            <div
              key={section.title}
              className="glass-card"
              data-testid={section.sectionTestId}
              style={{ padding: '1.5rem' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                  {t(`minhasfinancas.${section.title}`)}
                </h3>
                <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  {/* Ordenação das contas a critério do usuário (só na seção de contas) */}
                  {section.title === 'accounts_title' && (
                    <button
                      type="button"
                      className="icon-btn"
                      data-testid="mf-resumo-accounts-sort"
                      aria-label={t('minhasfinancas.accounts_sort_label')}
                      title={t('minhasfinancas.accounts_sort_label')}
                      aria-expanded={sortOpen}
                      onClick={() => setSortOpen((v) => !v)}
                    >
                      <ArrowUpDown size={15} />
                    </button>
                  )}
                  {/* Modo reordenar: setas ↑/↓ nas linhas de conta (só no
                      critério Manual — escolher outro critério desliga). */}
                  {section.title === 'accounts_title' && accountsSort === 'manual' && (
                    <button
                      type="button"
                      className="btn-cancel"
                      data-testid="mf-resumo-accounts-reorder-toggle"
                      aria-pressed={accountsReordering}
                      onClick={() => setAccountsReordering((prev) => !prev)}
                      style={{
                        padding: '0.4rem 0.75rem',
                        fontSize: '0.8rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        background: accountsReordering
                          ? 'color-mix(in srgb, var(--primary) 16%, transparent)'
                          : undefined,
                        color: accountsReordering ? 'var(--primary)' : undefined,
                        borderColor: accountsReordering ? 'var(--primary)' : undefined,
                      }}
                    >
                      <ArrowUpDown size={14} />
                      {t('minhasfinancas.accounts_reorder')}
                    </button>
                  )}
                  {/* Atalho para escolher quais contas aparecem no Resumo */}
                  <button
                    type="button"
                    className="icon-btn"
                    data-testid={`mf-resumo-pick-accounts-${section.title}`}
                    aria-label={t('minhasfinancas.dash_accts_title')}
                    title={t('minhasfinancas.dash_accts_title')}
                    onClick={() => setCustomizing(true)}
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    data-testid={section.actionTestId}
                    onClick={() => goTo(section.tab)}
                    style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem' }}
                  >
                    {t('minhasfinancas.see_all')}
                    <ArrowRight size={14} />
                  </button>
                </span>
              </div>

              {/* Ordenação das contas (crítica do usuário): chips que aplicam
                  na hora e somem ao escolher — sem dropdown flutuante. */}
              {section.title === 'accounts_title' && sortOpen && (
                <div
                  data-testid="mf-resumo-accounts-sort-menu"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                    marginBottom: '0.9rem',
                  }}
                >
                  {ACCOUNT_SORT_OPTIONS.map((opt) => {
                    const active = accountsSort === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        data-testid={`mf-resumo-accounts-sort-${opt.value}`}
                        aria-pressed={active}
                        onClick={() => changeAccountsSort(opt.value)}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: 999,
                          fontSize: '0.78rem',
                          fontWeight: active ? 800 : 600,
                          cursor: 'pointer',
                          color: active ? '#fff' : 'inherit',
                          background: active ? 'var(--primary)' : 'var(--input-bg)',
                          border: `1px solid ${active ? 'var(--primary)' : 'var(--glass-border)'}`,
                        }}
                      >
                        {t(opt.labelKey)}
                      </button>
                    );
                  })}
                </div>
              )}

              {isNarrow ? (
                /* Estreito (mockup): linhas com ícone + saldo, sem tabela
                   com rolagem lateral. */
                <div data-testid={`${section.sectionTestId}-list`} style={{ display: 'flex', flexDirection: 'column' }}>
                  {section.rows.map((row) => {
                    const isCard = section.title === 'cards_title';
                    const cardItem = isCard ? upcomingById[row.id] : null;
                    const current = cardItem?.current ?? null;
                    const nextInv = cardItem?.next ?? null;
                    const cur = cardItem?.card?.currency || row.currency || 'BRL';
                    const invoiceState = isCard ? cardInvoiceState(current) : null;

                    // Cartão (mock de referência): bandeira ao lado do nome,
                    // ícone de status ao lado do valor e rótulos de fechamento,
                    // vencimento e próxima fatura.
                    if (isCard) {
                      return (
                        <button
                          key={row.id}
                          type="button"
                          data-testid={section.testid}
                          onClick={() => setSelectedId(row.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.75rem',
                            padding: '0.75rem 0.25rem',
                            background: 'none',
                            border: 'none',
                            borderBottom: '1px solid var(--glass-border)',
                            color: 'inherit',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                          }}
                        >
                          <MFAccountIcon
                            account={row}
                            size={38}
                            data-testid={`mf-resumo-icon-${row.id}`}
                            style={{ marginTop: 2 }}
                          />
                          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            {/* nome + bandeira .......... valor + status */}
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', width: '100%' }}>
                              <span
                                data-testid={`mf-resumo-open-account-${row.id}`}
                                style={{
                                  fontWeight: 800,
                                  fontSize: '0.92rem',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {row.name}
                              </span>
                              {/* bandeira da REDE (Visa/Master/Elo…) */}
                              {Boolean(row.card_brand) && (
                                <span
                                  data-testid={`mf-resumo-card-brand-${row.id}`}
                                  style={{ display: 'inline-flex', flexShrink: 0 }}
                                >
                                  <MFCardBrandIcon
                                    brand={row.card_brand}
                                    size={16}
                                    title={t(`minhasfinancas.card_brand_${row.card_brand}`)}
                                  />
                                </span>
                              )}
                              <span
                                style={{
                                  marginLeft: 'auto',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0,
                                }}
                              >
                                <span
                                  data-testid={`mf-resumo-card-total-${row.id}`}
                                  style={{ fontWeight: 800, fontSize: '0.95rem' }}
                                >
                                  {nativeMoney(Number(current?.total) || 0, cur)}
                                </span>
                                {invoiceState && (
                                  <span
                                    data-testid={`mf-resumo-card-status-${row.id}`}
                                    title={t(`minhasfinancas.${invoiceState.labelKey}`)}
                                    aria-label={t(`minhasfinancas.${invoiceState.labelKey}`)}
                                    style={{ color: invoiceState.color, display: 'inline-flex' }}
                                  >
                                    {invoiceState.icon === 'paid' && <CheckCircle2 size={15} />}
                                    {invoiceState.icon === 'closed' && <Lock size={15} />}
                                    {invoiceState.icon === 'open' && <LockOpen size={15} />}
                                  </span>
                                )}
                              </span>
                            </span>
                            {/* Fechamento / Vencimento / Próxima fatura */}
                            {[
                              current?.closeISO && {
                                k: 'close',
                                label: t('minhasfinancas.card_closing'),
                                value: dayMonthLabel(current.closeISO, i18n.language),
                              },
                              current?.dueISO && {
                                k: 'due',
                                label: t('minhasfinancas.card_due_label'),
                                value: dayMonthLabel(current.dueISO, i18n.language),
                              },
                              nextInv && {
                                k: 'next',
                                label: t('minhasfinancas.card_next_invoice'),
                                value: nativeMoney(Number(nextInv.total) || 0, cur),
                              },
                            ]
                              .filter(Boolean)
                              .map((line) => (
                                <span
                                  key={line.k}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '0.5rem',
                                    fontSize: '0.72rem',
                                  }}
                                >
                                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                                    {line.label}
                                  </span>
                                  <span
                                    data-testid={`mf-resumo-card-${line.k}-${row.id}`}
                                    style={{ fontWeight: 700 }}
                                  >
                                    {line.value}
                                  </span>
                                </span>
                              ))}
                          </span>
                        </button>
                      );
                    }

                    // Conta: ícone + nome, previsão (vermelha quando negativa) + saldo.
                    // Modo reordenar: setas ↑/↓ como IRMÃS do botão da linha (button
                    // dentro de button é inválido) — a linha segue clicável.
                    return (
                      <div
                        key={row.id}
                        style={{ display: 'flex', alignItems: 'center', width: '100%' }}
                      >
                      <button
                        type="button"
                        data-testid={section.testid}
                        onClick={() => setSelectedId(row.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.7rem 0.25rem',
                          background: 'none',
                          border: 'none',
                          borderBottom: '1px solid var(--glass-border)',
                          color: 'inherit',
                          cursor: 'pointer',
                          textAlign: 'left',
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <MFAccountIcon
                          account={row}
                          size={38}
                          data-testid={`mf-resumo-icon-${row.id}`}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span
                            data-testid={`mf-resumo-open-account-${row.id}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontWeight: 800,
                              fontSize: '0.92rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {row.name}
                            </span>
                            <MFIgnoreDots show={row.ignore_in_totals} />
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {t('minhasfinancas.accounts_table_forecast')}:{' '}
                            <span
                              style={
                                Number(row.previsto) < 0
                                  ? { color: '#ef4444', fontWeight: 700 }
                                  : undefined
                              }
                            >
                              {nativeMoney(row.previsto, row.currency)}
                            </span>
                          </span>
                        </span>
                        <span style={{ fontWeight: 800, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                          {nativeMoney(row.saldo, row.currency)}
                        </span>
                      </button>
                      {accountsReordering && (
                        <span
                          style={{
                            display: 'inline-flex',
                            gap: '0.15rem',
                            flexShrink: 0,
                            paddingLeft: '0.35rem',
                          }}
                        >
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={t('minhasfinancas.move_up')}
                            data-testid={`mf-resumo-account-move-up-${row.id}`}
                            onClick={() => moveAccount(row.id, -1)}
                            style={{ padding: '0.3rem' }}
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={t('minhasfinancas.move_down')}
                            data-testid={`mf-resumo-account-move-down-${row.id}`}
                            onClick={() => moveAccount(row.id, 1)}
                            style={{ padding: '0.3rem' }}
                          >
                            <ChevronDown size={16} />
                          </button>
                        </span>
                      )}
                      </div>
                    );
                  })}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem',
                      marginTop: '0.6rem',
                      padding: '0.6rem 0.75rem',
                      background: 'var(--input-bg)',
                      borderRadius: 12,
                      fontWeight: 800,
                      fontSize: '0.9rem',
                    }}
                  >
                    <span style={{ fontSize: '0.8rem' }}>
                      {t('minhasfinancas.total')}
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {section.title === 'cards_title'
                          ? t('minhasfinancas.resumo_open_to_pay')
                          : t('minhasfinancas.accounts_table_forecast')}
                      </span>
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      {section.title === 'cards_title' ? (
                        <>
                          <MFTotalsStack
                            totals={cardUpcoming?.openTotalByCurrency ?? {}}
                            showValues={showValues}
                            align="right"
                            fontSize="inherit"
                            testId="mf-resumo-cards-open-total"
                          />
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            <MFTotalsStack
                              totals={cardUpcoming?.upcomingTotalByCurrency ?? {}}
                              showValues={showValues}
                              align="right"
                              fontSize="inherit"
                              testId="mf-resumo-cards-next-total"
                            />
                          </span>
                        </>
                      ) : (
                        <>
                          <MFTotalsStack
                            totals={groupTotalsByCurrency(section.rows, 'saldo')}
                            showValues={showValues}
                            align="right"
                            fontSize="inherit"
                          />
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            <MFTotalsStack
                              totals={groupTotalsByCurrency(section.rows, 'previsto')}
                              showValues={showValues}
                              align="right"
                              fontSize="inherit"
                            />
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead>
                    <tr>
                      {/* Coluna da conta (ícone + nome) / descrição do cartão */}
                      <th
                        aria-hidden={section.title !== 'cards_title'}
                        style={{
                          padding: '0.6rem 0.75rem',
                          borderBottom: '1px solid var(--glass-border)',
                          textAlign: 'left',
                          fontSize: '0.72rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {section.title === 'cards_title'
                          ? t('minhasfinancas.cards_col_desc')
                          : null}
                      </th>
                      {(section.title === 'cards_title'
                        ? [
                            'card_closing',
                            'card_due_label',
                            'cards_col_invoice',
                            'cards_col_next',
                          ]
                        : [
                            'accounts_table_balance',
                            'accounts_table_income',
                            'accounts_table_expense',
                            'accounts_table_forecast',
                          ]
                      ).map((key) => (
                        <th
                          key={key}
                          style={{
                            padding: '0.6rem 0.75rem',
                            textAlign: 'right',
                            fontSize: '0.72rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: 'var(--text-muted)',
                            borderBottom: '1px solid var(--glass-border)',
                          }}
                        >
                          {t(`minhasfinancas.${key}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row) => {
                      // Cartões: layout do Minhas Finanças — Descrição,
                      // Fechamento, Vencimento, Fatura e Próxima (em vez de
                      // receitas/despesas/saldo/previsão).
                      if (section.title === 'cards_title') {
                        const cardItem = upcomingById[row.id];
                        const current = cardItem?.current ?? null;
                        const nextInv = cardItem?.next ?? null;
                        const cur = cardItem?.card?.currency || row.currency || 'BRL';
                        const invoiceState = cardInvoiceState(current);
                        return (
                          <tr
                            key={row.id}
                            data-testid={section.testid}
                            className="table-row-hover"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedId(row.id)}
                          >
                            {/* Descrição: ícone + nome + bandeira da rede */}
                            <td
                              style={{
                                padding: '0.75rem',
                                borderBottom: '1px solid var(--glass-border)',
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                textAlign: 'left',
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <MFAccountIcon
                                  account={row}
                                  size={20}
                                  data-testid={`mf-resumo-icon-${row.id}`}
                                />
                                <button
                                  type="button"
                                  data-testid={`mf-resumo-open-account-${row.id}`}
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
                                {/* bandeira da REDE (Visa/Master/Elo…) */}
                                {Boolean(row.card_brand) && (
                                  <span
                                    data-testid={`mf-resumo-card-brand-${row.id}`}
                                    style={{ display: 'inline-flex', flexShrink: 0 }}
                                  >
                                    <MFCardBrandIcon
                                      brand={row.card_brand}
                                      size={18}
                                      title={t(`minhasfinancas.card_brand_${row.card_brand}`)}
                                    />
                                  </span>
                                )}
                              </span>
                            </td>
                            {/* Fechamento */}
                            <td
                              style={{
                                padding: '0.75rem',
                                textAlign: 'right',
                                borderBottom: '1px solid var(--glass-border)',
                                color: 'var(--text-muted)',
                                fontSize: '0.9rem',
                              }}
                            >
                              {current?.closeISO && (
                                <span data-testid={`mf-resumo-card-close-${row.id}`}>
                                  {shortDateWeekday(current.closeISO, i18n.language)}
                                </span>
                              )}
                            </td>
                            {/* Vencimento (fatura corrente) */}
                            <td
                              style={{
                                padding: '0.75rem',
                                textAlign: 'right',
                                borderBottom: '1px solid var(--glass-border)',
                                fontSize: '0.9rem',
                              }}
                            >
                              {current?.dueISO && (
                                <span data-testid={`mf-resumo-card-due-${row.id}`}>
                                  {shortDateWeekday(current.dueISO, i18n.language)}
                                </span>
                              )}
                            </td>
                            {/* Fatura (valor da fatura corrente + status) */}
                            <td
                              style={{
                                padding: '0.75rem',
                                textAlign: 'right',
                                borderBottom: '1px solid var(--glass-border)',
                                fontWeight: 800,
                                fontSize: '0.9rem',
                              }}
                            >
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                {invoiceState && (
                                  <span
                                    title={t(`minhasfinancas.${invoiceState.labelKey}`)}
                                    aria-label={t(`minhasfinancas.${invoiceState.labelKey}`)}
                                    style={{ color: invoiceState.color, display: 'inline-flex' }}
                                  >
                                    {invoiceState.icon === 'paid' && <CheckCircle2 size={14} />}
                                    {invoiceState.icon === 'closed' && <Lock size={14} />}
                                    {invoiceState.icon === 'open' && <LockOpen size={14} />}
                                  </span>
                                )}
                                <span data-testid={`mf-resumo-card-total-${row.id}`}>
                                  {nativeMoney(Number(current?.total) || 0, cur)}
                                </span>
                              </span>
                            </td>
                            {/* Próxima fatura (mês seguinte) */}
                            <td
                              style={{
                                padding: '0.75rem',
                                textAlign: 'right',
                                borderBottom: '1px solid var(--glass-border)',
                                fontWeight: 700,
                                color: 'var(--text-muted)',
                                fontSize: '0.9rem',
                              }}
                            >
                              {nextInv && (
                                <span data-testid={`mf-resumo-card-next-${row.id}`}>
                                  {nativeMoney(Number(nextInv.total) || 0, cur)}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      }
                      // Contas: colunas originais (Previsão em vermelho se negativa)
                      return (
                        <tr
                          key={row.id}
                          data-testid={section.testid}
                          className="table-row-hover"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedId(row.id)}
                        >
                          <td
                            style={{
                              padding: '0.75rem',
                              borderBottom: '1px solid var(--glass-border)',
                              fontWeight: 700,
                              fontSize: '0.9rem',
                              textAlign: 'left',
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <MFAccountIcon
                                account={row}
                                size={20}
                                data-testid={`mf-resumo-icon-${row.id}`}
                              />
                              <button
                                type="button"
                                data-testid={`mf-resumo-open-account-${row.id}`}
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
                              <MFIgnoreDots show={row.ignore_in_totals} />
                              {/* Modo reordenar: ↑/↓ trocam a posição com o vizinho */}
                              {accountsReordering && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    gap: '0.15rem',
                                    flexShrink: 0,
                                    marginLeft: '0.25rem',
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    aria-label={t('minhasfinancas.move_up')}
                                    data-testid={`mf-resumo-account-move-up-${row.id}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      moveAccount(row.id, -1);
                                    }}
                                    style={{ padding: '0.25rem' }}
                                  >
                                    <ChevronUp size={15} />
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    aria-label={t('minhasfinancas.move_down')}
                                    data-testid={`mf-resumo-account-move-down-${row.id}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      moveAccount(row.id, 1);
                                    }}
                                    style={{ padding: '0.25rem' }}
                                  >
                                    <ChevronDown size={15} />
                                  </button>
                                </span>
                              )}
                            </span>
                          </td>
                          {/* Saldo em 1ª coluna (pedido) */}
                          <td style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', fontWeight: 800, fontSize: '0.9rem' }}>
                            {nativeMoney(row.saldo, row.currency)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: '#10b981', fontSize: '0.9rem' }}>
                            {nativeMoney(row.receitas, row.currency)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: '#ef4444', fontSize: '0.9rem' }}>
                            {nativeMoney(row.despesas, row.currency)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', fontWeight: 700, fontSize: '0.9rem' }}>
                            <span
                              style={
                                Number(row.previsto) < 0
                                  ? { color: '#ef4444', fontWeight: 800 }
                                  : { color: 'var(--text-muted)' }
                              }
                            >
                              {nativeMoney(row.previsto, row.currency)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td
                        style={{
                          padding: '0.75rem',
                          fontWeight: 800,
                          fontSize: '0.72rem',
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                          textAlign: 'left',
                        }}
                      >
                        {t('minhasfinancas.total')}
                        {section.title === 'cards_title' && (
                          <span style={{ display: 'block', textTransform: 'none', fontWeight: 500 }}>
                            {t('minhasfinancas.resumo_open_to_pay')}
                          </span>
                        )}
                      </td>
                      {section.title === 'cards_title' ? (
                        <>
                          {/* Fechamento / Vencimento: sem total */}
                          <td style={{ padding: '0.75rem' }} />
                          <td style={{ padding: '0.75rem' }} />
                          {/* Fatura: total a pagar (fatura corrente em aberto) */}
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, fontSize: '0.9rem' }}>
                            <span data-testid="mf-resumo-cards-open-total">
                              {formatTotals(cardUpcoming?.openTotalByCurrency ?? {}, showValues)}
                            </span>
                          </td>
                          {/* Próxima: total da próxima fatura */}
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            <span data-testid="mf-resumo-cards-next-total">
                              {formatTotals(cardUpcoming?.upcomingTotalByCurrency ?? {}, showValues)}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          {/* Saldo em 1ª coluna (pedido) */}
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, fontSize: '0.9rem' }}>
                            {formatTotals(groupTotalsByCurrency(section.rows, 'saldo'), showValues)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#10b981', fontWeight: 700, fontSize: '0.9rem' }}>
                            {formatTotals(groupTotalsByCurrency(section.rows, 'receitas'), showValues)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#ef4444', fontWeight: 700, fontSize: '0.9rem' }}>
                            {formatTotals(groupTotalsByCurrency(section.rows, 'despesas'), showValues)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {formatTotals(groupTotalsByCurrency(section.rows, 'previsto'), showValues)}
                          </td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (id === 'recent') {
      // Feed único (Fase C): últimos lançamentos de todas as contas,
      // independente do mês navegado. Clique leva aos Lançamentos.
      const feed = recentTxs.filter((tx) => tx.status !== 'CANCELADO').slice(0, 10);
      return (
        <div
          className="glass-card"
          data-testid="mf-resumo-recent-card"
          style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', maxWidth: 560 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.9rem' }}>{t('minhasfinancas.res_recent_title')}</strong>
            <button
              type="button"
              className="icon-btn"
              data-testid="mf-resumo-go-recent"
              aria-label={t('minhasfinancas.see_all')}
              onClick={() => goTo('minhasfinancas-transactions')}
            >
              <ArrowRight size={15} />
            </button>
          </div>
          {feed.length === 0 ? (
            <p
              data-testid="mf-resumo-recent-empty"
              style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}
            >
              {t('minhasfinancas.res_recent_empty')}
            </p>
          ) : (
            feed.map((tx) => {
              const amount = Number(tx.amount) || 0;
              const isExpense = tx.type === 'DESPESA';
              const isTransfer = tx.type === 'TRANSFERENCIA';
              return (
                <button
                  key={tx.id}
                  type="button"
                  data-testid={`mf-resumo-recent-row-${tx.id}`}
                  onClick={() => goTo('minhasfinancas-transactions')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    width: '100%',
                    padding: '0.35rem 0.25rem',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid var(--glass-border)',
                    font: 'inherit',
                    color: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {shortDate(tx.payment_date)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                    {tx.description || t('minhasfinancas.chart_uncategorized')}
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {accountsById[tx.account_id]?.name ?? ''}
                      {!isTransfer && tx.category_id
                        ? ` · ${categoriesById[tx.category_id]?.name ?? t('minhasfinancas.chart_uncategorized')}`
                        : ''}
                    </span>
                  </span>
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      whiteSpace: 'nowrap',
                      color: isTransfer
                        ? 'var(--text-muted)'
                        : isExpense
                          ? '#ef4444'
                          : '#10b981',
                    }}
                  >
                    {isTransfer
                      ? nativeMoney(amount, accountsById[tx.account_id]?.currency || 'BRL')
                      : `${isExpense ? '−' : '+'}${nativeMoney(amount, accountsById[tx.account_id]?.currency || 'BRL')}`}
                  </span>
                </button>
              );
            })
          )}
        </div>
      );
    }

    if (id === 'pending') {
      // Pendentes do MÊS navegado: só o que está agendado dentro do mês
      // (a pagar, a receber, transferências e o pagamento-espelho da
      // fatura, marcado com 🎴). Clique abre o detalhe (com Efetivar).
      return (
        <MFPendingCard
          user={user}
          monthKey={monthKey}
          onOpenTx={(tx) => setPendingTx(tx)}
          onSeeAll={() => goTo('minhasfinancas-transactions')}
        />
      );
    }

    if (id === 'budgets') {
      return (
        <div
          className="glass-card"
          data-testid="mf-resumo-budget-card"
          style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', width: '100%', maxWidth: 560 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.9rem' }}>{t('minhasfinancas.res_budget_title')}</strong>
            <button
              type="button"
              className="icon-btn"
              data-testid="mf-resumo-go-budgets"
              aria-label={t('minhasfinancas.see_all')}
              onClick={() => goTo('minhasfinancas-budgets')}
            >
              <ArrowRight size={15} />
            </button>
          </div>
          {budgetItems.length === 0 ? (
            <p
              data-testid="mf-resumo-budget-empty"
              style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}
            >
              {t('minhasfinancas.res_budget_empty')}
            </p>
          ) : (
            <>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {t('minhasfinancas.res_budget_counts', {
                  count: budgetItems.length,
                  breached: budgetBreaches,
                })}
              </span>
              {/* Lista com barra de uso por orçamento (Fase E) */}
              {budgetItems.map((item, index) => {
                const pct =
                  item.limit > 0
                    ? Math.min(100, Math.round((item.spent / item.limit) * 100))
                    : 0;
                return (
                  <div
                    key={item.budget.id ?? index}
                    data-testid={`mf-resumo-budget-item-${index}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.budget.name}
                      </span>
                      <span style={{ color: item.breached ? '#ef4444' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {showValues ? formatMoney(item.spent, currency) : '•••'} /{' '}
                        {showValues ? formatMoney(item.limit, currency) : '•••'}
                      </span>
                    </span>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--input-bg)', overflow: 'hidden' }}>
                      <div
                        data-testid={`mf-resumo-budget-bar-${index}`}
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: item.breached ? '#ef4444' : 'var(--primary)',
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {budgetBreaches > 0 && (
                <span
                  data-testid="mf-resumo-budget-alert"
                  style={{ fontSize: '0.78rem', fontWeight: 800, color: '#ef4444' }}
                >
                  ⚠ {t('minhasfinancas.bdg_alert_title')}
                </span>
              )}
            </>
          )}
        </div>
      );
    }

    if (id === 'goals') {
      return (
        <div
          className="glass-card"
          data-testid="mf-resumo-goal-card"
          style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', width: '100%', maxWidth: 560 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.9rem' }}>{t('minhasfinancas.res_goal_title')}</strong>
            <button
              type="button"
              className="icon-btn"
              data-testid="mf-resumo-go-goals"
              aria-label={t('minhasfinancas.see_all')}
              onClick={() => goTo('minhasfinancas-goals')}
            >
              <ArrowRight size={15} />
            </button>
          </div>
          {activeGoals.length === 0 ? (
            <p
              data-testid="mf-resumo-goal-empty"
              style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}
            >
              {t('minhasfinancas.res_goal_empty')}
            </p>
          ) : (
            <>
              {/* Lista com barra de progresso por objetivo (Fase E) */}
              {activeGoals.map((goal, index) => {
                const balanceKnown =
                  !goal.account_id || goalBalances[goal.account_id] !== undefined;
                // O saldo da conta atrelada chega depois dos objetivos (o
                // recorte é menor) — enquanto isso, "…" em vez de um
                // R$ 0,00 mentiroso.
                const current = balanceKnown
                  ? goalCurrentAmount(goal, allContributions, goalBalances[goal.account_id])
                  : null;
                const target = Number(goal.target_amount) || 0;
                const pct =
                  current === null ? 0 : Math.min(100, Math.round((current / (target || 1)) * 100));
                return (
                  <div
                    key={goal.id ?? index}
                    data-testid={`mf-resumo-goal-item-${index}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {goal.icon || '🎯'} {goal.name}
                      </span>
                      <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {/* Objetivo sem moeda própria = padrão (BRL), como
                            na tela de Objetivos — o escopo da tela ('all')
                            não é moeda (vazava como "ALL", o Lek albanês). */}
                        {showValues
                          ? current === null
                            ? '…'
                            : formatMoney(current, goal.currency)
                          : '•••'}{' '}
                        /{' '}
                        {showValues ? formatMoney(target, goal.currency) : '•••'}
                      </span>
                    </span>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--input-bg)', overflow: 'hidden' }}>
                      <div
                        data-testid={`mf-resumo-goal-bar-${index}`}
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: goal.color || 'var(--primary)',
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: goal.color || 'var(--primary)' }}>
                      {current === null ? '…' : t('minhasfinancas.bdg_pct', { pct })}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      );
    }

    return null;
  };

  // Camada do menu ⋮ (overlay + painel). No estreito ela vai via portal no
  // <body>: o glass-card do cabeçalho tem backdrop-filter, que cria um
  // containing block para position:fixed — sem o portal o painel ficava
  // ancorado no card e ATRÁS do .main-header (z-index 100), escondendo
  // "Todas as moedas" e impedindo a rolagem da lista de moedas.
  const menuLayer = menuOpen ? (
    <>
      {/* Clicar fora fecha: fundo escuro no estreito, invisível
          no largo (só captura o clique). */}
      <span
        data-testid="mf-resumo-menu-overlay"
        onClick={closeMenu}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: isNarrow ? 1099 : 59,
          background: isNarrow ? 'rgba(0, 0, 0, 0.55)' : 'transparent',
        }}
      />
      <div
        data-testid="mf-resumo-menu-panel"
        role="menu"
        aria-label={t('minhasfinancas.more_options')}
        style={menuStyle}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <strong style={{ flex: 1, fontSize: '0.8rem' }}>
            {menuView === 'currency'
              ? t('minhasfinancas.currency_label')
              : t('minhasfinancas.more_options')}
          </strong>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-resumo-menu-close"
            aria-label={t('minhasfinancas.cancel')}
            onClick={closeMenu}
          >
            <X size={15} />
          </button>
        </div>

        {menuView === 'root' ? (
          <>
            {/* Nível 1: Selecionar moeda → lista; Personalizar. */}
            <button
              type="button"
              role="menuitem"
              data-testid="mf-resumo-menu-currency-open"
              onClick={() => setMenuView('currency')}
              style={menuItemStyle}
            >
              <span style={{ flex: 1, textAlign: 'left' }}>
                {t('minhasfinancas.select_currency')}
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  fontWeight: 700,
                }}
              >
                {currency === 'all' ? t('minhasfinancas.currency_all') : currency}
              </span>
              <ChevronRight size={14} />
            </button>
            <span
              style={{
                borderTop: '1px solid var(--glass-border)',
                margin: '0.3rem 0',
              }}
            />
            <button
              type="button"
              role="menuitem"
              data-testid="mf-resumo-customize"
              onClick={() => {
                closeMenu();
                setCustomizing(true);
              }}
              style={menuItemStyle}
            >
              <SlidersHorizontal size={15} />
              {t('minhasfinancas.dash_customize')}
            </button>
          </>
        ) : (
          <>
            {/* Nível 2: lista de moedas — escolher aplica e fecha
                (assim nunca se fica preso no menu). */}
            <button
              type="button"
              role="menuitem"
              data-testid="mf-resumo-menu-back"
              onClick={() => setMenuView('root')}
              style={menuItemStyle}
            >
              <ChevronLeft size={14} />
              {t('minhasfinancas.back')}
            </button>
            <span
              style={{
                borderTop: '1px solid var(--glass-border)',
                margin: '0.3rem 0',
              }}
            />
            {[
              { code: 'all', label: t('minhasfinancas.currency_all') },
              ...currencyOptions.map((code) => ({ code, label: code })),
            ].map((option) => {
              const active = currency === option.code;
              return (
                <button
                  key={option.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  data-testid={`mf-resumo-menu-currency-${option.code}`}
                  onClick={() => {
                    setCurrency(option.code);
                    closeMenu();
                  }}
                  style={{
                    ...menuItemStyle,
                    borderColor: active ? 'var(--primary)' : 'transparent',
                    background: active
                      ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
                      : 'transparent',
                    fontWeight: active ? 800 : 600,
                  }}
                >
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    {option.label}
                  </span>
                  {active && <Check size={14} />}
                </button>
              );
            })}
          </>
        )}
      </div>
    </>
  ) : null;

  return (
    <div data-testid="mf-resumo" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Cabeçalho + navegação de mês */}
      <div
        className="glass-card"
        style={{
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          // O backdrop-filter cria um stacking context; sem isto os dropdowns
          // (menu ⋮ e sino) ficavam ATRÁS dos cards de KPI (z-index do app).
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Largo: título + descrição no bloco à esquerda. */}
        {!isNarrow && (
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
              {t('minhasfinancas.title')}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>
              {t('minhasfinancas.overview_desc')}
            </p>
          </div>
        )}
        {/* Estreito no drill-down: título sem asções (somem no detalhe) */}
        {isNarrow && selectedRow && (
          <h2 style={{ width: '100%', fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
            {t('minhasfinancas.title')}
          </h2>
        )}
        {!selectedRow && (
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
              alignItems: 'center',
              // Estreito: nome do módulo e ícones na MESMA linha (título à
              // esquerda, ações coladas à direita — pedido do usuário).
              ...(isNarrow ? { width: '100%' } : {}),
            }}
          >
            {isNarrow && (
              <h2
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  margin: 0,
                }}
              >
                {t('minhasfinancas.title')}
              </h2>
            )}
            <MFRemindersBell user={user} onChangeMonth={onChangeMonth} />
            {/* Menu de três pontos (padrão do app de referência): moedas +
                personalizar painel. No estreito a régua de abas some e o
                menu abre como bottom-sheet. */}
            <span style={{ position: 'relative' }}>
              <button
                type="button"
                className="icon-btn"
                data-testid="mf-resumo-menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={t('minhasfinancas.more_options')}
                onClick={() => {
                  if (!menuOpen) setMenuView('root');
                  setMenuOpen((prev) => !prev);
                }}
              >
                <MoreVertical size={18} />
              </button>
              {menuLayer &&
                (isNarrow ? createPortal(menuLayer, document.body) : menuLayer)}
            </span>
            {/* Sem abas no estreito: o badge deixa visível qual moeda está
                filtrando (some quando é "Todas"). */}
            {isNarrow && currency !== 'all' && (
              <span
                data-testid="mf-resumo-currency-badge"
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  color: 'var(--primary)',
                  background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                  border: '1px solid var(--primary)',
                  borderRadius: 999,
                  padding: '0.15rem 0.45rem',
                }}
              >
                {currency}
              </span>
            )}
            {!isNarrow && (
              <>
                <MFCurrencyTabs
                  currencies={currencyOptions}
                  value={currency}
                  onChange={setCurrency}
                  testId="mf-resumo-currency-tabs"
                />
                <MFMonthNav monthKey={monthKey} onChange={onChangeMonth} />
              </>
            )}
          </div>
        )}
        {/* Estreito: descrição abaixo da linha do título… */}
        {isNarrow && (
          <p
            style={{
              width: '100%',
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
              margin: 0,
            }}
          >
            {t('minhasfinancas.overview_desc')}
          </p>
        )}
        {/* …e seletor de mês centralizado em linha própria */}
        {!selectedRow && isNarrow && (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <MFMonthNav monthKey={monthKey} onChange={onChangeMonth} />
          </div>
        )}
      </div>

      {/* Compacto do estreito (formato do mock de referência): Inicial à
          esquerda, saldo em R$ em destaque no centro e Previsto à direita —
          as demais moedas saem menores e apagadas, só com a sigla. */}
      {isNarrow && !selectedRow && groupPath.length === 0 && (
        <div
          className="glass-card"
          data-testid="mf-resumo-compact"
          style={{
            padding: '0.9rem 1.1rem',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '0.4rem',
          }}
        >
          {[
            { key: 'initial', label: t('minhasfinancas.initial'), totals: kpis.initial, hero: false, align: 'left' },
            { key: 'balance', label: t('minhasfinancas.kpi_balance'), totals: kpis.saldo, hero: true, align: 'center' },
            { key: 'forecast', label: t('minhasfinancas.kpi_forecast'), totals: kpis.previsto, hero: false, align: 'right' },
          ].map((item) => (
            <div
              key={item.key}
              data-testid={`mf-resumo-compact-${item.key}`}
              style={{
                minWidth: 0,
                flex: item.hero ? '0 1 auto' : '1 1 0',
                textAlign: item.align,
              }}
            >
              <div
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.label}
              </div>
              <div style={item.hero ? { fontSize: '1.3rem', fontWeight: 800 } : { fontSize: '0.82rem', fontWeight: 700 }}>
                {isLoading ? '…' : isError ? '—' : (
                  <MFTotalsStack
                    totals={item.totals}
                    showValues={showValues}
                    hero={item.hero}
                    align={item.align}
                    fontSize="inherit"
                    lineHeight={1.25}
                    testId={`mf-resumo-compact-${item.key}-totals`}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Personalizar painel: modal de verdade — antes era um card solto no
          meio da página e o usuário não entendia o que tinha aberto. */}
      {!selectedRow && customizing && (
        <div
          className="modal-overlay"
          data-testid="mf-widget-panel-overlay"
          onClick={() => setCustomizing(false)}
        >
          <div
            className="glass-card modal-content"
            data-testid="mf-widget-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('minhasfinancas.dash_customize')}
            onClick={(event) => event.stopPropagation()}
            style={{ padding: '1.5rem 1.6rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, flex: 1 }}>
                {t('minhasfinancas.dash_customize')}
              </h3>
              <button
                type="button"
                className="icon-btn"
                data-testid="mf-widget-panel-close"
                aria-label={t('minhasfinancas.cancel')}
                onClick={() => setCustomizing(false)}
              >
                <X size={16} />
              </button>
            </div>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.dash_hint')}
            </p>
          {widgetPref.order.map((id, index) => {
            const hidden = widgetPref.hidden.includes(id);
            return (
              <div
                key={id}
                data-testid={`mf-widget-row-${id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.4rem 0',
                  opacity: hidden ? 0.55 : 1,
                  borderBottom: '1px solid var(--glass-border)',
                }}
              >
                <span style={{ fontSize: '0.85rem', fontWeight: hidden ? 500 : 700 }}>
                  {widgetLabel(id)}
                </span>
                <span style={{ display: 'flex', gap: '0.35rem' }}>
                  <button
                    type="button"
                    className="icon-btn"
                    data-testid={`mf-widget-up-${id}`}
                    aria-label={t('minhasfinancas.dash_up')}
                    disabled={index === 0}
                    style={{ opacity: index === 0 ? 0.4 : 1 }}
                    onClick={() => updateWidgetPref(moveWidget(widgetPref, id, -1))}
                  >
                    <ChevronUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    data-testid={`mf-widget-down-${id}`}
                    aria-label={t('minhasfinancas.dash_down')}
                    disabled={index === widgetPref.order.length - 1}
                    style={{ opacity: index === widgetPref.order.length - 1 ? 0.4 : 1 }}
                    onClick={() => updateWidgetPref(moveWidget(widgetPref, id, 1))}
                  >
                    <ChevronDown size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    data-testid={`mf-widget-toggle-${id}`}
                    aria-label={t(
                      hidden ? 'minhasfinancas.dash_show' : 'minhasfinancas.dash_hide'
                    )}
                    onClick={() => updateWidgetPref(toggleWidget(widgetPref, id))}
                  >
                    {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </span>
              </div>
            );
          })}

          {/* Gráficos do widget "charts" — cada um ocultável à parte (Fase D) */}
          <div
            style={{
              marginTop: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--glass-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
            }}
          >
            <strong style={{ fontSize: '0.85rem' }}>{t('minhasfinancas.dash_charts_title')}</strong>
            {MF_CHARTS.map((chartId) => {
              const chartHidden = (widgetPref.hiddenCharts ?? []).includes(chartId);
              return (
                <button
                  key={chartId}
                  type="button"
                  data-testid={`mf-chart-toggle-${chartId}`}
                  onClick={() => updateWidgetPref(toggleChart(widgetPref, chartId))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: '0.4rem 0',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid var(--glass-border)',
                    font: 'inherit',
                    color: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                    opacity: chartHidden ? 0.55 : 1,
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: chartHidden ? 500 : 700 }}>
                    {t(`minhasfinancas.${chartId}`)}
                  </span>
                  {chartHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              );
            })}
          </div>

          {/* Contas visíveis no painel (KPIs, tabela e gráficos seguem) */}
          <div
            style={{
              marginTop: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--glass-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}
            >
              <strong style={{ fontSize: '0.85rem' }}>{t('minhasfinancas.dash_accts_title')}</strong>
              <span style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  data-testid="mf-dash-accts-all"
                  onClick={() => updateWidgetPref(setHiddenAccounts(widgetPref, []))}
                  style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem' }}
                >
                  {t('minhasfinancas.dash_accts_all')}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  data-testid="mf-dash-accts-none"
                  onClick={() =>
                    updateWidgetPref(
                      setHiddenAccounts(widgetPref, pickerAccounts.map((acc) => acc.id))
                    )
                  }
                  style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem' }}
                >
                  {t('minhasfinancas.dash_accts_none')}
                </button>
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.dash_accts_hint')}
            </p>
            {pickerAccounts.length > 8 && (
              <input
                type="text"
                className="glass-input"
                data-testid="mf-dash-accts-search"
                placeholder={t('common.search')}
                value={acctSearch}
                onChange={(event) => setAcctSearch(event.target.value)}
                style={{ fontSize: '0.82rem' }}
              />
            )}
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {filteredPickerAccounts.map((acc) => {
                const isHidden = hiddenAccountSet.has(acc.id);
                return (
                  <button
                    key={acc.id}
                    type="button"
                    data-testid={`mf-dash-acct-${acc.id}`}
                    onClick={() => updateWidgetPref(toggleAccountVisible(widgetPref, acc.id))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      padding: '0.45rem 0.25rem',
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid var(--glass-border)',
                      color: 'inherit',
                      cursor: 'pointer',
                      opacity: isHidden ? 0.55 : 1,
                      textAlign: 'left',
                    }}
                  >
                    {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    <MFAccountIcon account={acc} size={18} />
                    <span
                      style={{
                        flex: 1,
                        fontSize: '0.84rem',
                        fontWeight: isHidden ? 500 : 700,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {acc.name}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {acc.currency}
                    </span>
                  </button>
                );
              })}
              {filteredPickerAccounts.length === 0 && (
                <p style={{ margin: '0.5rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {t('common.no_results')}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-widget-panel-done"
            onClick={() => setCustomizing(false)}
            style={{ marginTop: '0.9rem', alignSelf: 'flex-end', display: 'inline-flex' }}
          >
            {t('minhasfinancas.dash_done')}
          </button>
          </div>
        </div>
      )}

      {isError && (
        <div className="glass-card" data-testid="mf-resumo-error" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--danger)', margin: 0 }}>{t('minhasfinancas.load_error')}</p>
        </div>
      )}

      {/* Drill-down: detalhe da conta > drill de grupo > widgets do painel */}
      {selectedRow ? (
        <MFAccountDetail
          account={selectedRow}
          user={user}
          monthKey={monthKey}
          onChangeMonth={onChangeMonth}
          showValues={showValues}
          onClose={() => setSelectedId(null)}
          onEdit={(row) => setAccountModalRow(row)}
          onOpenCard={(card) => setSelectedId(card.id)}
          onOpenAccount={(row) => setSelectedId(row.id)}
        />
      ) : groupPath.length > 0 &&
        groups.some((group) => group.id === groupPath[groupPath.length - 1]) ? (
        <MFGroupDrill
          groups={groups}
          rows={activeRows}
          path={groupPath}
          showValues={showValues}
          onNavigate={setGroupPath}
          onOpenAccount={setSelectedId}
          onNewAccount={() => setAccountModalGroup(groupPath[groupPath.length - 1])}
          onNewSubgroup={() =>
            setGroupModal({ parentId: groupPath[groupPath.length - 1] })
          }
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
            gap: '1.5rem',
          }}
        >
          {/* Widgets do painel, na ordem configurada pelo usuário.
              KPIs, Grupos, Contas e Gráficos ocupam a faixa cheia;
              Orçamento e Objetivo dividem a última linha em duas colunas. */}
          {orderedWidgets
            // Estreito: o compacto substitui os cards de KPI e os gráficos
            // (vão embora na Fase D, quando forem redesenhados para o mobile).
            .filter((id) => !isNarrow || (id !== 'charts' && id !== 'kpis'))
            .map((id) => (
            <div
              key={id}
              data-widget={id}
              style={{
                gridColumn: ['kpis', 'accounts', 'groups', 'charts'].includes(id)
                  ? '1 / -1'
                  : undefined,
              }}
            >
              {renderWidget(id)}
            </div>
          ))}
        </div>
      )}

      {/* Modais do Resumo: criação de grupo (raiz ou subgrupo do drill)
          e de conta com o grupo do drill pré-selecionado */}
      {groupModal && (
        <MFGroupModal
          user={user}
          defaultParentId={groupModal.parentId}
          onClose={() => setGroupModal(null)}
        />
      )}
      {accountModalGroup && (
        <MFAccountModal
          isOpen
          user={user}
          defaultGroupId={accountModalGroup}
          onClose={() => setAccountModalGroup(null)}
        />
      )}
      {accountModalRow && (
        <MFAccountModal
          isOpen
          user={user}
          account={accountModalRow}
          onClose={() => setAccountModalRow(null)}
        />
      )}
      {/* Detalhe do pendente (card "Pendentes") — mesmo modal do Extrato,
          com o botão Efetivar. */}
      {pendingTx && (
        <MFTxDetailModal
          tx={pendingTx}
          tagIds={[]}
          user={user}
          onClose={() => setPendingTx(null)}
        />
      )}
    </div>
  );
}
