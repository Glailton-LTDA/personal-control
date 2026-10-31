import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
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
  ArrowLeft,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  PieChart as PieIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MFMonthNav from './MFMonthNav';
import MFSelect from './MFSelect';
import MFGroupIcon from './MFGroupIcon';
import MFAccountIcon from './MFAccountIcon';
import { formatMoney } from '../../hooks/useMinhasFinancas';
import { chartPercent, chartTotal, CHART_COLORS } from './mfCharts';

const tooltipStyle = {
  background: 'var(--glass-bg, #1e293b)',
  border: '1px solid var(--glass-border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--text-main)',
};

const colorFor = (group, index) => group.color || CHART_COLORS[index % CHART_COLORS.length];

function GroupIcon({ group }) {
  const isAccount = String(group.key || '').startsWith('account:');
  const account = group.accounts?.[0]?.account;
  if (isAccount && account) return <MFAccountIcon account={account} size={26} />;
  return (
    <span
      className="mf-charts-group-icon"
      style={{ background: `color-mix(in srgb, ${group.color || 'var(--primary)'} 18%, transparent)` }}
    >
      <MFGroupIcon icon={group.icon} name={group.name} color={group.color} size={18} />
    </span>
  );
}

/**
 * Tela cheia de Gráficos do Resumo (rota
 * `minhasfinancas/resumo/graficos/<metric>/<grouping>/<category>`).
 *
 * Reusa os dados do `mf_month_summary` já carregados no Resumo. O drill-down
 * categoria → contas → detalhe da conta usa o detalhe existente.
 */
