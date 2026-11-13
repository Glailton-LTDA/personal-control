import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Calendar,
  MapPin,
  Check,
  Edit,
  FileText,
  FlaskConical,
  HeartPulse,
  Pill,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  deleteHealth,
  dismissHealth,
  HEALTH_KINDS,
  healthErrorKey,
  localDay,
  snoozeHealth,
  saveHealth,
} from '../../lib/health';
import {
  useHealthDetail,
  useHealthList,
  useHealthReminderSync,
  useHealthSearch,
} from '../../hooks/useHealth';
import { appointmentFollowUp, appointmentMapUrl } from '../../lib/medicalSpecialties';
import HealthForm from './HealthForm';
import TreatmentList from './TreatmentList';
import TreatmentDetail from './TreatmentDetail';
import TreatmentForm from './TreatmentForm';
import MarkdownRenderer from '../MarkdownRenderer';
import HealthDocuments from './HealthDocuments';
import HealthResults from './HealthResults';
import {
  HealthDate,
  HealthEmpty,
  HealthError,
  HealthLoading,
  HealthModal,
  HealthPagination,
  HealthStatus,
  HealthReturnBadge,
} from './HealthUI';
import './HealthGuide.css';

const ICONS = {
  today: Activity,
  medications: Pill,
  appointments: Calendar,
  exams: FlaskConical,
  conditions: HeartPulse,
  documents: FileText,
};
const STATUSES = {
  conditions: ['monitoring', 'chronic', 'resolved'],
  medications: ['active', 'paused', 'finished'],
  appointments: ['scheduled', 'completed', 'cancelled'],
  exams: ['requested', 'scheduled', 'awaiting', 'completed', 'cancelled'],
};
const PARENT_FIELDS = {
  conditions: 'condition_id',
  appointments: 'appointment_id',
  medications: 'medication_id',
  exams: 'exam_id',
};
const DATE_FIELDS = {
  conditions: 'diagnosed_on',
  appointments: 'starts_at',
  medications: 'starts_on',
  exams: 'performed_at',
};

