import React, { useEffect, useRef, useState } from 'react';
import { Download, Eye, FileText, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  deleteHealthDocument,
  downloadHealth,
  healthErrorKey,
  uploadHealth,
} from '../../lib/health';
import { useHealthList, useHealthSearch } from '../../hooks/useHealth';
import {
  HealthDate,
  HealthEmpty,
  HealthError,
  HealthLinkSelect,
  HealthLoading,
  HealthModal,
  HealthPagination,
} from './HealthUI';

const CATEGORIES = [
  'prescription',
  'request',
  'report',
  'result',
  'image',
  'other',
];
function UploadForm({ userId, parent, imageOnly, onClose, onSaved }) {
  const { t } = useTranslation();
  const [file, setFile] = useState(null);
  const [category, setCategory] = useState(imageOnly ? 'image' : 'other');
  const [links, setLinks] = useState(
    parent ? { [parent.field]: parent.id } : {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <HealthModal title={t('health.upload')} onClose={() => !busy && onClose()}>
      <form
        className="health-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !file) return;
          setBusy(true);
          setError('');
          try {
            await uploadHealth(userId, file, category, links);
            onSaved();
          } catch (err) {
            setError(healthErrorKey(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="health-form-grid" disabled={busy}>
          <label className="health-field health-full">
            <span>{t('health.file')}</span>
            <input
              type="file"
              required
              accept="application/pdf,image/jpeg,image/png,image/webp,application/dicom,.dcm"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                setFile(
                  selected?.name.toLowerCase().endsWith('.dcm') &&
                    !selected.type
                    ? new File([selected], selected.name, {
                        type: 'application/dicom',
                      })
                    : selected,
                );
              }}
            />
          </label>
          <label className="health-field health-full">
            <span>{t('health.category')}</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((value) => (
                <option value={value} key={value}>
                  {t(`health.category_${value}`)}
                </option>
              ))}
            </select>
          </label>
          <p className="health-muted health-full">{t('health.file_hint')}</p>
          {!parent && (
            <details className="health-full">
              <summary>{t('health.links')}</summary>
              <div className="health-form-grid health-links">
                {[
                  ['conditions', 'condition_id'],
                  ['appointments', 'appointment_id'],
                  ['medications', 'medication_id'],
                  ['exams', 'exam_id'],
                ].map(([kind, field]) => (
                  <HealthLinkSelect
                    key={field}
                    userId={userId}
                    kind={kind}
                    field={field}
                    value={links[field]}
                    onChange={(value) =>
                      setLinks((previous) => ({ ...previous, [field]: value }))
                    }
                  />
                ))}
              </div>
            </details>
          )}
        </fieldset>
        {error && (
          <p className="health-error" role="alert">
            {t(`health.${error}`)}
          </p>
        )}
        <footer className="health-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t('health.cancel')}
          </button>
          <button className="btn-primary" disabled={busy || !file}>
            {t(busy ? 'health.loading' : 'health.upload')}
          </button>
        </footer>
      </form>
    </HealthModal>
  );
}

export default function HealthDocuments({ userId, parent, imageOnly = false }) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const [input, setInput] = useState('');
  const [upload, setUpload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const alive = useRef(true);
  const previewUrl = useRef(null);
  const search = useHealthSearch(input);
  const query = useHealthList(userId, 'documents', {
    parent,
    page,
    search,
    ...(imageOnly ? { category: 'image' } : {}),
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);
  const closePreview = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
  };
  const openFile = async (id, download = false) => {
    if (busy) return;
    setBusy(true);
    try {
      const { doc, blob } = await downloadHealth(userId, id);
      if (!alive.current) return;
      const url = URL.createObjectURL(blob);
      if (download || doc.mime_type === 'application/dicom') {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = doc.name;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        previewUrl.current = url;
        setPreview({ ...doc, url });
      }
    } catch (err) {
      if (alive.current) toast.error(t(`health.${healthErrorKey(err)}`));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section className="health-section">
      <header className="health-row">
        <h2>{t(imageOnly ? 'health.images' : 'health.documents')}</h2>
        <button className="btn-primary" onClick={() => setUpload(true)}>
          <Plus size={18} />
          {t('health.upload')}
        </button>
      </header>
      <input
        className="health-search"
        value={input}
        maxLength={120}
        aria-label={t('health.search')}
        placeholder={t('health.search')}
        onChange={(e) => {
          setInput(e.target.value);
          setPage(0);
        }}
      />
      {query.isLoading ? (
        <HealthLoading />
      ) : query.isError ? (
        <HealthError query={query} />
      ) : !query.data?.rows.length ? (
        <HealthEmpty />
      ) : (
        <div className="health-list">
          {query.data.rows.map((doc) => (
            <article className="glass-card health-document" key={doc.id}>
              <FileText size={22} />
              <div className="health-grow">
                <strong>{doc.name}</strong>
                <p className="health-muted">
                  {t(`health.category_${doc.category}`)} ·{' '}
                  {new Intl.NumberFormat(i18n.language, {
                    style: 'unit',
                    unit: 'megabyte',
                    maximumFractionDigits: 2,
                  }).format(doc.size_bytes / 1048576)}{' '}
                  · <HealthDate value={doc.created_at} dateOnly />
                </p>
              </div>
              <div className="health-actions">
                <button
                  className="health-icon"
                  disabled={busy}
                  onClick={() => openFile(doc.id)}
                  aria-label={`${t('health.view')}: ${doc.name}`}
                >
                  <Eye size={18} />
                </button>
                <button
                  className="health-icon"
                  disabled={busy}
                  onClick={() => openFile(doc.id, true)}
                  aria-label={`${t('health.download')}: ${doc.name}`}
                >
                  <Download size={18} />
                </button>
                <button
                  className="health-icon health-danger"
                  disabled={busy}
                  onClick={() => setDeleting(doc)}
                  aria-label={`${t('health.delete')}: ${doc.name}`}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <HealthPagination
        page={page}
        hasNext={query.data?.hasNext}
        onPage={setPage}
      />
      {upload && (
        <UploadForm
          userId={userId}
          parent={parent}
          imageOnly={imageOnly}
          onClose={() => setUpload(false)}
          onSaved={() => {
            setUpload(false);
            client.invalidateQueries({
              queryKey: ['health', userId, 'documents'],
            });
          }}
        />
      )}
      {preview && (
        <HealthModal title={preview.name} onClose={closePreview}>
          {preview.mime_type.startsWith('image/') ? (
            <img
              className="health-preview"
              src={preview.url}
              alt={preview.name}
            />
          ) : (
            <iframe
              className="health-preview"
              src={preview.url}
              title={t('health.preview')}
            />
          )}
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
                  await deleteHealthDocument(userId, deleting.id);
                  setDeleting(null);
                  await client.invalidateQueries({
                    queryKey: ['health', userId, 'documents'],
                  });
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
