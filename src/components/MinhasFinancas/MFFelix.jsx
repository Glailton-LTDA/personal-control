import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Send, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMFAccounts, useMFCategories } from '../../hooks/useMinhasFinancas';
import { buildFelixRequest, felixReplyOf } from './mfFelixRequest';

/**
 * Tela do assistente Felix (Fase 8): chat com a Edge Function
 * `finance-ai` (Gemini + function calling). O contexto enviado
 * carrega os IDs reais de contas/categorias — o Felix consulta e
 * cria lançamentos com RLS do próprio usuário.
 */
export default function MFFelix({ user }) {
  const { t, i18n } = useTranslation();
  const { data: accounts = [] } = useMFAccounts(user);
  const { data: categories = [] } = useMFCategories(user);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages, busy]);

  const suggestions = [
    t('minhasfinancas.felix_suggest_1'),
    t('minhasfinancas.felix_suggest_2'),
    t('minhasfinancas.felix_suggest_3'),
  ];

  const send = async (textArg) => {
    const text = String(textArg ?? input).trim();
    if (!text || busy) return;
    setInput('');
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const body = buildFelixRequest({
        messages: next,
        accounts,
        categories,
        language: i18n?.language || 'pt-BR',
      });
      const { data, error } = await supabase.functions.invoke('finance-ai', { body });
      if (error) throw error;
      if (data?.configured === false) {
        setMessages([
          ...next,
          { role: 'assistant', content: t('minhasfinancas.felix_not_configured'), error: true },
        ]);
        return;
      }
      const reply = felixReplyOf(data);
      setMessages([
        ...next,
        reply
          ? { role: 'assistant', content: reply }
          : { role: 'assistant', content: t('minhasfinancas.felix_empty_reply'), error: true },
      ]);
    } catch (err) {
      // A Edge Function devolve `code` (auth/model/quota) para explicar o
      // motivo; sem isso, fica a mensagem genérica.
      let payload = null;
      try {
        payload = await err?.context?.clone?.().json?.();
      } catch {
        payload = null;
      }
      const byCode = {
        model: 'felix_error_model',
        auth: 'felix_error_key',
        quota: 'felix_error_quota',
      };
      const key = byCode[payload?.code] ?? 'felix_error';
      const detail = payload?.detail ? ` — ${payload.detail}` : '';
      setMessages([
        ...next,
        { role: 'assistant', content: `${t(`minhasfinancas.${key}`)}${detail}`, error: true },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setMessages([]);
    setInput('');
  };

  return (
    <div data-testid="felix-screen" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Cabeçalho */}
      <div
        className="glass-card"
        style={{
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              padding: '0.6rem',
              borderRadius: 14,
              background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
              color: 'var(--primary)',
            }}
          >
            <Sparkles size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
              {t('nav.sub.minhasfinancas.felix')}
            </h2>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('minhasfinancas.felix_desc')}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            className="icon-btn"
            data-testid="felix-clear"
            onClick={clear}
            aria-label={t('minhasfinancas.felix_clear')}
            title={t('minhasfinancas.felix_clear')}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Chat */}
      <div className="glass-card" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div
          data-testid="felix-chat"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem',
            maxHeight: '55vh',
            minHeight: '180px',
            overflowY: 'auto',
            padding: '0.25rem',
          }}
        >
          {messages.length === 0 && (
            <div
              data-testid="felix-welcome"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '0.6rem',
                padding: '1.5rem 0.5rem',
              }}
            >
              <div style={{ fontSize: '2.2rem', lineHeight: 1 }}>🐱</div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: 460 }}>
                {t('minhasfinancas.felix_welcome')}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.4rem' }}>
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="btn-secondary"
                    data-testid="felix-suggestion"
                    onClick={() => send(suggestion)}
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', borderRadius: 999 }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              data-testid={
                message.error
                  ? 'felix-msg-error'
                  : message.role === 'user'
                    ? 'felix-msg-user'
                    : 'felix-msg-assistant'
              }
              style={{
                alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                padding: '0.55rem 0.85rem',
                borderRadius: 14,
                fontSize: '0.87rem',
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                border: message.error
                  ? '1px solid color-mix(in srgb, #ef4444 45%, transparent)'
                  : '1px solid var(--glass-border)',
                background:
                  message.role === 'user'
                    ? 'color-mix(in srgb, var(--primary) 16%, transparent)'
                    : message.error
                      ? 'color-mix(in srgb, #ef4444 8%, transparent)'
                      : 'var(--glass-bg, rgba(255,255,255,0.04))',
                color: message.error ? '#fca5a5' : 'inherit',
              }}
            >
              {message.content}
            </div>
          ))}

          {busy && (
            <div
              data-testid="felix-busy"
              style={{
                alignSelf: 'flex-start',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
                padding: '0.35rem 0.5rem',
              }}
            >
              {t('minhasfinancas.felix_thinking')}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
          style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}
        >
          <input
            className="glass-input"
            data-testid="felix-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t('minhasfinancas.felix_placeholder')}
            disabled={busy}
            style={{ flex: 1, margin: 0 }}
          />
          <button
            type="submit"
            className="btn-primary"
            data-testid="felix-send"
            disabled={busy || input.trim() === ''}
            aria-label={t('minhasfinancas.felix_send')}
            title={t('minhasfinancas.felix_send')}
            style={{ padding: '0.6rem 0.9rem' }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
