import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Edit2, Save, X, Palette, Building2, Layers, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import { useEncryption } from '../../contexts/EncryptionContext';

export default function InvestmentSettings({ user }) {
  const [activeTab, setActiveTab] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [accountTypes, setAccountTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const { encryptObject, decryptObject } = useEncryption();
  
  const [formData, setFormData] = useState({
    name: '',
    institution_id: '',
    account_type_id: '',
    color: '#6366f1'
  });

  const [instData, setInstData] = useState({
    name: '',
    color: '#6366f1'
  });

  const [typeData, setTypeData] = useState({
    name: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch Institutions
      const { data: insts } = await supabase.from('investment_institutions').select('*').order('name');
      setInstitutions(insts || []);

      // Fetch Account Types
      const { data: types } = await supabase.from('investment_account_types').select('*').order('name');
      setAccountTypes(types || []);

      // Fetch Accounts with joins
      const { data: accs } = await supabase
        .from('investment_accounts')
        .select('*, institution:investment_institutions(name), type:investment_account_types(name)')
        .order('name');
      
      if (accs) {
        const decrypted = await decryptObject(accs, ['name']);
        setAccounts(decrypted);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [decryptObject]);

  useEffect(() => {
    fetchData();
  }, [user, fetchData]);

  const resetForms = () => {
    setFormData({ name: '', institution_id: '', account_type_id: '', color: '#6366f1' });
    setInstData({ name: '', color: '#6366f1' });
    setTypeData({ name: '' });
    setEditingId(null);
    setIsAdding(false);
  };

  async function handleAccountSubmit(e) {
    e.preventDefault();
    const encrypted = await encryptObject(formData, ['name']);
    
    if (editingId) {
      const { error } = await supabase
        .from('investment_accounts')
        .update({
          name: encrypted.name,
          institution_id: formData.institution_id || null,
          account_type_id: formData.account_type_id || null,
          color: formData.color
        })
        .eq('id', editingId);
      
      if (!error) {
        toast.success('Conta atualizada');
        resetForms();
        fetchData();
      }
    } else {
      const { error } = await supabase
        .from('investment_accounts')
        .insert([{
          ...encrypted,
          institution_id: formData.institution_id || null,
          account_type_id: formData.account_type_id || null,
          user_id: user.id
        }]);
      
      if (!error) {
        toast.success('Conta criada');
        resetForms();
        fetchData();
      }
    }
  }

  async function handleInstitutionSubmit(e) {
    e.preventDefault();
    if (editingId) {
      const { error } = await supabase
        .from('investment_institutions')
        .update(instData)
        .eq('id', editingId);
      if (!error) { toast.success('Instituição atualizada'); resetForms(); fetchData(); }
    } else {
      const { error } = await supabase
        .from('investment_institutions')
        .insert([{ ...instData, user_id: user.id }]);
      if (!error) { toast.success('Instituição criada'); resetForms(); fetchData(); }
    }
  }

  async function handleTypeSubmit(e) {
    e.preventDefault();
    if (editingId) {
      const { error } = await supabase
        .from('investment_account_types')
        .update(typeData)
        .eq('id', editingId);
      if (!error) { toast.success('Tipo atualizado'); resetForms(); fetchData(); }
    } else {
      const { error } = await supabase
        .from('investment_account_types')
        .insert([{ ...typeData, user_id: user.id }]);
      if (!error) { toast.success('Tipo criado'); resetForms(); fetchData(); }
    }
  }

  const deleteItem = async (table, id, label) => {
    confirmToast(`Tem certeza que deseja excluir este ${label}?`, async () => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (!error) { toast.success(`${label} excluído`); fetchData(); }
      else { toast.error('Erro ao excluir item. Verifique se existem dependências.'); }
    }, { danger: true });
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '5rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Palette size={24} color="var(--primary)" /> Configurações de Investimentos
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>Personalize suas contas, instituições e categorias.</p>
      </div>

      <div className="tabs-container" style={{ marginBottom: '2rem' }}>
        <button className={`tab-btn ${activeTab === 'accounts' ? 'active' : ''}`} onClick={() => setActiveTab('accounts')}>
          <CreditCard size={18} /> Contas
        </button>
        <button className={`tab-btn ${activeTab === 'institutions' ? 'active' : ''}`} onClick={() => setActiveTab('institutions')}>
          <Building2 size={18} /> Instituições
        </button>
        <button className={`tab-btn ${activeTab === 'types' ? 'active' : ''}`} onClick={() => setActiveTab('types')}>
          <Layers size={18} /> Tipos de Conta
        </button>
      </div>

      <AnimatePresence mode="wait">
        {isAdding && (
          <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', zIndex: 2000 }}>
            <Motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-card" 
              style={{ padding: '2rem', width: '100%', maxWidth: '600px', border: '2px solid var(--primary)', position: 'relative' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {editingId ? 'Editar' : 'Novo(a)'} {activeTab === 'accounts' ? 'Conta' : activeTab === 'institutions' ? 'Instituição' : 'Tipo'}
                </h3>
                <button onClick={resetForms} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>
              </div>

              {activeTab === 'accounts' && (
                <form onSubmit={handleAccountSubmit}>
                  <div className="form-grid">
                    <div className="input-group">
                      <label>Nome da Conta</label>
                      <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                    </div>
                    <div className="input-group">
                      <label>Instituição</label>
                      <select className="glass-input" value={formData.institution_id} onChange={e => setFormData({...formData, institution_id: e.target.value})}>
                        <option value="">Selecione...</option>
                        {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </div>
                    <div className="input-group">
                      <label>Tipo de Conta</label>
                      <select className="glass-input" value={formData.account_type_id} onChange={e => setFormData({...formData, account_type_id: e.target.value})}>
                        <option value="">Selecione...</option>
                        {accountTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="input-group">
                      <label>Cor do Gráfico</label>
                      <input type="color" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} style={{ height: '45px', padding: '4px' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2.5rem' }}>
                    <button type="button" className="btn-cancel" onClick={resetForms}>Cancelar</button>
                    <button type="submit" className="btn-primary"><Save size={18} /> Salvar</button>
                  </div>
                </form>
              )}

              {activeTab === 'institutions' && (
                <form onSubmit={handleInstitutionSubmit}>
                  <div className="input-group">
                    <label>Nome da Instituição</label>
                    <input type="text" value={instData.name} onChange={e => setInstData({...instData, name: e.target.value})} required />
                  </div>
                  <div className="input-group">
                    <label>Cor de Identificação</label>
                    <input type="color" value={instData.color} onChange={e => setInstData({...instData, color: e.target.value})} style={{ height: '45px', padding: '4px' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2.5rem' }}>
                    <button type="button" className="btn-cancel" onClick={resetForms}>Cancelar</button>
                    <button type="submit" className="btn-primary"><Save size={18} /> Salvar</button>
                  </div>
                </form>
              )}

              {activeTab === 'types' && (
                <form onSubmit={handleTypeSubmit}>
                  <div className="input-group">
                    <label>Nome do Tipo de Conta</label>
                    <input type="text" value={typeData.name} onChange={e => setTypeData({...typeData, name: e.target.value})} required placeholder="Ex: CDB, FII, Ações..." />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2.5rem' }}>
                    <button type="button" className="btn-cancel" onClick={resetForms}>Cancelar</button>
                    <button type="submit" className="btn-primary"><Save size={18} /> Salvar</button>
                  </div>
                </form>
              )}
            </Motion.div>
          </div>
        )}
      </AnimatePresence>

      <Motion.div 
        key={activeTab}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}
      >
        {loading ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem' }}>Carregando...</div>
        ) : (
          <>
            {activeTab === 'accounts' && (
              accounts.length === 0 ? <p style={{ gridColumn: '1/-1', textAlign: 'center' }}>Nenhuma conta cadastrada.</p> :
              accounts.map(acc => (
                <div key={acc.id} className="glass-card" style={{ padding: '1.5rem', borderLeft: `6px solid ${acc.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                        {acc.institution?.name || 'Sem Instituição'} • {acc.type?.name || 'Sem Tipo'}
                      </p>
                      <h4 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{acc.name}</h4>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="icon-btn" onClick={() => { setEditingId(acc.id); setFormData({ name: acc.name, institution_id: acc.institution_id || '', account_type_id: acc.account_type_id || '', color: acc.color }); setIsAdding(true); }}><Edit2 size={16} /></button>
                      <button className="icon-btn danger" onClick={() => deleteItem('investment_accounts', acc.id, 'Conta')}><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              ))
            )}

            {activeTab === 'institutions' && (
              institutions.length === 0 ? <p style={{ gridColumn: '1/-1', textAlign: 'center' }}>Nenhuma instituição cadastrada.</p> :
              institutions.map(i => (
                <div key={i.id} className="glass-card" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: i.color }}></div>
                    <span style={{ fontWeight: 600 }}>{i.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="icon-btn" onClick={() => { setEditingId(i.id); setInstData({ name: i.name, color: i.color }); setIsAdding(true); }}><Edit2 size={16} /></button>
                    <button className="icon-btn danger" onClick={() => deleteItem('investment_institutions', i.id, 'Instituição')}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))
            )}

            {activeTab === 'types' && (
              accountTypes.length === 0 ? <p style={{ gridColumn: '1/-1', textAlign: 'center' }}>Nenhum tipo cadastrado.</p> :
              accountTypes.map(t => (
                <div key={t.id} className="glass-card" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="icon-btn" onClick={() => { setEditingId(t.id); setTypeData({ name: t.name }); setIsAdding(true); }}><Edit2 size={16} /></button>
                    <button className="icon-btn danger" onClick={() => deleteItem('investment_account_types', t.id, 'Tipo')}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </Motion.div>

      {!isAdding && (
        <button className="contextual-fab" onClick={() => setIsAdding(true)}><Plus size={32} /></button>
      )}
    </div>
  );
}
