import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Mail, User, Tag, Star } from 'lucide-react';

export default function FinanceSettings() {
  const [categories, setCategories] = useState([]);
  const [responsibles, setResponsibles] = useState([]);
  const [newCat, setNewCat] = useState({ name: '', type: 'DESPESA' });
  const [newResp, setNewResp] = useState({ name: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState('');

  useEffect(() => {
    fetchData();
    fetchConfig();
  }, []);

  async function fetchData() {
    const { data: catData } = await supabase.from('finance_categories').select('*').order('name');
    const { data: respData } = await supabase.from('finance_responsibles').select('*').order('name');
    if (catData) setCategories(catData);
    if (respData) setResponsibles(respData);
  }

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
    if (window.confirm('Excluir este item? Isso pode afetar registros vinculados.')) {
      await supabase.from(table).delete().eq('id', id);
      fetchData();
    }
  }

  async function fetchConfig() {
    const { data } = await supabase.from('finance_config').select('value').eq('key', 'email_template').single();
    if (data) setEmailTemplate(data.value);
  }

  async function saveConfig() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('finance_config').upsert({
      key: 'email_template',
      value: emailTemplate,
      user_id: user.id
    }, { onConflict: 'key' });
    if (!error) alert('Template salvo com sucesso!');
    setLoading(false);
  }

  return (
    <div className="settings-page">
      <div className="settings-group-grid">

        {/* Categorias */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Tag size={20} color="var(--primary)"/> Categorias Customizadas
          </h3>
          <div className="settings-input-row">
            <input
              placeholder="Nova Categoria..."
              className="settings-text-input"
              value={newCat.name}
              onChange={e => setNewCat({...newCat, name: e.target.value})}
              onKeyDown={e => e.key === 'Enter' && addCategory()}
            />
            <select
              className="settings-type-select"
              value={newCat.type}
              onChange={e => setNewCat({...newCat, type: e.target.value})}
            >
              <option value="DESPESA">Gasto</option>
              <option value="RECEITA">Entrada</option>
            </select>
            <button className="btn-primary settings-add-btn" onClick={addCategory}>
              <Plus size={20}/>
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {categories.map(c => (
              <div key={c.id} className="badge" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
                <span style={{ color: c.type === 'RECEITA' ? 'var(--success)' : 'inherit' }}>{c.name}</span>
                <Trash2 size={12} style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => deleteItem('finance_categories', c.id)}/>
              </div>
            ))}
          </div>
        </div>

        {/* Responsáveis — card list only, works on all screen sizes */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <User size={20} color="var(--primary)"/> Responsáveis e E-mails
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <input
              placeholder="Nome do Responsável..."
              className="settings-text-input"
              value={newResp.name}
              onChange={e => setNewResp({...newResp, name: e.target.value})}
            />
            <div className="settings-input-row" style={{ marginBottom: 0 }}>
              <input
                placeholder="E-mail para notificações..."
                className="settings-text-input"
                value={newResp.email}
                onChange={e => setNewResp({...newResp, email: e.target.value})}
                onKeyDown={e => e.key === 'Enter' && addResponsible()}
              />
              <button className="btn-primary settings-add-btn" onClick={addResponsible}>
                <Plus size={20}/>
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {responsibles.map(r => (
              <div
                key={r.id}
                className="settings-resp-card"
                style={{ borderColor: r.is_main ? 'var(--primary)' : 'var(--glass-border)' }}
              >
                <div className="settings-resp-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                    <button
                      onClick={() => setMainResponsible(r.id)}
                      disabled={loading}
                      title={r.is_main ? 'Principal atual' : 'Definir como principal'}
                      style={{
                        background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer',
                        color: r.is_main ? 'var(--primary)' : 'var(--text-muted)',
                        flexShrink: 0, padding: 4
                      }}
                    >
                      <Star size={18} fill={r.is_main ? 'currentColor' : 'none'}/>
                    </button>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="settings-resp-name">
                        {r.name}
                        {r.is_main && <span className="resp-badge-principal">PRINCIPAL</span>}
                      </div>
                      <div className="settings-resp-email">{r.email || 'Sem e-mail'}</div>
                    </div>
                  </div>
                  <Trash2
                    size={18}
                    style={{ cursor: 'pointer', color: 'var(--danger)', flexShrink: 0 }}
                    onClick={() => deleteItem('finance_responsibles', r.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Config de Email */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div className="settings-email-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Mail size={20} color="var(--primary)"/> Template de Notificação
          </h3>
          <button className="btn-primary" onClick={saveConfig} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar Template'}
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Este e-mail será enviado ao responsável quando você clicar em "Enviar E-mail" na transação.{' '}
          Use as variáveis: <code>{`\${descricao}, \${formattedAmount}, \${formattedDate}, \${pagoPor}, \${status}`}</code>
        </p>
        <textarea
          className="settings-textarea"
          value={emailTemplate}
          onChange={e => setEmailTemplate(e.target.value)}
        />
      </div>
    </div>
  );
}
