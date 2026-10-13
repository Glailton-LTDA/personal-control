import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Save, FileDown, FileSpreadsheet, X, RotateCcw, Table2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import {
  useMFReportData,
  useMFAccounts,
  useMFCategories,
  useMFTags,
  useMFSavedReports,
  useCreateMFSavedReport,
  useDeleteMFSavedReport,
  shiftMonth,
  formatMoney,
  currentMonthKey,
} from '../../hooks/useMinhasFinancas';
import MFCurrencySelect from './MFCurrencySelect';
import {
  filterReportRows,
  reportKpis,
  reportMonthlySeries,
  reportCategoryRanking,
  previousPeriod,
  buildCsv,
  downloadText,
} from './mfReports';
import { exportReportPdf } from './mfReportPdf';
import { exportReportXls } from './mfReportXls';
import MFSelect from './MFSelect';

const FILTER_KEYS = ['from', 'to', 'type', 'category_id', 'account_id', 'tag_id', 'currency'];

const defaultFilters = () => ({
  from: shiftMonth(currentMonthKey(), -5),
  to: currentMonthKey(),
  type: 'ALL',
  category_id: '',
  account_id: '',
  tag_id: '',
  currency: 'BRL',
});

/**
 * Tela de Relatórios (Fase 6): filtros (período em meses, tipo, categoria
 * com filhos, conta, tag e moeda única), KPIs com comparação ao período
 * anterior, gráficos de evolução e ranking, filtros salvos e exportação
 * CSV/PDF.
 */
