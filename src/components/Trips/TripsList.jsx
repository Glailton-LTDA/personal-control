import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { Plane, Calendar, MapPin, DollarSign, PieChart, TrendingUp, AlertTriangle, Plus, Users, ArrowUpRight, ArrowDownRight, Edit2, Trash2, AlertCircle, Building, Car, FileText, Globe, ChevronUp, ChevronDown, ArrowUpDown, Search } from 'lucide-react';
import ExpenseModal from './ExpenseModal';
import TripDetails from './TripDetails';
import { CURRENCIES } from '../../constants/currencies';
import { motion, AnimatePresence } from 'framer-motion';

export default function TripsList({ user, refreshKey, onTripSelect, externalSelectedTrip, trips, showValues = true, onEditTrip }) {
  const selectedTrip = externalSelectedTrip;
  const [expenses, setExpenses] = useState([]);
  const [activeCurrency, setActiveCurrency] = useState('BRL');
  
  // Persist currency choice per trip
  useEffect(() => {
    if (externalSelectedTrip?.id) {
      const saved = localStorage.getItem(`pc_trip_${externalSelectedTrip.id}_currency`);
      if (saved && externalSelectedTrip.currencies?.includes(saved)) {
        setActiveCurrency(saved);
      }
    }
  }, [externalSelectedTrip?.id]);

  useEffect(() => {
    if (externalSelectedTrip?.id && activeCurrency) {
      localStorage.setItem(`pc_trip_${externalSelectedTrip.id}_currency`, activeCurrency);
    }
  }, [activeCurrency, externalSelectedTrip?.id]);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [categories, setCategories] = useState([]);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const renderFlag = (flag, size = '1.1rem') => {
    if (!flag) return <span>🏳️</span>;
    if (flag.startsWith('data:image')) {
      return (
        <img 
          src={flag} 
          alt="flag" 
          style={{ 
            width: size, 
            height: size, 
            objectFit: 'contain',
            borderRadius: '2px'
          }} 
        />
      );
    }
    return <span style={{ fontSize: size, lineHeight: 1 }}>{flag}</span>;
  };

  useEffect(() => {
    if (externalSelectedTrip) {
      if (externalSelectedTrip.currencies && externalSelectedTrip.currencies.length > 0) {
        if (!externalSelectedTrip.currencies.includes(activeCurrency)) {
          // If the current currency isn't in the new trip, try to load from storage or default to first
          const saved = localStorage.getItem(`pc_trip_${externalSelectedTrip.id}_currency`);
          if (saved && externalSelectedTrip.currencies.includes(saved)) {
            setActiveCurrency(saved);
          } else {
            setActiveCurrency(externalSelectedTrip.currencies[0]);
          }
        }
      }
      fetchExpenses(externalSelectedTrip.id);
    }
  }, [externalSelectedTrip?.id, activeCurrency, refreshKey]);


  useEffect(() => {
    const fetchCategories = async () => {
      const targetUserId = externalSelectedTrip?.user_id || user?.id;
      if (!targetUserId) return;
      
      const { data } = await supabase
        .from('trip_categories')
        .select('*')
        .eq('user_id', targetUserId)
        .order('name');
      if (data) setCategories(data);
    };
    fetchCategories();
  }, [externalSelectedTrip?.user_id, user?.id]);

  const fetchExpenses = async (tripId = externalSelectedTrip?.id) => {
    if (!tripId) return;
    const { data, error } = await supabase
      .from('trip_expenses')
      .select('*, trip_categories(name)')
      .eq('trip_id', tripId)
      .eq('currency', activeCurrency)
      .order('date', { ascending: false });
    
    if (!error && data) {
      setExpenses(data);
    }
  };

  const deleteExpense = async (id) => {
    if (!confirm('Tem certeza que deseja excluir esta despesa?')) return;
    const { error } = await supabase
      .from('trip_expenses')
      .delete()
      .eq('id', id);
    
    if (!error) {
      fetchExpenses(externalSelectedTrip.id);
    }
  };

  const handleTripSelect = (trip) => {
    if (onTripSelect) onTripSelect(trip);
    if (trip.currencies && trip.currencies.length > 0) {
      setActiveCurrency(trip.currencies[0]);
    }
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedExpenses = [...expenses].sort((a, b) => {
    let valA, valB;

    if (sortConfig.key === 'trip_categories') {
      valA = (a.trip_categories?.name || '').toLowerCase();
      valB = (b.trip_categories?.name || '').toLowerCase();
    } else if (typeof a[sortConfig.key] === 'string') {
      valA = (a[sortConfig.key] || '').toLowerCase();
      valB = (b[sortConfig.key] || '').toLowerCase();
    } else {
      valA = a[sortConfig.key];
      valB = b[sortConfig.key];
    }

    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const filteredExpenses = sortedExpenses.filter(exp => 
    exp.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (exp.trip_categories?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (exp.paid_by || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Daily Speding Data ──
  const dailyMap = expenses.reduce((acc, exp) => {
    const date = exp.date;
    acc[date] = (acc[date] || 0) + exp.amount;
    return acc;
  }, {});

  // ── Metrics Calculation ──
  const totalSpent = expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
  
  // Contar apenas os dias que tiveram gastos reais (evita inflar a média com dias vazios)
  const daysWithExpenses = Object.keys(dailyMap).filter(date => dailyMap[date] > 0.01);
  const daysCount = daysWithExpenses.length || 1;
  
  const dailyAverage = totalSpent / daysCount;
  const currentLimit = selectedTrip?.daily_limits?.[activeCurrency] || 0;

  const categoryMap = expenses.reduce((acc, exp) => {
    const cat = exp.trip_categories?.name || 'Geral';
    acc[cat] = (acc[cat] || 0) + exp.amount;
    return acc;
  }, {});

  // ── Paid By Analysis ──
  const paidByMap = expenses.reduce((acc, exp) => {
    const person = exp.paid_by || 'Não definido';
    acc[person] = (acc[person] || 0) + exp.amount;
    return acc;
  }, {});

  const allDaysSet = new Set();
  
  // Adicionar apenas os dias que possuem gastos reais no gráfico
  Object.keys(dailyMap).forEach(date => {
    if (date && date !== 'null' && date !== 'undefined' && dailyMap[date] > 0.01) {
      allDaysSet.add(date);
    }
  });

  const allDays = Array.from(allDaysSet).sort((a, b) => b.localeCompare(a));

  const renderItineraryItem = (item, typeIcon, color = 'var(--primary)') => (
    <div key={item.id} className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ padding: '0.6rem', background: `${color}10`, borderRadius: '10px', color: color }}>
            {React.createElement(typeIcon, { size: 18 })}
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700' }}>{item.name}</h4>
            {item.confirmation && <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>#{item.confirmation}</span>}
          </div>
        </div>
        {item.receipt_url && (
          <a href={item.receipt_url} target="_blank" rel="noopener noreferrer" className="btn" style={{ padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.05)', fontSize: '0.7rem', borderRadius: '8px' }}>
            DOC <FileText size={12} style={{ marginLeft: '4px' }} />
          </a>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '0.65rem', opacity: 0.5, textTransform: 'uppercase' }}>Início</div>
          <div style={{ fontWeight: '600', fontSize: '0.8rem' }}>
            {item.start_date ? formatDate(item.start_date) : '--'}
            {item.start_time && <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>• {item.start_time}</span>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.65rem', opacity: 0.5, textTransform: 'uppercase' }}>Fim</div>
          <div style={{ fontWeight: '600', fontSize: '0.8rem' }}>
            {item.end_date ? formatDate(item.end_date) : '--'}
            {item.end_time && <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>• {item.end_time}</span>}
          </div>
        </div>
      </div>

      {item.notes && (
        <div style={{ fontSize: '0.9rem', padding: '1rem', borderLeft: '2px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.01)', borderRadius: '0 12px 12px 0', opacity: 0.8, fontStyle: 'italic' }}>
          {item.notes}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }} className="fade-in">
      
      {/* ── Trips Selector & View Mode ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Trip Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem', flex: 1 }}>
          {trips.map(trip => (
            <button
              key={trip.id}
              onClick={() => handleTripSelect(trip)}
              className="glass-card"
              style={{ 
                padding: '0.75rem 1.25rem', 
                whiteSpace: 'nowrap',
                border: selectedTrip?.id === trip.id ? '1px solid var(--primary)' : '1px solid var(--glass-border)',
                background: selectedTrip?.id === trip.id ? 'var(--primary)' : 'var(--bg-card)',
                color: selectedTrip?.id === trip.id ? 'white' : 'var(--text-muted)',
                fontWeight: selectedTrip?.id === trip.id ? '700' : '500',
                transition: '0.3s'
              }}
            >
              {trip.title}
            </button>
          ))}
        </div>

        {/* Details and Edit Buttons */}
        <div style={{ 
          display: 'flex', 
          gap: '0.75rem',
          width: isMobile ? '100%' : 'auto',
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          {selectedTrip && (
            <button 
              onClick={() => onEditTrip(selectedTrip)}
              className="glass-card"
              style={{ 
                padding: '0.65rem 1.25rem', border: '1px solid var(--glass-border)', borderRadius: '14px', 
                background: 'var(--bg-card)',
                color: 'var(--text-main)',
                display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start', gap: '0.6rem', fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer', transition: '0.3s',
                width: isMobile ? '100%' : 'auto'
              }}
            >
              <Edit2 size={18} /> Editar Viagem
            </button>
          )}
          {selectedTrip && (
            <button 
              onClick={() => setIsDetailsOpen(true)}
              className="glass-card"
              style={{ 
                padding: '0.65rem 1.5rem', border: '1px solid var(--primary)', borderRadius: '14px', 
                background: 'var(--primary)',
                color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start', gap: '0.6rem', fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer', transition: '0.3s',
                width: isMobile ? '100%' : 'auto',
                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)'
              }}
            >
              <FileText size={18} /> Detalhes da Viagem
            </button>
          )}
        </div>
      </div>

      {selectedTrip && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <>
              {/* Currency Tabs */}
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div className="glass-card" style={{ display: 'flex', padding: '0.25rem', borderRadius: '12px' }}>
                  {selectedTrip.currencies?.map(currCode => {
                    const currData = CURRENCIES.find(c => c.code === currCode);
                    return (
                      <button
                        key={currCode}
                        onClick={() => setActiveCurrency(currCode)}
                        style={{
                          padding: '0.5rem 1rem',
                          border: 'none',
                          borderRadius: '10px',
                          background: activeCurrency === currCode ? 'var(--primary)' : 'transparent',
                          color: activeCurrency === currCode ? 'white' : 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          transition: '0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {renderFlag(currData?.flag)}
                        </div>
                        {currCode}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── KPI Grid ── */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: isMobile ? '0.75rem' : '1.5rem' 
              }}>
                 <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ padding: '0.75rem', background: 'rgba(99,102,241,0.1)', borderRadius: '12px', color: 'var(--primary)' }}><DollarSign size={20} /></div>
                    <div>
                       <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Gasto ({activeCurrency})</p>
                       <h3 style={{ margin: '0.15rem 0 0 0', fontSize: isMobile ? '1.25rem' : '1.5rem' }}>{showValues ? totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '••••••'}</h3>
                    </div>
                 </div>
                 
                 <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ padding: '0.75rem', background: 'rgba(16,185,129,0.1)', borderRadius: '12px', color: 'var(--success)' }}><TrendingUp size={20} /></div>
                    <div>
                       <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Média Diária <small style={{ opacity: 0.7 }}>({daysCount} {daysCount === 1 ? 'dia' : 'dias'})</small></p>
                       <h3 style={{ margin: '0.15rem 0 0 0', fontSize: isMobile ? '1.25rem' : '1.5rem' }}>{showValues ? dailyAverage.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '••••••'}</h3>
                    </div>
                 </div>

                 <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ 
                      padding: '0.75rem', 
                      background: currentLimit > 0 && dailyAverage > currentLimit ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', 
                      borderRadius: '12px', 
                      color: currentLimit > 0 && dailyAverage > currentLimit ? 'var(--danger)' : 'var(--success)' 
                    }}>
                       {currentLimit > 0 && dailyAverage > currentLimit ? <AlertTriangle size={20} /> : <Users size={20} />}
                    </div>
                    <div>
                       <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status Limite</p>
                       <h3 style={{ margin: '0.15rem 0 0 0', fontSize: isMobile ? '1.25rem' : '1.5rem', color: currentLimit > 0 && dailyAverage > currentLimit ? 'var(--danger)' : 'inherit' }}>
                         {currentLimit > 0 ? (dailyAverage > currentLimit ? 'Crítico' : 'No Plano') : 'Livre'}
                       </h3>
                    </div>
                 </div>
              </div>

              {/* ── Main Dashboard content ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: isMobile ? '1rem' : '1.5rem' }}>
                  {/* Category Chart */}
                  <div className="glass-card" style={{ padding: isMobile ? '1.25rem' : '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '1.25rem' : '2rem' }}>
                       <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem' }}>
                         <PieChart size={20} className="text-primary" /> Gastos por Categoria
                       </h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                       {Object.entries(categoryMap).length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Sem gastos registrados.</p>}
                       {Object.entries(categoryMap)
                         .sort((a, b) => b[1] - a[1])
                         .map(([cat, total]) => (
                         <div key={cat}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                             <span style={{ fontWeight: '500' }}>{cat}</span>
                             <span style={{ fontWeight: '700' }}>{showValues ? total.toLocaleString('pt-BR') : '••••'} <small style={{ fontWeight: '400', opacity: 0.6 }}>{activeCurrency}</small></span>
                           </div>
                           <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                             <div style={{ 
                               width: `${(total/totalSpent)*100}%`, 
                               height: '100%', 
                               background: 'linear-gradient(90deg, var(--primary), var(--success))',
                               borderRadius: '4px'
                             }} />
                           </div>
                         </div>
                       ))}
                    </div>
                  </div>

                  {/* Paid By Chart */}
                  <div className="glass-card" style={{ padding: isMobile ? '1.25rem' : '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '1.25rem' : '2rem' }}>
                       <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem' }}>
                         <Users size={20} className="text-primary" /> Gastos por Viajante
                       </h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                       {Object.entries(paidByMap).length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Sem gastos registrados.</p>}
                       {Object.entries(paidByMap)
                         .sort((a, b) => b[1] - a[1])
                         .map(([person, total]) => (
                         <div key={person}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                             <span style={{ fontWeight: '500' }}>{person}</span>
                             <span style={{ fontWeight: '700' }}>{showValues ? total.toLocaleString('pt-BR') : '••••'} <small style={{ fontWeight: '400', opacity: 0.6 }}>{activeCurrency}</small></span>
                           </div>
                           <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                             <div style={{ 
                               width: `${(total/totalSpent)*100}%`, 
                               height: '100%', 
                               background: 'linear-gradient(90deg, #6366f1, #3b82f6)',
                               borderRadius: '4px'
                             }} />
                           </div>
                         </div>
                       ))}
                    </div>
                  </div>

                  {/* Daily Spending Chart */}
                  <div className="glass-card" style={{ padding: isMobile ? '1.25rem' : '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '1.25rem' : '2rem' }}>
                       <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem' }}>
                         <Calendar size={20} className="text-primary" /> Gastos por Dia
                       </h3>
                       {currentLimit > 0 && (
                         <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Meta: <b>{currentLimit.toLocaleString('pt-BR')}</b></span>
                       )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto' }} className="custom-scrollbar">
                       {allDays.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Defina as datas da viagem para ver o gráfico diário.</p>}
                       {[...allDays].reverse().map(date => {
                         const dayTotal = dailyMap[date] || 0;
                         const isOverLimit = currentLimit > 0 && dayTotal > currentLimit;
                         return (
                           <div key={date}>
                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                               <span style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isOverLimit ? 1 : 0.8 }}>
                                 {formatDate(date, { day: '2-digit', month: 'short' })}
                                 {isOverLimit && <AlertCircle size={14} style={{ color: 'var(--danger)' }} />}
                               </span>
                               <span style={{ fontWeight: '700', color: isOverLimit ? 'var(--danger)' : 'inherit' }}>
                                 {showValues ? dayTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '••••'} <small style={{ fontWeight: '400', opacity: 0.6 }}>{activeCurrency}</small>
                               </span>
                             </div>
                             <div style={{ height: '8px', background: 'rgba(255,255,245,0.05)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                               <div style={{ 
                                 width: `${currentLimit > 0 ? Math.min((dayTotal/currentLimit)*100, 100) : (totalSpent > 0 ? (dayTotal/totalSpent)*100 : 0)}%`, 
                                 height: '100%', 
                                 background: isOverLimit ? 'linear-gradient(90deg, #ef4444, #f87171)' : 'linear-gradient(90deg, #10b981, #34d399)',
                                 borderRadius: '4px',
                                 transition: '0.5s',
                                 boxShadow: isOverLimit ? '0 0 10px rgba(239, 68, 68, 0.4)' : 'none'
                               }} />
                             </div>
                           </div>
                         );
                       })}
                    </div>
                  </div>
                </div>

                {/* Recent Expenses List */}
                <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.1rem' }}>
                       <DollarSign size={22} className="text-primary" /> Despesas
                       <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '400', opacity: 0.7 }}>
                         ({filteredExpenses.length} {filteredExpenses.length === 1 ? 'registro' : 'registros'})
                       </span>
                    </h3>
                    <button 
                      className="btn" 
                      onClick={() => setIsAddingExpense(true)}
                      style={{ background: 'var(--primary)', color: 'white', padding: '0.6rem 1.2rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                       <Plus size={16} /> Nova Despesa
                    </button>
                  </div>

                  {/* ── Search and Sort Control Bar (Mobile/Tablet Focused) ── */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: '0.5rem' }}>Ordenar:</span>
                      {[
                        { key: 'date', label: 'Data' },
                        { key: 'description', label: 'Descrição' },
                        { key: 'trip_categories', label: 'Categoria' },
                        { key: 'amount', label: 'Valor' }
                      ].map(pill => (
                        <button
                          key={pill.key}
                          onClick={() => handleSort(pill.key)}
                          className="glass-card"
                          style={{
                            padding: '0.4rem 0.8rem',
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            border: sortConfig.key === pill.key ? '1px solid var(--primary)' : '1px solid transparent',
                            background: sortConfig.key === pill.key ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.03)',
                            color: sortConfig.key === pill.key ? 'white' : 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            transition: '0.2s'
                          }}
                        >
                          {pill.label}
                          {sortConfig.key === pill.key && (
                            sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                          )}
                        </button>
                      ))}
                    </div>

                    <div style={{ position: 'relative', width: '100%' }}>
                      <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                      <input 
                        type="text"
                        placeholder="Pesquisar por descrição ou categoria..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="glass-input"
                        style={{ paddingLeft: '2.8rem', width: '100%', fontSize: '0.9rem', borderRadius: '12px' }}
                      />
                    </div>
                  </div>
                  
                  <div style={{ overflowX: 'auto', paddingBottom: '3rem' }}>
                    <table className="finance-table">

                      {!isMobile && (
                        <thead>
                          <tr>
                            <th onClick={() => handleSort('date')} style={{ textAlign: 'left', cursor: 'pointer' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                DATA {sortConfig.key === 'date' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} style={{ opacity: 0.3 }} />}
                              </div>
                            </th>
                            <th onClick={() => handleSort('description')} style={{ textAlign: 'left', cursor: 'pointer' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                DESCRIÇÃO {sortConfig.key === 'description' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} style={{ opacity: 0.3 }} />}
                              </div>
                            </th>
                            <th onClick={() => handleSort('trip_categories')} style={{ textAlign: 'left', cursor: 'pointer' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                CATEGORIA {sortConfig.key === 'trip_categories' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} style={{ opacity: 0.3 }} />}
                              </div>
                            </th>
                            <th onClick={() => handleSort('paid_by')} style={{ textAlign: 'left', cursor: 'pointer' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                PAGO POR {sortConfig.key === 'paid_by' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} style={{ opacity: 0.3 }} />}
                              </div>
                            </th>
                            <th onClick={() => handleSort('amount')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                VALOR {sortConfig.key === 'amount' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} style={{ opacity: 0.3 }} />}
                              </div>
                            </th>
                            <th style={{ textAlign: 'center' }}>AÇÕES</th>
                          </tr>
                        </thead>
                      )}
                      <tbody>
                        {expenses.length === 0 && (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                              Nenhuma despesa nesta moeda.
                            </td>
                          </tr>
                        )}
                        {filteredExpenses.map(exp => (
                          <tr key={exp.id}>
                            <td data-label="Data">
                              {exp.date ? formatDate(exp.date, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '--'}
                            </td>
                            <td data-label="Descrição">
                              <div style={{ fontWeight: '700', color: 'var(--text-main)' }}>{exp.description}</div>
                            </td>
                            <td data-label="Categoria">
                              <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600' }}>
                                {exp.trip_categories?.name || 'Geral'}
                              </span>
                            </td>
                            <td data-label="Pago Por">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
                                <Users size={14} style={{ opacity: 0.5 }} />
                                {exp.paid_by}
                              </div>
                            </td>
                            <td data-label="Valor" style={{ textAlign: isMobile ? 'right' : 'right', fontWeight: '800' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <span style={{ color: 'var(--text-main)', fontSize: '1rem' }}>
                                  {showValues ? exp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '••••'}
                                </span>
                                <small style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: '800', opacity: 0.6 }}>{activeCurrency}</small>
                              </div>
                            </td>
                            <td className="actions-cell">
                              <div className="actions-row" style={{ justifyContent: isMobile ? 'center' : 'center' }}>
                                <button className="action-btn" onClick={() => setEditingExpense(exp)} title="Editar">
                                  <Edit2 size={18} />
                                </button>
                                <button className="action-btn danger" onClick={() => deleteExpense(exp.id)} title="Excluir">
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                </div>

              </div>
            </>
          </div>
        </div>
      )}

      {(isAddingExpense || editingExpense) && (
        <ExpenseModal 
          user={user}
          trip={selectedTrip}
          expense={editingExpense}
          currency={activeCurrency}
          categories={categories}
          onClose={() => { setIsAddingExpense(false); setEditingExpense(null); }}
          onSave={() => { setIsAddingExpense(false); setEditingExpense(null); fetchExpenses(); }}
        />
      )}

      <AnimatePresence>
        {isDetailsOpen && (
          <TripDetails 
            trip={selectedTrip} 
            expenses={expenses}
            showValues={showValues}
            onClose={() => setIsDetailsOpen(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
