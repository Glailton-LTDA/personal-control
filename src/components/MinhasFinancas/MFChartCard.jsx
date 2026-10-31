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
import { ChevronDown, ChevronUp, Maximize2, MoreVertical, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MFGroupIcon from './MFGroupIcon';
import MFAccountIcon from './MFAccountIcon';
import { formatMoney } from '../../hooks/useMinhasFinancas';
import { chartPercent, chartTotal, limitChartLegend, CHART_COLORS } from './mfCharts';

const tooltipStyle = {
  background: 'var(--glass-bg, #1e293b)',
  border: '1px solid var(--glass-border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--text-main)',
};

const groupColor = (group, index) =>
  group.color || CHART_COLORS[index % CHART_COLORS.length];

function LegendIcon({ group }) {
  const isAccount = String(group.key || '').startsWith('account:');
  const account = group.accounts?.[0]?.account;
  if (isAccount && account) {
    return <MFAccountIcon account={account} size={22} />;
  }
  const color = group.color || 'var(--primary)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: 8,
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        flexShrink: 0,
      }}
    >
      <MFGroupIcon icon={group.icon} name={group.name} color={color} size={16} />
    </span>
  );
}

/**
 * Shell dos cards de gráfico do Resumo.
 *
 * Mesmo cabeçalho (seta, tela cheia e ⋮), limite de legenda 4 + "Outros N"
 * no resumo, lista completa no expandido, menu de opções client-side e
 * clique na categoria para abrir o drill-down.
 */