export default function MFRelatorios({ user, showValues = true }) {
  const { t } = useTranslation();
  const { data: reportData } = useMFReportData(user);
  const { data: accounts = [] } = useMFAccounts(user);
  const { data: categories = [] } = useMFCategories(user);
  const { data: tags = [] } = useMFTags(user);
  const { data: savedReports = [] } = useMFSavedReports(user);
  const createSaved = useCreateMFSavedReport();
  const deleteSaved = useDeleteMFSavedReport();

  const [filters, setFilters] = useState(defaultFilters);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');

  const currencyOptions = useMemo(
    () => [...new Set(accounts.map((acc) => acc.currency || 'BRL'))],
    [accounts]
  );
  useEffect(() => {
    if (currencyOptions.length === 0) return;
    if (!currencyOptions.includes(filters.currency)) {
      setFilters((prev) => ({
        ...prev,
        currency: currencyOptions.includes('BRL') ? 'BRL' : currencyOptions[0],
      }));
    }
  }, [currencyOptions, filters.currency]);

  const accountsById = useMemo(
    () => Object.fromEntries(accounts.map((acc) => [acc.id, acc])),
    [accounts]
  );
  const categoriesById = useMemo(
    () => Object.fromEntries(categories.map((cat) => [cat.id, cat])),
    [categories]
  );
  const categoryOptions = useMemo(() => {
    const parents = categories.filter((cat) => !cat.parent_id);
    const list = [];
    parents.forEach((parent) => {
      list.push(parent);
      categories
        .filter((cat) => cat.parent_id === parent.id)
        .forEach((child) => list.push(child));
    });
    return list;
  }, [categories]);

  const transactions = useMemo(() => reportData?.transactions ?? [], [reportData]);
  const tagIdsByTx = useMemo(() => reportData?.tagIdsByTx ?? {}, [reportData]);

  const set = (field) => (event) =>
    setFilters((prev) => ({ ...prev, [field]: event.target.value }));

  const rows = useMemo(
    () =>
      filterReportRows({
        transactions,
        tagIdsByTx,
        accountsById,
        categoriesById,
        filters,
      }),
    [transactions, tagIdsByTx, accountsById, categoriesById, filters]
  );

  const kpis = useMemo(() => reportKpis(rows), [rows]);
  const series = useMemo(
    () => reportMonthlySeries(rows, filters.from, filters.to),
    [rows, filters.from, filters.to]
  );
  const ranking = useMemo(
    () => reportCategoryRanking(rows, categoriesById),
    [rows, categoriesById]
  );
  const prevKpis = useMemo(() => {
    const prev = previousPeriod(filters.from, filters.to);
    return reportKpis(
      filterReportRows({
        transactions,
        tagIdsByTx,
        accountsById,
        categoriesById,
        filters: { ...filters, from: prev.from, to: prev.to },
      })
    );
  }, [transactions, tagIdsByTx, accountsById, categoriesById, filters]);

  const variation = (current, previous) =>
    previous ? Math.round(((current - previous) / Math.abs(previous)) * 100) : null;

  const money = (value) => (showValues ? formatMoney(value, filters.currency) : '•••');

  const displayRanking = ranking.map((item) => ({
    ...item,
    name: item.name ?? t('minhasfinancas.report_untitled'),
  }));

  const exportHeaders = [
    t('minhasfinancas.report_th_date'),
    t('minhasfinancas.report_th_description'),
    t('minhasfinancas.report_type'),
    t('minhasfinancas.report_th_category'),
    t('minhasfinancas.report_th_account'),
    t('minhasfinancas.report_th_amount'),
    t('minhasfinancas.status'),
  ];

  const pdfRows = rows.map((tx) => [
    tx.payment_date,
    tx.description,
    tx.type,
    tx.category_id ? categoriesById[tx.category_id]?.name ?? '' : '',
    accountsById[tx.account_id]?.name ?? '',
    (Number(tx.amount) || 0).toFixed(2).replace('.', ','),
    tx.status,
  ]);

  // XLS: mesmo detalhe, mas com o valor como NÚMERO (célula numérica).
  const xlsRows = rows.map((tx) => [
    tx.payment_date,
    tx.description,
    tx.type,
    tx.category_id ? categoriesById[tx.category_id]?.name ?? '' : '',
    accountsById[tx.account_id]?.name ?? '',
    Number(tx.amount) || 0,
    tx.status,
  ]);

  const handleSaveFilter = async () => {
    const name = saveName.trim();
    if (!name) {
      toast.error(t('minhasfinancas.cfg_name_required'));
      return;
    }
    try {
      await createSaved.mutateAsync({
        user_id: user.id,
        name,
        filters: Object.fromEntries(FILTER_KEYS.map((key) => [key, filters[key]])),
      });
      toast.success(t('minhasfinancas.report_saved'));
      setSaveName('');
      setShowSave(false);
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const applySaved = (report) => {
    const saved = report.filters ?? {};
    setFilters((prev) => {
      const next = { ...prev };
      FILTER_KEYS.forEach((key) => {
        if (saved[key] != null) next[key] = saved[key];
      });
      return next;
    });
  };

  const handleDeleteSaved = (report) => {
    confirmToast(
      t('minhasfinancas.report_delete_confirm'),
      async () => {
        try {
          await deleteSaved.mutateAsync(report.id);
          toast.success(t('minhasfinancas.report_deleted'));
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.delete') }
    );
  };

  const handleCsv = () => {
    const content = buildCsv(rows, { accountsById, categoriesById }, exportHeaders);
    downloadText(content, `relatorio_${filters.from}_${filters.to}.csv`);
    toast.success(t('minhasfinancas.report_exported'));
  };

  const handleXls = () => {
    exportReportXls(
      {
        title: t('minhasfinancas.report_title'),
        summaryName: t('nav.sub.minhasfinancas.resumo'),
        detailName: t('nav.sub.minhasfinancas.transactions'),
        kpis: [
          [t('minhasfinancas.report_period'), `${filters.from} – ${filters.to}`],
          [t('minhasfinancas.report_kpi_income'), money(kpis.income)],
          [t('minhasfinancas.report_kpi_expense'), money(kpis.expense)],
          [t('minhasfinancas.report_kpi_balance'), money(kpis.balance)],
          [t('minhasfinancas.report_kpi_count'), String(kpis.count)],
          ...(kpis.savingRate != null
            ? [[t('minhasfinancas.report_kpi_saving'), `${kpis.savingRate}%`]]
            : []),
        ],
        headers: exportHeaders,
        rows: xlsRows,
      },
      `relatorio_${filters.from}_${filters.to}.xls`
    );
    toast.success(t('minhasfinancas.report_exported'));
  };

  const handlePdf = () => {
    exportReportPdf({
      title: t('minhasfinancas.report_title'),
      subtitle: `${filters.from} – ${filters.to}`,
      kpis: {
        summary: `${t('minhasfinancas.report_kpi_income')}: ${money(kpis.income)} · ${t(
          'minhasfinancas.report_kpi_expense'
        )}: ${money(kpis.expense)} · ${t('minhasfinancas.report_kpi_balance')}: ${money(
          kpis.balance
        )}`,
      },
      headers: exportHeaders,
      rows: pdfRows,
    });
    toast.success(t('minhasfinancas.report_exported'));
  };

  const kpiCards = [
    {
      key: 'income',
      label: t('minhasfinancas.report_kpi_income'),
      value: kpis.income,
      color: '#10b981',
      variation: variation(kpis.income, prevKpis.income),
    },
    {
      key: 'expense',
      label: t('minhasfinancas.report_kpi_expense'),
      value: kpis.expense,
      color: '#ef4444',
      variation: variation(kpis.expense, prevKpis.expense),
    },
    {
      key: 'balance',
      label: t('minhasfinancas.report_kpi_balance'),
      value: kpis.balance,
      color: 'var(--primary)',
      variation: variation(kpis.balance, prevKpis.balance),
    },
  ];

  return (
    <div data-testid="mf-relatorios" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
            <BarChart3 size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
              {t('nav.sub.minhasfinancas.reports')}
            </h2>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.reports_desc')}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-secondary"
            data-testid="mf-report-csv"
            onClick={handleCsv}
            style={{ padding: '0.6rem 0.9rem', fontSize: '0.8rem' }}
          >
            <FileSpreadsheet size={15} />
            {t('minhasfinancas.report_csv')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            data-testid="mf-report-xls"
            onClick={handleXls}
            style={{ padding: '0.6rem 0.9rem', fontSize: '0.8rem' }}
          >
            <Table2 size={15} />
            {t('minhasfinancas.report_xls')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            data-testid="mf-report-pdf"
            onClick={handlePdf}
            style={{ padding: '0.6rem 0.9rem', fontSize: '0.8rem' }}
          >
            <FileDown size={15} />
            {t('minhasfinancas.report_pdf')}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-report-save"
            onClick={() => setShowSave((prev) => !prev)}
            style={{ padding: '0.6rem 0.9rem', fontSize: '0.8rem' }}
          >
            <Save size={15} />
            {t('minhasfinancas.report_save')}
          </button>
        </div>
      </div>

      {/* Salvar filtro */}
      {showSave && (
        <div
          className="glass-card"
          data-testid="mf-report-save-form"
          style={{ padding: '0.9rem 1.25rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}
        >
          <input
            type="text"
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
            placeholder={t('minhasfinancas.report_save_name')}
            data-testid="mf-report-save-name"
            style={{ flex: 1, minWidth: 200 }}
          />
          <button
            type="button"
            className="btn-primary"
            data-testid="mf-report-save-confirm"
            onClick={handleSaveFilter}
            style={{ padding: '0.55rem 0.9rem', fontSize: '0.8rem' }}
          >
            {t('minhasfinancas.save')}
          </button>
        </div>
      )}

      {/* Filtros salvos */}
      {savedReports.length > 0 && (
        <div
          className="glass-card"
          data-testid="mf-report-saved-list"
          style={{ padding: '0.8rem 1.25rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}
        >
          <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {t('minhasfinancas.report_saved_list')}
          </span>
          {savedReports.map((report) => (
            <span
              key={report.id}
              data-testid="mf-report-saved-chip"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                border: '1px solid var(--glass-border)',
                borderRadius: 999,
                padding: '0.2rem 0.45rem 0.2rem 0.7rem',
              }}
            >
              <button
                type="button"
                onClick={() => applySaved(report)}
                data-testid={`mf-report-apply-${report.id}`}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit' }}
              >
                {report.name}
              </button>
              <button
                type="button"
                aria-label={t('minhasfinancas.delete')}
                data-testid={`mf-report-del-${report.id}`}
                onClick={() => handleDeleteSaved(report)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex' }}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div
        className="glass-card"
        style={{
          padding: '1rem 1.25rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '0.75rem',
          alignItems: 'end',
        }}
      >
        <div className="input-group" style={{ margin: 0 }}>
          <label>{t('minhasfinancas.report_from')}</label>
          <input type="month" value={filters.from} onChange={set('from')} data-testid="mf-report-from" />
        </div>
        <div className="input-group" style={{ margin: 0 }}>
          <label>{t('minhasfinancas.report_to')}</label>
          <input type="month" value={filters.to} onChange={set('to')} data-testid="mf-report-to" />
        </div>
        <div className="input-group" style={{ margin: 0 }}>
          <label>{t('minhasfinancas.report_type')}</label>
          <MFSelect
            testId="mf-report-type"
            value={filters.type}
            onChange={(next) => set('type')({ target: { value: next } })}
            searchable={false}
            options={[
              { value: 'ALL', label: t('minhasfinancas.report_type_all') },
              { value: 'RECEITA', label: t('minhasfinancas.report_type_income') },
              { value: 'DESPESA', label: t('minhasfinancas.report_type_expense') },
            ]}
          />
        </div>
        <div className="input-group" style={{ margin: 0 }}>
          <label>{t('minhasfinancas.report_category')}</label>
          <MFSelect
            testId="mf-report-category"
            value={filters.category_id}
            onChange={(next) => set('category_id')({ target: { value: next } })}
            placeholder={t('minhasfinancas.report_any')}
            options={[
              { value: '', label: t('minhasfinancas.report_any') },
              ...categoryOptions.map((cat) => ({
                value: cat.id,
                label: cat.parent_id ? `└ ${cat.name}` : cat.name,
              })),
            ]}
          />
        </div>
        <div className="input-group" style={{ margin: 0 }}>
          <label>{t('minhasfinancas.report_account')}</label>
          <MFSelect
            testId="mf-report-account"
            value={filters.account_id}
            onChange={(next) => set('account_id')({ target: { value: next } })}
            placeholder={t('minhasfinancas.report_any')}
            options={[
              { value: '', label: t('minhasfinancas.report_any') },
              ...accounts.map((acc) => ({
                value: acc.id,
                label: acc.name,
                meta: `(${acc.currency || 'BRL'})`,
                color: acc.color,
              })),
            ]}
          />
        </div>
        <div className="input-group" style={{ margin: 0 }}>
          <label>{t('minhasfinancas.report_tag')}</label>
          <MFSelect
            testId="mf-report-tag"
            value={filters.tag_id}
            onChange={(next) => set('tag_id')({ target: { value: next } })}
            placeholder={t('minhasfinancas.report_any')}
            options={[
              { value: '', label: t('minhasfinancas.report_any') },
              ...tags.map((tag) => ({ value: tag.id, label: `# ${tag.name}` })),
            ]}
          />
        </div>
        <div className="input-group" style={{ margin: 0 }}>
          <label>{t('minhasfinancas.currency_label')}</label>
          <MFCurrencySelect
            value={filters.currency}
            onChange={(value) => setFilters((prev) => ({ ...prev, currency: value }))}
            currencies={currencyOptions}
            includeAll={false}
            testId="mf-report-currency"
          />
        </div>
        <button
          type="button"
          className="btn-cancel"
          data-testid="mf-report-clear"
          onClick={() => setFilters(defaultFilters())}
          style={{ fontSize: '0.8rem', padding: '0.6rem' }}
        >
          <RotateCcw size={14} />
          {t('minhasfinancas.report_clear')}
        </button>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '1rem',
        }}
      >
        {kpiCards.map((card) => (
          <div
            key={card.key}
            className="glass-card"
            data-testid={`mf-report-kpi-${card.key}`}
            style={{ padding: '1.1rem 1.25rem' }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
              {card.label}
            </span>
            <p data-testid={`mf-report-kpi-value-${card.key}`} style={{ margin: '0.35rem 0 0', fontSize: '1.45rem', fontWeight: 800, color: card.color }}>
              {money(card.value)}
            </p>
            {card.variation !== null && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {card.variation > 0 ? '+' : ''}
                {card.variation}% {t('minhasfinancas.report_vs_prev')}
              </span>
            )}
          </div>
        ))}
        <div className="glass-card" data-testid="mf-report-kpi-saving" style={{ padding: '1.1rem 1.25rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
            {t('minhasfinancas.report_kpi_saving')}
          </span>
          <p data-testid="mf-report-kpi-saving-value" style={{ margin: '0.35rem 0 0', fontSize: '1.45rem', fontWeight: 800, color: '#06b6d4' }}>
            {kpis.savingRate !== null ? `${kpis.savingRate}%` : '—'}
          </p>
          <span data-testid="mf-report-count" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {kpis.count} {t('minhasfinancas.report_count')}
          </span>
        </div>
      </div>

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <div className="glass-card" data-testid="mf-report-evolution" style={{ padding: '1.1rem 1.25rem' }}>
          <strong style={{ fontSize: '0.9rem' }}>{t('minhasfinancas.report_evolution')}</strong>
          <div style={{ height: 240, marginTop: '0.75rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} />
                <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => formatMoney(Number(value) || 0, filters.currency)} />
                <Bar
                  dataKey="income"
                  name={t('minhasfinancas.report_kpi_income')}
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="expense"
                  name={t('minhasfinancas.report_kpi_expense')}
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="glass-card" data-testid="mf-report-ranking" style={{ padding: '1.1rem 1.25rem' }}>
          <strong style={{ fontSize: '0.9rem' }}>{t('minhasfinancas.report_ranking')}</strong>
          <div style={{ height: 240, marginTop: '0.75rem' }} data-testid="mf-report-ranking-body">
            {displayRanking.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2rem 0', textAlign: 'center' }}>
                {t('minhasfinancas.report_no_results')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={displayRanking}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" horizontal={false} />
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip formatter={(value) => formatMoney(Number(value) || 0, filters.currency)} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {displayRanking.map((item) => (
                      <Cell key={item.id} fill={item.color || '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="glass-card" style={{ padding: '1.1rem 1.25rem' }}>
        <strong style={{ fontSize: '0.9rem' }}>
          {kpis.count} {t('minhasfinancas.report_count')}
        </strong>
        {rows.length === 0 ? (
          <p data-testid="mf-report-empty" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '1rem 0 0' }}>
            {t('minhasfinancas.report_no_results')}
          </p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr>
                  {exportHeaders.map((header) => (
                    <th
                      key={header}
                      style={{
                        padding: '0.5rem 0.5rem',
                        textAlign: 'left',
                        fontSize: '0.68rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--text-muted)',
                        borderBottom: '1px solid var(--glass-border)',
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((tx) => (
                  <tr key={tx.id} data-testid="mf-report-row" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '0.5rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{tx.payment_date}</td>
                    <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{tx.description}</td>
                    <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tx.type}</td>
                    <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                      {tx.category_id ? categoriesById[tx.category_id]?.name ?? '—' : '—'}
                    </td>
                    <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                      {accountsById[tx.account_id]?.name ?? '—'}
                    </td>
                    <td
                      data-testid="mf-report-row-amount"
                      style={{
                        padding: '0.5rem',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        textAlign: 'right',
                        color: tx.type === 'RECEITA' ? '#10b981' : '#ef4444',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {showValues ? formatMoney(Number(tx.amount) || 0, filters.currency) : '•••'}
                    </td>
                    <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tx.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
