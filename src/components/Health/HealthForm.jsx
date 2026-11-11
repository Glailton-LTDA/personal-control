import React, { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  healthErrorKey,
  localDateTime,
  localDay,
  saveHealth,
} from '../../lib/health';
import AddressInput from '../Trips/AddressInput';
import HealthReportEditor from './HealthReportEditor';
import { MEDICAL_SPECIALTIES } from '../../lib/medicalSpecialties';
import { HealthLinkSelect, HealthModal } from './HealthUI';

const STATUS = {
  conditions: ['monitoring', 'chronic', 'resolved'],
  appointments: ['scheduled', 'completed', 'cancelled'],
  medications: ['active', 'paused', 'finished'],
  exams: ['requested', 'scheduled', 'awaiting', 'completed', 'cancelled'],
  doses: ['taken', 'skipped'],
};
export default function HealthForm({
  userId,
  kind,
  record,
  initial = {},
  onClose,
  onSaved,
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [form, setForm] = useState(() => ({
    name: '',
    status: STATUS[kind][0],
    notes: '',
    professional: '',
    laboratory: '',
    specialty: '',
    location: '',
    address: '',
    dose: '',
    starts_on: localDay(),
    ends_on: '',
    times: ['08:00'],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    reminders_enabled: true,
    reminder_minutes: [1440, 120],
    report: '',
    preparation: '',
    diagnosed_on: '',
    amount: '',
    ...initial,
    ...record,
    starts_at: localDateTime(record?.starts_at || initial.starts_at),
    performed_at: localDateTime(record?.performed_at || initial.performed_at),
    scheduled_at: localDateTime(
      record?.scheduled_at || initial.scheduled_at || new Date().toISOString(),
    ),
    taken_at: localDateTime(record?.taken_at || new Date().toISOString()),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (field, value) =>
    setForm((previous) => ({ ...previous, [field]: value }));
  const text = (
    field,
    {
      type = 'text',
      required = false,
      maxLength = 255,
      min,
      readOnly = false,
    } = {},
  ) => (
    <label className="health-field" key={field}>
      <span>{t(`health.${field}`)}</span>
      <input
        name={field}
        type={type}
        readOnly={readOnly}
        required={required}
        maxLength={maxLength}
        min={min}
        value={form[field] || ''}
        onChange={(e) => set(field, e.target.value)}
      />
    </label>
  );
  const area = (field, maxLength = 20000) => (
    <label className="health-field health-full">
      <span>{t(`health.${field}`)}</span>
      <textarea
        name={field}
        rows={4}
        maxLength={maxLength}
        value={form[field] || ''}
        onChange={(e) => set(field, e.target.value)}
      />
    </label>
  );
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const values = {
        ...form,
        name: form.name.trim(),
        diagnosed_on: form.diagnosed_on || null,
        ends_on: form.ends_on || null,
      };
      if (kind === 'medications') {
        const times = form.times.map((value) => value.slice(0, 5));
        if (
          (form.reminders_enabled && !times.length) ||
          times.some((value) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) ||
          new Set(times).size !== times.length
        ) {
          setError('invalid_times');
          return;
        }
        values.times = times;
      }
      for (const field of [
        'starts_at',
        'performed_at',
        'scheduled_at',
        'taken_at',
      ])
        values[field] = form[field]
          ? new Date(form[field]).toISOString()
          : null;
      if (kind === 'doses' && form.status === 'skipped') values.taken_at = null;
      const saved = await saveHealth(userId, kind, values, record?.id);
      onSaved(saved.id);
    } catch (err) {
      setError(healthErrorKey(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <HealthModal
      title={t(
        `health.${record ? 'edit' : initial.follow_up_of ? 'schedule_follow_up' : kind === 'doses' ? 'record_dose' : `new_${kind}`}`,
      )}
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit} className="health-form">
        <fieldset disabled={busy} className="health-form-grid">
          {kind !== 'doses' && text('name', { required: true })}
          <label className="health-field">
            <span>{t('health.status')}</span>
            <select
              name="status"
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            >
              {STATUS[kind].map((status) => (
                <option key={status} value={status}>
                  {t(`health.status_${status}`)}
                </option>
              ))}
            </select>
          </label>
          {kind === 'conditions' && text('diagnosed_on', { type: 'date' })}
          {kind === 'appointments' && (
            <>
              {text('starts_at', { type: 'datetime-local', required: true })}
              {text('professional')}
              <div className="health-field">
                <label htmlFor={`${inputId}-specialty`}>{t('health.specialty')}</label>
                <input id={`${inputId}-specialty`} name="specialty" list={`${inputId}-specialties`} value={form.specialty}
                  maxLength={255} onChange={(e) => set('specialty', e.target.value)}
                  aria-describedby={`${inputId}-specialty-hint`} />
                <datalist id={`${inputId}-specialties`}>
                  {MEDICAL_SPECIALTIES.map((key) => <option key={key} value={t(`health.specialties.${key}`)} />)}
                </datalist>
                <small id={`${inputId}-specialty-hint`} className="health-muted">{t('health.specialty_hint')}</small>
              </div>
              {text('location', { maxLength: 1000 })}
              <div className="health-field health-full">
                <label htmlFor={`${inputId}-address`}>{t('health.address')}</label>
                <AddressInput id={`${inputId}-address`} value={form.address} disabled={busy}
                  allowFreeText placeholder={t('health.address_placeholder')}
                  clearLabel={t('health.clear_address')}
                  onChange={(address) => set('address', address.slice(0, 1000))} />
              </div>
              {form.follow_up_of && <p className="health-muted health-full">{t('health.follow_up_hint')}</p>}
            </>
          )}
          {kind === 'exams' && (
            <>
              {text('performed_at', {
                type: 'datetime-local',
                required: ['scheduled', 'completed'].includes(form.status),
              })}
              {text('laboratory')}
              {text('professional')}
              {area('preparation')}
              <HealthReportEditor value={form.report} onChange={(value) => set('report', value)} disabled={busy} />
            </>
          )}
          {kind === 'medications' && (
            <>
              {text('dose', { required: true })}
              {text('starts_on', { type: 'date', required: true })}
              {text('ends_on', { type: 'date', min: form.starts_on })}
              {text('timezone', { required: true, maxLength: 100 })}
              <label className="health-check health-full">
                <input
                  type="checkbox"
                  checked={form.reminders_enabled}
                  onChange={(e) => set('reminders_enabled', e.target.checked)}
                />
                {t('health.reminders_enabled')}
              </label>
              <fieldset className="health-times health-full">
                <legend>{t('health.times')}</legend>
                <div className="health-time-grid">
                  {form.times.map((time, index) => (
                    <div className="health-row" key={index}>
                      <input
                        type="time"
                        required
                        value={time.slice(0, 5)}
                        aria-label={t('health.times')}
                        onChange={(e) =>
                          set(
                            'times',
                            form.times.map((old, i) =>
                              i === index ? e.target.value : old,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="health-icon"
                        aria-label={t('health.remove_time')}
                        onClick={() =>
                          set(
                            'times',
                            form.times.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={form.times.length >= 24}
                  onClick={() => set('times', [...form.times, '12:00'])}
                >
                  <Plus size={16} />
                  {t('health.add_time')}
                </button>
              </fieldset>
            </>
          )}
          {['appointments', 'exams'].includes(kind) && (
            <fieldset className="health-full health-reminder-options">
              <legend>{t('health.reminder_minutes')}</legend>
              {[0, 120, 1440].map((minutes) => (
                <label className="health-check" key={minutes}>
                  <input
                    type="checkbox"
                    checked={form.reminder_minutes.includes(minutes)}
                    onChange={(e) =>
                      set(
                        'reminder_minutes',
                        e.target.checked
                          ? [...form.reminder_minutes, minutes]
                          : form.reminder_minutes.filter((n) => n !== minutes),
                      )
                    }
                  />
                  {t(`health.reminder_${minutes}`)}
                </label>
              ))}
            </fieldset>
          )}
          {kind === 'doses' && (
            <>
              {!initial.medication_id && !record && (
                <HealthLinkSelect
                  userId={userId}
                  kind="medications"
                  field="medication_id"
                  value={form.medication_id}
                  onChange={(value) => set('medication_id', value)}
                />
              )}
              {text('scheduled_at', {
                type: 'datetime-local',
                required: true,
                readOnly: Boolean(record),
              })}
              {form.status === 'taken' && (
                <>
                  {text('taken_at', { type: 'datetime-local', required: true })}
                  {text('amount')}
                </>
              )}
            </>
          )}
          {kind !== 'doses' && area('notes')}
          {['appointments', 'medications', 'exams'].includes(kind) && (
            <details className="health-full">
              <summary>{t('health.links')}</summary>
              <div className="health-form-grid health-links">
                <HealthLinkSelect
                  userId={userId}
                  kind="conditions"
                  field="condition_id"
                  value={form.condition_id}
                  onChange={(value) => set('condition_id', value)}
                />
                {kind !== 'appointments' && (
                  <HealthLinkSelect
                    userId={userId}
                    kind="appointments"
                    field="appointment_id"
                    value={form.appointment_id}
                    onChange={(value) => set('appointment_id', value)}
                  />
                )}
              </div>
            </details>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="health-error">
            {t(`health.${error}`)}
          </p>
        )}
        <footer className="health-actions">
          <button
            type="button"
            disabled={busy}
            className="btn-secondary"
            onClick={onClose}
          >
            {t('health.cancel')}
          </button>
          <button
            className="btn-primary"
            disabled={busy || (kind === 'doses' && !form.medication_id)}
          >
            {t(busy ? 'health.loading' : 'health.save')}
          </button>
        </footer>
      </form>
    </HealthModal>
  );
}
