import React, { useState, useEffect } from 'react';
import { supabase, getSignedUrl } from '../../lib/supabase';
import { X, Save, DollarSign, Calendar, Tag, Users, FileText, Upload, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useEncryption } from '../../contexts/EncryptionContext';

export default function ExpenseModal({ user, trip, expense, currency: initialCurrency, categories: initialCategories, onClose, onSave }) {
  const [categories, setCategories] = useState(initialCategories || []);
  const { encryptObject, decryptObject } = useEncryption();
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
    currency: expense?.currency || initialCurrency || trip?.currencies?.[0] || 'BRL',
    receipt_url: expense?.receipt_url || null
  });
  const [isCustomPaidBy, setIsCustomPaidBy] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (file) => {
    if (!file || !trip) return;
    
    setIsUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${trip.id}/expense_${Date.now()}.${fileExt}`;
    const filePath = `receipts/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('trip-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      setFormData(prev => ({ ...prev, receipt_url: filePath }));
    } catch (error) {
      toast.error('Erro ao fazer upload: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleViewFile = async () => {
    if (!formData.receipt_url) return;
    const signedUrl = await getSignedUrl('trip-documents', formData.receipt_url);
    if (signedUrl) window.open(signedUrl, '_blank');
  };

  const participants = trip?.participants && trip.participants.length > 0 
    ? trip.participants 
    : ['Glailton', 'Deisianne'];

  useEffect(() => {
    async function fetchCategories() {
      const { data } = await supabase.from('trip_categories').select('*').eq('user_id', user.id).order('name', { ascending: true });
      if (data) {
        const decrypted = await decryptObject(data, ['name'], {
          resourceId: trip?.id,
          resourceType: 'TRIP'
        });
        setCategories(decrypted);
      }
    }

    if (!initialCategories || initialCategories.length === 0) {
      fetchCategories();
    }
  }, [initialCategories, user.id, decryptObject]);

  const handleDateChange = (e) => {
    const val = e.target.value.replace(/\D/g, '');
    let formatted = '';
    
    if (val.length <= 2) {
      formatted = val;
    } else if (val.length <= 4) {
      formatted = `${val.slice(0, 2)}/${val.slice(2)}`;
    } else {
      formatted = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4, 8)}`;
    }
    
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
      toast.error('Selecione uma viagem primeiro.');
      return;
    }

    const isoDate = parseDisplayDateToISO(displayDate);
    if (!isoDate || isNaN(new Date(isoDate).getTime())) {
      toast.error('Por favor, insira uma data válida (DD/MM/AAAA)');
      return;
    }

    const encrypted = await encryptObject(formData, ['description', 'paid_by'], {
      resourceId: trip.id,
      resourceType: 'TRIP'
    });
    
    const payload = {
      user_id: user.id,
      trip_id: trip.id,
      description: encrypted.description,
      amount: parseFloat(formData.amount),
      currency: formData.currency,
      date: isoDate,
      paid_by: encrypted.paid_by,
      category_id: formData.category_id || null,
      receipt_url: formData.receipt_url
    };

    let result;
    if (expense?.id) {
      result = await supabase.from('trip_expenses').update(payload).eq('id', expense.id);
    } else {
      result = await supabase.from('trip_expenses').insert([payload]);
    }

    const { error } = result;

    if (!error) {
      toast.success(expense?.id ? 'Lançamento atualizado!' : 'Lançamento salvo com sucesso!');
      onSave();
    }
    else toast.error('Erro ao salvar: ' + error.message);
  }

  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>      <div className="glass-card fade-in" style={{ 
        width: '100%', 
        maxWidth: '550px', 
        maxHeight: 'calc(100vh - 2rem)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-card)', 
        border: '1px solid var(--glass-border)', 
        borderRadius: '24px', 
        boxShadow: 'var(--shadow)',
        overflow: 'hidden'
      }}>
        {/* Fixed Header */}
        <div style={{ 
          padding: window.innerWidth < 600 ? '1.5rem 1.5rem 1rem 1.5rem' : '2.5rem 2.5rem 1.5rem 2.5rem', 
          position: 'relative', 
          borderBottom: '1px solid var(--glass-border)' 
        }}>
          <h2 style={{ 
            margin: 0, 
            fontSize: window.innerWidth < 600 ? '1.4rem' : '1.75rem', 
            fontWeight: '800', 
            color: 'var(--text-main)', 
            letterSpacing: '-0.02em' 
          }}>
            {expense ? 'Editar Lançamento' : 'Novo Lançamento'}
          </h2>
          <p style={{ margin: '0.4rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {expense ? 'Atualize os detalhes deste gasto' : 'Adicione um novo gasto à sua viagem'}
          </p>
          <button className="icon-btn" onClick={onClose} style={{ position: 'absolute', top: window.innerWidth < 600 ? '1rem' : '1.5rem', right: window.innerWidth < 600 ? '1rem' : '1.5rem', padding: '0.5rem', color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>

        {/* Scrollable Content */}
        <div style={{ 
          padding: window.innerWidth < 600 ? '1.5rem' : '2rem 2.5rem 2.5rem 2.5rem', 
          overflowY: 'auto', 
          flex: 1 
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', opacity: 0.7 }}>
              <Tag size={14} /> Descrição
            </label>
            <input 
              required autoFocus className="glass-input" 
              style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.85rem 1rem', borderRadius: '12px' }} 
              value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Ex: Jantar em Cusco, Passagens..." 
            />
          </div>

          <div className="form-grid" style={{ gap: '1rem' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', opacity: 0.7 }}>
                <DollarSign size={14} /> Valor
              </label>
              <input 
                required type="number" step="0.01" className="glass-input" 
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.85rem 1rem', borderRadius: '12px', outline: 'none' }} 
                value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} placeholder="0.00" 
              />
            </div>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', opacity: 0.7 }}>
                Moeda
              </label>
              <select 
                required className="glass-input" 
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.85rem 1rem', borderRadius: '12px', outline: 'none' }} 
                value={formData.currency} onChange={e => setFormData({...formData, currency: e.target.value})}
              >
                {trip?.currencies?.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="form-grid" style={{ gap: '1rem' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', opacity: 0.7 }}>
                <Calendar size={14} /> Data
              </label>
              
              {!isCustomDate && tripDates.length > 0 ? (
                <select 
                  className="glass-input" 
                  style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.85rem 1rem', borderRadius: '12px', outline: 'none' }} 
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
                    style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.85rem 1rem', borderRadius: '12px', outline: 'none' }} 
                    value={displayDate} 
                    onChange={handleDateChange}
                    placeholder="DD/MM/AAAA"
                    autoFocus={isCustomDate}
                  />
                  {tripDates.length > 0 && (
                    <button 
                      type="button"
                      onClick={() => setIsCustomDate(false)}
                      style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700' }}
                    >
                      Sugestões
                    </button>
                  )}
                </div>
              )}
            </div>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', opacity: 0.7 }}>
                <Tag size={14} /> Categoria
              </label>
              <select 
                className="glass-input" 
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.85rem 1rem', borderRadius: '12px', outline: 'none' }} 
                value={formData.category_id} onChange={e => setFormData({...formData, category_id: e.target.value})}
              >
                <option value="">Sem categoria</option>
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', opacity: 0.7 }}>
              <Users size={14} /> Responsável
            </label>
              {!isCustomPaidBy ? (
                <select 
                  className="glass-input" 
                  style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.85rem 1rem', borderRadius: '12px' }} 
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
                    style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.85rem 1rem', borderRadius: '12px' }} 
                    value={formData.paid_by} 
                    onChange={e => setFormData({...formData, paid_by: e.target.value})}
                    placeholder="Nome do responsável"
                  />
                  <button 
                    type="button"
                    onClick={() => setIsCustomPaidBy(false)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700' }}
                  >
                    Voltar
                  </button>
                </div>
              )}
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', opacity: 0.7 }}>
              <FileText size={14} /> Comprovante / Anexo
            </label>
            {formData.receipt_url ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  type="button"
                  onClick={handleViewFile}
                  className="glass-input"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(99,102,241,0.1)', border: '1px solid var(--primary)', color: 'var(--primary)', cursor: 'pointer', fontWeight: '700' }}
                >
                  <FileText size={16} /> Ver Comprovante
                </button>
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, receipt_url: null})}
                  style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: 'none', borderRadius: '12px', cursor: 'pointer' }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input 
                  type="file" 
                  id="expense-receipt" 
                  style={{ display: 'none' }} 
                  onChange={(e) => handleFileUpload(e.target.files[0])}
                  disabled={isUploading}
                />
                <label 
                  htmlFor="expense-receipt"
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.6rem', 
                    width: '100%', 
                    padding: '0.85rem', 
                    background: 'rgba(255,255,255,0.03)', 
                    borderRadius: '12px', 
                    fontSize: '0.85rem', 
                    color: 'var(--text-muted)', 
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    border: '1px dashed var(--glass-border)',
                    fontWeight: '600'
                  }}
                >
                  {isUploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                  {isUploading ? 'Enviando...' : 'Anexar Comprovante'}
                </label>
              </div>
            )}
          </div>

          <div style={{ marginTop: '0.5rem' }}>
            <button type="submit" className="btn" style={{ width: '100%', padding: '1rem', background: 'var(--primary)', color: 'white', fontWeight: '700', fontSize: '0.95rem', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', border: 'none', cursor: 'pointer', boxShadow: '0 8px 16px -4px rgba(99,102,241,0.4)' }}>
              <Save size={18} /> Salvar Lançamento
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
