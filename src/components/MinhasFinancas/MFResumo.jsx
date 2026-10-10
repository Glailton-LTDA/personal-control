import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  Eye,
  EyeOff,
  FolderTree,
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
import MFCurrencyFilter from './MFCurrencyFilter';
import MFAccountIcon from './MFAccountIcon';
import MFGroupIcon from './MFGroupIcon';
import MFAccountDetail from './MFAccountDetail';
import MFGroupDrill from './MFGroupDrill';
import MFGroupModal from './MFGroupModal';
import MFAccountModal from './MFAccountModal';
import {
  visibleWidgets,
  toggleWidget,
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
  const { data: goalBalances = {} } = useMFAccountBalances(user);
  const { data: categories = [] } = useMFCategories(user);
  const { data: groups = [] } = useMFGroups(user);

  // Escopo de moeda por tela: 'all' = todas (totais separados por moeda).
  const [currency, setCurrency] = useState('all');

  // Painel personalizável (Fase 9): widgets + contas visíveis
  const [widgetPref, setWidgetPref] = useState(loadWidgetPref);
  const [customizing, setCustomizing] = useState(false);
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
  // Modal de nova conta com o grupo do drill já pré-selecionado
  const [accountModalGroup, setAccountModalGroup] = useState(null);
  // Modal de EDIÇÃO de conta a partir do detalhe (drill ou widget)
  const [accountModalRow, setAccountModalRow] = useState(null);

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
    initial: groupTotalsByCurrency(countedRows, 'initial_balance'),
  };
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
      const byCat = {};
      curTxs.forEach((tx) => {
        if (tx.t !== 'DESPESA' || tx.m !== monthKey) return;
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
      const pie =
        sorted.length > 8
          ? [
              ...sorted.slice(0, 7),
              {
                id: 'other',
                name: t('common.other'),
                value: sorted.slice(7).reduce((sum, item) => sum + item.value, 0),
              },
            ]
          : sorted;
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
      return { currency: cur, pie, flow };
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
  const featuredGoal = activeGoals.length > 0 ? activeGoals[0] : null;
  const featuredCurrent = featuredGoal
    ? goalCurrentAmount(featuredGoal, allContributions, goalBalances[featuredGoal.account_id])
    : 0;
  const featuredPct = featuredGoal
    ? Math.min(
        100,
        Math.round(
          (featuredCurrent / (Number(featuredGoal.target_amount) || 1)) * 100
        )
      )
    : 0;

  const cards = [
    {
      key: 'kpi_balance',
      icon: Wallet,
      valueText: formatTotals(kpis.saldo, showValues),
      sub: `${t('minhasfinancas.initial')}: ${formatTotals(kpis.initial, showValues)}`,
      color: 'var(--primary)',
    },
    {
      key: 'kpi_received',
      icon: TrendingUp,
      valueText: formatTotals(kpis.recebido, showValues),
      color: '#10b981',
      // Variação só quando o escopo tem uma única moeda (não cruzamos moedas).
      variation: singleCurrency
        ? variation(sumField(activeRows, 'receitas'), sumField(activeRows, 'receitasPrev'))
        : undefined,
      favorableWhenUp: true,
    },
    {
      key: 'kpi_spent',
      icon: TrendingDown,
      valueText: formatTotals(kpis.gasto, showValues),
      color: '#ef4444',
      variation: singleCurrency
        ? variation(sumField(activeRows, 'despesas'), sumField(activeRows, 'despesasPrev'))
        : undefined,
      favorableWhenUp: false,
    },
    {
      key: 'kpi_forecast',
      icon: CalendarClock,
      valueText: formatTotals(kpis.previsto, showValues),
      sub: t('minhasfinancas.accounts_count', { count: activeRows.length }),
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
                <p data-testid={`mf-kpi-value-${card.key}`} style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0 }}>
                  {isLoading ? '…' : isError ? '—' : card.valueText}
                </p>
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {card.sub && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {showValues ? card.sub : '•••'}
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
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
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
                return (
                  <button
                    key={group.id}
                    type="button"
                    data-testid={`mf-group-card-${group.id}`}
                    onClick={() => setGroupPath([group.id])}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.7rem',
                      padding: '0.9rem 1rem',
                      borderRadius: 14,
                      border: '1px solid var(--glass-border)',
                      background: 'var(--input-bg)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      font: 'inherit',
                      color: 'var(--text-main)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '1.15rem',
                        background:
                          'linear-gradient(135deg, color-mix(in srgb, var(--primary) 22%, transparent), color-mix(in srgb, #8b5cf6 18%, transparent))',
                        border: '1px solid var(--glass-border)',
                        flexShrink: 0,
                      }}
                    >
                      <MFGroupIcon icon={group.icon} name={group.name} size={30} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontWeight: 700,
                          fontSize: '0.92rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {group.name}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {t('minhasfinancas.accounts_count', { count: subRows.length })}
                        {descendantCount > 0 &&
                          ` · ${t('minhasfinancas.groups_count', { count: descendantCount })}`}
                      </span>
                    </span>
                    {group.sum_totals ? (
                      <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>
                        {formatTotals(groupTotalsByCurrency(countableRows(subRows), 'saldo'), showValues)}
                      </span>
                    ) : (
                      <ArrowRight size={15} style={{ color: 'var(--text-muted)' }} />
                    )}
                  </button>
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
      if (chartData.length === 0) {
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
          {chartData.map(({ currency: cur, pie, flow }) => (
            <React.Fragment key={cur}>
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
            </React.Fragment>
          ))}
        </div>
      );
    }

    if (id === 'accounts') {
      // Cartões (account_type='CARTAO') têm seção própria — nunca se misturam
      // com as contas. Só esta lista segue o filtro visual; KPIs e gráficos
      // somam todas as contas ativas.
      const accountRows = visibleRows.filter((row) => row.account_type !== 'CARTAO');
      const cardRows = visibleRows.filter((row) => row.account_type === 'CARTAO');
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
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead>
                    <tr>
                      {/* Coluna da conta (ícone + nome): sem rótulo */}
                      <th
                        aria-hidden
                        style={{
                          padding: '0.6rem 0.75rem',
                          borderBottom: '1px solid var(--glass-border)',
                        }}
                      />
                      {[
                        'accounts_table_income',
                        'accounts_table_expense',
                        'accounts_table_balance',
                        'accounts_table_forecast',
                      ].map((key) => (
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
                    {section.rows.map((row) => (
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
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: '#10b981', fontSize: '0.9rem' }}>
                          {nativeMoney(row.receitas, row.currency)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: '#ef4444', fontSize: '0.9rem' }}>
                          {nativeMoney(row.despesas, row.currency)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', fontWeight: 800, fontSize: '0.9rem' }}>
                          {nativeMoney(row.saldo, row.currency)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          {nativeMoney(row.previsto, row.currency)}
                        </td>
                      </tr>
                    ))}
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
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#10b981', fontWeight: 700, fontSize: '0.9rem' }}>
                        {formatTotals(groupTotalsByCurrency(countableRows(section.rows), 'receitas'), showValues)}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#ef4444', fontWeight: 700, fontSize: '0.9rem' }}>
                        {formatTotals(groupTotalsByCurrency(countableRows(section.rows), 'despesas'), showValues)}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, fontSize: '0.9rem' }}>
                        {formatTotals(groupTotalsByCurrency(countableRows(section.rows), 'saldo'), showValues)}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {formatTotals(groupTotalsByCurrency(countableRows(section.rows), 'previsto'), showValues)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}
        </div>
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
              {currency !== 'all' && (
                <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                  {showValues
                    ? formatMoney(
                        budgetItems.reduce((sum, item) => sum + item.spent, 0),
                        currency
                      )
                    : '•••'}{' '}
                  /{' '}
                  {showValues
                    ? formatMoney(
                        budgetItems.reduce((sum, item) => sum + item.limit, 0),
                        currency
                      )
                    : '•••'}
                </span>
              )}
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
          {!featuredGoal ? (
            <p
              data-testid="mf-resumo-goal-empty"
              style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}
            >
              {t('minhasfinancas.res_goal_empty')}
            </p>
          ) : (
            <>
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                {featuredGoal.icon || '🎯'} {featuredGoal.name}
              </span>
              <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                {showValues ? formatMoney(featuredCurrent) : '•••'} /{' '}
                {showValues ? formatMoney(Number(featuredGoal.target_amount) || 0) : '•••'}
              </span>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--input-bg)', overflow: 'hidden' }}>
                <div
                  data-testid="mf-resumo-goal-progress"
                  style={{
                    width: `${featuredPct}%`,
                    height: '100%',
                    background: featuredGoal.color || 'var(--primary)',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: featuredGoal.color || 'var(--primary)' }}>
                {t('minhasfinancas.bdg_pct', { pct: featuredPct })}
              </span>
            </>
          )}
        </div>
      );
    }

    return null;
  };

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
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
            {t('minhasfinancas.title')}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>
            {t('minhasfinancas.overview_desc')}
          </p>
        </div>
        {!selectedRow && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className={customizing ? 'btn-primary' : 'btn-secondary'}
              data-testid="mf-resumo-customize"
              onClick={() => setCustomizing((prev) => !prev)}
              style={{ padding: '0.55rem 0.9rem', fontSize: '0.8rem' }}
              aria-pressed={customizing}
            >
              <SlidersHorizontal size={15} />
              {t(customizing ? 'minhasfinancas.dash_done' : 'minhasfinancas.dash_customize')}
            </button>
            <MFCurrencyFilter
              currencies={currencyOptions}
              value={currency}
              onChange={setCurrency}
            />
            <MFMonthNav monthKey={monthKey} onChange={onChangeMonth} />
          </div>
        )}
      </div>

      {/* Painel de personalização (Fase 9) */}
      {!selectedRow && customizing && (
        <div
          className="glass-card"
          data-testid="mf-widget-panel"
          style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
        >
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
          {orderedWidgets.map((id) => (
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
    </div>
  );
}
