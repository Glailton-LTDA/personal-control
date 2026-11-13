import React, { useState } from 'react';
import { Clock, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTreatmentList } from '../../hooks/useTreatments';
import {
  HealthDate,
  HealthEmpty,
  HealthError,
  HealthLoading,
  HealthPagination,
  HealthStatus,
} from './HealthUI';

export default function TreatmentList({ userId, navigate, group = 'active' }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [statusGroup, setStatusGroup] = useState(group);
  const [page, setPage] = useState(0);
  const query = useTreatmentList(userId, {
    group: statusGroup,
    prefix: search,
    page,
  });

  const rows = query.data?.rows || [];

  if (query.isLoading) return <HealthLoading />;
  if (query.isError) return <HealthError query={query} />;
  if (!rows.length) return <HealthEmpty />;

  return (
    <section className="health-section">
      <div className="health-filters">
        <label className="health-search-wrap">
          <Clock size={18} />
          <input
            aria-label={t('health.search')}
            placeholder={t('health.search')}
            maxLength={120}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <select
          aria-label={t('health.status')}
          value={statusGroup}
          onChange={(e) => {
            setStatusGroup(e.target.value);
            setPage(0);
          }}
        >
          <option value="active">
            {t('health.treatment_status_active')} /{' '}
            {t('health.treatment_status_paused')}
          </option>
          <option value="finished">{t('health.treatment_status_finished')}</option>
          <option value="all">{t('health.all')}</option>
        </select>
      </div>
      <div className="health-list">
        {rows.map((record) => (
          <article
            className="glass-card health-card health-treatment-row"
            key={record.id}
            onClick={() => navigate(`health/treatments/${record.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) =>
              e.key === 'Enter' && navigate(`health/treatments/${record.id}`)
            }
          >
            <div className="health-grow">
              <div className="health-row">
                <strong>{record.name}</strong>
                <HealthStatus status={record.status} />
              </div>
              <p className="health-muted">
                {record.dose}
                {record.timezone && ` · ${record.timezone}`}
              </p>
              <div className="health-row" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                <span>
                  {t('health.treatment_taken')}:{' '}
                  <strong>{record.taken_total}</strong>
                </span>
                {record.next_at && (
                  <span>
                    {t('health.scheduled_at')}:{' '}
                    <HealthDate value={record.next_at} />
                  </span>
                )}
              </div>
            </div>
            <div className="health-actions">
              <button
                className="health-icon"
                aria-label={t('health.edit')}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`health/treatments/${record.id}`);
                }}
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
          </article>
        ))}
      </div>
      <HealthPagination
        page={page}
        hasNext={query.data?.has_more}
        onPage={setPage}
      />
    </section>
  );
}
