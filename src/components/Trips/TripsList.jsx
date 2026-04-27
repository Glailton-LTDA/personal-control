import React, { useState, useEffect, useCallback } from 'react';
import { supabase, getSignedUrl } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { 
  DollarSign, 
  Calendar, 
  TrendingUp, 
  Tag, 
  Trash2, 
  Filter, 
  ChevronDown, 
  Plus, 
  PieChart, 
  AlertTriangle, 
  Users, 
  Search,
  CheckCircle,
  Clock,
  ListTodo,
  Compass,
  Plane,
  MapPin,
  ArrowUpRight,
  ArrowDownRight,
  Edit2,
  AlertCircle,
  Building,
  Car,
  FileText,
  Globe,
  ChevronUp,
  ArrowUpDown,
  MoreVertical,
  Map,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import ExpenseModal from './ExpenseModal';
import TripDetails from './TripDetails';
import { CURRENCIES } from '../../constants/currencies';
import { AnimatePresence } from 'framer-motion';
import { useEncryption } from '../../contexts/EncryptionContext';

export default function TripsList({ user, refreshKey, onTripSelect, externalSelectedTrip, trips, showValues = true, onEditTrip, onViewChecklists, onViewItinerary }) {
  const selectedTrip = externalSelectedTrip;
  const [expenses, setExpenses] = useState([]);
  const [activeCurrency, setActiveCurrency] = useState('BRL');
  const { decryptObject } = useEncryption();
  const [isTripMenuOpen, setIsTripMenuOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [tripSearchQuery, setTripSearchQuery] = useState('');
  
  // Persist currency choice per trip
  useEffect(() => {
    if (externalSelectedTrip?.id) {
      const saved = localStorage.getItem(`pc_trip_${externalSelectedTrip.id}_currency`);
      if (saved && externalSelectedTrip.currencies?.includes(saved)) {
        setActiveCurrency(saved);
      }
    }
  }, [externalSelectedTrip?.id, externalSelectedTrip?.currencies]);

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

  const fetchExpenses = useCallback(async (tripId = externalSelectedTrip?.id) => {
    if (!tripId) return;
    const { data, error } = await supabase
      .from('trip_expenses')
      .select('*, trip_categories(name)')
      .eq('trip_id', tripId)
      .order('date', { ascending: false });
    
    if (!error && data) {
      const decrypted = await decryptObject(data, [
        'description', 
        'paid_by', 
        'trip_categories.name'
      ]);
      setExpenses(decrypted);
    }
  }, [decryptObject, externalSelectedTrip?.id]);

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
  }, [externalSelectedTrip, activeCurrency, refreshKey, fetchExpenses]);

  useEffect(() => {
    const fetchCategories = async () => {
      const targetUserId = externalSelectedTrip?.user_id || user?.id;
      if (!targetUserId) return;
      
      const { data } = await supabase
        .from('trip_categories')
        .select('*')
        .eq('user_id', targetUserId)
        .order('name');
      if (data) {
        const decrypted = await decryptObject(data, ['name']);
        setCategories(decrypted);
      }
    };
    fetchCategories();
  }, [externalSelectedTrip?.user_id, user?.id, decryptObject]);

  const deleteExpense = async (id) => {
    confirmToast('Excluir esta despesa?', async () => {
      const { error } = await supabase
        .from('trip_expenses')
        .delete()
        .eq('id', id);
      
      if (!error) {
        fetchExpenses(externalSelectedTrip.id);
        toast.success('Despesa excluída');
      } else {
        toast.error('Erro ao excluir');
      }
    }, { danger: true, confirmText: 'Sim, excluir' });
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

  const currencyExpenses = expenses.filter(exp => exp.currency === activeCurrency);

  const sortedExpenses = [...currencyExpenses].sort((a, b) => {
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
  const dailyMap = currencyExpenses.reduce((acc, exp) => {
    const date = exp.date;
    acc[date] = (acc[date] || 0) + (parseFloat(exp.amount) || 0);
    return acc;
  }, {});

  // ── Metrics Calculation ──
  const totalSpent = currencyExpenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
  
  // Contar apenas os dias que tiveram gastos reais (evita inflar a média com dias vazios)
  const daysWithExpenses = Object.keys(dailyMap).filter(date => dailyMap[date] > 0.01);
  const daysCount = daysWithExpenses.length || 1;
  
  const dailyAverage = totalSpent / daysCount;
  const currentLimit = selectedTrip?.daily_limits?.[activeCurrency] || 0;

  const categoryMap = currencyExpenses.reduce((acc, exp) => {
    const cat = exp.trip_categories?.name || 'Geral';
    acc[cat] = (acc[cat] || 0) + (parseFloat(exp.amount) || 0);
    return acc;
  }, {});

  // ── Paid By Analysis ──
  const paidByMap = currencyExpenses.reduce((acc, exp) => {
    const person = exp.paid_by || 'Não definido';
    acc[person] = (acc[person] || 0) + (parseFloat(exp.amount) || 0);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }} className="fade-in">
      {isDetailsOpen && (
        <TripDetails 
          trip={selectedTrip} 
          expenses={expenses}
          showValues={showValues}
          onBack={() => setIsDetailsOpen(false)} 
          onViewChecklists={() => {
            setIsDetailsOpen(false);
            onViewChecklists();
          }}
        />
      )}
      
      {/* ── Trips Selector & Action Menu ── */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 100 }}>
        {/* Searchable Trip Selector */}
        <div style={{ position: 'relative', flex: 1, maxWidth: isMobile ? '100%' : '400px' }}>
          <div 
            className="glass-card" 
            onClick={() => setIsTripMenuOpen(!isTripMenuOpen)}
            style={{ 
              padding: '0.75rem 1.25rem', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              cursor: 'pointer',
              border: '1px solid var(--glass-border)',
              background: 'var(--bg-card)',
              borderRadius: '14px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
              <Plane size={18} className="text-primary" />
              <span style={{ fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedTrip?.title || 'Selecionar Viagem...'}
              </span>
            </div>
            <ChevronDown size={18} style={{ transform: isTripMenuOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
          </div>

          <AnimatePresence>
            {isTripMenuOpen && (
              <div 
                className="glass-card fade-in"
                style={{ 
                  position: 'absolute', top: '110%', left: 0, right: 0, 
                  padding: '0.5rem', zIndex: 110,
                  maxHeight: '300px', overflowY: 'auto',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                  border: '1px solid var(--glass-border)'
                }}
              >
                <div style={{ position: 'relative', marginBottom: '0.5rem', padding: '0.25rem' }}>
                  <Search size={14} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                  <input 
                    autoFocus
                    type="text"
                    placeholder="Buscar viagem..."
                    value={tripSearchQuery}
                    onChange={(e) => setTripSearchQuery(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ 
                      width: '100%', padding: '0.5rem 0.5rem 0.5rem 2.2rem', 
                      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                      borderRadius: '8px', color: 'white', fontSize: '0.85rem'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {trips
                    .filter(t => t.title.toLowerCase().includes(tripSearchQuery.toLowerCase()))
                    .map(trip => (
                    <button
                      key={trip.id}
                      onClick={() => {
                        handleTripSelect(trip);
                        setIsTripMenuOpen(false);
                        setTripSearchQuery('');
                      }}
                      style={{ 
                        padding: '0.75rem 1rem', border: 'none', borderRadius: '8px',
                        background: selectedTrip?.id === trip.id ? 'var(--primary)' : 'transparent',
                        color: selectedTrip?.id === trip.id ? 'white' : 'var(--text-main)',
                        textAlign: 'left', cursor: 'pointer', transition: '0.2s',
                        fontWeight: selectedTrip?.id === trip.id ? '700' : '500',
                        fontSize: '0.9rem'
                      }}
                    >
                      {trip.title}
                    </button>
                  ))}
                  {trips.filter(t => t.title.toLowerCase().includes(tripSearchQuery.toLowerCase())).length === 0 && (
                    <p style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhuma viagem encontrada</p>
                  )}
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Menu (3 dots) */}
        {selectedTrip && (
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setIsActionsMenuOpen(!isActionsMenuOpen)}
              className="icon-btn"
              style={{ 
                width: '46px', height: '46px', background: 'var(--bg-card)', 
                border: '1px solid var(--glass-border)', borderRadius: '14px' 
              }}
            >
              <MoreVertical size={22} />
            </button>

            <AnimatePresence>
              {isActionsMenuOpen && (
                <>
                  <div 
                    style={{ position: 'fixed', inset: 0, zIndex: 105 }} 
                    onClick={() => setIsActionsMenuOpen(false)} 
                  />
                  <div 
                    className="glass-card fade-in"
                    style={{ 
                      position: 'absolute', top: '110%', right: 0, 
                      width: '220px', padding: '0.5rem', zIndex: 110,
                      boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                      border: '1px solid var(--glass-border)'
                    }}
                  >
                    {[
                      { icon: <Edit2 size={16} />, label: 'Editar Viagem', onClick: () => onEditTrip(selectedTrip) },
                      { icon: <FileText size={16} />, label: 'Detalhes da Viagem', onClick: () => setIsDetailsOpen(true) },
                      { icon: <ListTodo size={16} />, label: 'Checklist', onClick: onViewChecklists },
                      { icon: <Map size={16} />, label: 'Roteiro da Viagem', onClick: () => {
                        if (onViewItinerary) onViewItinerary();
                        setIsActionsMenuOpen(false);
                      } }
                    ].map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => { item.onClick(); setIsActionsMenuOpen(false); }}
                        style={{ 
                          width: '100%', padding: '0.75rem 1rem', border: 'none', borderRadius: '8px',
                          background: 'transparent', color: 'var(--text-main)',
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          cursor: 'pointer', transition: '0.2s', fontWeight: '600',
                          fontSize: '0.85rem'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ color: 'var(--primary)' }}>{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}
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
                            <th style={{ textAlign: 'center' }}>ANEXO</th>
                            <th style={{ textAlign: 'center' }}>AÇÕES</th>
                          </tr>
                        </thead>
                      )}
                      <tbody>
                        {currencyExpenses.length === 0 && (
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
                              <div data-testid={`expense-desc-${expenses.indexOf(exp)}`} style={{ fontWeight: '700', color: 'var(--text-main)' }}>{exp.description}</div>
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
                            <td data-label="Anexo" style={{ textAlign: 'center' }}>
                              {exp.receipt_url && (
                                <button 
                                  onClick={async () => {
                                    const signedUrl = await getSignedUrl('trip-documents', exp.receipt_url);
                                    if (signedUrl) window.open(signedUrl, '_blank');
                                  }}
                                  className="action-btn"
                                  title="Ver Comprovante"
                                  style={{ color: 'var(--primary)', background: 'rgba(99,102,241,0.1)' }}
                                >
                                  <FileText size={18} />
                                </button>
                              )}
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

      {/* Modal was here */}
    </div>
  );
}
