import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Edit2, Save, X, Palette } from 'lucide-react';

export default function InvestmentSettings({ user }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    institution: '',
    color: '#6366f1'
  });

  useEffect(() => {
    fetchAccounts();
  }, [user]);

  async function fetchAccounts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('investment_accounts')
      .select('*')
      .order('institution', { ascending: true })
      .order('name', { ascending: true });
    
    if (!error) setAccounts(data);
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (editingId) {
      const { error } = await supabase
        .from('investment_accounts')
        .update({
          name: formData.name,
          institution: formData.institution,
          color: formData.color
        })
        .eq('id', editingId);
      
      if (!error) {
        setEditingId(null);
        setIsAdding(false);
        setFormData({ name: '', institution: '', color: '#6366f1' });
        fetchAccounts();
      }
    } else {
      const { error } = await supabase
        .from('investment_accounts')
        .insert([{
          ...formData,
          user_id: user.id
        }]);
      
      if (!error) {
        setIsAdding(false);
        setFormData({ name: '', institution: '', color: '#6366f1' });
        fetchAccounts();
      }
    }
  }

  async function deleteAccount(id) {
    if (window.confirm('Tem certeza que deseja excluir esta conta? Todos os registros vinculados serão removidos.')) {
      const { error } = await supabase
        .from('investment_accounts')
        .delete()
        .eq('id', id);
      
      if (!error) fetchAccounts();
    }
  }

  const startEdit = (acc) => {
    setEditingId(acc.id);
    setFormData({
      name: acc.name,
      institution: acc.institution || '',
      color: acc.color || '#6366f1'
    });
    setIsAdding(true);
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Palette size={24} color="var(--primary)" /> Configurações de Investimentos
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>Gerencie suas contas, instituições e cores de identificação.</p>
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pading: '1.5rem', zIndex: 2000 }}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-card" 
              style={{ 
                padding: '2rem', 
                width: '100%',
                maxWidth: '600px', 
                border: '2px solid var(--primary)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-light)' }}>
                  {editingId ? 'Editar Conta' : 'Nova Conta de Investimento'}
                </h3>
                <button 
                  onClick={() => { setIsAdding(false); setEditingId(null); setFormData({ name: '', institution: '', color: '#6366f1' }); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem' }}>
                  <div className="input-group">
                    <label>Nome do Investimento/Conta</label>
                    <input 
                      type="text" 
                      value={formData.name} 
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="Ex: CDB C6, Nuconta..."
                      required
                      autoFocus
                    />
                  </div>
                  <div className="input-group">
                    <label>Instituição</label>
                    <input 
                      type="text" 
                      value={formData.institution} 
                      onChange={e => setFormData({...formData, institution: e.target.value})}
                      placeholder="Ex: Nubank, Itaú..."
                    />
                  </div>
                </div>
                
                <div style={{ marginBottom: '2rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Cor de Identificação</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ position: 'relative', width: '60px', height: '40px' }}>
                      <input 
                        type="color" 
                        value={formData.color} 
                        onChange={e => setFormData({...formData, color: e.target.value})}
                        style={{ 
                          opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer', zIndex: 2
                        }}
                      />
                      <div style={{ 
                        position: 'absolute', inset: 0, background: formData.color, borderRadius: '8px', border: '2px solid white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 1
                      }}></div>
                    </div>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Personalize a cor para os gráficos.
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    onClick={() => { setIsAdding(false); setEditingId(null); setFormData({ name: '', institution: '', color: '#6366f1' }); }}
                    style={{ padding: '0.75rem 1.5rem' }}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary" style={{ padding: '0.75rem 2rem' }}>
                    <Save size={18} /> {editingId ? 'Salvar Alterações' : 'Criar Conta'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {loading ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Carregando contas...</div>
        ) : accounts.length === 0 ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Nenhuma conta cadastrada ainda.</div>
        ) : accounts.map(acc => (
          <div 
            key={acc.id} 
            className="glass-card" 
            style={{ 
              padding: '1.25rem', 
              borderLeft: `6px solid ${acc.color || 'var(--primary)'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '40px', height: '40px', background: acc.color, opacity: 0.1, borderRadius: '50%' }}></div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>
                  {acc.institution || 'Instituição não informada'}
                </p>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '2px' }}>{acc.name}</h4>
              </div>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button className="icon-btn" onClick={() => startEdit(acc)} title="Editar"><Edit2 size={16} /></button>
                <button className="icon-btn danger" onClick={() => deleteAccount(acc.id)} title="Excluir"><Trash2 size={16} /></button>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: acc.color }}></div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{acc.color}</span>
            </div>
          </div>
        ))}
      </div>

      {/* FAB - Floating Action Button for New Account */}
      {!isAdding && (
        <button 
          className="contextual-fab" 
          onClick={() => setIsAdding(true)}
          title="Nova Conta"
        >
          <Plus size={32} />
        </button>
      )}
    </div>
  );
}
