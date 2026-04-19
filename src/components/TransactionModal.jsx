import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Calendar, Tag, DollarSign, User, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function TransactionModal({ isOpen, onClose, onRefresh, user, initialData = null }) {
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    type: 'DESPESA',
    category: '',
    paid_by: '',
    status: 'PENDENTE'
  });
  
  const [categories, setCategories] = useState([]);
  const [responsibles, setResponsibles] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        payment_date: new Date(initialData.payment_date).toISOString().split('T')[0]
      });
    } else {
      setFormData({
        description: '',
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        type: 'DESPESA',
        category: '',
        paid_by: '',
        status: 'PENDENTE'
      });
    }
    fetchOptions();
  }, [initialData, isOpen]);

  async function fetchOptions() {
    const { data: catData } = await supabase.from('finance_categories').select('name, type');
    const { data: respData } = await supabase.from('finance_responsibles').select('name');
    if (catData) setCategories(catData);
    if (respData) setResponsibles(respData);
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (initialData?.id) {
      // Edit
      const { error } = await supabase.from('finances')
        .update({ ...formData })
        .eq('id', initialData.id);
      if (!error) {
        onRefresh();
        onClose();
      }
    } else {
      // Create
      const { error } = await supabase.from('finances').insert([
        { ...formData, user_id: user.id }
      ]);
      if (!error) {
        onRefresh();
        onClose();
      }
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  const filteredCategories = categories.filter(c => c.type === formData.type);

  return (
    <div className="modal-overlay">
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="glass-card modal-content"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{initialData ? 'Editar Lançamento' : 'Novo Lançamento'}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{initialData ? 'Altere as informações do registro' : 'Adicione uma nova transação financeira'}</p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label><Tag size={14} style={{ marginRight: '4px' }}/> Descrição</label>
            <input 
              type="text" required value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              placeholder="Ex: Aluguel, Salário..."
            />
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label><DollarSign size={14} style={{ marginRight: '4px' }}/> Valor (R$)</label>
              <input 
                type="number" step="0.01" required value={formData.amount}
                onChange={e => setFormData({...formData, amount: e.target.value})}
              />
            </div>
            <div className="input-group">
              <label><Calendar size={14} style={{ marginRight: '4px' }}/> Data</label>
              <input 
                type="date" required value={formData.payment_date}
                onChange={e => setFormData({...formData, payment_date: e.target.value})}
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>Tipo</label>
              <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                <option value="DESPESA">Despesa</option>
                <option value="RECEITA">Receita</option>
              </select>
            </div>
            <div className="input-group">
              <label><User size={14} style={{ marginRight: '4px' }}/> Responsável</label>
              <select 
                required value={formData.paid_by} 
                onChange={e => setFormData({...formData, paid_by: e.target.value})}
              >
                <option value="">Selecione...</option>
                {responsibles.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>Categoria</label>
              <select 
                required value={formData.category} 
                onChange={e => setFormData({...formData, category: e.target.value})}
              >
                <option value="">Selecione...</option>
                {filteredCategories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Status</label>
              <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option value="PAGO">Pago</option>
                <option value="PENDENTE">Pendente</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <button disabled={loading} className="btn-primary" style={{ width: '100%', height: '3.5rem' }}>
              {loading ? 'Processando...' : <><Save size={22} /> {initialData ? 'Atualizar Dados' : 'Salvar Lançamento'}</>}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
