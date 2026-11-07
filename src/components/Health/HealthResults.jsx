import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { deleteHealth, healthErrorKey, saveHealth } from '../../lib/health';
import { useHealthList } from '../../hooks/useHealth';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  HealthModal,
  HealthPagination,
} from './HealthUI';

export default function HealthResults({ userId, examId }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const query = useHealthList(userId, 'results', {
    parent: { field: 'exam_id', id: examId },
    page,
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ['health', userId, 'results'] });
  return (
    <section className="health-section">
      <header className="health-row">
        <h2>{t('health.results')}</h2>
        <button
          className="btn-primary"
          onClick={() => {
            setError('');
            setForm({ name: '', value: '', unit: '', reference_range: '' });
          }}
        >
          <Plus size={18} />
          {t('health.add_result')}
        </button>
      </header>
      <p className="health-muted">{t('health.result_hint')}</p>
      {query.isLoading ? (
        <HealthLoading />
      ) : query.isError ? (
        <HealthError query={query} />
      ) : !query.data?.rows.length ? (
        <HealthEmpty />
      ) : (
        <div className="health-list">
          {query.data.rows.map((row) => (
            <article className="glass-card health-card" key={row.id}>
              <div className="health-row">
                <h3>{row.name}</h3>
                <div className="health-actions">
                  <button
                    className="health-icon"
                    aria-label={`${t('health.edit')}: ${row.name}`}
                    onClick={() => {
                      setError('');
                      setForm(row);
                    }}
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    className="health-icon health-danger"
                    aria-label={`${t('health.delete')}: ${row.name}`}
                    onClick={() => setDeleting(row)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <p>
                <strong>{row.value}</strong> {row.unit}
              </p>
              {row.reference_range && (
                <p className="health-muted">
                  {t('health.reference_range')}: {row.reference_range}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
      <HealthPagination
        page={page}
        hasNext={query.data?.hasNext}
        onPage={setPage}
      />
      {form && (
        <HealthModal
          title={t(form.id ? 'health.edit' : 'health.add_result')}
          onClose={() => !busy && setForm(null)}
        >
          <form
            className="health-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError('');
              try {
                await saveHealth(
                  userId,
                  'results',
                  { ...form, exam_id: examId },
                  form.id,
                );
                setForm(null);
                await refresh();
              } catch (err) {
                setError(healthErrorKey(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset className="health-form-grid" disabled={busy}>
              {['name', 'value', 'unit', 'reference_range'].map((field) => (
                <label className="health-field" key={field}>
                  <span>{t(`health.${field}`)}</span>
                  <input
                    required={['name', 'value'].includes(field)}
                    maxLength={
                      field === 'name' ? 255 : field === 'unit' ? 100 : 1000
                    }
                    value={form[field]}
                    onChange={(e) =>
                      setForm((previous) => ({
                        ...previous,
                        [field]: e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </fieldset>
            {error && (
              <p role="alert" className="health-error">
                {t(`health.${error}`)}
              </p>
            )}
            <footer className="health-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                {t('health.cancel')}
              </button>
              <button className="btn-primary" disabled={busy}>
                {t(busy ? 'health.loading' : 'health.save')}
              </button>
            </footer>
          </form>
        </HealthModal>
      )}
      {deleting && (
        <HealthModal
          title={t('health.confirm_delete')}
          onClose={() => !busy && setDeleting(null)}
        >
          <p>{deleting.name}</p>
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
                setBusy(true);
                try {
                  await deleteHealth(userId, 'results', deleting.id);
                  setDeleting(null);
                  await refresh();
                } catch (err) {
                  toast.error(t(`health.${healthErrorKey(err)}`));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('health.delete')}
            </button>
          </footer>
        </HealthModal>
      )}
    </section>
  );
}
