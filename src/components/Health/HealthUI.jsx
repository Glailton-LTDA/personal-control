import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import {
  useHealthDetail,
  useHealthList,
  useHealthSearch,
} from '../../hooks/useHealth';

export function HealthModal({ title, children, onClose }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('button, input, select, textarea')?.focus();
    const listener = (event) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const items = [
        ...ref.current.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], iframe',
        ),
      ].filter((el) => el.getClientRects().length);
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div className="health-overlay">
      <section
        ref={ref}
        className="health-modal glass-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="health-modal-title"
      >
        <header className="health-row">
          <h2 id="health-modal-title">{title}</h2>
          <button
            type="button"
            className="health-icon"
            onClick={onClose}
            aria-label={t('health.close')}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}

export function HealthLoading() {
  const { t } = useTranslation();
  return (
    <div className="health-empty" role="status">
      <Loader2 className="health-spin" size={24} />
      {t('health.loading')}
    </div>
  );
}
export function HealthError({ query }) {
  const { t } = useTranslation();
  return (
    <div className="health-empty" role="alert">
      <p>{t('health.error')}</p>
      <button className="btn-secondary" onClick={() => query.refetch()}>
        {t('health.retry')}
      </button>
    </div>
  );
}
export function HealthEmpty() {
  const { t } = useTranslation();
  return (
    <div className="health-empty">
      <h3>{t('health.empty')}</h3>
      <p>{t('health.empty_hint')}</p>
    </div>
  );
}
export function HealthPagination({ page, hasNext, onPage }) {
  const { t } = useTranslation();
  if (!page && !hasNext) return null;
  return (
    <nav
      className="health-pagination"
      aria-label={t('health.page', { page: page + 1 })}
    >
      <button
        className="btn-secondary"
        disabled={!page}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft size={16} />
        {t('health.previous')}
      </button>
      <span>{t('health.page', { page: page + 1 })}</span>
      <button
        className="btn-secondary"
        disabled={!hasNext}
        onClick={() => onPage(page + 1)}
      >
        {t('health.next')}
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}
export function HealthReturnBadge() {
  const { t } = useTranslation();
  return <span className="health-return-badge">{t('health.follow_up_badge')}</span>;
}

export function HealthStatus({ status }) {
  const { t } = useTranslation();
  return (
    <span className={`health-status health-status-${status}`}>
      {t(`health.status_${status}`)}
    </span>
  );
}
export function HealthDate({ value, dateOnly = false }) {
  const { t, i18n } = useTranslation();
  if (!value) return <span>{t('health.no_date')}</span>;
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (!Number.isFinite(date.getTime()))
    return <span>{t('health.no_date')}</span>;
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(
        i18n.language,
        dateOnly
          ? { dateStyle: 'medium' }
          : { dateStyle: 'medium', timeStyle: 'short' },
      ).format(date)}
    </time>
  );
}

// Search and page the link options instead of downloading every medical record.
export function HealthLinkSelect({ userId, kind, field, value, onChange }) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [page, setPage] = useState(0);
  const search = useHealthSearch(input);
  const query = useHealthList(userId, kind, { search, page });
  const selected = useHealthDetail(userId, kind, value);
  const rows = query.data?.rows || [];
  const options =
    value && selected.data && !rows.some((row) => row.id === value)
      ? [selected.data, ...rows]
      : rows;
  return (
    <fieldset className="health-link-select">
      <legend>{t(`health.${field}`)}</legend>
      <input
        aria-label={t('health.find_link')}
        value={input}
        maxLength={120}
        onChange={(e) => {
          setInput(e.target.value);
          setPage(0);
        }}
        placeholder={t('health.search')}
      />
      <select
        aria-label={t(`health.${field}`)}
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{t('health.none')}</option>
        {options.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      {query.isError && <HealthError query={query} />}
      <HealthPagination
        page={page}
        hasNext={query.data?.hasNext}
        onPage={setPage}
      />
    </fieldset>
  );
}
