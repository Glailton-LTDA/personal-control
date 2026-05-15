import React, { useState, useEffect } from 'react';
import { Wrench, Plus, Trash2, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export default function ServiceTemplatesManager({ user }) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ description: '', km_milestone: 10000, interval_km: 10000, interval_months: 12 });

  useEffect(() => { fetchTemplates(); }, []);

  async function fetchTemplates() {
    setLoading(true);
    const { data } = await supabase
      .from('car_service_templates')
      .select('*')
      .order('description')
      .order('km_milestone');
    if (data) setTemplates(data);
    setLoading(false);
  }

  async function addTemplate() {
    if (!form.description.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('car_service_templates').insert({
      description: form.description.trim(),
      km_milestone: parseInt(form.km_milestone),
      interval_km: form.interval_km ? parseInt(form.interval_km) : null,
      interval_months: form.interval_months ? parseInt(form.interval_months) : null,
      user_id: user.id
    });
    if (!error) {
      setForm({ description: '', km_milestone: 10000, interval_km: 10000, interval_months: 12 });
      fetchTemplates();
      toast.success(t('cars.milestone_added', 'Milestone adicionado!'));
    } else {
      toast.error(t('cars.errors.service_log_failed', 'Erro ao adicionar') + ': ' + error.message);
    }
    setSaving(false);
  }

  async function deleteTemplate(id) {
    await supabase.from('car_service_templates').delete().eq('id', id);
    fetchTemplates();
  }

  const grouped = templates.reduce((acc, t) => {
    if (!acc[t.description]) acc[t.description] = [];
    acc[t.description].push(t);
    return acc;
  }, {});

  const existingNames = Object.keys(grouped).sort();

  return (
    <div className="glass-card" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div className="cat-icon-wrap" style={{ "--cat-color": "var(--primary)", width: 44, height: 44, borderRadius: 12 }}>
          <Wrench size={22} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>{t('cars.master_revision_plan', 'Plano de Revisão Mestre')}</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            {t('cars.manage_milestones', 'Gerencie os marcos de quilometragem globais.')}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="skeleton-loader" style={{ height: 160, borderRadius: 16 }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem', maxHeight: 450, overflowY: 'auto', paddingRight: '0.5rem' }}>
          {existingNames.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', background: 'var(--card-action-bg)', borderRadius: '12px' }}>
              {t('cars.no_custom_milestones', 'Nenhum milestone personalizado definido.')}
            </div>
          ) : (
            existingNames.map(desc => (
              <div key={desc} style={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: '0.75rem', 
                padding: '1.25rem', 
                background: 'var(--card-action-bg)', 
                borderRadius: '16px', 
                border: '1px solid var(--glass-border)' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                   <div style={{ width: 4, height: 16, borderRadius: 2, background: 'var(--primary)' }} />
                   <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)' }}>{desc}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {grouped[desc].map(t => (
                    <div key={t.id} className="status-badge" style={{
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: t.user_id ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                      color: t.user_id ? 'var(--primary)' : 'var(--text-muted)',
                      border: `1px solid ${t.user_id ? 'rgba(99, 102, 241, 0.2)' : 'var(--glass-border)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <Calendar size={12} />
                      {t.km_milestone.toLocaleString()} km
                      {(t.interval_km || t.interval_months) && (
                        <span style={{ opacity: 0.6, fontSize: '0.65rem', marginLeft: '4px' }}>
                          ({t.interval_km ? `${t.interval_km/1000}k km` : ''} 
                           {t.interval_km && t.interval_months ? ' / ' : ''}
                           {t.interval_months ? `${t.interval_months}m` : ''})
                        </span>
                      )}
                      {t.user_id && (
                        <button 
                          onClick={() => deleteTemplate(t.id)} 
                          style={{ 
                            background: 'none', border: 'none', cursor: 'pointer', 
                            color: 'var(--danger)', padding: 0, display: 'flex', 
                            alignItems: 'center', opacity: 0.7, marginLeft: '4px'
                          }}
                        >
                          <Plus size={14} style={{ transform: 'rotate(45deg)' }} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--text-main)' }}>{t('cars.new_custom_milestone', 'Novo Milestone Personalizado')}</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>{t('cars.service_description', 'Descrição do Serviço')}</label>
            <input
              type="text" list="template-names-mgr"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Ex: Correia Dentada"
            />
            <datalist id="template-names-mgr">
              {existingNames.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>{t('cars.checkpoint_km', 'Checkpoint (KM)')}</label>
            <select value={form.km_milestone} onChange={e => setForm({ ...form, km_milestone: parseInt(e.target.value) })}>
              {[5000,10000,15000,20000,25000,30000,40000,50000,60000,70000,80000,90000,100000,120000,150000].map(k => (
                <option key={k} value={k}>{k.toLocaleString()} km</option>
              ))}
            </select>
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '1rem', alignItems: 'end' }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>{t('cars.interval_km', 'Recorrência (KM)')}</label>
            <input
              type="number"
              value={form.interval_km}
              onChange={e => setForm({ ...form, interval_km: e.target.value })}
              placeholder="Ex: 10000"
            />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>{t('cars.interval_months', 'Recorrência (Meses)')}</label>
            <input
              type="number"
              value={form.interval_months}
              onChange={e => setForm({ ...form, interval_months: e.target.value })}
              placeholder="Ex: 12"
            />
          </div>
          <button className="btn-primary" onClick={addTemplate} disabled={saving || !form.description.trim()} style={{ height: '42px', padding: '0 1.5rem' }}>
            <Plus size={18} /> {saving ? '...' : t('common.add', 'Adicionar')}
          </button>
        </div>
      </div>
    </div>
  );
}
