import React, { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Diálogo de escolha com N opções empilhadas (prints originais:
 * "O que você deseja?" da série fixa e "Contabilizar no mês da
 * efetivação?"). Clique no overlay = cancelar (não faz nada).
 *
 * `options`: `{ key, label, testId? }` — `onOption(key, checked)` recebe a
 * escolha (+ estado do checkbox, quando há); `body` é string ou array de
 * parágrafos. `checkbox` opcional: `{ label, testId?, defaultChecked? }`.
 */
export default function MFChoiceDialog({ testId, title, body = [], options = [], checkbox = null, onOption, onClose }) {
  const [checked, setChecked] = useState(checkbox ? checkbox.defaultChecked !== false : true);
  const paragraphs = Array.isArray(body) ? body : [body];
  const btnStyle = { width: '100%', textAlign: 'center' };

  return createPortal(
    <div className="modal-overlay" data-testid={testId} onClick={onClose}>
      <div
        className="glass-card modal-content"
        style={{ maxWidth: 460 }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3
          data-testid={`${testId}-title`}
          style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 800 }}
        >
          {title}
        </h3>
        {paragraphs.map((paragraph, index) => (
          <p
            key={index}
            data-testid={index === 0 ? `${testId}-body` : `${testId}-body-${index}`}
            style={{
              margin: '0 0 0.75rem',
              fontSize: '0.88rem',
              lineHeight: 1.55,
              color: 'var(--text-muted)',
            }}
          >
            {paragraph}
          </p>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1rem' }}>
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              className={option.variant === 'primary' ? 'btn-primary' : 'btn-cancel'}
              data-testid={option.testId || `${testId}-option-${option.key}`}
              style={btnStyle}
              onClick={() => onOption(option.key, checked)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {checkbox && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginTop: '0.9rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              data-testid={checkbox.testId || `${testId}-check`}
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
            />
            {checkbox.label}
          </label>
        )}
      </div>
    </div>,
    document.body
  );
}
