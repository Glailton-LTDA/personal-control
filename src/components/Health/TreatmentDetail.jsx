import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Edit,
  History,
  Pause,
  Play,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useTreatmentDetail,
  useTreatmentCalendar,
  useTreatmentHistory,
  useTreatmentState,
  useRecordDose,
  useUndoDose,
} from '../../hooks/useTreatments';
import { HealthDate, HealthEmpty, HealthError, HealthLoading, HealthModal } from './HealthUI';

const DAY_MS = 86400000;

function addDate(days, d = new Date()) {
  const value = new Date(d);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

const SLOT_STATUS_LABEL = {
  scheduled: 'health.scheduled',
  missed: 'health.pending',
  taken: 'health.status_taken',
  skipped: 'health.status_skipped',
  canceled: 'health.status_cancelled',
};

export default function TreatmentDetail({
  userId,
  medicationId,
  navigate,
  onForm,
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('summary');
  const [calendarFrom, setCalendarFrom] = useState(addDate(-7));
  const [calendarTo, setCalendarTo] = useState(addDate(7));
  const [historyFilter, setHistoryFilter] = useState('all');
  const [recording, setRecording] = useState(null);

  const detail = useTreatmentDetail(userId, medicationId);
  const calendar = useTreatmentCalendar(
    userId,
    medicationId,
    calendarFrom,
    calendarTo,
    detail.isSuccess,
  );
  const history = useTreatmentHistory(
    userId,
    medicationId,
    { filter: historyFilter },
    detail.isSuccess,
  );

  const { mutate: setState, isPending: statePending } = useTreatmentState(userId);
  const { mutate: recordDose, isPending: recordingPending } = useRecordDose(userId);
  const { mutate: undoDose } = useUndoDose(userId);
  const medication = detail.data?.medication;
  const schedule = detail.data?.schedule;
  const stats = detail.data?.stats;
  const today = detail.data?.today || [];
  const next = detail.data?.next || [];

  const isActive = medication?.status === 'active';
  const isPaused = medication?.status === 'paused';
  const isFinished = medication?.status === 'finished';

  const handleState = (action) => {
    if (!medication) return;
    setState({
      medicationId,
      action,
      options: { reason: '', effectiveAt: new Date().toISOString() },
    });
  };

  const handleRecordDose = (scheduledAt) => {
    setRecording({
      scheduledAt,
      status: 'taken',
      takenAt: new Date().toISOString(),
      amount: '',
    });
  };

  const handleUndoDose = (scheduledAt, rowVersion) => {
    if (!window.confirm(t('health.confirm_undo_dose'))) return;
    undoDose({ medicationId, scheduledAt, expectedVersion: rowVersion });
  };

  const submitDose = (event) => {
    event.preventDefault();
    if (!recording) return;
    const { scheduledAt, status, takenAt, amount } = recording;
    recordDose({
      medicationId,
      scheduledAt,
      status,
      options: { takenAt, amount, expectedVersion: 0 },
    });
    setRecording(null);
  };

  if (detail.isLoading) return <HealthLoading />;
  if (detail.isError) return <HealthError query={detail} />;
  if (!medication) return null;

  const tabs = [
    { key: 'summary', label: t('health.treatment_summary'), icon: CheckCircle2 },
    { key: 'calendar', label: t('health.treatment_calendar'), icon: Calendar },
    { key: 'history', label: t('health.treatment_history'), icon: History },
  ];

  return (
    <section className="health-section">
      <button
        className="btn-secondary health-back"
        onClick={() => navigate('health/treatments')}
      >
        <ArrowLeft size={18} />
        {t('health.back')}
      </button>
      <header className="health-row">
        <div className="health-grow">
          <h2>{medication.name}</h2>
          <div className="health-actions">
            <span
              className={`health-status health-status-${medication.status}`}
            >
              {t(`health.status_${medication.status}`)}
            </span>
            <span className="health-muted">{t('health.treatment_dose')}: {medication.dose}</span>
          </div>
        </div>
        <div className="health-actions">
          {isActive && (
            <button
              className="btn-secondary"
              disabled={statePending || recordingPending}
              onClick={() => handleState('pause')}
            >
              <Pause size={18} /> {t('health.treatment_pause')}
            </button>
          )}
          {isPaused && (
            <button
              className="btn-secondary"
              disabled={statePending}
              onClick={() => handleState('resume')}
            >
              <Play size={18} /> {t('health.treatment_resume')}
            </button>
          )}
          {!isFinished && (
            <button
              className="btn-secondary health-danger"
              disabled={statePending}
              onClick={() => handleState('finish')}
            >
              <X size={18} /> {t('health.treatment_finish')}
            </button>
          )}
          <button
            className="btn-primary"
            disabled={recordingPending}
            onClick={() => handleRecordDose(new Date().toISOString())}
          >
            <Check size={18} /> {t('health.treatment_record_dose')}
          </button>
          <button
            className="btn-secondary"
            disabled={statePending}
            onClick={() => onForm?.({ kind: 'medications', record: medication })}
          >
            <Edit size={18} /> {t('health.edit_treatment')}
          </button>
        </div>
      </header>

      {recording && (
        <HealthModal
          title={t('health.treatment_record_dose')}
          onClose={() => setRecording(null)}
        >
          <form onSubmit={submitDose} className="health-form">
            <fieldset disabled={recordingPending} className="health-form-grid">
              <label className="health-field health-full">
                <span>{t('health.scheduled_at')}</span>
                <input
                  type="datetime-local"
                  required
                  value={recording.scheduledAt.slice(0, 16)}
                  onChange={(e) =>
                    setRecording({ ...recording, scheduledAt: e.target.value })
                  }
                />
              </label>
              <label className="health-field health-full">
                <span>{t('health.taken_at')}</span>
                <input
                  type="datetime-local"
                  required
                  value={recording.takenAt.slice(0, 16)}
                  onChange={(e) =>
                    setRecording({ ...recording, takenAt: e.target.value })
                  }
                />
              </label>
              <label className="health-field health-full">
                <span>{t('health.amount')}</span>
                <input
                  type="text"
                  value={recording.amount}
                  onChange={(e) =>
                    setRecording({ ...recording, amount: e.target.value })
                  }
                />
              </label>
              <label className="health-field health-full">
                <span>{t('health.treatment_taken')}</span>
                <select
                  value={recording.status}
                  onChange={(e) =>
                    setRecording({ ...recording, status: e.target.value })
                  }
                >
                  <option value="taken">{t('health.treatment_taken')}</option>
                  <option value="skipped">{t('health.treatment_skipped')}</option>
                </select>
              </label>
            </fieldset>
            <footer className="health-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setRecording(null)}
              >
                {t('health.cancel')}
              </button>
              <button className="btn-primary" disabled={recordingPending}>
                {t('health.save')}
              </button>
            </footer>
          </form>
        </HealthModal>
      )}

      <nav className="health-tabs" aria-label={t('health.summary')}>
        {tabs.map((item) => (
          <button
            key={item.key}
            className={tab === item.key ? 'active' : ''}
            aria-current={tab === item.key ? 'page' : undefined}
            onClick={() => setTab(item.key)}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'summary' && (
        <>
          <dl className="glass-card health-summary">
            <div>
              <dt>{t('health.treatment_duration')}</dt>
              <dd>
                {schedule?.duration_kind === 'continuous'
                  ? t('health.treatment_duration_continuous')
                  : `${schedule?.duration_days ?? 0} dias`}
              </dd>
            </div>
            <div>
              <dt>{t('health.treatment_mode')}</dt>
              <dd>
                {schedule?.mode === 'interval'
                  ? `${t('health.treatment_mode_interval')} (${schedule.interval_minutes} min)`
                  : (schedule?.local_times || []).join(', ')}
              </dd>
            </div>
            <div>
              <dt>{t('health.treatment_taken')}</dt>
              <dd>{stats?.taken_total ?? 0}</dd>
            </div>
            <div>
              <dt>{t('health.treatment_overdue')}</dt>
              <dd>{stats?.overdue ?? 0}</dd>
            </div>
            <div>
              <dt>{t('health.treatment_due')}</dt>
              <dd>{stats?.due_recent ?? 0}</dd>
            </div>
          </dl>
          <div className="health-section">
            <h3>{t('health.treatment_upcoming')}</h3>
            {today.length === 0 ? (
              <p className="health-muted">{t('health.treatment_no_slots')}</p>
            ) : (
              <ul className="health-list">
                {today.map((slot) => (
                  <li
                    key={slot.scheduled_at}
                    className="glass-card health-card health-treatment-slot"
                  >
                    <div className="health-row">
                      <strong>
                        {new Date(slot.scheduled_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </strong>
                      <span
                        className={`health-status health-status-${slot.status}`}
                      >
                        {t(SLOT_STATUS_LABEL[slot.status] || 'health.scheduled')}
                      </span>
                    </div>
                    {slot.taken_at && (
                      <p className="health-muted">
                        {t('health.taken_at')}:{' '}
                        <HealthDate value={slot.taken_at} /> · {slot.amount}
                      </p>
                    )}
                    <div className="health-actions">
                      {slot.status === 'scheduled' && (
                        <button
                          className="btn-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRecordDose(slot.scheduled_at);
                          }}
                        >
                          {t('health.treatment_record_dose')}
                        </button>
                      )}
                      {slot.status === 'taken' && (
                        <button
                          className="btn-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUndoDose(slot.scheduled_at, slot.record_version);
                          }}
                        >
                          {t('health.treatment_undo_dose')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {next.length > 0 && (
            <div className="health-section">
              <h3>{t('health.next')}</h3>
              <ul className="health-list">
                {next.map((slot) => (
                  <li key={slot.scheduled_at} className="health-muted">
                    <HealthDate value={slot.scheduled_at} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {tab === 'calendar' && (
        <div className="health-section">
          <div className="health-row" style={{ gap: '0.6rem', alignItems: 'center' }}>
            <label>
              {t('health.treatment_local_start_date')}
              <input
                type="date"
                value={calendarFrom}
                onChange={(e) => setCalendarFrom(e.target.value)}
              />
            </label>
            <label>
              {t('health.next')}
              <input
                type="date"
                value={calendarTo}
                onChange={(e) => setCalendarTo(e.target.value)}
              />
            </label>
          </div>
          {calendar.isLoading ? (
            <HealthLoading />
          ) : calendar.isError ? (
            <HealthError query={calendar} />
          ) : (
            <div className="health-list">
              {calendar.data?.days?.length === 0 ? (
                <p className="health-muted">{t('health.treatment_no_slots')}</p>
              ) : (
                calendar.data.days.map((day) => (
                  <div key={day.date} className="glass-card health-card health-treatment-day">
                    <div className="health-row">
                      <strong>{day.date}</strong>
                      <span className="health-muted">
                        {day.slots.length} {t('health.treatment_upcoming')}
                      </span>
                    </div>
                    <ul className="health-preview-slots">
                      {day.slots.map((slot) => (
                        <li key={slot.scheduled_at}>
                          {new Date(slot.scheduled_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {slot.status !== 'scheduled' &&
                            ` (${t(SLOT_STATUS_LABEL[slot.status] || 'health.scheduled')})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="health-section">
          <select
            value={historyFilter}
            onChange={(e) => setHistoryFilter(e.target.value)}
            className="health-muted"
            style={{ marginBottom: '1rem', padding: '0.5rem' }}
          >
            <option value="all">{t('health.all')}</option>
            <option value="taken">{t('health.treatment_taken')}</option>
            <option value="skipped">{t('health.treatment_skipped')}</option>
            <option value="missed">{t('health.pending')}</option>
            <option value="canceled">{t('health.status_cancelled')}</option>
          </select>
          {history.isLoading ? (
            <HealthLoading />
          ) : history.isError ? (
            <HealthError query={history} />
          ) : (
            <div className="health-list">
              {history.data?.rows?.length === 0 ? (
                <p className="health-muted">{t('health.empty')}</p>
              ) : (
                history.data.rows.map((row) => (
                  <article
                    key={row.scheduled_at}
                    className="glass-card health-card health-treatment-row"
                  >
                    <div className="health-grow">
                      <div className="health-row">
                        <HealthDate value={row.scheduled_at} />
                        <span
                          className={`health-status health-status-${row.status}`}
                        >
                          {t(SLOT_STATUS_LABEL[row.status] || 'health.scheduled')}
                        </span>
                      </div>
                      {row.amount && (
                        <p className="health-muted">
                          {t('health.amount')}: {row.amount}
                        </p>
                      )}
                      {row.canceled_at && (
                        <p className="health-muted">
                          {t('health.status_cancelled')}:{' '}
                          <HealthDate value={row.canceled_at} />
                        </p>
                      )}
                    </div>
                    <div className="health-actions">
                      {row.status === 'taken' && row.dose_id && (
                        <button
                          className="btn-secondary"
                          onClick={() => handleUndoDose(row.scheduled_at, row.record_version)}
                        >
                          {t('health.treatment_undo_dose')}
                        </button>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
