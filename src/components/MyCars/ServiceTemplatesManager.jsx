import React, { useState, useEffect } from 'react';
import { Wrench } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

export default function ServiceTemplatesManager({ user }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ description: '', km_milestone: 10000 });

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
      user_id: user.id
    });
    if (!error) {
      setForm({ description: '', km_milestone: 10000 });
      fetchTemplates();
      toast.success('Milestone adicionado');
    } else {
      toast.error('Erro ao adicionar: ' + error.message);
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
    <div className="glass-card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
          <Wrench size={18} />
        </div>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Plano de Revisão -- Milestones</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Define em quais quilometragens cada serviço deve ser realizado.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="skeleton-loader" style={{ height: 120, borderRadius: 10 }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem', maxHeight: 400, overflowY: 'auto' }}>
          {existingNames.map(desc => (
            <div key={desc} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--glass-border)' }}>
              <span style={{ fontWeight: 600, fontSize: '0.82rem', minWidth: 200, paddingTop: 4 }}>{desc}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', flex: 1 }}>
                {grouped[desc].map(t => (
                  <span key={t.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, fontWeight: 600,
                    background: t.user_id ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${t.user_id ? 'rgba(99,102,241,0.3)' : 'var(--glass-border)'}`,
                    color: t.user_id ? 'var(--primary)' : 'var(--text-muted)'
                  }}>
                    {t.km_milestone.toLocaleString()} km
                    {t.user_id && <button onClick={() => deleteTemplate(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 0, lineHeight: 1, marginLeft: 2 }} title="Remover">x</button>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 500 }}>Adicionar milestone personalizado</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="input-group" style={{ flex: 2, minWidth: 180, marginBottom: 0 }}>
            <label style={{ fontSize: '0.72rem' }}>Serviço</label>
            <input
              type="text" list="template-names-mgr"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Ex: Troca de Correia Dentada"
              style={{ fontSize: '0.82rem' }}
            />
            <datalist id="template-names-mgr">
              {existingNames.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div className="input-group" style={{ flex: 1, minWidth: 130, marginBottom: 0 }}>
            <label style={{ fontSize: '0.72rem' }}>Quilometragem</label>
            <select value={form.km_milestone} onChange={e => setForm({ ...form, km_milestone: parseInt(e.target.value) })} style={{ fontSize: '0.82rem' }}>
              {[5000,10000,15000,20000,25000,30000,40000,50000,60000,70000,80000,90000,100000,120000,150000].map(k => (
                <option key={k} value={k}>{k.toLocaleString()} km</option>
              ))}
            </select>
          </div>
          <button className="btn-primary" onClick={addTemplate} disabled={saving || !form.description.trim()} style={{ padding: '8px 16px', fontSize: '0.82rem', height: 38 }}>
            {saving ? '...' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}
