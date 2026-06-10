import React, { useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { LogIn, Mail, Lock, ArrowLeft, KeyRound, CheckCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ── Componentes de Apoio ───────────────────────────────────────

/**
 * Background Blobs para efeito de profundidade glassmorphism
 */
const BackgroundDecorations = () => (
  <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: -1, pointerEvents: 'none' }}>
    <Motion.div
      animate={{ 
        scale: [1, 1.2, 1],
        rotate: [0, 90, 0],
        x: [0, 50, 0],
        y: [0, 30, 0]
      }}
      transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      style={{
        position: 'absolute',
        top: '-10%',
        right: '-5%',
        width: '40vw',
        height: '40vw',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
        filter: 'blur(80px)',
      }}
    />
    <Motion.div
      animate={{ 
        scale: [1, 1.1, 1],
        x: [0, -40, 0],
        y: [0, 60, 0]
      }}
      transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
      style={{
        position: 'absolute',
        bottom: '10%',
        left: '-5%',
        width: '35vw',
        height: '35vw',
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%)',
        filter: 'blur(100px)',
      }}
    />
  </div>
);

// ── Tela: Login ───────────────────────────────────────────────
function LoginForm({ onLogin, onForgot }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    else onLogin(data.user);
    setLoading(false);
  };

  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <Motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <h1 style={{ 
            fontSize: '2.25rem', 
            fontWeight: '900', 
            marginBottom: '0.5rem', 
            letterSpacing: '-0.04em',
            background: 'linear-gradient(135deg, #fff 0%, #94a3b8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            PersonalControl
          </h1>
        </Motion.div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{t('login.subtitle')}</p>
      </div>

      <form onSubmit={handleLogin}>
        <div className="input-group">
          <label htmlFor="login-email">
            <Mail size={14} style={{ verticalAlign: 'middle', marginRight: '6px', opacity: 0.7 }} /> 
            {t('login.email')}
          </label>
          <input 
            id="login-email"
            className="glass-input"
            type="email" 
            placeholder={t('login.email_placeholder')} 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            required 
          />
        </div>

        <div className="input-group">
          <label htmlFor="login-password">
            <Lock size={14} style={{ verticalAlign: 'middle', marginRight: '6px', opacity: 0.7 }} /> 
            {t('login.password')}
          </label>
          <input 
            id="login-password"
            className="glass-input"
            type="password" 
            placeholder="••••••••" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
          />
        </div>

        {error && (
          <Motion.p 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '1rem', fontWeight: '600' }}
          >
            {error}
          </Motion.p>
        )}

        <button data-testid="login-btn" disabled={loading} className="btn-primary premium-gradient" style={{ width: '100%', marginTop: '0.5rem' }}>
          {loading ? (
            <RefreshCw size={20} className="animate-spin" />
          ) : (
            <><LogIn size={18} /> {t('login.enter')}</>
          )}
        </button>
      </form>

      <button
        onClick={onForgot}
        className="text-link"
        style={{ 
          marginTop: '1.5rem', 
          width: '100%', 
          background: 'none', 
          border: 'none', 
          color: 'var(--text-muted)', 
          fontSize: '0.85rem', 
          cursor: 'pointer', 
          fontWeight: '600',
          transition: 'color 0.2s'
        }}
        data-testid="forgot-password-link"
      >
        {t('login.forgot_password')}
      </button>
    </>
  );
}

// ── Tela: Esqueci a senha ─────────────────────────────────────
function ForgotPasswordForm({ onBack }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });

    if (err) setError(err.message);
    else setSent(true);
    setLoading(false);
  };

  return (
    <>
      <button 
        data-testid="back-to-login-btn" 
        onClick={onBack} 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          background: 'rgba(255,255,255,0.03)', 
          border: '1px solid var(--glass-border)', 
          borderRadius: '10px',
          padding: '0.5rem 0.75rem',
          color: 'var(--text-muted)', 
          cursor: 'pointer', 
          marginBottom: '2rem', 
          fontSize: '0.8rem',
          fontWeight: '600'
        }}
      >
        <ArrowLeft size={14} /> {t('login.back_to_login')}
      </button>

      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{ 
          margin: '0 auto 1.25rem', 
          width: '3.5rem', 
          height: '3.5rem', 
          borderRadius: '16px', 
          background: 'rgba(99,102,241,0.1)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          color: 'var(--primary)',
          border: '1px solid rgba(99,102,241,0.2)'
        }}>
          <KeyRound size={24} />
        </div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
          {t('login.reset_password')}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>{t('login.reset_desc')}</p>
      </div>

      {sent ? (
        <Motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ 
            textAlign: 'center', 
            padding: '2rem', 
            background: 'rgba(16,185,129,0.03)', 
            border: '1px solid rgba(16,185,129,0.15)', 
            borderRadius: '1.25rem' 
          }}
        >
          <CheckCircle size={42} style={{ color: 'var(--success)', marginBottom: '1rem', opacity: 0.8 }} />
          <p style={{ color: 'var(--success)', fontWeight: '700', fontSize: '1.1rem' }}>{t('login.email_sent')}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.75rem', lineHeight: '1.6' }}>
            {t('login.check_inbox')}
          </p>
        </Motion.div>
      ) : (
        <form onSubmit={handleReset}>
          <div className="input-group">
            <label htmlFor="reset-email">
              <Mail size={14} style={{ verticalAlign: 'middle', marginRight: '6px', opacity: 0.7 }} /> 
              {t('login.registered_email')}
            </label>
            <input 
              id="reset-email"
              className="glass-input"
              type="email" 
              placeholder={t('login.email_placeholder')} 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
          </div>

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '1rem', fontWeight: '600' }}>{error}</p>
          )}

          <button data-testid="send-reset-link-btn" disabled={loading} className="btn-primary premium-gradient" style={{ width: '100%', marginTop: '0.5rem' }}>
            {loading ? <RefreshCw size={20} className="animate-spin" /> : <><Mail size={18} /> {t('login.send_link')}</>}
          </button>
        </form>
      )}
    </>
  );
}

