import React, { useState, useEffect } from 'react';
import { motion as Motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { Mail, Save, ShieldCheck, Bell, ChevronUp, ChevronDown, Layout, Lock, Eye, EyeOff, KeyRound, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Settings({ user, menuOrder, setMenuOrder, menuItems, activeTab }) {
  const [settings, setSettings] = useState({
    recipient_email: '',
    bcc_email: '',
    skip_email_modal: false,
    auto_send_on_paid: false,
    skip_confirmations: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Password change state
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwShow, setPwShow] = useState({ current: false, next: false, confirm: false });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState(null); // { type: 'success'|'error', text }

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    const { data } = await supabase
      .from('notification_settings')
      .select('*')
      .single();

    if (data) {
      setSettings({
        recipient_email: data.recipient_email || '',
        bcc_email: data.bcc_email || '',
        skip_email_modal: data.skip_email_modal || false,
        auto_send_on_paid: data.auto_send_on_paid || false,
        skip_confirmations: data.skip_confirmations ?? (localStorage.getItem('pc_skip_confirmations') === 'true')
      });
      // Sync localStorage with DB
      localStorage.setItem('pc_skip_confirmations', data.skip_confirmations ?? (localStorage.getItem('pc_skip_confirmations') === 'true'));
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from('notification_settings')
      .upsert({ 
        user_id: user.id, 
        ...settings,
        menu_order: menuOrder,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (!error) {
      setMessage('Configurações salvas com sucesso!');
      toast.success('Configurações salvas');
      setTimeout(() => setMessage(''), 3000);
    } else {
      toast.error('Erro ao salvar: ' + error.message);
    }
    setSaving(false);
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      setPwMessage({ type: 'error', text: 'As senhas não coincidem.' });
      return;
    }
    if (pwForm.next.length < 6) {
      setPwMessage({ type: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres.' });
      return;
    }
    setPwSaving(true);
    setPwMessage(null);

    // Reauthenticate first
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: pwForm.current,
    });
    if (signInErr) {
      setPwMessage({ type: 'error', text: 'Senha atual incorreta.' });
      setPwSaving(false);
      return;
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password: pwForm.next });
    if (updateErr) {
      setPwMessage({ type: 'error', text: updateErr.message });
    } else {
      setPwMessage({ type: 'success', text: 'Senha alterada com sucesso!' });
      setPwForm({ current: '', next: '', confirm: '' });
      setTimeout(() => setPwMessage(null), 4000);
    }
    setPwSaving(false);
  }

  const moveItem = async (index, direction) => {
    const newOrder = [...menuOrder];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setMenuOrder(newOrder);

    // Save immediately to Supabase
    const { error } = await supabase
      .from('notification_settings')
      .upsert({ 
        user_id: user.id, 
        menu_order: newOrder,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    
    if (error) console.error('Error saving menu order:', error);
  };

  if (loading) return <div style={{ padding: '2rem' }}>Carregando configurações...</div>;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Menu Reordering Section */}
      {activeTab === 'settings-general' && (
        <Motion.div data-testid="section-menu-order" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '1rem', color: 'var(--primary)' }}>
                  <Layout size={24} />
              </div>
              <div>
                  <h3 style={{ fontSize: '1.25rem' }}>Ordem do Menu Lateral</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Personalize a ordem dos módulos no seu sidebar.</p>
              </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {menuOrder.map((id, index) => {
              const item = menuItems.find(i => i.id === id);
              if (!item) return null;
              const Icon = item.icon;
              
              return (
                <div 
                  key={id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '0.75rem 1rem', 
                    background: 'rgba(255,255,255,0.03)', 
                    borderRadius: '0.75rem',
                    border: '1px solid var(--glass-border)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Icon size={18} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontWeight: 500 }}>{item.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={() => moveItem(index, -1)} 
                      disabled={index === 0}
                      className="icon-btn"
                      style={{ padding: '4px', opacity: index === 0 ? 0.3 : 1 }}
                    >
                      <ChevronUp size={18} />
                    </button>
                    <button 
                      onClick={() => moveItem(index, 1)} 
                      disabled={index === menuOrder.length - 1}
                      className="icon-btn"
                      style={{ padding: '4px', opacity: index === menuOrder.length - 1 ? 0.3 : 1 }}
                    >
                      <ChevronDown size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Motion.div>
      )}

      {/* Notifications Section */}
      {activeTab === 'settings-general' && (
        <Motion.div data-testid="section-notifications" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '1rem', color: 'var(--primary)' }}>
                  <Bell size={24} />
              </div>
              <div>
                  <h3 style={{ fontSize: '1.25rem' }}>Notificações de Pagas</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Configure para quem os e-mails automáticos serão enviados.</p>
              </div>
          </div>

          <div className="input-group">
            <label><Mail size={16} inline="true" style={{ verticalAlign: 'middle', marginRight: '5px' }} /> E-mail Principal (Destinatário)</label>
            <input 
              type="email" 
              value={settings.recipient_email}
              onChange={e => setSettings({...settings, recipient_email: e.target.value})}
              placeholder="deisianness@gmail.com"
            />
          </div>

          <div className="input-group">
            <label><ShieldCheck size={16} inline="true" style={{ verticalAlign: 'middle', marginRight: '5px' }} /> E-mail em Cópia Oculta (BCC)</label>
            <input 
              type="email" 
              value={settings.bcc_email}
              onChange={e => setSettings({...settings, bcc_email: e.target.value})}
              placeholder="glailton.rc@gmail.com"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={settings.skip_email_modal}
                onChange={(e) => setSettings({ ...settings, skip_email_modal: e.target.checked })}
                style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
              />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600' }}>Pular modal de e-mail</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Envia direto para o e-mail principal cadastrado</p>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={settings.skip_confirmations || false}
                onChange={(e) => {
                  const val = e.target.checked;
                  setSettings({ ...settings, skip_confirmations: val });
                  localStorage.setItem('pc_skip_confirmations', val);
                }}
                style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
              />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600' }}>Pular confirmações de exclusão</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Executa ações instantaneamente (mais rápido)</p>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={settings.auto_send_on_paid}
                onChange={(e) => setSettings({ ...settings, auto_send_on_paid: e.target.checked })}
                style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
              />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600' }}>Enviar e-mail automático ao marcar como pago</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Automatiza o disparo ao confirmar o pagamento</p>
              </div>
            </label>
          </div>

          {message && <p style={{ color: 'var(--success)', marginBottom: '1rem', fontSize: '0.875rem' }}>{message}</p>}

          <button disabled={saving} onClick={handleSave} className="btn-primary" style={{ width: '100%' }}>
            {saving ? 'Salvando...' : <><Save size={20} /> Salvar Configurações</>}
          </button>

          <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255,165,0,0.05)', borderRadius: '0.75rem', border: '1px solid rgba(255,165,0,0.2)' }}>
              <p style={{ fontSize: '0.75rem', color: 'orange', lineHeight: '1.4' }}>
                  Nota: O disparo de e-mail requer a configuração de uma Edge Function no Supabase vinculada ao seu serviço de e-mail (Resend/SendGrid).
              </p>
          </div>
        </Motion.div>
      )}

      {/* Change Password Section */}
      {activeTab === 'settings-security' && (
        <Motion.div data-testid="section-security" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ padding: '0.75rem', background: 'rgba(99,102,241,0.1)', borderRadius: '1rem', color: 'var(--primary)' }}>
              <KeyRound size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem' }}>Alterar Senha</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Atualize a senha da sua conta.</p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[{ key: 'current', label: 'Senha atual' }, { key: 'next', label: 'Nova senha' }, { key: 'confirm', label: 'Confirmar nova senha' }].map(({ key, label }) => (
              <div key={key} className="input-group" style={{ marginBottom: 0 }}>
                <label>
                  <Lock size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> {label}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={pwShow[key] ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={pwForm[key]}
                    onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                    required
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setPwShow(s => ({ ...s, [key]: !s[key] }))}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                  >
                    {pwShow[key] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            ))}

            {pwMessage && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '10px', background: pwMessage.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${pwMessage.type === 'success' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
                {pwMessage.type === 'success' && <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />}
                <span style={{ fontSize: '0.875rem', color: pwMessage.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>{pwMessage.text}</span>
              </div>
            )}

            <button disabled={pwSaving} className="btn-primary" type="submit" style={{ width: '100%', marginTop: '0.5rem' }}>
              {pwSaving ? 'Alterando...' : <><Lock size={18} /> Alterar Senha</>}
            </button>
          </form>
        </Motion.div>
      )}
    </div>
  );
}
