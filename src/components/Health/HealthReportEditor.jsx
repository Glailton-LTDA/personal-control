import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MarkdownRenderer from '../MarkdownRenderer';

export default function HealthReportEditor({ value, onChange, disabled = false }) {
  const { t } = useTranslation();
  const id = useId();
  const [preview, setPreview] = useState(false);
  return (
    <fieldset className="health-report-editor health-full" disabled={disabled}>
      <legend>{t('health.report')}</legend>
      <div className="health-actions" role="group" aria-label={t('health.report_mode')}>
        <button type="button" className="btn-secondary" aria-pressed={!preview} onClick={() => setPreview(false)}>{t('health.markdown_edit')}</button>
        <button type="button" className="btn-secondary" aria-pressed={preview} onClick={() => setPreview(true)}>{t('health.markdown_preview')}</button>
      </div>
      {preview ? (
        <div className="health-report-preview" role="region" aria-label={t('health.markdown_preview')}>
          <MarkdownRenderer className="health-report-markdown" content={value || t('health.no_information')} />
        </div>
      ) : (
        <>
          <label htmlFor={id}>{t('health.report')}</label>
          <textarea id={id} name="report" rows={10} maxLength={100000} value={value}
            aria-describedby={`${id}-hint`} onChange={(event) => onChange(event.target.value)} />
          <p id={`${id}-hint`} className="health-muted">{t('health.markdown_hint')}</p>
        </>
      )}
    </fieldset>
  );
}