export default function MFChartCard({
  title,
  currency,
  groups = [],
  expanded = false,
  onToggle = () => {},
  onOpen = () => {},
  onSelectGroup = null,
  options = {},
  onOptionsChange = () => {},
  testId,
  kind = 'donut',
  flow = null,
  emptyTestId,
  emptyLabel,
  footerPrefix = '',
  showValues = true,
  compactHint = '',
}) {
  const { t } = useTranslation();
  const rootRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const visible = useMemo(
    () =>
      groups
        .filter((group) => Number(group.value) > 0)
        .sort((a, b) => b.value - a.value),
    [groups]
  );
  const total = chartTotal(visible);
  const legend = useMemo(() => {
    if (expanded) return { items: visible, other: null };
    return limitChartLegend(visible, 4, t('common.other'));
  }, [expanded, visible, t]);
  const empty = visible.length === 0 || total <= 0;
  const toggleOption = (key, value) =>
    onOptionsChange({ ...options, [key]: value });
  const percentOn = options.percent !== false;
  const badgesOn = options.badges === true;
  const percentOf = (group) => chartPercent(group.value, total);

  const renderIcon = (group, index) => (
    <LegendIcon group={{ ...group, color: groupColor(group, index) }} />
  );

  const renderLegendRow = (group, index, isOther = false) => {
    const clickable = !isOther && !!onSelectGroup;
    const content = (
      <>
        {renderIcon(group, index)}
        <span className="mf-chart-legend-meta">
          <span className="mf-chart-legend-name">{group.name}</span>
          <span className="mf-chart-legend-sub">
            {badgesOn && group.count > 0
              ? t('minhasfinancas.chart_accounts_count', { count: group.count })
              : null}
            {badgesOn && group.count > 0 && percentOn ? ' · ' : null}
            {percentOn ? `${percentOf(group)}%` : null}
          </span>
        </span>
        <span className="mf-chart-legend-value">
          {showValues ? formatMoney(group.value, currency) : '•••'}
        </span>
      </>
    );
    if (!clickable) {
      return (
        <div
          className="mf-chart-legend-row is-static"
          data-testid={`${testId}-legend-${group.key}`}
          key={group.key}
        >
          {content}
        </div>
      );
    }
    return (
      <button
        type="button"
        className="mf-chart-legend-row"
        data-testid={`${testId}-legend-${group.key}`}
        key={group.key}
        onClick={() => onSelectGroup(group)}
      >
        {content}
      </button>
    );
  };

  const compactPills = legend.other
    ? [...legend.items, { ...legend.other, isOther: true }]
    : legend.items;

  return (
    <div
      ref={rootRef}
      className={`glass-card mf-chart-card${expanded ? ' is-expanded' : ''}`}
      data-testid={testId}
      style={{ padding: '1.1rem 1.2rem', position: 'relative' }}
    >
      <div className="mf-chart-card-head">
        <h3 className="mf-chart-card-title">
          {title}
          {currency ? <span className="mf-chart-card-currency"> · {currency}</span> : null}
        </h3>
        <div className="mf-chart-card-actions">
          {kind !== 'flow' && (
            <button
              type="button"
              className="icon-btn"
              data-testid={`${testId}-toggle`}
              title={
                expanded
                  ? t('minhasfinancas.chart_legend_collapse')
                  : t('minhasfinancas.chart_legend_expand')
              }
              aria-label={
                expanded
                  ? t('minhasfinancas.chart_legend_collapse')
                  : t('minhasfinancas.chart_legend_expand')
              }
              aria-expanded={expanded}
              onClick={onToggle}
            >
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            data-testid={`${testId}-open`}
            title={t('minhasfinancas.chart_open_fullscreen')}
            aria-label={t('minhasfinancas.chart_open_fullscreen')}
            onClick={onOpen}
          >
            <Maximize2 size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            data-testid={`${testId}-menu-toggle`}
            title={t('minhasfinancas.chart_more_options')}
            aria-label={t('minhasfinancas.chart_more_options')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <div className="mf-chart-menu" data-testid={`${testId}-menu`}>
              {kind !== 'flow' && (
                <>
                  <button
                    type="button"
                    className="mf-chart-menu-item"
                    data-testid={`${testId}-opt-badges`}
                    onClick={() => toggleOption('badges', !badgesOn)}
                  >
                    <span className="mf-chart-menu-check">{badgesOn ? <Check size={13} /> : null}</span>
                    {t('minhasfinancas.chart_option_badges')}
                  </button>
                  <button
                    type="button"
                    className="mf-chart-menu-item"
                    data-testid={`${testId}-opt-percent`}
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
                data-testid={`${testId}-opt-ignored`}
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

      {kind === 'flow' ? (
        <div className="mf-chart-flow-wrap" style={{ height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={flow ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip
                formatter={(value) => formatMoney(value, currency)}
                contentStyle={tooltipStyle}
              />
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
      ) : empty ? (
        <p className="mf-chart-empty-line" data-testid={emptyTestId}>
          {emptyLabel ?? t('minhasfinancas.chart_no_data')}
        </p>
      ) : kind === 'bars' ? (
        <div className="mf-chart-bars-wrap" style={{ height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visible} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip
                formatter={(value) => formatMoney(value, currency)}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="value" fill="#6366f1" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {visible.map((group, index) => (
                  <Cell key={group.key} fill={groupColor(group, index)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mf-chart-donut-wrap">
          <div className="mf-chart-donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={visible}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={54}
                  outerRadius={80}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {visible.map((group, index) => (
                    <Cell key={group.key} fill={groupColor(group, index)} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => (showValues ? formatMoney(value, currency) : '•••')}
                  contentStyle={tooltipStyle}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mf-chart-donut-center">
              <strong>{showValues ? formatMoney(total, currency) : '•••'}</strong>
              <span>{t('minhasfinancas.chart_total')}</span>
            </div>
          </div>
        </div>
      )}

      {kind !== 'flow' && !empty && (
        <div className={expanded ? 'mf-chart-legend-list' : 'mf-chart-legend-pills'}>
          {expanded
            ? legend.items.map((group, index) => renderLegendRow(group, index))
            : compactPills.map((group, index) =>
                group.isOther ? (
                  <span
                    className="mf-chart-pill is-other"
                    data-testid={`${testId}-pill-other`}
                    key={group.key}
                  >
                    {group.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="mf-chart-pill"
                    data-testid={`${testId}-pill-${group.key}`}
                    key={group.key}
                    onClick={onSelectGroup ? () => onSelectGroup(group) : undefined}
                  >
                    {renderIcon(group, index)}
                    <b>{group.name}</b>
                  </button>
                )
              )}
        </div>
      )}

      <div className="mf-chart-card-foot">
        <span>
          {footerPrefix ||
            t('minhasfinancas.chart_categories_count', { count: visible.length })}
          {!expanded && compactHint ? ` · ${compactHint}` : ''}
        </span>
        {kind !== 'flow' && (visible.length > 4 || expanded) && (
          <button type="button" className="mf-chart-foot-link" onClick={onToggle}>
            {expanded
              ? t('minhasfinancas.chart_legend_collapse')
              : t('minhasfinancas.chart_legend_all', { count: visible.length })}
          </button>
        )}
      </div>
    </div>
  );
}
