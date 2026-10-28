import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import {
  useMFAccounts,
  useMFTagTransactions,
  formatMoney,
} from '../../hooks/useMinhasFinancas';

const PAGE_SIZE = 20;

const fmtDate = (iso) =>
  iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';

/**
 * Lançamentos de uma tag em modal paginado (20 por página, busca por
 * descrição no servidor). Antes o drill abria a lista inteira dentro do
 * card de Ajustes — com histórico longo, ficava inviável.
 */
export default function MFTagTransactionsModal({ user, tag, onClose }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const { data: accounts = [] } = useMFAccounts(user);
  const { data, isLoading } = useMFTagTransactions(user, tag?.id, {
    search,
    page,
    pageSize: PAGE_SIZE,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const accountsById = useMemo(
    () => Object.fromEntries((accounts ?? []).map((row) => [row.id, row])),
    [accounts]
  );

  return createPortal(
    <div
      className="modal-overlay mf-tag-overlay"
      data-testid="mf-tag-tx-modal"
      onClick={onClose}
    >
      <div
        className="glass-card modal-content mf-tag-tx-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('minhasfinancas.tag_tx_title', { name: tag?.name ?? '' })}
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 560, padding: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            padding: '1.05rem 1.25rem 0.9rem',
            borderBottom: '1px solid var(--glass-border)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: tag?.color || 'var(--primary)',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                margin: 0,
                fontSize: '1.02rem',
                fontWeight: 800,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t('minhasfinancas.tag_tx_title', { name: tag?.name ?? '' })}
            </h3>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.tag_tx_count', { count: total })}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            data-testid="mf-tag-tx-close"
            aria-label={t('minhasfinancas.close')}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '0.85rem 1.25rem 0', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: 'var(--input-bg)',
              border: '1px solid var(--glass-border)',
              borderRadius: 10,
              padding: '0.45rem 0.65rem',
            }}
          >
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              data-testid="mf-tag-tx-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder={t('minhasfinancas.tag_tx_search')}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-main)',
                fontFamily: 'inherit',
                fontSize: '0.85rem',
              }}
            />
            {search !== '' && (
              <button
                type="button"
                className="icon-btn"
                data-testid="mf-tag-tx-search-clear"
                aria-label={t('minhasfinancas.search_clear')}
                onClick={() => {
                  setSearch('');
                  setPage(0);
                }}
                style={{ padding: '0.15rem' }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            padding: '0.5rem 1.25rem',
            overflowY: 'auto',
            maxHeight: '46vh',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.1rem',
          }}
        >
          {isLoading ? (
            <p style={{ margin: '0.5rem 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.loading')}
            </p>
          ) : rows.length === 0 ? (
            <p
              data-testid="mf-tag-tx-empty"
              style={{ margin: '0.5rem 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}
            >
              {t('minhasfinancas.tag_no_transactions')}
            </p>
          ) : (
            rows.map((row) => {
              const account = accountsById[row.account_id];
              const amount = Number(row.amount) || 0;
              const color =
                row.type === 'RECEITA'
                  ? 'var(--success)'
                  : row.type === 'DESPESA'
                    ? '#ef4444'
                    : 'var(--text-muted)';
              return (
                <div
                  key={row.id}
                  data-testid={`mf-tag-tx-row-${row.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.45rem 0.15rem',
                    borderBottom: '1px solid var(--glass-border)',
                    fontSize: '0.82rem',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {fmtDate(row.payment_date)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                      }}
                    >
                      {row.description || '—'}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {account?.name ?? ''}
                    </span>
                  </span>
                  <span
                    style={{
                      fontWeight: 800,
                      color,
                      whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatMoney(amount, account?.currency || 'BRL')}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div
          className="modal-footer"
          style={{
            padding: '0.8rem 1.25rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.6rem',
          }}
        >
          <button
            type="button"
            className="btn-cancel"
            data-testid="mf-tag-tx-prev"
            disabled={page <= 0}
            onClick={() => setPage((prev) => Math.max(0, prev - 1))}
            style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem' }}
          >
            <ChevronLeft size={14} />
            {t('minhasfinancas.tag_tx_prev')}
          </button>
          <span
            data-testid="mf-tag-tx-page"
            style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}
          >
            {t('minhasfinancas.tag_tx_page', { page: page + 1, pages })}
          </span>
          <button
            type="button"
            className="btn-cancel"
            data-testid="mf-tag-tx-next"
            disabled={page + 1 >= pages}
            onClick={() => setPage((prev) => Math.min(pages - 1, prev + 1))}
            style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem' }}
          >
            {t('minhasfinancas.tag_tx_next')}
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
