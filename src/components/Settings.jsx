import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Save, ShieldCheck, Bell } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Settings({ user }) {
  const [settings, setSettings] = useState({
    recipient_email: '',
    bcc_email: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    const { data, error } = await supabase
      .from('notification_settings')
      .select('*')
      .single();

    if (data) setSettings({
      recipient_email: data.recipient_email,
      bcc_email: data.bcc_email
    });
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from('notification_settings')
      .upsert({ 
        user_id: user.id, 
        ...settings,
        updated_at: new Date().toISOString()
      });

    if (!error) {
      setMessage('Configurações salvas com sucesso!');
      setTimeout(() => setMessage(''), 3000);
    } else {
      alert('Erro ao salvar: ' + error.message);
    }
    setSaving(false);
  }

  if (loading) return <div style={{ padding: '2rem' }}>Carregando configurações...</div>;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card" style={{ padding: '2.5rem' }}>
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

        {message && <p style={{ color: 'var(--success)', marginBottom: '1rem', fontSize: '0.875rem' }}>{message}</p>}

        <button disabled={saving} onClick={handleSave} className="btn-primary" style={{ width: '100%' }}>
          {saving ? 'Salvando...' : <><Save size={20} /> Salvar Configurações</>}
        </button>

        <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255,165,0,0.05)', borderRadius: '0.75rem', border: '1px solid rgba(255,165,0,0.2)' }}>
            <p style={{ fontSize: '0.75rem', color: 'orange', lineHeight: '1.4' }}>
                Nota: O disparo de e-mail requer a configuração de uma Edge Function no Supabase vinculada ao seu serviço de e-mail (Resend/SendGrid).
            </p>
        </div>
      </motion.div>
    </div>
  );
}
