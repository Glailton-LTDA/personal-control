import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppModal from '../AppModal';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
  useHealthDetail,
  useHealthList,
  useHealthSearch,
} from '../../hooks/useHealth';

export function HealthModal(props) {
  const { t } = useTranslation();
  return <AppModal {...props} closeLabel={t('health.close')} className="health-modal" overlayClassName="health-overlay" />;
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
  const { t, i18n } = useTranslation();
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
  const optionLabel = (row) => {
    if (kind !== 'appointments' || !row.starts_at) return row.name;
    const date = new Date(
      row.starts_at.length === 10 ? `${row.starts_at}T12:00:00` : row.starts_at,
    );
    if (!Number.isFinite(date.getTime())) return row.name;
    return t('health.link_option_with_date', {
      name: row.name,
      date: new Intl.DateTimeFormat(i18n.language, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date),
    });
  };
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
            {optionLabel(row)}
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
