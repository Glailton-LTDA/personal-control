import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Mail, User, ChevronRight } from 'lucide-react';
import { useFinanceResponsibles } from '../../hooks/useFinance';
import { useMFSendReceiptEmail } from '../../hooks/useMinhasFinancas';

/**
 * "Enviar Comprovante" (padrão do Finance): lista os responsáveis para
 * escolher quem recebe os detalhes por e-mail. Ao escolher, envia e fecha
 * em caso de sucesso. Sem t() com defaults: chaves em
 * minhasfinancas.email_modal_*.
 */
export default function MFEmailModal({ tx, categoryName = '', onClose }) {
  const { t } = useTranslation();
  const { data: responsibles = [] } = useFinanceResponsibles();
  const sendReceipt = useMFSendReceiptEmail();
  const [sending, setSending] = useState(false);

  const handleSelect = async (email) => {
    if (sending || !email) return;
    setSending(true);
    try {
      const ok = await sendReceipt({ tx, categoryName, to: email });
      if (ok) onClose();
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" data-testid="mf-email-modal" onClick={onClose}>
      <div
        className="glass-card modal-content"
        style={{ maxWidth: 460 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('minhasfinancas.email_modal_title')}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                padding: '0.5rem',
                background: 'rgba(99, 102, 241, 0.1)',
                borderRadius: 12,
                color: 'var(--primary)',
                display: 'inline-flex',
              }}
            >
              <Mail size={22} />
            </div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
              {t('minhasfinancas.email_modal_title')}
            </h3>
          </div>
          <button type="button" className="icon-btn" data-testid="mf-email-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '0 0 1.25rem' }}>
          {t('minhasfinancas.email_modal_desc')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {responsibles.map((resp) => (
            <button
              key={resp.id}
              type="button"
              data-testid={`mf-email-resp-${resp.id}`}
              onClick={() => handleSelect(resp.email)}
              disabled={sending || !resp.email}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem 1.1rem',
                background: 'var(--card-action-bg, transparent)',
                borderRadius: 16,
                border: '1px solid var(--glass-border)',
                textAlign: 'left',
                cursor: 'pointer',
                opacity: resp.email ? 1 : 0.5,
                width: '100%',
                color: 'inherit',
                font: 'inherit',
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: resp.is_main
                    ? 'rgba(99,102,241,0.12)'
                    : 'var(--tabs-bg, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: resp.is_main ? 'var(--primary)' : 'var(--text-muted)',
                  flexShrink: 0,
                }}
              >
                <User size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                  }}
                >
                  {resp.name}
                  {resp.is_main && (
                    <span
                      style={{
                        fontSize: '0.6rem',
                        background: 'var(--primary)',
                        color: '#fff',
                        padding: '1px 6px',
                        borderRadius: 4,
                        fontWeight: 900,
                      }}
                    >
                      {t('minhasfinancas.email_modal_main')}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.15rem 0 0' }}>
                  {resp.email || t('minhasfinancas.email_modal_no_email')}
                </p>
              </div>
              <ChevronRight size={17} style={{ opacity: 0.35, flexShrink: 0 }} />
            </button>
          ))}
        </div>

        {sending && (
          <div
            style={{
              marginTop: '1.25rem',
              textAlign: 'center',
              color: 'var(--primary)',
              fontSize: '0.85rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
            }}
          >
            <div
              className="spinner"
              style={{
                width: 15,
                height: 15,
                border: '2px solid rgba(99,102,241,0.2)',
                borderTopColor: 'var(--primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            {t('minhasfinancas.email_modal_sending')}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
