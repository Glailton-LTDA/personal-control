import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Mail, User, Tag, ArrowLeft } from 'lucide-react';

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
    await supabase.from('finance_responsibles').update({ is_main: false });
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
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
        
        {/* Categorias */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Tag size={20} color="var(--primary)"/> Categorias Customizadas
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <input 
              placeholder="Nova Categoria..." className="input-field" 
              style={{ flex: 1, background: 'var(--input-bg)', border: '1px solid var(--glass-border)', padding: '0.75rem', borderRadius: '0.75rem', color: 'white' }}
              value={newCat.name} onChange={e => setNewCat({...newCat, name: e.target.value})}
            />
            <select 
              value={newCat.type} onChange={e => setNewCat({...newCat, type: e.target.value})}
              style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)', padding: '0.75rem', borderRadius: '0.75rem', color: 'white' }}
            >
              <option value="DESPESA">Gasto</option>
              <option value="RECEITA">Entrada</option>
            </select>
            <button className="btn-primary" onClick={addCategory}><Plus size={20}/></button>
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

        {/* Responsáveis */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <User size={20} color="var(--primary)"/> Responsáveis e E-mails
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <input 
              placeholder="Nome do Responsável..." className="input-field" 
              style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)', padding: '0.75rem', borderRadius: '0.75rem', color: 'white' }}
              value={newResp.name} onChange={e => setNewResp({...newResp, name: e.target.value})}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                placeholder="E-mail para notificações..." className="input-field" 
                style={{ flex: 1, background: 'var(--input-bg)', border: '1px solid var(--glass-border)', padding: '0.75rem', borderRadius: '0.75rem', color: 'white' }}
                value={newResp.email} onChange={e => setNewResp({...newResp, email: e.target.value})}
              />
              <button className="btn-primary" onClick={addResponsible}><Plus size={20}/></button>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                <th style={{ paddingBottom: '0.5rem' }}>PRINCIPAL</th>
                <th style={{ paddingBottom: '0.5rem' }}>NOME</th>
                <th style={{ paddingBottom: '0.5rem' }}>E-MAIL</th>
                <th style={{ paddingBottom: '0.5rem', textAlign: 'right' }}>AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {responsibles.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '0.75rem 0' }}>
                    <input 
                      type="radio" 
                      name="main_resp" 
                      checked={r.is_main} 
                      onChange={() => setMainResponsible(r.id)}
                      style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                    />
                  </td>
                  <td style={{ padding: '0.75rem 0', fontWeight: r.is_main ? 600 : 400 }}>
                    {r.name} {r.is_main && <span style={{ fontSize: '0.65rem', background: 'var(--primary)', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '1rem', marginLeft: '0.5rem' }}>PRINCIPAL</span>}
                  </td>
                  <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{r.email}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Trash2 size={16} style={{ cursor: 'pointer', color: 'var(--danger)' }} onClick={() => deleteItem('finance_responsibles', r.id)}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Config de Email */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Mail size={20} color="var(--primary)"/> Template de Notificação
          </h3>
          <button className="btn-primary" onClick={saveConfig} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar Template'}
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Este e-mail será enviado ao responsável quando você clicar em "Enviar E-mail" na transação. 
          Use as variáveis: <code>{`\${descricao}, \${formattedAmount}, \${formattedDate}, \${pagoPor}, \${status}`}</code>
        </p>
        <textarea 
          style={{ width: '100%', minHeight: '200px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', padding: '1rem', borderRadius: '0.75rem', color: 'white', fontFamily: 'monospace', fontSize: '13px' }}
          value={emailTemplate}
          onChange={e => setEmailTemplate(e.target.value)}
        />
      </div>
    </div>
  );
}
