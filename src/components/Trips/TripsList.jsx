import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  X,
  ShoppingCart,
  Utensils,
  Coffee,
  Heart,
  Ticket,
  Camera,
  ShoppingBag,
  Briefcase,
  Smartphone,
  Bed,
  ChevronRight,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import ExpenseModal from './ExpenseModal';
import TripDetails from './TripDetails';
import { CURRENCIES } from '../../constants/currencies';
import { AnimatePresence } from 'framer-motion';
import { useEncryption } from '../../contexts/EncryptionContext';

const TRIP_CATEGORY_META = [
  { keywords: ['vôo', 'voo', 'passag', 'aéreo', 'aereo', 'aviao', 'avião', 'flight'], icon: Plane,        color: '#0ea5e9' },
  { keywords: ['hospedagem', 'hotel', 'airbnb', 'pousada', 'stay', 'aluguel'],     icon: Bed,          color: '#6366f1' },
  { keywords: ['alimentaç', 'comida', 'restaur', 'jantar', 'almoço', 'cafe', 'café'], icon: Utensils,    color: '#f97316' },
  { keywords: ['transporte', 'uber', 'taxi', 'ônibus', 'onibus', 'carro', 'gasolina', 'combust'], icon: Car, color: '#06b6d4' },
  { keywords: ['passeio', 'tour', 'ingresso', 'museu', 'ticket', 'lazer'],         icon: Compass,      color: '#8b5cf6' },
  { keywords: ['compra', 'shopping', 'lembran', 'gift'],                          icon: ShoppingBag,  color: '#ec4899' },
  { keywords: ['seguro', 'saúde', 'saude', 'médico', 'medico', 'farmácia'],        icon: Heart,        color: '#ef4444' },
  { keywords: ['trabalho', 'reunião', 'evento', 'conferên'],                      icon: Briefcase,    color: '#64748b' },
  { keywords: ['internet', 'chip', 'celular', 'sim'],                             icon: Smartphone,   color: '#a855f7' },
];

function getTripCategoryMeta(category = '') {
  const lower = category.toLowerCase();
  const match = TRIP_CATEGORY_META.find(m => m.keywords.some(k => lower.includes(k)));
  return match || { icon: Tag, color: '#94a3b8' };
}