export default function MFChartsScreen({
  chart = 'contas',
  grouping = 'type',
  categoryKey = null,
  monthKey,
  onChangeMonth = () => {},
  currencies = [],
  currency,
  onCurrencyChange = () => {},
  groups = [],
  flow = [],
  showValues = true,
  options = {},
  onOptionsChange = () => {},
  onBack = () => {},
  onChangeChart = () => {},
  onChangeGrouping = () => {},
  onSelectCategory = () => {},
  onSelectAccount = () => {},
  accountTypeLabel = (type) => type,
}) {
  const { t } = useTranslation();
  const initialTab = chart === 'flow' || (chart !== 'contas' && grouping !== 'category') ? 'bars' : 'pie';
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const menuRef = useRef(null);

  useEffect(() => {
    setTab(chart === 'flow' || (chart !== 'contas' && grouping !== 'category') ? 'bars' : 'pie');
  }, [chart, grouping]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  // Tela cheia: não deixa o FAB global (e o perfil) atrapalharem o foco.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('mf-detail-context', { detail: { scope: 'charts' } })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent('mf-detail-context', { detail: { scope: null } })
      );
    };
  }, []);

  const visible = useMemo(
    () => groups.filter((group) => Number(group.value) > 0).sort((a, b) => b.value - a.value),
    [groups]
  );
  const total = chartTotal(visible);
  const selected = categoryKey ? visible.find((group) => group.key === categoryKey) : null;
  const percentOn = options.percent !== false;
  const badgesOn = options.badges === true;
  const percentOf = (value) => chartPercent(value, total);

  const metricOptions = [
    { value: 'contas', label: t('minhasfinancas.chart_metric_accounts') },
    { value: 'despesas', label: t('minhasfinancas.chart_metric_expenses') },
    { value: 'receitas', label: t('minhasfinancas.chart_metric_income') },
    { value: 'fluxo', label: t('minhasfinancas.chart_metric_flow') },
  ];
  const currencyOptions = currencies.map((code) => ({ value: code, label: code }));
  const groupingOptions =
    chart === 'contas'
      ? [
          { value: 'type', label: t('minhasfinancas.chart_group_type') },
          { value: 'institution', label: t('minhasfinancas.chart_group_institution') },
          { value: 'group', label: t('minhasfinancas.chart_group_group') },
          { value: 'account', label: t('minhasfinancas.chart_group_account') },
        ]
      : [
          { value: 'category', label: t('minhasfinancas.chart_group_category') },
          { value: 'type', label: t('minhasfinancas.chart_group_type') },
          { value: 'institution', label: t('minhasfinancas.chart_group_institution') },
          { value: 'group', label: t('minhasfinancas.chart_group_group') },
          { value: 'account', label: t('minhasfinancas.chart_group_account') },
        ];

  const title =
    chart === 'contas'
      ? t('minhasfinancas.chart_accounts')
      : chart === 'fluxo'
        ? t('minhasfinancas.chart_flow')
        : chart === 'despesas'
          ? grouping === 'category'
            ? t('minhasfinancas.chart_categories')
            : grouping === 'type'
              ? t('minhasfinancas.chart_bytype')
              : t(`minhasfinancas.chart_expenses_by_${grouping}`)
          : grouping === 'category'
            ? t('minhasfinancas.chart_income')
            : grouping === 'type'
              ? t('minhasfinancas.chart_income_by_type')
              : t(`minhasfinancas.chart_income_by_${grouping}`);

  const toggleOption = (key, value) => onOptionsChange({ ...options, [key]: value });
  const showCharts = chart !== 'flow';
  const accountRows = selected ? selected.accounts : [];

  return (
    <div className="mf-charts-screen" data-testid="mf-charts-screen">
      <div className="mf-charts-head">
        <button
          type="button"
          className="mf-charts-back"
          data-testid="mf-charts-back"
          onClick={onBack}
          aria-label={t('minhasfinancas.chart_back')}
          title={t('minhasfinancas.chart_back')}
        >
          <ArrowLeft size={18} />
        </button>
        <h2>{t('minhasfinancas.chart_title')}</h2>
        <div className="mf-charts-controls">
          <MFMonthNav monthKey={monthKey} onChange={onChangeMonth} />
          <MFSelect
            testId="mf-charts-metric"
            value={chart}
            onChange={onChangeChart}
            options={metricOptions}
            ariaLabel={t('minhasfinancas.chart_metric')}
            style={{ width: 'auto', padding: '0.45rem 0.7rem', fontSize: '0.78rem' }}
          />
          <MFSelect
            testId="mf-charts-currency"
            value={currency || ''}
            onChange={onCurrencyChange}
            options={currencyOptions}
            ariaLabel={t('minhasfinancas.chart_currency')}
            style={{ width: 'auto', padding: '0.45rem 0.7rem', fontSize: '0.78rem' }}
          />
          {chart !== 'fluxo' && (
            <MFSelect
              testId="mf-charts-grouping"
              value={grouping}
              onChange={onChangeGrouping}
              options={groupingOptions}
              ariaLabel={t('minhasfinancas.chart_group_by')}
              style={{ width: 'auto', padding: '0.45rem 0.7rem', fontSize: '0.78rem' }}
            />
          )}
          <div className="mf-charts-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="icon-btn"
              data-testid="mf-charts-menu-toggle"
              aria-label={t('minhasfinancas.chart_more_options')}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <div className="mf-chart-menu" data-testid="mf-charts-menu">
                {chart !== 'fluxo' && (
                  <>
                    <button
                      type="button"
                      className="mf-chart-menu-item"
                      data-testid="mf-charts-opt-badges"
                      onClick={() => toggleOption('badges', !badgesOn)}
                    >
                      <span className="mf-chart-menu-check">{badgesOn ? <Check size={13} /> : null}</span>
                      {t('minhasfinancas.chart_option_badges')}
                    </button>
                    <button
                      type="button"
                      className="mf-chart-menu-item"
                      data-testid="mf-charts-opt-percent"
                      onClick={() => toggleOption('percent', !percentOn)}
                    >
                      <span className="mf-chart-menu-check">{percentOn ? <Check size={13} /> : null}</span>
                      {t('minhasfinancas.chart_option_percent')}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="mf-chart-menu-item"
                  data-testid="mf-charts-opt-ignored"
                  onClick={() => toggleOption('includeIgnored', !options.includeIgnored)}
                >
                  <span className="mf-chart-menu-check">
                    {options.includeIgnored ? <Check size={13} /> : null}
                  </span>
                  {t('minhasfinancas.chart_option_ignored')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCharts && (
        <div className="mf-charts-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pie'}
            className={`mf-charts-tab${tab === 'pie' ? ' is-active' : ''}`}
            data-testid="mf-charts-tab-pie"
            onClick={() => setTab('pie')}
          >
            <PieIcon size={14} />
            {t('minhasfinancas.chart_tab_pie')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'bars'}
            className={`mf-charts-tab${tab === 'bars' ? ' is-active' : ''}`}
            data-testid="mf-charts-tab-bars"
            onClick={() => setTab('bars')}
          >
            <BarChart3 size={14} />
            {t('minhasfinancas.chart_tab_bars')}
          </button>
        </div>
      )}

      <div className="mf-charts-body">
        <section className="mf-charts-chart" aria-label={title}>
          <div className="mf-charts-chart-title">{title} · {currency}</div>
          {chart !== 'fluxo' && visible.length === 0 ? (
            <p className="mf-chart-empty-line" data-testid="mf-charts-empty">
              {t('minhasfinancas.chart_no_data')}
            </p>
          ) : tab === 'bars' || chart === 'fluxo' ? (
            <div className="mf-charts-bars" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={
                    chart === 'fluxo'
                      ? flow
                      : visible.map((group) => ({
                          name: group.name,
                          value: group.value,
                          key: group.key,
                        }))
                  }
                  margin={{ top: 12, right: 10, left: 0, bottom: 28 }}
                >
                  <XAxis
                    dataKey={chart === 'fluxo' ? 'label' : 'name'}
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={chart === 'fluxo' ? 0 : -25}
                    textAnchor={chart === 'fluxo' ? 'middle' : 'end'}
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value) => formatMoney(value, currency)}
                    contentStyle={tooltipStyle}
                  />
                  {chart === 'fluxo' ? (
                    <>
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
                    </>
                  ) : (
                    <Bar dataKey="value" fill="#6366f1" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                      {visible.map((group, index) => (
                        <Cell key={group.key} fill={colorFor(group, index)} />
                      ))}
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mf-charts-donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={visible}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={78}
                    outerRadius={118}
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {visible.map((group, index) => (
                      <Cell key={group.key} fill={colorFor(group, index)} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => (showValues ? formatMoney(value, currency) : '•••')}
                    contentStyle={tooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mf-charts-donut-center">
                <strong>{showValues ? formatMoney(total, currency) : '•••'}</strong>
                <span>{t('minhasfinancas.chart_total')}</span>
              </div>
            </div>
          )}
        </section>

        {chart !== 'fluxo' && (
          <aside className="mf-charts-list" data-testid="mf-charts-list">
            {selected ? (
              <>
                <button
                  type="button"
                  className="mf-charts-list-back"
                  data-testid="mf-charts-back-categories"
                  onClick={() => onSelectCategory(null)}
                >
                  <ChevronLeft size={15} />
                  {t('minhasfinancas.chart_categories_label')}
                </button>
                <div className="mf-charts-list-head">
                  <h3>{selected.name}</h3>
                  <span>{t('minhasfinancas.chart_accounts_count', { count: accountRows.length })}</span>
                </div>
                <p className="mf-charts-list-total">
                  {t('minhasfinancas.chart_total')}:{' '}
                  <b>{showValues ? formatMoney(selected.value, currency) : '•••'}</b>
                </p>
                <div className="mf-charts-rows">
                  {accountRows.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className="mf-charts-row mf-charts-account-row"
                      data-testid={`mf-charts-account-${item.id}`}
                      onClick={() => onSelectAccount(item.account ?? item)}
                    >
                      <MFAccountIcon account={item.account ?? item} size={26} />
                      <span className="mf-charts-row-meta">
                        <span className="mf-charts-row-name">{item.name}</span>
                        <span className="mf-charts-row-sub">
                          {accountTypeLabel(item.account?.account_type)} ·{' '}
                          {item.account?.currency ?? currency}
                        </span>
                      </span>
                      <span className="mf-charts-row-value">
                        {showValues ? formatMoney(item.value, currency) : '•••'}
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </div>
                <p className="mf-charts-hint">{t('minhasfinancas.chart_click_account')}</p>
              </>
            ) : (
              <>
                <div className="mf-charts-list-head">
                  <h3>{t('minhasfinancas.chart_categories_label')}</h3>
                  <span>{t('minhasfinancas.chart_categories_count', { count: visible.length })}</span>
                </div>
                <div className="mf-charts-rows">
                  {visible.map((group, index) => (
                    <button
                      type="button"
                      key={group.key}
                      className="mf-charts-row"
                      data-testid={`mf-charts-category-${group.key}`}
                      onClick={() => onSelectCategory(group.key)}
                    >
                      <GroupIcon group={{ ...group, color: colorFor(group, index) }} />
                      <span className="mf-charts-row-meta">
                        <span className="mf-charts-row-name">{group.name}</span>
                        <span className="mf-charts-row-sub">
                          {badgesOn
                            ? t('minhasfinancas.chart_accounts_count', { count: group.count })
                            : null}
                          {badgesOn && percentOn ? ' · ' : null}
                          {percentOn ? `${percentOf(group.value)}%` : null}
                        </span>
                      </span>
                      <span className="mf-charts-row-value">
                        {showValues ? formatMoney(group.value, currency) : '•••'}
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </div>
                <p className="mf-charts-hint">{t('minhasfinancas.chart_click_category')}</p>
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
