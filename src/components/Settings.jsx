import React, { useState, useEffect } from 'react';
import { motion as Motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Mail, Save, ShieldCheck, Bell, ChevronUp, ChevronDown, Layout, Lock, Eye, EyeOff, KeyRound, CheckCircle, Loader2, LayoutGrid, Sun, Moon, Globe, User, Info, Database, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export default function Settings({ user, menuOrder, setMenuOrder, menuItems, activeTab, theme, setTheme }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState({
    recipient_email: '',
    bcc_email: '',
    skip_email_modal: false,
    auto_send_on_paid: false,
    skip_confirmations: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Manual sync state
  const [syncing, setSyncing] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Password change state
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwShow, setPwShow] = useState({ current: false, next: false, confirm: false });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState(null); 

  // Profile name state
  const [displayName, setDisplayName] = useState(user?.user_metadata?.full_name || user?.user_metadata?.name || '');
  const [updatingName, setUpdatingName] = useState(false);

  async function handleUpdateName() {
    setUpdatingName(true);
    const { error } = await supabase.auth.updateUser({
      data: { full_name: displayName }
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t('settings.profile_updated'));
    }
    setUpdatingName(false);
  }

  async function updateQueueCount() {
    try {
      const { db } = await import('../lib/offline/db');
      const count = await db.sync_queue.count();
      setQueueCount(count);
    } catch (err) {
      console.error('Error fetching queue count:', err);
    }
  }

  async function handleManualSync() {
    if (syncing) return;
    setSyncing(true);
    const toastId = toast.loading(t('settings.syncing_data', 'Sincronizando dados com o servidor...'));
    try {
      const { SyncEngine } = await import('../lib/offline/SyncEngine');
      const engine = new SyncEngine(user.id);
      await engine.sync();
      
      await updateQueueCount();
      
      // Invalidate query caches
      queryClient.invalidateQueries();
      
      toast.success(t('settings.sync_success', 'Dados sincronizados com sucesso!'), { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(t('settings.sync_error', 'Erro ao sincronizar dados.'), { id: toastId });
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    fetchSettings();
    if (user?.id) {
      updateQueueCount();
    }
  }, [user?.id]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
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
      toast.success(t('settings.success'));
    } else {
      toast.error('Error: ' + error.message);
    }
    setSaving(false);
  }

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    toast.success(t('settings.language_changed'));
  };

  async function handleChangePassword(e) {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      setPwMessage({ type: 'error', text: t('settings.password_mismatch') });
      return;
    }
    if (pwForm.next.length < 6) {
      setPwMessage({ type: 'error', text: 'Min 6 chars.' });
      return;
    }
    setPwSaving(true);
    setPwMessage(null);

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: pwForm.current,
    });
    if (signInErr) {
      setPwMessage({ type: 'error', text: t('settings.incorrect_password') });
      setPwSaving(false);
      return;
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password: pwForm.next });
    if (updateErr) {
      setPwMessage({ type: 'error', text: updateErr.message });
    } else {
      setPwMessage({ type: 'success', text: t('settings.password_changed') });
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

    const { error } = await supabase
      .from('notification_settings')
      .upsert({ 
        user_id: user.id, 
        menu_order: newOrder,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    
    if (error) console.error('Error saving menu order:', error);
  };

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center' }}><Loader2 className="animate-spin" style={{ color: 'var(--primary)', margin: '0 auto' }} /></div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      
      {/* ── GENERAL TAB ── */}
      {activeTab === 'settings-general' && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', 
          gap: '1.5rem', 
          alignItems: 'start' 
        }}>
          
          {/* Card 0: Profile */}
          <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '1rem', color: 'var(--primary)' }}>
                <User size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('settings.profile')}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500, margin: 0 }}>{t('settings.profile_desc')}</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{t('settings.profile_name')}</label>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <input 
                    type="text" 
                    value={displayName} 
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder={t('settings.name_placeholder')}
                    style={{ borderRadius: '12px', flex: 1, minWidth: '200px' }}
                  />
                  <button 
                    onClick={handleUpdateName} 
                    disabled={updatingName || !displayName.trim()} 
                    className="btn-primary" 
                    style={{ padding: '0.8rem 1.5rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flex: '1 1 auto' }}
                  >
                    {updatingName ? <Loader2 size={18} className="animate-spin" /> : <><Save size={18} /> <span>{t('settings.save')}</span></>}
                  </button>
                </div>
              </div>
            </div>
          </Motion.div>
          {/* Card 1: Theme Selection */}
          <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '1rem', color: 'var(--primary)' }}>
                <Layout size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('settings.customization')}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500, margin: 0 }}>{t('settings.customization_desc')}</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {[
                { id: 'light', label: t('settings.themes.light'), icon: Sun, bg: '#ffffff', color: '#6366f1' },
                { id: 'dark', label: t('settings.themes.dark'), icon: Moon, bg: '#0f172a', color: '#818cf8' }
              ].map(t_theme => (
                <button 
                  key={t_theme.id}
                  onClick={() => setTheme(t_theme.id)}
                  style={{ 
                    padding: '1.5rem 1rem', 
                    borderRadius: '24px', 
                    background: theme === t_theme.id ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-card)', 
                    border: '2px solid', 
                    borderColor: theme === t_theme.id ? 'var(--primary)' : 'var(--glass-border)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '1rem',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: theme === t_theme.id ? '0 8px 25px rgba(99, 102, 241, 0.2)' : 'var(--shadow)'
                  }}
                  onMouseEnter={(e) => {
                    if (theme !== t_theme.id) {
                      e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (theme !== t_theme.id) {
                      e.currentTarget.style.borderColor = 'var(--glass-border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <div style={{ 
                    width: '100%', 
                    height: '50px', 
                    background: t_theme.bg, 
                    borderRadius: '12px', 
                    border: '1px solid var(--glass-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                  }}>
                    <t_theme.icon size={22} color={t_theme.color} />
                  </div>
                  <span style={{ 
                    fontWeight: 800, 
                    fontSize: '0.85rem', 
                    color: theme === t_theme.id ? 'var(--text-main)' : 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>{t_theme.label}</span>
                </button>
              ))}
            </div>
          </Motion.div>

          {/* Card 2: Language Selector */}
          <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '1rem', color: 'var(--primary)' }}>
                <Globe size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('settings.language')}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500, margin: 0 }}>{t('settings.language_desc')}</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {[
                { id: 'pt', code: 'br', label: 'Português' },
                { id: 'en', code: 'us', label: 'English' },
                { id: 'es', code: 'es', label: 'Español' }
              ].map(lang => (
                <button 
                  key={lang.id}
                  onClick={() => changeLanguage(lang.id)}
                  style={{ 
                    padding: '1.25rem 1rem', 
                    borderRadius: '20px', 
                    background: i18n.language.startsWith(lang.id) ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-card)', 
                    border: '2px solid', 
                    borderColor: i18n.language.startsWith(lang.id) ? 'var(--primary)' : 'var(--glass-border)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: i18n.language.startsWith(lang.id) ? '0 8px 20px rgba(99, 102, 241, 0.15)' : 'var(--shadow)'
                  }}
                  onMouseEnter={(e) => {
                    if (!i18n.language.startsWith(lang.id)) {
                      e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!i18n.language.startsWith(lang.id)) {
                      e.currentTarget.style.borderColor = 'var(--glass-border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <div style={{ 
                    width: '44px', 
                    height: '30px', 
                    borderRadius: '6px', 
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    <img 
                      src={`https://flagcdn.com/w80/${lang.code}.png`} 
                      alt={lang.label}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  <span style={{ 
                    fontWeight: 800, 
                    fontSize: '0.85rem',
                    color: i18n.language.startsWith(lang.id) ? 'var(--text-main)' : 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em'
                  }}>
                    {lang.label}
                  </span>
                </button>
              ))}
            </div>
          </Motion.div>

          {/* Card 3: Menu Reordering */}
          <Motion.div data-testid="section-menu-order" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '1rem', color: 'var(--primary)' }}>
                <LayoutGrid size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('settings.navigation')}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500, margin: 0 }}>{t('settings.navigation_desc')}</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {menuOrder.map((id, index) => {
                const item = menuItems.find(i => i.id === id);
                if (!item) return null;
                const Icon = item.icon;
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <Icon size={18} style={{ color: 'var(--primary)' }} />
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => moveItem(index, -1)} disabled={index === 0} className="icon-btn" style={{ opacity: index === 0 ? 0.2 : 1 }}><ChevronUp size={18} /></button>
                      <button onClick={() => moveItem(index, 1)} disabled={index === menuOrder.length - 1} className="icon-btn" style={{ opacity: index === menuOrder.length - 1 ? 0.2 : 1 }}><ChevronDown size={18} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Motion.div>

          {/* Card 4: Email & System Notifications */}
          <Motion.div data-testid="section-notifications" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card" style={{ padding: '2rem' }}>
            <div className="settings-card-header" style={{ marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: '250px' }}>
                <div style={{ padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '1rem', color: 'var(--primary)', flexShrink: 0 }}>
                  <Bell size={24} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 900, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('settings.system')}</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500, margin: 0, lineHeight: 1.4 }}>{t('settings.system_desc')}</p>
                </div>
              </div>
              <button 
                data-testid="save-settings-button" 
                disabled={saving} 
                onClick={handleSave} 
                className="btn-primary" 
                style={{ 
                  padding: '0.8rem 2rem',
                  whiteSpace: 'nowrap'
                }}
              >
                {saving ? t('settings.saving') : <><Save size={18} /> {t('settings.save')}</>}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="input-group">
                  <label><Mail size={14} style={{ marginRight: '6px' }} /> {t('settings.recipient')}</label>
                  <input 
                    type="email" 
                    data-testid="recipient-email-input"
                    value={settings.recipient_email} 
                    onChange={e => setSettings({...settings, recipient_email: e.target.value})} 
                    placeholder="nome@email.com" 
                  />
                </div>
                <div className="input-group">
                  <label><ShieldCheck size={14} style={{ marginRight: '6px' }} /> {t('settings.bcc')}</label>
                  <input 
                    type="email" 
                    data-testid="bcc-email-input"
                    value={settings.bcc_email} 
                    onChange={e => setSettings({...settings, bcc_email: e.target.value})} 
                    placeholder="bcc@email.com" 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '20px', border: '1px solid var(--glass-border)' }}>
                {[
                  { key: 'skip_email_modal', label: t('settings.options.skip_modal'), desc: t('settings.options.skip_modal_desc'), testId: 'skip-email-modal-check' },
                  { key: 'skip_confirmations', label: t('settings.options.skip_confirm'), desc: t('settings.options.skip_confirm_desc'), testId: 'skip-confirmations-check' },
                  { key: 'auto_send_on_paid', label: t('settings.options.auto_send'), desc: t('settings.options.auto_send_desc'), testId: 'auto-send-check' }
                ].map(opt => (
                  <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', cursor: 'pointer', borderRadius: '12px', transition: '0.2s' }}>
                    <input 
                      type="checkbox" 
                      data-testid={opt.testId}
                      checked={settings[opt.key]}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setSettings({ ...settings, [opt.key]: val });
                        if (opt.key === 'skip_confirmations') localStorage.setItem('pc_skip_confirmations', val);
                      }}
                      style={{ width: '20px', height: '20px', accentColor: 'var(--primary)' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{opt.label}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </Motion.div>

          {/* Card: Database & Synchronization */}
          <Motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.35 }} 
            className="glass-card" 
            style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
            data-testid="section-sync"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '1rem', color: 'var(--primary)' }}>
                <Database size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('settings.sync_title', 'Dados & Sincronização')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500, margin: 0 }}>
                  {t('settings.sync_desc', 'Gerenciamento do banco de dados offline e sincronização manual.')}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Connection Status Row */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                padding: '1rem', 
                background: 'rgba(255,255,255,0.02)', 
                borderRadius: '16px', 
                border: '1px solid var(--glass-border)' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {isOnline ? (
                    <Wifi size={18} style={{ color: '#10b981' }} />
                  ) : (
                    <WifiOff size={18} style={{ color: '#ef4444' }} />
                  )}
                  <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    {t('settings.sync_connection_status', 'Status da Rede')}
                  </span>
                </div>
                <div style={{ 
                  padding: '0.4rem 0.8rem', 
                  background: isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                  border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`, 
                  borderRadius: '12px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem', 
                  color: isOnline ? '#10b981' : '#ef4444', 
                  fontSize: '0.8rem', 
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  {isOnline ? t('settings.sync_online', 'Online') : t('settings.sync_offline', 'Offline')}
                </div>
              </div>

              {/* Sync Queue Row */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                padding: '1rem', 
                background: 'rgba(255,255,255,0.02)', 
                borderRadius: '16px', 
                border: '1px solid var(--glass-border)' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <RefreshCw size={18} style={{ color: 'var(--primary)' }} className={syncing ? 'animate-spin' : ''} />
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                      {t('settings.sync_pending_changes', 'Alterações Pendentes')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {queueCount > 0 
                        ? t('settings.sync_pending_desc', 'Há alterações locais pendentes de envio.') 
                        : t('settings.sync_synced_desc', 'Seus dados locais estão totalmente atualizados.')}
                    </div>
                  </div>
                </div>
                <div style={{ 
                  padding: '0.4rem 0.8rem', 
                  background: queueCount > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)', 
                  border: `1px solid ${queueCount > 0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`, 
                  borderRadius: '12px', 
                  color: queueCount > 0 ? '#f59e0b' : '#10b981', 
                  fontSize: '0.85rem', 
                  fontWeight: 800 
                }}>
                  {queueCount}
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                disabled={syncing}
                onClick={handleManualSync}
                className="btn-primary"
                style={{
                  width: '100%',
                  padding: '1rem',
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: syncing ? 'not-allowed' : 'pointer'
                }}
              >
                {syncing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>{t('settings.sync_syncing', 'Sincronizando...')}</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={18} />
                    <span>{t('settings.sync_button', 'Sincronizar Agora')}</span>
                  </>
                )}
              </button>
            </div>
          </Motion.div>

          {/* Card 5: About System */}
          <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '1rem', color: 'var(--primary)' }}>
                <Info size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('settings.about_system')}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500, margin: 0 }}>{t('settings.about_desc')}</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{t('settings.version', 'Versão')}</span>
                  <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>1.7.0 (Stable)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{t('settings.build_id', 'Build ID')}</span>
                  <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>2026.05.12</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{t('settings.design_system', 'Design System')}</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 800 }}>Orbit Core</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <a 
                  href="https://github.com" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn-secondary" 
                  style={{ flex: 1, padding: '0.75rem', fontSize: '0.8rem', justifyContent: 'center' }}
                >
                  <Globe size={16} /> GitHub
                </a>
                <div style={{ flex: 1, padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#10b981', fontSize: '0.8rem', fontWeight: 700 }}>
                  <CheckCircle size={16} /> Online
                </div>
              </div>
            </div>
          </Motion.div>
        </div>
      )}

      {/* ── SECURITY TAB ── */}
      {activeTab === 'settings-security' && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', 
          gap: '1.5rem', 
          alignItems: 'start' 
        }}>
          
          {/* Card 1: Change Password */}
          <Motion.div data-testid="section-security" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(99,102,241,0.1)', borderRadius: '1rem', color: 'var(--primary)' }}>
                <KeyRound size={24} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('settings.vault')}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>{t('settings.vault_desc')}</p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {[{ key: 'current', label: t('settings.current_password') }, { key: 'next', label: t('settings.new_password') }, { key: 'confirm', label: t('settings.confirm_password') }].map(({ key, label }) => (
                <div key={key} className="input-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={pwShow[key] ? 'text' : 'password'}
                      data-testid={`password-input-${key}`}
                      placeholder="••••••••"
                      value={pwForm[key]}
                      onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                      required
                      style={{ paddingRight: '2.5rem', borderRadius: '12px' }}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem', borderRadius: '12px', background: pwMessage.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${pwMessage.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: pwMessage.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>{pwMessage.text}</span>
                </div>
              )}

              <button disabled={pwSaving} className="btn-primary" type="submit" style={{ width: '100%', padding: '1rem', borderRadius: '14px' }}>
                {pwSaving ? '...' : <><Lock size={18} /> {t('settings.change_password_btn')}</>}
              </button>
            </form>
          </Motion.div>


        </div>
      )}
    </div>
  );
}
