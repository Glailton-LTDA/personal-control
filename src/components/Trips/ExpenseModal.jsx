import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Save, DollarSign, Calendar, Tag, Users, FileText } from 'lucide-react';

export default function ExpenseModal({ user, trip, expense, currency: initialCurrency, categories: initialCategories, onClose, onSave }) {
  const [categories, setCategories] = useState(initialCategories || []);
  const formatDateToDisplay = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  const parseDisplayDateToISO = (displayDate) => {
    if (!displayDate) return '';
    const [day, month, year] = displayDate.split('/');
    if (!day || !month || !year) return '';
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  };

  const [displayDate, setDisplayDate] = useState(formatDateToDisplay(expense?.date || new Date().toISOString().split('T')[0]));
  const [isCustomDate, setIsCustomDate] = useState(false);
  
  const [formData, setFormData] = useState({
    description: expense?.description || '',
    amount: expense?.amount || '',
    date: expense?.date || new Date().toISOString().split('T')[0],
    paid_by: expense?.paid_by || 'Glailton Costa',
    category_id: expense?.category_id || '',
    currency: expense?.currency || initialCurrency || trip?.currencies?.[0] || 'BRL'
  });
  const [isCustomPaidBy, setIsCustomPaidBy] = useState(false);

  const participants = trip?.participants && trip.participants.length > 0 
    ? trip.participants 
    : ['Glailton', 'Deisianne'];

  useEffect(() => {
    if (!initialCategories || initialCategories.length === 0) {
      fetchCategories();
    }
  }, []);

  async function fetchCategories() {
    const { data } = await supabase.from('trip_categories').select('*').eq('user_id', user.id).order('name', { ascending: true });
    if (data) setCategories(data);
  }

  const handleDateChange = (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 8) val = val.slice(0, 8);
    
    let formatted = val;
    if (val.length > 2) formatted = val.slice(0, 2) + '/' + val.slice(2);
    if (val.length > 4) formatted = formatted.slice(0, 5) + '/' + formatted.slice(5);
    
    setDisplayDate(formatted);
    
    if (formatted.length === 10) {
      const iso = parseDisplayDateToISO(formatted);
      if (iso && !isNaN(new Date(iso).getTime())) {
        setFormData({ ...formData, date: iso });
      }
    }
  };

  // Generate dates for the trip
  const tripDates = React.useMemo(() => {
    if (!trip?.start_date || !trip?.end_date) return [];
    const dates = [];
    let curr = new Date(trip.start_date + 'T12:00:00');
    const end = new Date(trip.end_date + 'T12:00:00');
    while (curr <= end) {
      dates.push({
        iso: curr.toISOString().split('T')[0],
        display: formatDateToDisplay(curr.toISOString().split('T')[0])
      });
      curr.setDate(curr.getDate() + 1);
    }
    return dates.reverse(); // Most recent dates first
  }, [trip]);

  useEffect(() => {
    // If the current date is not in tripDates, switch to custom mode
    if (tripDates.length > 0 && !tripDates.find(d => d.display === displayDate)) {
      setIsCustomDate(true);
    }
  }, [tripDates, displayDate]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!trip) {
      alert('Selecione uma viagem primeiro.');
      return;
    }

    const isoDate = parseDisplayDateToISO(displayDate);
    if (!isoDate || isNaN(new Date(isoDate).getTime())) {
      alert('Por favor, insira uma data válida (DD/MM/AAAA)');
      return;
    }

    const payload = {
      user_id: user.id,
      trip_id: trip.id,
      description: formData.description,
      amount: parseFloat(formData.amount),
      currency: formData.currency,
      date: isoDate,
      paid_by: formData.paid_by,
      category_id: formData.category_id || null
    };

    let result;
    if (expense?.id) {
      result = await supabase.from('trip_expenses').update(payload).eq('id', expense.id);
    } else {
      result = await supabase.from('trip_expenses').insert([payload]);
    }

    const { error } = result;

    if (!error) onSave();
    else alert('Erro ao salvar: ' + error.message);
  }

  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="glass-card fade-in" style={{ 
        width: '100%', 
        maxWidth: '550px', 
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-card)', 
        border: '1px solid var(--glass-border)', 
        borderRadius: '24px', 
        boxShadow: 'var(--shadow)',
        overflow: 'hidden'
      }}>
        {/* Fixed Header */}
        <div style={{ padding: '2.5rem 2.5rem 1.5rem 2.5rem', position: 'relative', borderBottom: '1px solid var(--glass-border)' }}>
          <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
            {expense ? 'Editar Lançamento' : 'Novo Lançamento'}
          </h2>
          <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            {expense ? 'Atualize os detalhes deste gasto' : 'Adicione um novo gasto à sua viagem'}
          </p>
          <button className="icon-btn" onClick={onClose} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', padding: '0.5rem', color: 'var(--text-muted)' }}><X size={24} /></button>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: '2rem 2.5rem 2.5rem 2.5rem', overflowY: 'auto', flex: 1 }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}>
              <Tag size={16} /> Descrição
            </label>
            <input 
              required autoFocus className="glass-input" 
              style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '1rem 1.25rem', borderRadius: '12px' }} 
              value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Ex: Jantar em Cusco, Passagens..." 
            />
          </div>

          <div className="form-grid">
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}>
                <DollarSign size={16} /> Valor
              </label>
              <input 
                required type="number" step="0.01" className="glass-input" 
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.75rem 1rem', borderRadius: '12px', outline: 'none' }} 
                value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} placeholder="0.00" 
              />
            </div>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}>
                Moeda
              </label>
              <select 
                required className="glass-input" 
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.75rem 1rem', borderRadius: '12px', outline: 'none' }} 
                value={formData.currency} onChange={e => setFormData({...formData, currency: e.target.value})}
              >
                {trip?.currencies?.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}>
                <Calendar size={16} /> Data
              </label>
              
              {!isCustomDate && tripDates.length > 0 ? (
                <select 
                  className="glass-input" 
                  style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.75rem 1rem', borderRadius: '12px', outline: 'none' }} 
                  value={displayDate} 
                  onChange={e => {
                    if (e.target.value === 'CUSTOM') {
                      setIsCustomDate(true);
                    } else {
                      setDisplayDate(e.target.value);
                      const iso = parseDisplayDateToISO(e.target.value);
                      if (iso) setFormData({...formData, date: iso});
                    }
                  }}
                >
                  {tripDates.map(d => (
                    <option key={d.iso} value={d.display}>{d.display}</option>
                  ))}
                  <option value="CUSTOM">Outra data (digitar...)</option>
                </select>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input 
                    required 
                    type="text" 
                    className="glass-input" 
                    style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.75rem 1rem', borderRadius: '12px', outline: 'none' }} 
                    value={displayDate} 
                    onChange={handleDateChange}
                    placeholder="DD/MM/AAAA"
                    autoFocus={isCustomDate}
                  />
                  {tripDates.length > 0 && (
                    <button 
                      type="button"
                      onClick={() => setIsCustomDate(false)}
                      style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '700' }}
                    >
                      Sugestões
                    </button>
                  )}
                </div>
              )}
            </div>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}>
                <Tag size={16} /> Categoria
              </label>
              <select 
                className="glass-input" 
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.75rem 1rem', borderRadius: '12px', outline: 'none' }} 
                value={formData.category_id} onChange={e => setFormData({...formData, category_id: e.target.value})}
              >
                <option value="">Sem categoria</option>
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>
          </div>


          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}>
              <Users size={16} /> Responsável
            </label>
              {!isCustomPaidBy ? (
                <select 
                  className="glass-input" 
                  style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '1rem 1.25rem', borderRadius: '12px' }} 
                  value={formData.paid_by} 
                  onChange={e => {
                    if (e.target.value === 'CUSTOM') {
                      setIsCustomPaidBy(true);
                      setFormData({...formData, paid_by: ''});
                    } else {
                      setFormData({...formData, paid_by: e.target.value});
                    }
                  }}
                >
                  {participants.map(p => <option key={p} value={p}>{p}</option>)}
                  <option value="CUSTOM">Outro (digitar...)</option>
                </select>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input 
                    required autoFocus
                    className="glass-input" 
                    style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '1rem 1.25rem', borderRadius: '12px' }} 
                    value={formData.paid_by} 
                    onChange={e => setFormData({...formData, paid_by: e.target.value})}
                    placeholder="Nome do responsável"
                  />
                  <button 
                    type="button"
                    onClick={() => setIsCustomPaidBy(false)}
                    style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '700' }}
                  >
                    Voltar
                  </button>
                </div>
              )}
          </div>

          <div style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn" style={{ width: '100%', padding: '1.25rem', background: 'var(--primary)', color: 'white', fontWeight: '700', fontSize: '1rem', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', border: 'none', cursor: 'pointer', boxShadow: '0 10px 20px -5px rgba(99,102,241,0.5)' }}>
              <Save size={20} /> Salvar Lançamento
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}

function PlusIcon({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}