export default function TripsList({ user, refreshKey, onTripSelect, externalSelectedTrip, trips, showValues = true, onEditTrip, onViewChecklists, onViewItinerary }) {
  const selectedTrip = externalSelectedTrip;
  const [expenses, setExpenses] = useState([]);
  const [activeCurrency, setActiveCurrency] = useState('BRL');
  const { decryptObject } = useEncryption();
  const [isTripMenuOpen, setIsTripMenuOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [tripSearchQuery, setTripSearchQuery] = useState('');
  
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
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const renderFlag = (flag, size = '1.1rem') => {
    if (!flag) return <span>🏳️</span>;
    if (flag.startsWith('data:image')) {
      return (
        <img src={flag} alt="flag" style={{ width: size, height: size, objectFit: 'contain', borderRadius: '2px' }} />
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
      const decrypted = await decryptObject(data, ['description', 'paid_by', 'trip_categories.name']);
      setExpenses(decrypted);
    }
  }, [decryptObject, externalSelectedTrip?.id]);

  useEffect(() => {
    if (externalSelectedTrip?.id) {
      fetchExpenses(externalSelectedTrip.id);
    }
  }, [externalSelectedTrip?.id, refreshKey, fetchExpenses]);

  useEffect(() => {
    const fetchCategories = async () => {
      const targetUserId = externalSelectedTrip?.user_id || user?.id;
      if (!targetUserId) return;
      const { data } = await supabase.from('trip_categories').select('*').eq('user_id', targetUserId).order('name');
      if (data) {
        const decrypted = await decryptObject(data, ['name']);
        setCategories(decrypted);
      }
    };
    fetchCategories();
  }, [externalSelectedTrip?.user_id, user?.id, decryptObject]);

  const deleteExpense = async (id) => {
    confirmToast('Excluir esta despesa?', async () => {
      const { error } = await supabase.from('trip_expenses').delete().eq('id', id);
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
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
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

  const filteredExpenses = sortedExpenses.filter(exp => {
    const matchesSearch = exp.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (exp.trip_categories?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (exp.paid_by || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = filterCategory === 'all' || String(exp.category_id) === String(filterCategory);
    
    return matchesSearch && matchesCategory;
  });

  const dailyMap = currencyExpenses.reduce((acc, exp) => {
    const date = exp.date;
    acc[date] = (acc[date] || 0) + (parseFloat(exp.amount) || 0);
    return acc;
  }, {});

  const totalSpent = currencyExpenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
  const daysWithExpenses = Object.keys(dailyMap).filter(date => dailyMap[date] > 0.01);
  const daysCount = daysWithExpenses.length || 1;
  const dailyAverage = totalSpent / daysCount;

  const categoryMap = currencyExpenses.reduce((acc, exp) => {
    const cat = exp.trip_categories?.name || 'Geral';
    acc[cat] = (acc[cat] || 0) + (parseFloat(exp.amount) || 0);
    return acc;
  }, {});

  const paidByMap = currencyExpenses.reduce((acc, exp) => {
    const person = exp.paid_by || 'Não definido';
    acc[person] = (acc[person] || 0) + (parseFloat(exp.amount) || 0);
    return acc;
  }, {});

  const allDays = Object.keys(dailyMap).filter(date => dailyMap[date] > 0.01).sort((a, b) => b.localeCompare(a));

  const tripDuration = useMemo(() => {
    if (!selectedTrip?.start_date || !selectedTrip?.end_date) return 0;
    const start = new Date(selectedTrip.start_date);
    const end = new Date(selectedTrip.end_date);
    return Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
  }, [selectedTrip?.start_date, selectedTrip?.end_date]);

  const totalBudget = useMemo(() => {
    return (selectedTrip?.daily_limits?.[activeCurrency] || 0) * tripDuration;
  }, [selectedTrip?.daily_limits, activeCurrency, tripDuration]);

  const remainingBudget = totalBudget - totalSpent;
  const budgetProgress = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    if (isDetailsOpen) {
      return (
        <TripDetails 
          trip={selectedTrip} expenses={expenses} showValues={showValues}
          onBack={() => setIsDetailsOpen(false)} 
          onEdit={() => onEditTrip(selectedTrip)}
          onViewChecklists={() => { setIsDetailsOpen(false); onViewChecklists(); }} 
        />
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }} className="fade-in">
      
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 100 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: isMobile ? '100%' : '400px' }}>
          <div 
            className="glass-card" onClick={() => setIsTripMenuOpen(!isTripMenuOpen)}
            style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', borderRadius: '14px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
              <Plane size={18} className="text-primary" />
              <span style={{ fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedTrip?.title || 'Selecionar Viagem...'}</span>
            </div>
            <ChevronDown size={18} style={{ transform: isTripMenuOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
          </div>
          <AnimatePresence>
            {isTripMenuOpen && (
              <div className="glass-card fade-in" style={{ position: 'absolute', top: '110%', left: 0, right: 0, padding: '0.5rem', zIndex: 110, maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--glass-border)' }}>
                <div style={{ position: 'relative', marginBottom: '0.5rem', padding: '0.25rem' }}>
                  <Search size={14} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                  <input autoFocus type="text" placeholder="Buscar viagem..." value={tripSearchQuery} onChange={(e) => setTripSearchQuery(e.target.value)} onClick={(e) => e.stopPropagation()} style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2.2rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white', fontSize: '0.85rem' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {trips.filter(t => t.title.toLowerCase().includes(tripSearchQuery.toLowerCase())).map(trip => (
                    <button key={trip.id} onClick={() => { handleTripSelect(trip); setIsTripMenuOpen(false); setTripSearchQuery(''); }} style={{ padding: '0.75rem 1rem', border: 'none', borderRadius: '8px', background: selectedTrip?.id === trip.id ? 'var(--primary)' : 'transparent', color: selectedTrip?.id === trip.id ? 'white' : 'var(--text-main)', textAlign: 'left', cursor: 'pointer', transition: '0.2s', fontWeight: selectedTrip?.id === trip.id ? '700' : '500', fontSize: '0.9rem' }}>{trip.title}</button>
                  ))}
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>

        {selectedTrip && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setIsActionsMenuOpen(!isActionsMenuOpen)} className="icon-btn" aria-label="Menu da Viagem" style={{ width: '46px', height: '46px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '14px' }}><MoreVertical size={22} /></button>
            <AnimatePresence>
              {isActionsMenuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 105 }} onClick={() => setIsActionsMenuOpen(false)} />
                  <div className="glass-card fade-in" style={{ position: 'absolute', top: '110%', right: 0, width: '220px', padding: '0.5rem', zIndex: 110, border: '1px solid var(--glass-border)' }}>
                    {[
                      { icon: <Edit2 size={16} />, label: 'Editar Viagem', onClick: () => onEditTrip(selectedTrip) },
                      { icon: <FileText size={16} />, label: 'Detalhes da Viagem', testId: 'view-trip-details-btn', onClick: () => setIsDetailsOpen(true) },
                      { icon: <ListTodo size={16} />, label: 'Checklist', testId: 'view-checklists-btn', onClick: onViewChecklists },
                      { icon: <Map size={16} />, label: 'Roteiro da Viagem', testId: 'view-itinerary-btn', onClick: () => { if (onViewItinerary) onViewItinerary(); setIsActionsMenuOpen(false); } }
                    ].map((item, idx) => (
                      <button key={idx} data-testid={item.testId} onClick={() => { item.onClick(); setIsActionsMenuOpen(false); }} style={{ width: '100%', padding: '0.75rem 1rem', border: 'none', borderRadius: '8px', background: 'transparent', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', transition: '0.2s', fontWeight: '600', fontSize: '0.85rem' }}><span style={{ color: 'var(--primary)' }}>{item.icon}</span>{item.label}</button>
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
          {/* Trip Summary Card (Mobile Only) */}
          {isMobile && selectedTrip && (
            <div className="trip-active-header glass-card" style={{ padding: '1.5rem', marginBottom: '0.5rem', border: '1px solid var(--primary-light)', background: 'rgba(99,102,241,0.05)', borderRadius: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <div className="trip-hero-badge" style={{ marginBottom: '0.5rem' }}>
                    {new Date(selectedTrip.end_date) < new Date() ? 'Concluída' : 
                     new Date(selectedTrip.start_date) > new Date() ? 'Próxima' : 'Em Andamento'}
                  </div>
                  <h4 style={{ margin: '0.25rem 0 0.4rem 0', fontSize: '1.4rem', fontWeight: '900' }}>{selectedTrip.title}</h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <Calendar size={14} /> {formatDate(selectedTrip.start_date, { month: 'short', day: '2-digit' })} - {formatDate(selectedTrip.end_date, { month: 'short', day: '2-digit' })}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', opacity: 0.8 }}>Progresso do Orçamento</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: '900' }}>{Math.round(budgetProgress)}%</span>
                </div>
                <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ 
                    width: `${Math.min(budgetProgress, 100)}%`, 
                    height: '100%', 
                    background: budgetProgress > 90 ? 'var(--danger)' : 'linear-gradient(90deg, var(--primary), var(--success))',
                    borderRadius: '10px',
                    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.8rem', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Consumido: <b style={{ color: 'var(--text-main)' }}>{activeCurrency} {totalSpent.toLocaleString('pt-BR')}</b></span>
                  <span style={{ color: 'var(--text-muted)' }}>Meta Total: {activeCurrency} {totalBudget.toLocaleString('pt-BR')}</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div className="glass-card" style={{ display: 'flex', padding: '0.25rem', borderRadius: '12px' }}>
              {selectedTrip.currencies?.map(currCode => {
                const currData = CURRENCIES.find(c => c.code === currCode);
                return (
                  <button key={currCode} onClick={() => setActiveCurrency(currCode)} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '10px', background: activeCurrency === currCode ? 'var(--primary)' : 'transparent', color: activeCurrency === currCode ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.4rem', transition: '0.2s' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>{renderFlag(currData?.flag)}</div>{currCode}
                  </button>
                );
              })}
            </div>
          </div>

          {!isMobile && selectedTrip && (
            <div style={{ marginBottom: '1rem' }}>
              <div 
                className="trip-hero-card active" 
                style={{ maxWidth: '100%', cursor: 'default' }}
              >
                <div className="trip-hero-content">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div className="trip-hero-badge">
                        {new Date(selectedTrip.end_date) < new Date() ? 'Concluída' : 
                         new Date(selectedTrip.start_date) > new Date() ? 'Próxima' : 'Em Andamento'}
                      </div>
                      <h4 className="trip-hero-title" style={{ fontSize: '1.8rem', marginTop: '0.5rem' }}>{selectedTrip.title}</h4>
                      <p className="trip-hero-date" style={{ fontSize: '1rem' }}>
                        {formatDate(selectedTrip.start_date, { month: 'long', day: '2-digit' })} - {formatDate(selectedTrip.end_date, { month: 'long', day: '2-digit', year: 'numeric' })}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: '800' }}>Moeda Ativa</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                        {renderFlag(CURRENCIES.find(c => c.code === activeCurrency)?.flag, '1.4rem')}
                        <span style={{ fontSize: '1.25rem', fontWeight: '800' }}>{activeCurrency}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="trip-hero-stats" style={{ marginTop: '2rem' }}>
                    <div className="stat-row">
                      <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Progresso do Orçamento</span>
                      <span style={{ fontSize: '1rem', fontWeight: '800' }}>{Math.round(budgetProgress)}%</span>
                    </div>
                    <div className="stat-track" style={{ height: '12px' }}>
                      <div 
                        className="stat-fill" 
                        style={{ 
                          width: `${Math.min(budgetProgress, 100)}%`,
                          background: budgetProgress > 90 ? 'var(--danger)' : 'linear-gradient(90deg, var(--primary), var(--success))'
                        }} 
                      />
                    </div>
                    <div className="stat-row bottom" style={{ marginTop: '0.75rem' }}>
                      <span style={{ fontSize: '0.9rem' }}>Consumido: <b>{activeCurrency} {totalSpent.toLocaleString('pt-BR')}</b></span>
                      <span style={{ fontSize: '0.9rem' }}>Meta Total: {activeCurrency} {totalBudget.toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.5fr', gap: '1.5rem' }}>
            <div className="glass-card" style={{ padding: isMobile ? '1.5rem' : '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1rem' }}>Resumo da Viagem</div>
              <h2 style={{ fontSize: isMobile ? '1.75rem' : '2.5rem', margin: 0, fontWeight: '900' }}>{showValues ? `${activeCurrency} ${totalSpent.toLocaleString('pt-BR')}` : '••••••'}</h2>
              <div style={{ display: 'flex', gap: isMobile ? '1rem' : '2rem', marginTop: '1.5rem' }}>
                <div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Média Diária</div><div style={{ fontSize: isMobile ? '1rem' : '1.25rem', fontWeight: '800' }}>{showValues ? dailyAverage.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '•••'}</div></div>
                <div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Economia</div><div style={{ fontSize: isMobile ? '1rem' : '1.25rem', fontWeight: '800', color: remainingBudget > 0 ? 'var(--success)' : 'var(--danger)' }}>{totalBudget > 0 ? `${Math.round((remainingBudget/totalBudget)*100)}%` : '0%'}</div></div>
              </div>
            </div>
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem' }}><PieChart size={20} className="text-primary" /> Gastos por Categoria</h3>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.5rem' }}>
                {Object.entries(categoryMap).slice(0, 4).map(([cat, total]) => (
                  <div key={cat}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem' }}><span>{cat}</span><span style={{ fontWeight: '700' }}>{showValues ? total.toLocaleString('pt-BR') : '•••'}</span></div>
                    <div className="stat-track"><div className="stat-fill" style={{ width: `${(total/totalSpent)*100}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem' }}><Users size={20} className="text-primary" /> Gastos por Viajante</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {Object.entries(paidByMap).sort((a,b) => b[1]-a[1]).map(([person, total]) => (
                  <div key={person}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.4rem' }}><span>{person}</span><span style={{ fontWeight: '700' }}>{showValues ? total.toLocaleString('pt-BR') : '•••'}</span></div>
                    <div className="stat-track"><div className="stat-fill" style={{ width: `${(total/totalSpent)*100}%`, background: 'var(--primary)' }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem' }}><Calendar size={20} className="text-primary" /> Gastos Diários</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '200px', overflowY: 'auto' }} className="custom-scrollbar">
                {allDays.map(date => (
                  <div key={date}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.4rem' }}><span>{formatDate(date, { day: '2-digit', month: 'short' })}</span><span style={{ fontWeight: '700' }}>{showValues ? dailyMap[date].toLocaleString('pt-BR') : '•••'}</span></div>
                    <div className="stat-track"><div className="stat-fill" style={{ width: `${(dailyMap[date]/totalSpent)*100}%`, background: 'var(--success)' }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: isMobile ? '1.25rem' : '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.1rem' }}>
                <DollarSign size={22} className="text-primary" /> Despesas
              </h3>
              <button className="btn" onClick={() => setIsAddingExpense(true)} style={{ background: 'var(--primary)', color: 'white', padding: '0.6rem 1.2rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={16} /> Nova Despesa
              </button>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                <input 
                  type="text" 
                  placeholder="Pesquisar..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="glass-input" 
                  style={{ paddingLeft: '2.8rem', width: '100%', fontSize: '0.9rem', borderRadius: '12px' }} 
                />
              </div>
              <select 
                value={filterCategory} 
                onChange={(e) => setFilterCategory(e.target.value)}
                className="glass-input"
                style={{ width: isMobile ? '100%' : '220px', fontSize: '0.9rem', borderRadius: '12px', cursor: 'pointer' }}
              >
                <option value="all">Todas as Categorias</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div style={{ overflowX: 'auto' }}>
              {isMobile ? (
                <div className="trip-expenses-mobile-list">
                  {filteredExpenses.map((exp, idx) => {
                    const meta = getTripCategoryMeta(exp.trip_categories?.name);
                    const Icon = meta.icon;
                    return (
                      <div key={exp.id} className="trip-expense-card fade-in" style={{ animationDelay: `${idx * 0.05}s` }}>
                        <div className="trip-expense-header">
                          <div className="trip-cat-icon" style={{ '--cat-color': meta.color }}><Icon size={18} /></div>
                          <div className="trip-expense-info">
                            <div className="trip-expense-title">{exp.description}</div>
                            <div className="trip-expense-subtitle">{exp.date ? formatDate(exp.date, { day: '2-digit', month: 'short' }) : '--'} • {exp.trip_categories?.name || 'Geral'}</div>
                          </div>
                          <div className="trip-expense-amount">
                            <div className="amount-main">{showValues ? exp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '••••'} <small>{exp.currency}</small></div>
                          </div>
                        </div>
                        <div className="trip-expense-footer">
                          <div className="trip-expense-paidby"><Users size={12} /> {exp.paid_by}</div>
                          <div className="trip-expense-actions">
                            <button className="trip-action-mini" onClick={() => setEditingExpense(exp)} title="Editar"><Edit2 size={14} /></button>
                            <button className="trip-action-mini danger" onClick={() => deleteExpense(exp.id)} title="Excluir"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <table className="finance-table">
                      <thead>
                        <tr>
                          <th onClick={() => handleSort('date')} style={{ cursor: 'pointer' }}>DATA</th>
                          <th onClick={() => handleSort('description')} style={{ cursor: 'pointer' }}>DESCRIÇÃO</th>
                          <th>CATEGORIA</th>
                          <th>PAGO POR</th>
                          <th style={{ textAlign: 'right' }}>VALOR</th>
                          <th style={{ textAlign: 'center' }}>ANEXO</th>
                          <th style={{ textAlign: 'center' }}>AÇÕES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredExpenses.map(exp => {
                          const meta = getTripCategoryMeta(exp.trip_categories?.name);
                          const Icon = meta.icon;
                          return (
                            <tr key={exp.id}>
                              <td>{exp.date ? formatDate(exp.date) : '--'}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  <span className="cat-icon-wrap" style={{ '--cat-color': meta.color }}><Icon size={14} /></span>
                                  <div style={{ fontWeight: '700' }}>{exp.description}</div>
                                </div>
                              </td>
                              <td><span className="cat-chip" style={{ '--cat-color': meta.color }}>{exp.trip_categories?.name || 'Geral'}</span></td>
                              <td>{exp.paid_by}</td>
                              <td style={{ textAlign: 'right', fontWeight: '800' }}>{showValues ? exp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '••••'} <small>{exp.currency}</small></td>
                              <td style={{ textAlign: 'center' }}>
                                {exp.receipt_url && (
                                  <button onClick={async () => {
                                    const signedUrl = await getSignedUrl('trip-documents', exp.receipt_url);
                                    if (signedUrl) window.open(signedUrl, '_blank');
                                  }} className="action-btn" title="Ver Comprovante">
                                    <FileText size={18} />
                                  </button>
                                )}
                              </td>
                              <td className="actions-cell">
                            <div className="actions-row" style={{ justifyContent: 'center' }}>
                              <button className="action-btn" onClick={() => setEditingExpense(exp)} title="Editar"><Edit2 size={18} /></button>
                              <button className="action-btn danger" onClick={() => deleteExpense(exp.id)} title="Excluir"><Trash2 size={18} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {(isAddingExpense || editingExpense) && (
        <ExpenseModal 
          user={user} trip={selectedTrip} expense={editingExpense} currency={activeCurrency}
          categories={categories} onClose={() => { setIsAddingExpense(false); setEditingExpense(null); }}
          onSave={() => { setIsAddingExpense(false); setEditingExpense(null); fetchExpenses(); }}
        />
      )}
    </div>
  );
}