// ── Tela: Nova senha (vinda do link de reset) ─────────────────
function ResetPasswordForm({ onDone }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError(t('login.password_mismatch')); return; }
    if (password.length < 6) { setError(t('login.password_min_length')); return; }

    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) setError(err.message);
    else setSuccess(true);
    setLoading(false);
  };

  if (success) return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <Motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      >
        <CheckCircle size={56} style={{ color: 'var(--success)', marginBottom: '1.5rem' }} />
      </Motion.div>
      <h2 style={{ fontWeight: '800', fontSize: '1.75rem', marginBottom: '0.75rem', letterSpacing: '-0.02em' }}>
        {t('login.password_reset_success')}
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.95rem' }}>{t('login.can_login_now')}</p>
      <button data-testid="go-to-login-btn" onClick={onDone} className="btn-primary premium-gradient" style={{ width: '100%' }}>
        <LogIn size={18} /> {t('login.go_to_login')}
      </button>
    </div>
  );

  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{ 
          margin: '0 auto 1.25rem', 
          width: '3.5rem', 
          height: '3.5rem', 
          borderRadius: '16px', 
          background: 'rgba(99,102,241,0.1)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          color: 'var(--primary)',
          border: '1px solid rgba(99,102,241,0.2)'
        }}>
          <RefreshCw size={24} />
        </div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
          {t('login.new_password')}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('login.choose_secure_password')}</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label htmlFor="new-password">
            <Lock size={14} style={{ verticalAlign: 'middle', marginRight: '6px', opacity: 0.7 }} /> 
            {t('login.new_password_label')}
          </label>
          <input 
            id="new-password"
            className="glass-input"
            type="password" 
            placeholder="••••••••" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
          />
        </div>
        <div className="input-group">
          <label htmlFor="confirm-password">
            <Lock size={14} style={{ verticalAlign: 'middle', marginRight: '6px', opacity: 0.7 }} /> 
            {t('login.confirm_password_label')}
          </label>
          <input 
            id="confirm-password"
            className="glass-input"
            type="password" 
            placeholder="••••••••" 
            value={confirm} 
            onChange={e => setConfirm(e.target.value)} 
            required 
          />
        </div>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '1rem', fontWeight: '600' }}>{error}</p>
        )}

        <button data-testid="reset-password-btn" disabled={loading} className="btn-primary premium-gradient" style={{ width: '100%', marginTop: '0.5rem' }}>
          {loading ? <RefreshCw size={20} className="animate-spin" /> : <><RefreshCw size={18} /> {t('login.reset_password_btn')}</>}
        </button>
      </form>
    </>
  );
}

// ── Componente raiz ───────────────────────────────────────────
export default function Login({ onLogin, recoveryMode, onRecoveryComplete }) {
  const { t } = useTranslation();
  const [view, setView] = useState('login'); // 'login' | 'forgot'

  return (
    <div className="login-container" style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      background: 'var(--bg-canvas)',
      position: 'relative',
      padding: '1.5rem'
    }}>
      <BackgroundDecorations />

      <AnimatePresence mode="wait">
        <Motion.div
          key={recoveryMode ? 'recovery' : view}
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.98 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          className="glass-card"
          style={{ 
            width: '100%', 
            maxWidth: '420px', 
            padding: '3rem 2.5rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--glass-border)',
            boxShadow: '0 40px 100px -20px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(24px)'
          }}
        >
          {recoveryMode ? (
            <ResetPasswordForm onDone={() => {
              window.location.hash = '';
              onRecoveryComplete();
            }} />
          ) : view === 'login' ? (
            <LoginForm onLogin={onLogin} onForgot={() => setView('forgot')} />
          ) : (
            <ForgotPasswordForm onBack={() => setView('login')} />
          )}
        </Motion.div>
      </AnimatePresence>

      <div style={{ 
        position: 'absolute', 
        bottom: '2rem', 
        left: '0', 
        right: '0', 
        textAlign: 'center', 
        opacity: 0.4 
      }}>
        <span style={{ 
          fontSize: '0.7rem', 
          fontWeight: 800, 
          color: 'var(--text-muted)', 
          textTransform: 'uppercase', 
          letterSpacing: '0.15em' 
        }}>
          {t('login.version')}
        </span>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .text-link:hover {
          color: var(--primary) !important;
          text-decoration: none !important;
        }
        .glass-input::placeholder {
          color: rgba(148, 163, 184, 0.3);
        }
      `}} />
    </div>
  );
}
