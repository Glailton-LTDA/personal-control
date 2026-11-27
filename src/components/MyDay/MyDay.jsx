import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Pill,
  Wallet,
  Plane,
  Stethoscope,
  FlaskConical,
  CreditCard,
  MapPin,
  RefreshCw,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { useMyDay } from '../../hooks/useMyDay';
import { itemRoute, splitMyDay, MY_DAY_MODULES } from '../../lib/myDay';
import DoseAction from './DoseAction';
import './MyDay.css';

const icons = {
  doses: Pill,
  appointments: Stethoscope,
  exams: FlaskConical,
  payments: Wallet,
  invoices: CreditCard,
  itinerary: Plane,
  trips: Plane,
};
function DayItem({
  item,
  userId,
  navigate,
  now,
  locale,
  timezone,
  showValues,
  today,
}) {
  const { t } = useTranslation();
  const Icon = icons[item.kind];
  const date = new Date(`${item.day}T12:00:00`);
  const time = item.scheduled_at
    ? new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(item.scheduled_at))
    : item.time?.slice(0, 5);
  const taken = item.status === 'taken';
  const money =
    item.amount == null
      ? null
      : showValues
        ? new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: item.currency || 'BRL',
          }).format(item.amount)
        : '•••';
  return (
    <article
      className={`my-day-item glass-card${taken ? ' my-day-taken' : ''}`}
      data-testid="my-day-item"
    >
      <div className="my-day-item-label">
        <Icon size={18} aria-hidden="true" />
        <span>{t(`myDay.kind_${item.kind}`)}</span>
        <span className="my-day-time">
          {time
            ? item.day === today
              ? time
              : t('myDay.date_time', {
                  date: new Intl.DateTimeFormat(locale, {
                    day: 'numeric',
                    month: 'short',
                  }).format(date),
                  time,
                })
            : new Intl.DateTimeFormat(locale, {
                day: 'numeric',
                month: 'short',
              }).format(date)}
        </span>
      </div>
      <h3>{item.title || t('myDay.untitled')}</h3>
      {item.kind === 'doses' && <p>{item.dose}</p>}
      {item.professional && <p>{item.professional}</p>}
      {item.laboratory && <p>{item.laboratory}</p>}
      {item.trip_title && <p>{item.trip_title}</p>}
      {item.location && <p>{item.location}</p>}
      {money && <strong className="my-day-money">{money}</strong>}
      {taken && (
        <span className="my-day-status">
          <CheckCircle2 size={15} />
          {t('myDay.taken')}
        </span>
      )}
      {item.kind === 'doses' && item.status === 'skipped' && <span className="my-day-status">{t('myDay.skipped')}</span>}
      {item.kind === 'doses' && !taken && item.status !== 'skipped' && (
        <span className="my-day-status">
          <Clock size={15} />
          {t(
            new Date(item.scheduled_at) <= now
              ? 'myDay.overdue_dose'
              : 'myDay.scheduled'
          )}
        </span>
      )}
      <div className="my-day-actions">
        {item.kind === 'doses' && (
          <DoseAction item={item} userId={userId} now={now} />
        )}
        {item.address && (
          <a
            className="btn-secondary"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MapPin size={16} />
            {t('myDay.open_address')}
          </a>
        )}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate(itemRoute(item))}
        >
          {t(`myDay.open_${item.kind}`)}
        </button>
      </div>
    </article>
  );
}
export default function MyDay({
  user,
  navigate,
  showValues = true,
  visibleModules = MY_DAY_MODULES,
}) {
  const { t, i18n } = useTranslation();
  const query = useMyDay(user?.id, visibleModules);
  const groups = useMemo(
    () => splitMyDay(query.data, query.timezone),
    [query.data, query.timezone]
  );
  if (!user?.id) return null;
  const counts = [
    [
      'doses',
      groups.today.filter(
        (i) =>
          i.kind === 'doses' &&
          !['taken', 'skipped', 'canceled'].includes(i.status)
      ).length,
      Pill,
    ],
    [
      'appointments',
      groups.today.filter((i) => i.kind === 'appointments').length,
      Stethoscope,
    ],
    [
      'payments',
      groups.today.filter((i) => ['payments', 'invoices'].includes(i.kind))
        .length,
      Wallet,
    ],
  ];
  const more = Object.values(query.data?.sections || {}).some(
    (s) => s.has_more
  );
  const renderItems = (rows) =>
    rows.map((item) => (
      <DayItem
        key={item.key}
        item={item}
        userId={user.id}
        navigate={navigate}
        now={query.now}
        locale={i18n.language}
        timezone={query.timezone}
        showValues={showValues}
        today={query.data?.day}
      />
    ));
  return (
    <section className="my-day" data-testid="my-day">
      <header className="my-day-header">
        <div>
          <h1>
            <CalendarDays aria-hidden="true" />
            {t('myDay.title')}
          </h1>
          <p>{t('myDay.description')}</p>
          <p className="my-day-date">
            {new Intl.DateTimeFormat(i18n.language, {
              dateStyle: 'full',
            }).format(query.now)}
          </p>
        </div>
        {query.hasModules && (
          <button
            type="button"
            className="btn-secondary"
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            <RefreshCw size={17} />
            {t('myDay.refresh')}
          </button>
        )}
      </header>
      {!query.hasModules ? (
        <p className="glass-card my-day-message">{t('myDay.no_modules')}</p>
      ) : query.isLoading ? (
        <p role="status" className="glass-card my-day-message">
          {t('myDay.loading')}
        </p>
      ) : query.isError ? (
        <div role="alert" className="glass-card my-day-message">
          <p>{t('myDay.load_error')}</p>
          <button className="btn-secondary" onClick={() => query.refetch()}>
            {t('myDay.retry')}
          </button>
        </div>
      ) : (
        <>
          <div className="my-day-stats" aria-label={t('myDay.preview')}>
            {counts
              .filter(([kind]) =>
                kind === 'payments'
                  ? visibleModules.includes('minhasfinancas')
                  : visibleModules.includes('health')
              )
              .map(([key, count, Icon]) => (
                <div className="glass-card my-day-stat" key={key}>
                  {React.createElement(Icon, { size: 21 })}
                  <div>
                    <strong>{count}</strong>
                    <span>{t(`myDay.count_${key}`, { count })}</span>
                  </div>
                </div>
              ))}
          </div>
          <p className="my-day-preview">
            {t('myDay.preview_hint')}
            {query.data?.generated_at && (
              <>
                {' '}
                {t('myDay.updated', {
                  time: new Intl.DateTimeFormat(i18n.language, {
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(query.data.generated_at)),
                })}
              </>
            )}
          </p>
          {more && (
            <p role="status" className="my-day-preview">
              {t('myDay.more')}
            </p>
          )}
          <div className="my-day-columns">
            <section className="my-day-agenda">
              <h2>{t('myDay.today')}</h2>
              {groups.today.length ? (
                renderItems(groups.today)
              ) : (
                <p className="glass-card my-day-message">
                  {t('myDay.empty_today')}
                </p>
              )}
            </section>
            <aside className="my-day-aside">
              <section className="my-day-attention">
                <h2>{t('myDay.attention')}</h2>
                <p className="my-day-preview">{t('myDay.attention_hint')}</p>
                {groups.attention.length ? (
                  renderItems(groups.attention)
                ) : (
                  <p className="glass-card my-day-message">
                    {t('myDay.empty_attention')}
                  </p>
                )}
              </section>
              <section>
                <h2>{t('myDay.upcoming')}</h2>
                {groups.upcoming.length ? (
                  renderItems(groups.upcoming)
                ) : (
                  <p className="glass-card my-day-message">
                    {t('myDay.empty_upcoming')}
                  </p>
                )}
              </section>
            </aside>
          </div>
          <nav className="my-day-links" aria-label={t('myDay.view_all')}>
            {MY_DAY_MODULES.filter((m) => visibleModules.includes(m)).map(
              (module) => (
                <button
                  key={module}
                  className="btn-secondary"
                  onClick={() =>
                    navigate(
                      {
                        health: 'health/today',
                        minhasfinancas: 'minhasfinancas/transactions',
                        trips: 'trips/itinerary',
                      }[module]
                    )
                  }
                >
                  {t(`myDay.module_${module}`)}
                </button>
              )
            )}
          </nav>
        </>
      )}
    </section>
  );
}