function RecordCard({ kind, record, onOpen }) {
  const Icon = ICONS[kind];
  return (
    <button
      type="button"
      className="glass-card health-record"
      onClick={() => onOpen(record.id)}
    >
      <Icon size={22} />
      <div className="health-grow">
        <div className="health-record-title">
          <strong>{record.name}</strong>
          {kind === 'appointments' && record.follow_up_of && <HealthReturnBadge />}
        </div>
        <p className="health-muted">
          <HealthDate
            value={record[DATE_FIELDS[kind]]}
            dateOnly={['conditions', 'medications'].includes(kind)}
          />
          {(record.professional || record.laboratory || record.dose) && (
            <> · {record.professional || record.laboratory || record.dose}</>
          )}
        </p>
      </div>
      <HealthStatus status={record.status} />
    </button>
  );
}
function RecordList({
  userId,
  kind,
  navigate,
  parent,
  name,
  compact = false,
  soonestFirst = false,
  after,
  status: fixedStatus,
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const search = useHealthSearch(input);
  const query = useHealthList(userId, kind, {
    search,
    status: fixedStatus || status,
    page,
    parent,
    name,
    after,
    soonestFirst,
  });
  return (
    <section className="health-section">
      {compact ? (
        <h2>{t(`health.${kind}`)}</h2>
      ) : (
        <div className="health-filters">
          <label className="health-search-wrap">
            <Search size={18} />
            <input
              aria-label={t('health.search')}
              placeholder={t('health.search')}
              maxLength={120}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <select
            aria-label={t('health.status')}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t('health.all')}</option>
            {STATUSES[kind].map((value) => (
              <option value={value} key={value}>
                {t(`health.status_${value}`)}
              </option>
            ))}
          </select>
        </div>
      )}
      {query.isLoading ? (
        <HealthLoading />
      ) : query.isError ? (
        <HealthError query={query} />
      ) : !query.data?.rows.length ? (
        <HealthEmpty />
      ) : (
        <div className="health-list">
          {query.data.rows.map((record) => (
            <RecordCard
              key={record.id}
              kind={kind}
              record={record}
              onOpen={(id) => navigate(`health/${kind}/${id}`)}
            />
          ))}
        </div>
      )}
      <HealthPagination
        page={page}
        hasNext={query.data?.hasNext}
        onPage={setPage}
      />
    </section>
  );
}
function DoseList({ userId, medicationId, onEdit, after, before }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const query = useHealthList(userId, 'doses', {
    page,
    ...(medicationId
      ? { parent: { field: 'medication_id', id: medicationId } }
      : {}),
    after,
    before,
  });
  return (
    <section className="health-section">
      <h2>{t('health.recorded_doses')}</h2>
      {query.isLoading ? (
        <HealthLoading />
      ) : query.isError ? (
        <HealthError query={query} />
      ) : !query.data?.rows.length ? (
        <HealthEmpty />
      ) : (
        <div className="health-list">
          {query.data.rows.map((dose) => (
            <article className="glass-card health-card" key={dose.id}>
              <div className="health-row">
                <strong>
                  {dose.medication?.name || t('health.medications')}
                </strong>
                <HealthStatus status={dose.status} />
              </div>
              <p className="health-muted">
                {t('health.scheduled_at')}:{' '}
                <HealthDate value={dose.scheduled_at} />
              </p>
              {dose.taken_at && (
                <p>
                  {t('health.taken_at')}: <HealthDate value={dose.taken_at} /> ·{' '}
                  {dose.amount}
                </p>
              )}
              <button
                className="btn-secondary"
                onClick={() => onEdit({ kind: 'doses', record: dose })}
              >
                <Edit size={16} />
                {t('health.edit')}
              </button>
            </article>
          ))}
        </div>
      )}
      <HealthPagination
        page={page}
        hasNext={query.data?.hasNext}
        onPage={setPage}
      />
    </section>
  );
}
function Today({ userId, navigate, onForm, refresh }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const today = localDay(new Date(now));
  const start = new Date(`${today}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const sync = useHealthReminderSync(userId);
  const query = useHealthList(
    userId,
    'reminders',
    { page, after: start.toISOString(), before: end.toISOString() },
    sync.isSuccess,
  );
  const action = async (callback, message) => {
    if (busy) return;
    setBusy(true);
    try {
      await callback();
      await refresh();
      if (message) toast.success(t(message));
    } catch (err) {
      toast.error(t(`health.${healthErrorKey(err)}`));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="health-section">
      <div className="health-quick-actions">
        {HEALTH_KINDS.map((kind) => {
          const Icon = ICONS[kind];
          return (
            <button
              className="btn-secondary"
              key={kind}
              onClick={() => onForm({ kind })}
            >
              <Icon size={18} />
              {t(`health.new_${kind}`)}
            </button>
          );
        })}
        <button
          className="btn-secondary"
          onClick={() => onForm({ kind: 'doses' })}
        >
          <Check size={18} />
          {t('health.new_dose')}
        </button>
      </div>
      <div className="health-dashboard-grid">
        <section className="glass-card health-card health-section">
          <h2>{t('health.doses_today')}</h2>
          <p className="health-muted">{t('health.snooze_hint')}</p>
          {sync.isLoading || query.isLoading ? (
            <HealthLoading />
          ) : sync.isError || query.isError ? (
            <HealthError query={sync.isError ? sync : query} />
          ) : !query.data?.rows.length ? (
            <HealthEmpty />
          ) : (
            <div className="health-list">
              {query.data.rows.map((reminder) => {
                const kind = reminder.medication_id
                  ? 'medications'
                  : reminder.appointment_id
                    ? 'appointments'
                    : 'exams';
                const id =
                  reminder.medication_id ||
                  reminder.appointment_id ||
                  reminder.exam_id;
                const title =
                  reminder.medication?.name ||
                  reminder.appointment?.name ||
                  reminder.exam?.name ||
                  t(`health.${kind}`);
                return (
                  <article className="health-reminder" key={reminder.id}>
                    <div className="health-row">
                      <strong>{title}</strong>
                      <span className="health-status">
                        {t(
                          new Date(reminder.remind_at).getTime() <= now
                            ? 'health.pending'
                            : 'health.scheduled',
                        )}
                      </span>
                    </div>
                    <p>
                      <HealthDate value={reminder.scheduled_at} />
                      {reminder.medication?.dose && (
                        <> · {reminder.medication.dose}</>
                      )}
                    </p>
                    <p className="health-muted">
                      {t('health.remind_at')}:{' '}
                      <HealthDate value={reminder.remind_at} />
                    </p>
                    <div className="health-actions">
                      {kind === 'medications' ? (
                        <button
                          className="btn-primary"
                          onClick={() =>
                            onForm({
                              kind: 'doses',
                              initial: {
                                medication_id: id,
                                scheduled_at: reminder.scheduled_at,
                                amount: reminder.medication?.dose || '',
                              },
                            })
                          }
                        >
                          {t('health.record_dose')}
                        </button>
                      ) : (
                        <button
                          className="btn-secondary"
                          onClick={() => navigate(`health/${kind}/${id}`)}
                        >
                          {t('health.view')}
                        </button>
                      )}
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          action(
                            () =>
                              snoozeHealth(
                                userId,
                                reminder.id,
                                10,
                                reminder.remind_at,
                              ),
                            'health.snoozed',
                          )
                        }
                      >
                        {t('health.snooze')}
                      </button>
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          action(() => dismissHealth(userId, reminder.id))
                        }
                      >
                        {t('health.dismiss')}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <HealthPagination
            page={page}
            hasNext={query.data?.hasNext}
            onPage={setPage}
          />
        </section>
        <section className="glass-card health-card">
          <h2>{t('push.title')}</h2>
          <p className="health-muted">{t('push.manage_hint')}</p>
          <button
            className="btn-secondary"
            onClick={() => navigate('settings/general')}
          >
            {t('push.open_settings')}
          </button>
        </section>
      </div>
      <DoseList
        userId={userId}
        onEdit={onForm}
        after={start.toISOString()}
        before={end.toISOString()}
      />
      <div className="health-dashboard-grid">
        <RecordList
          userId={userId}
          kind="appointments"
          navigate={navigate}
          compact
          after={start.toISOString()}
          soonestFirst
          status="scheduled"
        />
        <RecordList
          userId={userId}
          kind="exams"
          navigate={navigate}
          compact
          after={start.toISOString()}
          soonestFirst
          status="scheduled"
        />
      </div>
    </div>
  );
}
function LinkedRecord({ userId, kind, id, navigate }) {
  const { data } = useHealthDetail(userId, kind, id);
  if (!data) return null;
  return (
    <RecordCard
      kind={kind}
      record={data}
      onOpen={() => navigate(`health/${kind}/${id}`)}
    />
  );
}
function RecordDetail({ userId, kind, id, navigate, onForm, onDelete }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('summary');
  const [completing, setCompleting] = useState(false);
  const client = useQueryClient();
  const query = useHealthDetail(userId, kind, id);
  if (query.isLoading) return <HealthLoading />;
  if (query.isError) return <HealthError query={query} />;
  if (!query.data) return null;
  const record = query.data;
  const parent = { field: PARENT_FIELDS[kind], id };
  const tabs = [
    'summary',
    ...(kind === 'exams' ? ['results', 'report', 'images'] : []),
    'documents',
    'history',
  ];
  const fields =
    kind === 'medications'
      ? ['dose', 'starts_on', 'ends_on', 'times', 'timezone', 'notes']
      : kind === 'appointments'
        ? ['starts_at', 'professional', 'specialty', 'location', 'address', 'notes']
        : kind === 'exams'
          ? [
              'performed_at',
              'laboratory',
              'professional',
              'preparation',
              'notes',
            ]
          : ['diagnosed_on', 'notes'];
  return (
    <section className="health-section">
      <button
        className="btn-secondary health-back"
        onClick={() => navigate(`health/${kind}`)}
      >
        <ArrowLeft size={18} />
        {t('health.back')}
      </button>
      <header className="health-row">
        <div className="health-grow">
          <h2>{record.name}</h2>
          <div className="health-actions">
            <HealthStatus status={record.status} />
            {kind === 'appointments' && record.follow_up_of && <HealthReturnBadge />}
          </div>
        </div>
        <div className="health-actions">
          {kind === 'appointments' && record.status === 'scheduled' && (
            <button className="btn-primary" disabled={completing} onClick={async () => {
              if (completing) return;
              setCompleting(true);
              try {
                await saveHealth(userId, kind, { status: 'completed' }, id);
                await client.invalidateQueries({ queryKey: ['health', userId] });
                toast.success(t('health.appointment_completed'));
              } catch (error) {
                toast.error(t(`health.${healthErrorKey(error)}`));
              } finally {
                setCompleting(false);
              }
            }}>
              <Check size={18} />{t(completing ? 'health.loading' : 'health.complete_appointment')}
            </button>
          )}
          {kind === 'appointments' && record.status !== 'cancelled' && (
            <button className="btn-secondary" disabled={completing}
              onClick={() => onForm({ kind, initial: appointmentFollowUp(record) })}>
              <Calendar size={18} />{t('health.schedule_follow_up')}
            </button>
          )}
          {kind === 'medications' && (
            <button
              className="btn-primary"
              onClick={() =>
                onForm({
                  kind: 'doses',
                  initial: { medication_id: id, amount: record.dose },
                })
              }
            >
              <Check size={18} />
              {t('health.new_dose')}
            </button>
          )}
          <button
            className="btn-secondary"
            onClick={() => onForm({ kind, record })}
          >
            <Edit size={18} />
            {t('health.edit')}
          </button>
          <button
            className="health-icon health-danger"
            aria-label={t('health.delete')}
            onClick={() => onDelete({ kind, record })}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>
      <nav className="health-tabs" aria-label={t('health.summary')}>
        {tabs.map((value) => (
          <button
            key={value}
            className={tab === value ? 'active' : ''}
            aria-current={tab === value ? 'page' : undefined}
            onClick={() => setTab(value)}
          >
            {t(`health.${value}`)}
          </button>
        ))}
      </nav>
      {tab === 'summary' && (
        <>
          <dl className="glass-card health-summary">
            {fields.map((field) => (
              <div key={field}>
                <dt>{t(`health.${field}`)}</dt>
                <dd>
                  {['starts_on', 'ends_on', 'diagnosed_on'].includes(field) ? (
                    record[field] ? (
                      <HealthDate value={record[field]} dateOnly />
                    ) : (
                      t(
                        field === 'ends_on'
                          ? 'health.continuous'
                          : 'health.no_information',
                      )
                    )
                  ) : ['starts_at', 'performed_at'].includes(field) ? (
                    <HealthDate value={record[field]} />
                  ) : field === 'address' && record.address ? (
                    <>
                      <span>{record.address}</span>
                      <a className="btn-secondary health-map-link" href={appointmentMapUrl(record.address)}
                        target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                        <MapPin size={18} />{t('health.open_gps')}
                      </a>
                    </>
                  ) : field === 'times' ? (
                    record.times.map((time) => time.slice(0, 5)).join(', ') ||
                    t('health.no_information')
                  ) : (
                    record[field] || t('health.no_information')
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <div className="health-list">
            {kind === 'appointments' && record.follow_up_of && (
              <section className="health-section">
                <h3>{t('health.original_appointment')}</h3>
                <LinkedRecord userId={userId} kind="appointments" id={record.follow_up_of} navigate={navigate} />
              </section>
            )}
            {record.condition_id && (
              <LinkedRecord
                userId={userId}
                kind="conditions"
                id={record.condition_id}
                navigate={navigate}
              />
            )}
            {record.appointment_id && (
              <LinkedRecord
                userId={userId}
                kind="appointments"
                id={record.appointment_id}
                navigate={navigate}
              />
            )}
          </div>
        </>
      )}
      {tab === 'report' && (
        <article className="glass-card health-card health-text">
          <MarkdownRenderer className="health-report-markdown" content={record.report || t('health.no_information')} />
        </article>
      )}
      {tab === 'results' && <HealthResults userId={userId} examId={id} />}
      {(tab === 'documents' || tab === 'images') && (
        <HealthDocuments
          key={tab}
          userId={userId}
          parent={parent}
          imageOnly={tab === 'images'}
        />
      )}
      {tab === 'history' &&
        (kind === 'exams' ? (
          <>
            <p className="health-muted">{t('health.exam_history_hint')}</p>
            <RecordList
              userId={userId}
              kind="exams"
              navigate={navigate}
              name={record.name}
              compact
            />
          </>
        ) : kind === 'medications' ? (
          <DoseList userId={userId} medicationId={id} onEdit={onForm} />
        ) : (
          <div className="health-section">
            {kind === 'appointments' && (
              <section className="health-section">
                <h3>{t('health.follow_ups')}</h3>
                <RecordList userId={userId} kind="appointments" navigate={navigate}
                  parent={{ field: 'follow_up_of', id }} compact />
              </section>
            )}
            {(kind === 'conditions'
              ? ['appointments', 'medications', 'exams']
              : ['medications', 'exams']
            ).map((related) => (
              <RecordList
                key={related}
                userId={userId}
                kind={related}
                navigate={navigate}
                parent={parent}
                compact
              />
            ))}
          </div>
        ))}
    </section>
  );
}

export default function HealthGuide({
  user,
  screen = 'today',
  detailId,
  navigate,
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [form, setForm] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const userId = user?.id;
  useEffect(
    () => () => {
      client.cancelQueries({ queryKey: ['health', userId] });
      client.removeQueries({ queryKey: ['health', userId] });
    },
    [client, userId],
  );
  const refresh = () =>
    client.invalidateQueries({ queryKey: ['health', userId] });
  if (!userId) return <p role="alert">{t('health.auth_required')}</p>;
  const current = Object.hasOwn(ICONS, screen) ? screen : 'today';
  return (
    <div className="health-guide" data-testid="health-guide">
      <header className="health-header">
        <div>
          <h1>
            <HeartPulse size={30} />
            {t('health.title')}
          </h1>
          <p className="health-muted">{t('health.subtitle')}</p>
        </div>
        <span className="health-private">
          <ShieldCheck size={17} />
          {t('health.private')}
        </span>
      </header>
      <nav
        className="health-tabs health-module-tabs"
        aria-label={t('health.title')}
      >
        {Object.keys(ICONS).map((kind) => {
          const Icon = ICONS[kind];
          return (
            <a
              key={kind}
              href={`/health/${kind}`}
              className={current === kind ? 'active' : ''}
              aria-current={current === kind ? 'page' : undefined}
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  navigate(`health/${kind}`);
                }
              }}
            >
              <Icon size={18} />
              {t(`health.${kind}`)}
            </a>
          );
        })}
      </nav>
      {current === 'today' ? (
        <Today
          userId={userId}
          navigate={navigate}
          onForm={setForm}
          refresh={refresh}
        />
      ) : current === 'documents' ? (
        <HealthDocuments userId={userId} />
      ) : current === 'medications' ? detailId ? (
        <TreatmentDetail
          key={detailId}
          userId={userId}
          medicationId={detailId}
          navigate={navigate}
          onForm={setForm}
        />
      ) : (
        <>
          <header className="health-row">
            <h2>{t('health.medications')}</h2>
            <button
              className="btn-primary"
              onClick={() => setForm({ kind: 'medications' })}
            >
              <Plus size={18} />
              {t('health.new_medications')}
            </button>
          </header>
          <TreatmentList
            key={current}
            userId={userId}
            navigate={navigate}
          />
        </>
      ) : detailId ? (
        <RecordDetail
          key={`${current}/${detailId}`}
          userId={userId}
          kind={current}
          id={detailId}
          navigate={navigate}
          onForm={setForm}
          onDelete={setDeleting}
        />
      ) : (
        <>
          <header className="health-row">
            <h2>{t(`health.${current}`)}</h2>
            <button
              className="btn-primary"
              onClick={() => setForm({ kind: current })}
            >
              <Plus size={18} />
              {t(`health.new_${current}`)}
            </button>
          </header>
          <RecordList
            key={current}
            userId={userId}
            kind={current}
            navigate={navigate}
          />
        </>
      )}
      {form && form.kind === 'medications' ? (
        <TreatmentForm
          userId={userId}
          record={form.record}
          onClose={() => setForm(null)}
          onSaved={(id) => {
            setForm(null);
            refresh();
            toast.success(t('health.treatment_saved'));
            navigate(`health/treatments/${id}`);
          }}
        />
      ) : form ? (
        <HealthForm
          userId={userId}
          {...form}
          onClose={() => setForm(null)}
          onSaved={(id) => {
            const kind = form.kind;
            setForm(null);
            refresh();
            toast.success(t('health.saved'));
            if (HEALTH_KINDS.includes(kind)) navigate(`health/${kind}/${id}`);
          }}
        />
      ) : null}
      {deleting && (
        <HealthModal
          title={t('health.confirm_delete')}
          onClose={() => !busy && setDeleting(null)}
        >
          <p>{deleting.record.name}</p>
          <p className="health-muted">{t('health.confirm_delete_hint')}</p>
          <footer className="health-actions">
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              {t('health.cancel')}
            </button>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  await deleteHealth(userId, deleting.kind, deleting.record.id);
                  const kind = deleting.kind;
                  setDeleting(null);
                  await refresh();
                  navigate(`health/${kind}`);
                  toast.success(t('health.deleted'));
                } catch (err) {
                  toast.error(t(`health.${healthErrorKey(err)}`));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t(busy ? 'health.loading' : 'health.delete')}
            </button>
          </footer>
        </HealthModal>
      )}
    </div>
  );
}
