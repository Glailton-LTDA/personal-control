import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { X, Save, Calendar, Search, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function InvestmentModal({ isOpen, onClose, onRefresh, user, initialData, accounts }) {
  const [formData, setFormData] = useState({
    account_id: '',
    record_date: new Date().toISOString().split('T')[0],
    initial_balance: '',
    final_balance: '',
    yield: ''
  });

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (initialData) {
      setFormData({
        account_id: initialData.account_id,
        record_date: initialData.record_date,
        initial_balance: initialData.initial_balance,
        final_balance: initialData.final_balance,
        yield: initialData.yield
      });
    } else {
      setFormData({
        account_id: accounts[0]?.id || '',
        record_date: new Date().toISOString().split('T')[0],
        initial_balance: '',
        final_balance: '',
        yield: ''
      });
    }
  }, [initialData, accounts, isOpen]);

  // Handle automatic yield calculation
  useEffect(() => {
    if (formData.initial_balance !== '' && formData.final_balance !== '') {
      const yield_val = (Number(formData.final_balance) - Number(formData.initial_balance)).toFixed(2);
      setFormData(prev => ({ ...prev, yield: parseFloat(yield_val) }));
    }
  }, [formData.initial_balance, formData.final_balance]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (initialData) {
      const { error } = await supabase
        .from('investment_records')
        .update(formData)
        .eq('id', initialData.id);
      if (!error) {
        onRefresh();
        onClose();
      }
    } else {
      const { error } = await supabase
        .from('investment_records')
        .insert([{ ...formData, user_id: user.id }]);
      if (!error) {
        onRefresh();
        onClose();
      }
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1050 }}>
      <AnimatePresence>
        <Motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="glass-card" 
          style={{ 
            width: '100%', 
            maxWidth: '550px', 
            padding: '0', 
            overflow: 'hidden',
            border: '1px solid var(--glass-border)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}
        >
          <div style={{ 
            padding: '2rem 2.5rem', 
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.05), transparent)',
            borderBottom: '1px solid var(--glass-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                {initialData ? 'Editar Registro' : 'Novo Registro'}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Informe os saldos para cálculo de rendimento.
              </p>
            </div>
            <button className="icon-btn" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05) !important' }}>
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '2.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              
              <div className="input-group" style={{ position: 'relative' }}>
                <label>Conta de Investimento</label>
                <div 
                  className="glass-input" 
                  style={{ 
                    padding: '0.75rem 1rem', 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--glass-border)'
                  }}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <span style={{ color: formData.account_id ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: formData.account_id ? '700' : '400' }}>
                    {formData.account_id 
                      ? (() => {
                          const acc = accounts.find(a => a.id === formData.account_id);
                          return acc ? `${acc.institution ? `${acc.institution} - ` : ''}${acc.name}` : 'Selecione uma conta...';
                        })()
                      : 'Selecione uma conta...'}
                  </span>
                  <ChevronDown size={18} style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
                </div>

                <AnimatePresence>
                  {isDropdownOpen && (
                    <Motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="glass-card"
                      style={{ 
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '0.5rem',
                        zIndex: 2000,
                        padding: '0.5rem',
                        boxShadow: 'var(--shadow)',
                        border: '1px solid var(--primary)',
                        maxHeight: '250px',
                        overflowY: 'auto'
                      }}
                    >
                      <div style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', padding: '0.5rem', marginBottom: '0.5rem', zIndex: 10 }}>
                        <div style={{ position: 'relative' }}>
                          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                          <input 
                            type="text"
                            placeholder="Buscar conta..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ 
                              width: '100%',
                              padding: '0.5rem 0.5rem 0.5rem 2.2rem',
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid var(--glass-border)',
                              borderRadius: '8px',
                              color: 'white',
                              fontSize: '0.85rem'
                            }}
                            autoFocus
                          />
                        </div>
                      </div>

                      {accounts
                        .filter(acc => {
                          const label = `${acc.institution || ''} ${acc.name}`.toLowerCase();
                          return label.includes(searchTerm.toLowerCase());
                        })
                        .map(acc => (
                          <div 
                            key={acc.id}
                            className="dropdown-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormData({...formData, account_id: acc.id});
                              setIsDropdownOpen(false);
                              setSearchTerm('');
                            }}
                            style={{ 
                              padding: '0.75rem 1rem',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              background: formData.account_id === acc.id ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                              border: formData.account_id === acc.id ? '1px solid var(--primary)' : '1px solid transparent'
                            }}
                          >
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: acc.color || 'var(--primary)' }}></div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{acc.name}</span>
                              <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>{acc.institution}</span>
                            </div>
                          </div>
                        ))}
                    </Motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="input-group">
                <label>Mês de Referência</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
                  <select 
                    value={new Date(formData.record_date + 'T00:00:00').getMonth()}
                    onChange={e => {
                      const date = new Date(formData.record_date + 'T00:00:00');
                      date.setMonth(parseInt(e.target.value));
                      setFormData({...formData, record_date: date.toISOString().split('T')[0]});
                    }}
                    className="select-filter"
                    style={{ width: '100%', padding: '0.75rem 1rem' }}
                  >
                    {[
                      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
                    ].map((month, idx) => (
                      <option key={idx} value={idx}>{month}</option>
                    ))}
                  </select>
                  <select 
                    value={new Date(formData.record_date + 'T00:00:00').getFullYear()}
                    onChange={e => {
                      const date = new Date(formData.record_date + 'T00:00:00');
                      date.setFullYear(parseInt(e.target.value));
                      setFormData({...formData, record_date: date.toISOString().split('T')[0]});
                    }}
                    className="select-filter"
                    style={{ width: '100%', padding: '0.75rem 1rem' }}
                  >
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="input-group">
                  <label>Saldo Inicial (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={formData.initial_balance}
                    onChange={e => setFormData({...formData, initial_balance: e.target.value})}
                    placeholder="0,00"
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Saldo Final (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={formData.final_balance}
                    onChange={e => setFormData({...formData, final_balance: e.target.value})}
                    placeholder="0,00"
                    required
                  />
                </div>
              </div>

              <Motion.div 
                animate={{ 
                  backgroundColor: formData.yield >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  borderColor: formData.yield >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                }}
                style={{ 
                  padding: '1.25rem', 
                  borderRadius: '1rem',
                  border: '1px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background-color 0.3s, border-color 0.3s'
                }}
              >
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Rendimento</span>
                </div>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: formData.yield >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.yield)}
                </span>
              </Motion.div>

              <div style={{ display: 'flex', gap: '1.25rem', marginTop: '1rem' }}>
                <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1, padding: '1rem' }}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ flex: 2, padding: '1rem', justifyContent: 'center' }}>
                  <Save size={20} /> {initialData ? 'Salvar Alterações' : 'Cadastrar Registro'}
                </button>
              </div>
            </div>
          </form>
        </Motion.div>
      </AnimatePresence>
    </div>
  );
}
