import React, { useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { LogIn, Mail, Lock, ArrowLeft, KeyRound, CheckCircle2, RefreshCw } from 'lucide-react';


// ── Tela: Login ───────────────────────────────────────────────
function LoginForm({ onLogin, onForgot }) {
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
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>PersonalControl</h1>
        <p style={{ color: 'var(--text-muted)' }}>Entre para gerenciar seu império financeiro</p>
      </div>

      <form onSubmit={handleLogin}>
        <div className="input-group">
          <label><Mail size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> E-mail</label>
          <input type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>

        <div className="input-group">
          <label><Lock size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Senha</label>
          <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}

        <button disabled={loading} className="btn-primary" style={{ width: '100%' }}>
          {loading ? 'Entrando...' : <><LogIn size={20} /> Entrar</>}
        </button>
      </form>

      <button
        onClick={onForgot}
        style={{ marginTop: '1.25rem', width: '100%', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.875rem', cursor: 'pointer', textDecoration: 'underline' }}
      >
        Esqueci minha senha
      </button>
    </>
  );
}

// ── Tela: Esqueci a senha ─────────────────────────────────────
function ForgotPasswordForm({ onBack }) {
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
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        <ArrowLeft size={16} /> Voltar ao login
      </button>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ margin: '0 auto 1rem', width: '3rem', height: '3rem', borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
          <KeyRound size={22} />
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Redefinir senha</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Enviaremos um link para o seu e-mail</p>
      </div>

      {sent ? (
        <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '12px' }}>
          <CheckCircle2 size={36} style={{ color: 'var(--success)', marginBottom: '0.75rem' }} />
          <p style={{ color: 'var(--success)', fontWeight: '600' }}>E-mail enviado!</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>Verifique sua caixa de entrada e clique no link para redefinir sua senha.</p>
        </div>
      ) : (
        <form onSubmit={handleReset}>
          <div className="input-group">
            <label><Mail size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> E-mail cadastrado</label>
            <input type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          {error && <p style={{ color: 'var(--danger)', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}

          <button disabled={loading} className="btn-primary" style={{ width: '100%' }}>
            {loading ? 'Enviando...' : <><Mail size={18} /> Enviar link de redefinição</>}
          </button>
        </form>
      )}
    </>
  );
}

// ── Tela: Nova senha (vinda do link de reset) ─────────────────
function ResetPasswordForm({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return; }

    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) setError(err.message);
    else setSuccess(true);
    setLoading(false);
  };

  if (success) return (
    <div style={{ textAlign: 'center', padding: '1.5rem' }}>
      <CheckCircle2 size={48} style={{ color: 'var(--success)', marginBottom: '1rem' }} />
      <h2 style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Senha redefinida!</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Você já pode entrar com sua nova senha.</p>
      <button onClick={onDone} className="btn-primary" style={{ width: '100%' }}>
        <LogIn size={18} /> Ir para o login
      </button>
    </div>
  );

  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ margin: '0 auto 1rem', width: '3rem', height: '3rem', borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
          <RefreshCw size={22} />
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Nova senha</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Escolha uma senha segura para sua conta</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label><Lock size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Nova senha</label>
          <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <div className="input-group">
          <label><Lock size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Confirmar senha</label>
          <input type="password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} required />
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}

        <button disabled={loading} className="btn-primary" style={{ width: '100%' }}>
          {loading ? 'Salvando...' : <><RefreshCw size={18} /> Redefinir senha</>}
        </button>
      </form>
    </>
  );
}

// ── Componente raiz ───────────────────────────────────────────
export default function Login({ onLogin, recoveryMode, onRecoveryComplete }) {
  const [view, setView] = useState('login'); // 'login' | 'forgot'

  if (recoveryMode) {
    return (
      <div className="login-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem' }}>
          <ResetPasswordForm onDone={() => {
            window.location.hash = '';
            onRecoveryComplete();
          }} />
        </Motion.div>
      </div>
    );
  }

  return (
    <div className="login-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <AnimatePresence mode="wait">
        <Motion.div
          key={view}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.2 }}
          className="glass-card"
          style={{ width: '100%', maxWidth: '400px', padding: '2.5rem' }}
        >
          {view === 'login'
            ? <LoginForm onLogin={onLogin} onForgot={() => setView('forgot')} />
            : <ForgotPasswordForm onBack={() => setView('login')} />
          }
        </Motion.div>
      </AnimatePresence>
    </div>
  );
}
