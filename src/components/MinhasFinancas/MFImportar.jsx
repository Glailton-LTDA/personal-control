import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X, Check, FileText, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import MFSelect from './MFSelect';
import {
  useMFAccounts,
  useMFCategories,
  useMFAllTransactions,
  useMFImportBatches,
  useRunMFImport,
  currentMonthKey,
  monthBounds,
  formatMoney,
} from '../../hooks/useMinhasFinancas';
import { buildCsv, downloadText } from './mfReports';
import {
  parseOfx,
  parseCsv,
  guessCsvMapping,
  mapCsvRows,
  suggestMatches,
  readTextFile,
} from './mfImportParse';

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
};

/**
 * Tela de Importação (Fase 7): upload de extrato OFX/CSV → mapeamento
 * de colunas (CSV) → sugestão de conciliação por valor + data (±3 dias)
 * + descrição → revisão linha a linha → gravação em lote (lote + linhas
 * + lançamentos, tudo rastreável em mf_import_batches/mf_import_rows).
 */
export default function MFImportar({ user, showValues = true }) {
  const { t } = useTranslation();
  const { data: accounts = [] } = useMFAccounts(user);
  const { data: batches = [] } = useMFImportBatches(user);
  const runImport = useRunMFImport();

  const [accountId, setAccountId] = useState('');
  const [fileName, setFileName] = useState(null);
  const [format, setFormat] = useState(null); // 'OFX' | 'CSV'
  const [ofxRows, setOfxRows] = useState([]);
  const [csvCells, setCsvCells] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({ date: -1, description: -1, amount: -1, type: -1 });
  const [invert, setInvert] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [decisions, setDecisions] = useState({});

  // Só a conta de destino entra na comparação de duplicidade — antes a
  // tela baixava a tabela inteira de lançamentos.
  const { data: allTransactions = [] } = useMFAllTransactions(user, accountId || null);

  // --- Exportar CSV: período (padrão = mês atual) + filtros ---
  const { data: categories = [] } = useMFCategories(user);
  const monthNow = monthBounds(currentMonthKey());
  const [exportFrom, setExportFrom] = useState(monthNow.start);
  const [exportTo, setExportTo] = useState(monthNow.end);
  const [exportAccountId, setExportAccountId] = useState('');
  const [exportType, setExportType] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const exportRange = useMemo(
    () => (exportFrom && exportTo ? { from: exportFrom, to: exportTo } : null),
    [exportFrom, exportTo]
  );
  const { data: exportTxs = [] } = useMFAllTransactions(
    user,
    exportAccountId || null,
    exportRange
  );
  const exportRows = useMemo(
    () =>
      (exportTxs ?? []).filter((tx) => {
        if (tx.status === 'CANCELADO') return false;
        if (
          exportRange &&
          (tx.payment_date < exportRange.from || tx.payment_date > exportRange.to)
        ) {
          return false;
        }
        if (exportType && tx.type !== exportType) return false;
        if (exportStatus && tx.status !== exportStatus) return false;
        return true;
      }),
    [exportTxs, exportRange, exportType, exportStatus]
  );

  const exportCsv = () => {
    if (exportRows.length === 0) {
      toast.error(t('minhasfinancas.export_empty'));
      return;
    }
    const accountsById = Object.fromEntries(
      (accounts ?? []).map((row) => [row.id, row])
    );
    const categoriesById = Object.fromEntries(
      (categories ?? []).map((row) => [row.id, row])
    );
    downloadText(
      buildCsv(exportRows, { accountsById, categoriesById }),
      `lancamentos_${exportFrom}_${exportTo}.csv`
    );
    toast.success(
      t('minhasfinancas.export_done', { count: exportRows.length })
    );
  };

  // conta de destino: primeira por padrão
  useEffect(() => {
    if (!accountId && accounts.length > 0) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  const resetFile = () => {
    setFileName(null);
    setFormat(null);
    setOfxRows([]);
    setCsvCells([]);
    setHeaders([]);
    setMapping({ date: -1, description: -1, amount: -1, type: -1 });
    setInvert(false);
    setFileError(null);
  };

  const handleFile = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setFileError(null);
    try {
      const text = await readTextFile(file);
      const looksOfx = /\.ofx$/i.test(file.name) || /<STMTTRN/i.test(text);
      if (looksOfx) {
        const parsed = parseOfx(text);
        if (!parsed.ok) {
          resetFile();
          setFileError(t('minhasfinancas.import_bad_file'));
          input.value = '';
          return;
        }
        setFormat('OFX');
        setOfxRows(parsed.rows);
        setCsvCells([]);
        setHeaders([]);
        setFileName(file.name);
      } else {
        const parsed = parseCsv(text);
        if (!parsed.ok) {
          resetFile();
          setFileError(t('minhasfinancas.import_empty_file'));
          input.value = '';
          return;
        }
        setFormat('CSV');
        setHeaders(parsed.headers);
        setCsvCells(parsed.rows);
        setOfxRows([]);
        setMapping({ ...guessCsvMapping(parsed.headers) });
        setInvert(false);
        setFileName(file.name);
      }
    } catch {
      resetFile();
      setFileError(t('minhasfinancas.import_read_error'));
    }
    input.value = '';
  };

  const mappingReady =
    format === 'OFX' || (mapping.date >= 0 && mapping.amount >= 0);

  const preparedRows = useMemo(() => {
    if (format === 'OFX') return ofxRows;
    if (format === 'CSV' && mappingReady) {
      return mapCsvRows({ rows: csvCells, mapping, invertAmount: invert }).rows;
    }
    return [];
  }, [format, ofxRows, csvCells, mapping, invert, mappingReady]);

  const scopedTransactions = useMemo(
    () => (accountId ? allTransactions.filter((tx) => tx.account_id === accountId) : []),
    [allTransactions, accountId]
  );

  const suggestedRows = useMemo(
    () => suggestMatches(preparedRows, scopedTransactions),
    [preparedRows, scopedTransactions]
  );

  // decisão inicial: linha com sugestão começa como "Ignorar" (evita
  // duplicidade), sem sugestão começa como "Importar".
  // deps = assinatura string: os arrays derivados de `data = []` têm
  // identidade nova a cada render enquanto as queries carregam (senão,
  // setState → render → efeito → setState vira loop infinito).
  const rowsSignature = suggestedRows
    .map(
      (row, index) =>
        `${index}:${row.date}:${row.amount}:${row.type}:${row.suggestion?.id ?? ''}`
    )
    .join('|');

  useEffect(() => {
    const next = {};
    suggestedRows.forEach((row, index) => {
      next[index] = row.suggestion ? 'IGNORE' : 'IMPORT';
    });
    setDecisions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsSignature]);

  const importCount = suggestedRows.filter((row, index) => decisions[index] === 'IMPORT').length;
  const suggestionCount = suggestedRows.filter((row) => row.suggestion).length;
  const account = accounts.find((acc) => acc.id === accountId) ?? null;
  const currency = account?.currency || 'BRL';

  const toggleDecision = (index) => {
    setDecisions((prev) => ({
      ...prev,
      [index]: prev[index] === 'IMPORT' ? 'IGNORE' : 'IMPORT',
    }));
  };

  const handleRun = () => {
    if (!accountId) {
      toast.error(t('minhasfinancas.import_no_account'));
      return;
    }
    if (suggestedRows.length === 0) return;
    if (importCount === 0) {
      toast.error(t('minhasfinancas.import_nothing'));
      return;
    }
    confirmToast(
      t('minhasfinancas.import_run_confirm'),
      async () => {
        try {
          await runImport.mutateAsync({
            user,
            account_id: accountId,
            filename: fileName,
            format,
            rows: suggestedRows.map((row, index) => ({
              ...row,
              decision: decisions[index] ?? 'IMPORT',
            })),
          });
          toast.success(t('minhasfinancas.import_done'));
          resetFile();
          setDecisions({});
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { confirmText: t('minhasfinancas.confirm') }
    );
  };

  const setMappingField = (field) => (value) =>
    setMapping((prev) => ({ ...prev, [field]: Number(value) }));

  const columnOptions = [
    { value: -1, label: t('minhasfinancas.import_col_none') },
    ...headers.map((header, index) => ({ value: index, label: header })),
  ];

  return (
    <div data-testid="mf-importar" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
            <Upload size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
              {t('nav.sub.minhasfinancas.import')}
            </h2>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.import_desc')}
            </p>
          </div>
        </div>
      </div>

      {/* Exportar CSV */}
      <div
        className="glass-card"
        data-testid="mf-export"
        style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              padding: '0.5rem',
              borderRadius: 12,
              background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
              color: 'var(--primary)',
            }}
          >
            <Download size={18} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
              {t('minhasfinancas.export_title')}
            </h2>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.export_desc')}
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.75rem',
            alignItems: 'end',
          }}
        >
          <div className="input-group" style={{ margin: 0 }}>
            <label>{t('minhasfinancas.export_from')}</label>
            <input
              type="date"
              data-testid="mf-export-from"
              className="glass-input"
              value={exportFrom}
              onChange={(e) => setExportFrom(e.target.value)}
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-main)',
                padding: '0.65rem 0.8rem',
                borderRadius: 10,
              }}
            />
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <label>{t('minhasfinancas.export_to')}</label>
            <input
              type="date"
              data-testid="mf-export-to"
              className="glass-input"
              value={exportTo}
              onChange={(e) => setExportTo(e.target.value)}
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-main)',
                padding: '0.65rem 0.8rem',
                borderRadius: 10,
              }}
            />
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <label>{t('minhasfinancas.export_account')}</label>
            <MFSelect
              testId="mf-export-account"
              value={exportAccountId}
              onChange={setExportAccountId}
              searchable={false}
              options={[
                { value: '', label: t('minhasfinancas.export_all_accounts') },
                ...accounts.map((acc) => ({ value: acc.id, label: acc.name })),
              ]}
            />
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <label>{t('minhasfinancas.export_type')}</label>
            <MFSelect
              testId="mf-export-type"
              value={exportType}
              onChange={setExportType}
              searchable={false}
              options={[
                { value: '', label: t('minhasfinancas.export_all_types') },
                { value: 'DESPESA', label: t('minhasfinancas.export_type_expense') },
                { value: 'RECEITA', label: t('minhasfinancas.export_type_income') },
                {
                  value: 'TRANSFERENCIA',
                  label: t('minhasfinancas.export_type_transfer'),
                },
              ]}
            />
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <label>{t('minhasfinancas.export_status')}</label>
            <MFSelect
              testId="mf-export-status"
              value={exportStatus}
              onChange={setExportStatus}
              searchable={false}
              options={[
                { value: '', label: t('minhasfinancas.export_all_statuses') },
                { value: 'PAGO', label: t('minhasfinancas.export_status_paid') },
                {
                  value: 'PENDENTE',
                  label: t('minhasfinancas.export_status_pending'),
                },
              ]}
            />
          </div>
          <button
            type="button"
            data-testid="mf-export-csv"
            className="btn"
            onClick={exportCsv}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1rem',
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Download size={16} />
            {t('minhasfinancas.export_button')}
          </button>
        </div>

        <span
          data-testid="mf-export-count"
          style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}
        >
          {t('minhasfinancas.export_count', { count: exportRows.length })}
        </span>
      </div>

      {/* Conta + arquivo */}
      <div
        className="glass-card"
        style={{
          padding: '1rem 1.25rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '0.75rem',
          alignItems: 'end',
        }}
      >
        <div className="input-group" style={{ margin: 0 }}>
          <label>{t('minhasfinancas.import_account')}</label>
          <MFSelect
            testId="mf-import-account"
            value={accountId}
            onChange={(next) => setAccountId(next)}
            placeholder={t('minhasfinancas.import_account_hint')}
            options={[
              { value: '', label: t('minhasfinancas.import_account_hint') },
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
          <label>{t('minhasfinancas.import_file')}</label>
          <input
            type="file"
            accept=".ofx,.csv,.txt"
            onChange={handleFile}
            data-testid="mf-import-file"
          />
        </div>
        {fileName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              data-testid="mf-import-file-name"
              style={{
                fontSize: '0.78rem',
                fontWeight: 800,
                border: '1px solid var(--glass-border)',
                borderRadius: 999,
                padding: '0.25rem 0.7rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <FileText size={13} />
              {fileName} · {format}
            </span>
            <button
              type="button"
              className="icon-btn"
              data-testid="mf-import-clear"
              onClick={resetFile}
              aria-label={t('minhasfinancas.import_clear')}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {fileError && (
          <p
            data-testid="mf-import-error"
            style={{ margin: 0, fontSize: '0.82rem', color: '#ef4444' }}
          >
            {fileError}
          </p>
        )}
      </div>

      {/* Mapeamento de colunas (CSV) */}
      {format === 'CSV' && headers.length > 0 && (
        <div className="glass-card" data-testid="mf-import-mapping" style={{ padding: '1rem 1.25rem' }}>
          <strong style={{ fontSize: '0.9rem' }}>{t('minhasfinancas.import_mapping')}</strong>
          <p style={{ margin: '0.25rem 0 0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {t('minhasfinancas.import_mapping_hint')}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '0.75rem',
              alignItems: 'end',
            }}
          >
            <div className="input-group" style={{ margin: 0 }}>
              <label>{t('minhasfinancas.import_col_date')}</label>
              <MFSelect
                testId="mf-import-col-date"
                value={mapping.date}
                onChange={setMappingField('date')}
                searchable={headers.length > 7}
                placeholder={t('minhasfinancas.import_col_none')}
                options={columnOptions}
              />
            </div>
            <div className="input-group" style={{ margin: 0 }}>
              <label>{t('minhasfinancas.import_col_description')}</label>
              <MFSelect
                testId="mf-import-col-description"
                value={mapping.description}
                onChange={setMappingField('description')}
                searchable={headers.length > 7}
                placeholder={t('minhasfinancas.import_col_none')}
                options={columnOptions}
              />
            </div>
            <div className="input-group" style={{ margin: 0 }}>
              <label>{t('minhasfinancas.import_col_amount')}</label>
              <MFSelect
                testId="mf-import-col-amount"
                value={mapping.amount}
                onChange={setMappingField('amount')}
                searchable={headers.length > 7}
                placeholder={t('minhasfinancas.import_col_none')}
                options={columnOptions}
              />
            </div>
            <div className="input-group" style={{ margin: 0 }}>
              <label>{t('minhasfinancas.import_col_type')}</label>
              <MFSelect
                testId="mf-import-col-type"
                value={mapping.type}
                onChange={setMappingField('type')}
                searchable={headers.length > 7}
                placeholder={t('minhasfinancas.import_col_none')}
                options={columnOptions}
              />
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={invert}
                onChange={(event) => setInvert(event.target.checked)}
                data-testid="mf-import-invert"
              />
              {t('minhasfinancas.import_invert')}
            </label>
          </div>
        </div>
      )}

      {/* Linhas + conciliação */}
      <div className="glass-card" style={{ padding: '1.1rem 1.25rem' }}>
        {!fileName ? (
          <p
            data-testid="mf-import-empty"
            style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}
          >
            {t('minhasfinancas.import_select_hint')}
          </p>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.75rem',
                flexWrap: 'wrap',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <strong style={{ fontSize: '0.9rem' }}>{t('minhasfinancas.import_rows')}</strong>
              <span
                data-testid="mf-import-summary"
                style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}
              >
                {suggestedRows.length} {t('minhasfinancas.import_line_word')} · {importCount}{' '}
                {t('minhasfinancas.import_to_import')} · {suggestionCount}{' '}
                {t('minhasfinancas.import_with_suggestions')}
              </span>
            </div>

            {!mappingReady ? (
              <p
                data-testid="mf-import-mapping-warning"
                style={{ margin: 0, fontSize: '0.82rem', color: '#f59e0b' }}
              >
                {t('minhasfinancas.import_mapping_required')}
              </p>
            ) : suggestedRows.length === 0 ? (
              <p
                data-testid="mf-import-no-rows"
                style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}
              >
                {t('minhasfinancas.import_empty_file')}
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {suggestedRows.map((row, index) => {
                    const decision = decisions[index] ?? 'IMPORT';
                    const isImport = decision === 'IMPORT';
                    return (
                      <div
                        key={`${row.date}-${row.description}-${index}`}
                        data-testid="mf-import-row"
                        style={{
                          display: 'flex',
                          gap: '0.75rem',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          border: '1px solid var(--glass-border)',
                          borderLeft: `3px solid ${isImport ? '#10b981' : 'var(--glass-border)'}`,
                          borderRadius: 10,
                          padding: '0.5rem 0.75rem',
                        }}
                      >
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {fmtDate(row.date)}
                        </span>
                        <span style={{ flex: 1, minWidth: 140, fontSize: '0.85rem' }}>
                          {row.description}
                        </span>
                        <span
                          data-testid="mf-import-row-amount"
                          style={{
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            color: row.type === 'RECEITA' ? '#10b981' : '#ef4444',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {showValues ? formatMoney(row.amount, currency) : '•••'}
                        </span>
                        {row.suggestion && (
                          <span
                            data-testid="mf-import-suggestion"
                            style={{
                              fontSize: '0.7rem',
                              color: '#f59e0b',
                              border: '1px solid color-mix(in srgb, #f59e0b 40%, transparent)',
                              background: 'color-mix(in srgb, #f59e0b 10%, transparent)',
                              borderRadius: 999,
                              padding: '0.1rem 0.55rem',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {t('minhasfinancas.import_already')} · {row.suggestion.description}{' '}
                            ({fmtDate(row.suggestion.payment_date)})
                          </span>
                        )}
                        <button
                          type="button"
                          data-testid={`mf-import-decision-${index}`}
                          onClick={() => toggleDecision(index)}
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '0.25rem 0.7rem',
                            borderRadius: 999,
                            cursor: 'pointer',
                            border: isImport
                              ? '1px solid color-mix(in srgb, #10b981 50%, transparent)'
                              : '1px solid var(--glass-border)',
                            background: isImport
                              ? 'color-mix(in srgb, #10b981 14%, transparent)'
                              : 'transparent',
                            color: isImport ? '#10b981' : 'var(--text-muted)',
                          }}
                        >
                          {isImport
                            ? t('minhasfinancas.import_decision_import')
                            : t('minhasfinancas.import_decision_ignore')}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.9rem' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    data-testid="mf-import-run"
                    onClick={handleRun}
                    disabled={runImport.isPending}
                    style={{ fontSize: '0.85rem', padding: '0.6rem 1rem' }}
                  >
                    <Check size={15} />
                    {t('minhasfinancas.import_run')}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Histórico */}
      <div className="glass-card" style={{ padding: '1.1rem 1.25rem' }}>
        <strong style={{ fontSize: '0.9rem' }}>{t('minhasfinancas.import_history')}</strong>
        {batches.length === 0 ? (
          <p
            data-testid="mf-import-history-empty"
            style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}
          >
            {t('minhasfinancas.import_history_empty')}
          </p>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              marginTop: '0.6rem',
            }}
          >
            {batches.map((batch) => (
              <div
                key={batch.id}
                data-testid="mf-import-batch"
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  fontSize: '0.82rem',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 10,
                  padding: '0.45rem 0.75rem',
                }}
              >
                <strong>{batch.filename}</strong>
                <span style={{ color: 'var(--text-muted)' }}>
                  {batch.total_rows} {t('minhasfinancas.import_line_word')}
                </span>
                <span
                  data-testid="mf-import-batch-status"
                  style={{
                    marginLeft: 'auto',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color:
                      batch.status === 'COMPLETED'
                        ? '#10b981'
                        : batch.status === 'CANCELLED'
                          ? '#ef4444'
                          : '#f59e0b',
                  }}
                >
                  {t(`minhasfinancas.import_batch_status_${batch.status}`)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
