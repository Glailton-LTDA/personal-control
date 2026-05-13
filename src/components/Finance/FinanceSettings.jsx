import React, { useState, useEffect, useCallback } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { 
  Plus, 
  Trash2, 
  User, 
  Tag, 
  Star, 
  ShieldCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { confirmToast } from '../../lib/toast';

export default function FinanceSettings() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [responsibles, setResponsibles] = useState([]);
  const [newCat, setNewCat] = useState({ name: '', type: 'DESPESA' });
  const [newResp, setNewResp] = useState({ name: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchData = useCallback(async () => {
    const { data: catData } = await supabase.from('finance_categories').select('*').order('name');
    const { data: respData } = await supabase.from('finance_responsibles').select('*').order('name');
    
    if (catData) {
      setCategories(catData);
    }
    if (respData) {
      setResponsibles(respData);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function addCategory() {
    if (!newCat.name) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('finance_categories').insert([{ ...newCat, user_id: user.id }]);
    setNewCat({ name: '', type: 'DESPESA' });
    fetchData();
  }

  async function addResponsible() {
    if (!newResp.name) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('finance_responsibles').insert([{ ...newResp, user_id: user.id }]);
    setNewResp({ name: '', email: '' });
    fetchData();
  }

  async function setMainResponsible(id) {
    setLoading(true);
    // Supabase rejects filterless updates — use .neq() to reset all others
    await supabase.from('finance_responsibles').update({ is_main: false }).neq('id', id);
    await supabase.from('finance_responsibles').update({ is_main: true }).eq('id', id);
    fetchData();
    setLoading(false);
  }

  async function deleteItem(table, id) {
    confirmToast(t('finances.confirm_delete_item', 'Excluir este item? Isso pode afetar registros vinculados.'), async () => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (!error) {
        fetchData();
        toast.success(t('common.success_delete'));
      } else {
        toast.error(t('common.error_deleting'));
      }
    }, { danger: true });
  }

  return (
    <Motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}
    >
      <div className="responsive-grid" style={{ 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: '2rem' 
      }}>

        {/* Categorias */}
        <Motion.div 
          initial={{ opacity: 0, x: -20 }} 
          animate={{ opacity: 1, x: 0 }} 
          className="glass-card" 
          style={{ padding: isMobile ? '1.5rem' : '2rem', display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '16px', color: 'var(--primary)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                <Tag size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.02em' }}>{t('finances.settings.categories_title')}</h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>{t('finances.settings.categories_desc')}</p>
              </div>
            </div>
          </div>

          <div style={{ 
            display: 'flex', 
            flexDirection: isMobile ? 'column' : 'row',
            gap: '0.75rem', 
            marginBottom: '2rem' 
          }}>
            <input
              placeholder={t('finances.settings.category_name_placeholder')}
              className="glass-input"
              style={{ flex: 1, height: '48px', fontWeight: '600' }}
              value={newCat.name}
              onChange={e => setNewCat({...newCat, name: e.target.value})}
              onKeyDown={e => e.key === 'Enter' && addCategory()}
            />
            <div style={{ display: 'flex', gap: '0.75rem', width: isMobile ? '100%' : 'auto' }}>
              <select
                className="glass-input"
                style={{ flex: isMobile ? 1 : '0 0 130px', height: '48px', padding: '0 1rem', fontWeight: '700' }}
                value={newCat.type}
                onChange={e => setNewCat({...newCat, type: e.target.value})}
              >
                <option value="DESPESA">{t('finances.settings.expense_type', 'Gasto')}</option>
                <option value="RECEITA">{t('finances.settings.income_type', 'Entrada')}</option>
              </select>
              <button 
                className="btn-primary" 
                onClick={addCategory}
                style={{ height: '48px', width: '48px', padding: 0, borderRadius: '14px', flexShrink: 0 }}
              >
                <Plus size={24}/>
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <AnimatePresence>
              {categories.map(c => (
                <Motion.div 
                  key={c.id} 
                  initial={{ opacity: 0, scale: 0.9 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ translateY: -2 }}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.75rem', 
                    padding: '0.75rem 1.25rem',
                    background: 'var(--card-action-bg)',
                    borderRadius: '14px',
                    border: '1px solid var(--glass-border)',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    transition: '0.2s'
                  }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.type === 'RECEITA' ? 'var(--success)' : 'var(--text-muted)', boxShadow: c.type === 'RECEITA' ? '0 0 8px var(--success)' : 'none' }} />
                  <span style={{ color: 'var(--text-main)' }}>{c.name}</span>
                  <button 
                    onClick={() => deleteItem('finance_categories', c.id)}
                    className="action-btn danger"
                    style={{ width: '24px', height: '24px', border: 'none', background: 'none' }}
                  >
                    <Trash2 size={16} style={{ opacity: 0.6 }}/>
                  </button>
                </Motion.div>
              ))}
            </AnimatePresence>
            {categories.length === 0 && (
              <div style={{ width: '100%', textAlign: 'center', padding: '2rem', opacity: 0.3 }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>{t('finances.settings.no_custom_categories', 'Nenhuma categoria personalizada')}</p>
              </div>
            )}
          </div>
        </Motion.div>

        {/* Responsáveis */}
        <Motion.div 
          initial={{ opacity: 0, x: 20 }} 
          animate={{ opacity: 1, x: 0 }} 
          className="glass-card" 
          style={{ padding: '2rem' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '16px', color: 'var(--success)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <User size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.02em' }}>{t('finances.settings.responsibles_title')}</h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>{t('finances.settings.responsibles_desc')}</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
            <div style={{ 
              display: 'flex', 
              flexDirection: isMobile ? 'column' : 'row',
              gap: '0.75rem' 
            }}>
              <input
                placeholder={t('finances.settings.name_placeholder')}
                className="glass-input"
                style={{ flex: 1, height: '48px', fontWeight: '600' }}
                value={newResp.name}
                onChange={e => setNewResp({...newResp, name: e.target.value})}
              />
              <div style={{ display: 'flex', gap: '0.75rem', width: isMobile ? '100%' : 'auto' }}>
                <input
                  placeholder={t('finances.settings.email_placeholder')}
                  className="glass-input"
                  style={{ flex: 1, height: '48px', fontWeight: '600' }}
                  value={newResp.email}
                  onChange={e => setNewResp({...newResp, email: e.target.value})}
                  onKeyDown={e => e.key === 'Enter' && addResponsible()}
                />
                <button 
                  className="btn-primary" 
                  onClick={addResponsible}
                  style={{ height: '48px', width: '48px', padding: 0, background: 'var(--success)', borderRadius: '14px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)', flexShrink: 0 }}
                >
                  <Plus size={24}/>
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <AnimatePresence>
              {responsibles.map(r => (
                <Motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  whileHover={{ scale: 1.01, background: 'var(--bg-card)' }}
                  style={{ 
                    padding: '1.25rem',
                    background: r.is_main ? 'rgba(99, 102, 241, 0.08)' : 'var(--card-action-bg)',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: r.is_main ? 'rgba(99, 102, 241, 0.3)' : 'var(--glass-border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.25rem',
                    transition: '0.2s'
                  }}
                >
                  <button
                    onClick={() => setMainResponsible(r.id)}
                    disabled={loading}
                    style={{
                      background: 'none', 
                      border: 'none', 
                      cursor: loading ? 'default' : 'pointer',
                      color: r.is_main ? 'var(--primary)' : 'var(--text-muted)',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: '0.2s'
                    }}
                  >
                    <Star size={24} fill={r.is_main ? 'currentColor' : 'none'} style={{ filter: r.is_main ? 'drop-shadow(0 0 4px var(--primary))' : 'none' }}/>
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem' }}>
                      {r.name}
                      {r.is_main && <span style={{ fontSize: '10px', background: 'var(--primary)', color: 'white', padding: '2px 8px', borderRadius: '6px', fontWeight: 900, letterSpacing: '0.05em' }}>{t('finances.settings.main_label')}</span>}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.email || t('finances.settings.no_email_config', 'Sem e-mail configurado')}</div>
                  </div>

                  <button 
                    onClick={() => deleteItem('finance_responsibles', r.id)}
                    className="action-btn danger"
                    style={{ width: '40px', height: '40px' }}
                  >
                    <Trash2 size={20}/>
                  </button>
                </Motion.div>
              ))}
            </AnimatePresence>
            {responsibles.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.3 }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>{t('finances.settings.no_responsibles', 'Nenhum responsável cadastrado')}</p>
              </div>
            )}
          </div>
        </Motion.div>
      </div>

      {/* Dica de Segurança / Audit */}
      <Motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        className="glass-card" 
        style={{ 
          padding: '1.5rem', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1.25rem', 
          borderLeft: '5px solid var(--primary)',
          background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.05), transparent)'
        }}
      >
        <div style={{ 
          width: '48px', 
          height: '48px', 
          borderRadius: '14px', 
          background: 'rgba(99, 102, 241, 0.1)', 
          color: 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <ShieldCheck size={28} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>{t('finances.settings.security_active', 'Segurança de Dados Ativa')}</p>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500, lineHeight: '1.4' }}>
            {t('finances.settings.security_desc', 'Seus dados financeiros estão protegidos por políticas de Row Level Security (RLS) no Supabase. Somente você tem acesso aos seus registros e configurações personalizadas.')}
          </p>
        </div>
      </Motion.div>

    </Motion.div>
  );
}
