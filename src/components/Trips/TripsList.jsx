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
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import ExpenseModal from './ExpenseModal';
import TripDetails from './TripDetails';
import { CURRENCIES } from '../../constants/currencies';
import { motion as Motion, AnimatePresence } from 'framer-motion';

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
  return match || { icon: Tag, color: 'var(--text-muted)' };
}

export default function TripsList({ 
  user, refreshKey, onTripSelect, externalSelectedTrip, trips, 
  showValues = true, onEditTrip, onViewChecklists, onViewItinerary,
  isDetailsOpen: externalIsDetailsOpen, setIsDetailsOpen: setExternalIsDetailsOpen
}) {
  const { t, i18n } = useTranslation();
  const [expenses, setExpenses] = useState([]);
  const [activeCurrency, setActiveCurrency] = useState('BRL');
  const [isDetailsOpen, setIsDetailsOpen] = useState(externalIsDetailsOpen);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isTripMenuOpen, setIsTripMenuOpen] = useState(false);
  const [tripSearchQuery, setTripSearchQuery] = useState('');
  const [internalSelectedTrip, setInternalSelectedTrip] = useState(externalSelectedTrip);

  useEffect(() => {
    setInternalSelectedTrip(externalSelectedTrip);
  }, [externalSelectedTrip]);

  const selectedTrip = internalSelectedTrip || externalSelectedTrip;

  // Sync with props
  useEffect(() => {
    setIsDetailsOpen(externalIsDetailsOpen);
  }, [externalIsDetailsOpen]);
  
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
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    const handleCurrencyChange = (e) => {
      if (e.detail.tripId === externalSelectedTrip?.id) {
        setActiveCurrency(e.detail.currency);
      }
    };
    window.addEventListener('trip-currency-changed', handleCurrencyChange);

    return () => {
      window.removeEventListener('trip-currency-changed', handleCurrencyChange);
    };
  }, [externalSelectedTrip?.id]);

  const renderFlag = (flag, size = '1.1rem') => {
    if (!flag) return <span>🏳️</span>;
    if (flag.startsWith('data:image')) {
      return (
        <img src={flag} alt="flag" style={{ width: size, height: size, objectFit: 'contain', borderRadius: '2px' }} />
      );
    }
    return <span style={{ fontSize: size, lineHeight: 1 }}>{flag}</span>;
  };

  const [isExpensesLoading, setIsExpensesLoading] = useState(false);
  const fetchExpenses = useCallback(async (tripId = externalSelectedTrip?.id) => {
    if (!tripId) return;
    setIsExpensesLoading(true);
    const { data, error } = await supabase
      .from('trip_expenses')
      .select('*, trip_categories(name)')
      .eq('trip_id', tripId)
      .order('date', { ascending: false });
    
    if (!error && data) {
      setExpenses(data);
    }
    setIsExpensesLoading(false);
  }, [externalSelectedTrip?.id]);

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
        setCategories(data);
      }
    };
    fetchCategories();
  }, [externalSelectedTrip?.user_id, user?.id]);

  const deleteExpense = async (id) => {
    confirmToast(t('trips.confirm_delete_expense', 'Excluir esta despesa?'), async () => {
      const { error } = await supabase.from('trip_expenses').delete().eq('id', id);
      if (!error) {
        fetchExpenses(externalSelectedTrip.id);
        toast.success(t('trips.expense_deleted', 'Despesa excluída'));
      } else {
        toast.error(t('trips.error_deleting', 'Erro ao excluir'));
      }
    }, { danger: true, confirmText: t('common.sim', 'Sim, excluir') });
  };


  const handleTripSelect = (trip) => {
    setInternalSelectedTrip(trip);
    setIsDetailsOpen(false);
    if (setExternalIsDetailsOpen) setExternalIsDetailsOpen(false);
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
    const cat = exp.trip_categories?.name || t('trips.general', 'Geral');
    acc[cat] = (acc[cat] || 0) + (parseFloat(exp.amount) || 0);
    return acc;
  }, {});

  const paidByMap = currencyExpenses.reduce((acc, exp) => {
    const person = exp.paid_by || t('trips.unidentified', 'Não definido');
    acc[person] = (acc[person] || 0) + (parseFloat(exp.amount) || 0);
    return acc;
  }, {});



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


  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div className="trip-header-container" style={{ zIndex: 1100, position: 'relative' }}>
        <div className="trip-selector-wrapper" style={{ position: 'relative', zIndex: isTripMenuOpen ? 2000 : 1 }}>
          <div 
            className="glass-card trip-selector-card" 
            data-testid="trip-selector"
            onClick={() => setIsTripMenuOpen(!isTripMenuOpen)}
          >
            <div className="trip-selector-info">
              <div className="trip-selector-icon">
                <MapPin size={16} />
              </div>
              <div className="trip-selector-text">
                <span className="trip-selector-label">{t('trips.selected_trip_label')}</span>
                <span className="trip-selector-title">
                  {selectedTrip?.title || t('trips.select_trip_placeholder')}
                </span>
              </div>
            </div>
            <ChevronDown size={20} className={`trip-selector-chevron ${isTripMenuOpen ? 'open' : ''}`} />
          </div>
          
            {isTripMenuOpen && (
              <div 
                className="glass-card trip-menu-dropdown"
                style={{ zIndex: 9999 }}
              >
                <div className="trip-menu-search">
                  <Search size={16} className="search-icon" />
                  <input 
                    autoFocus 
                    type="text" 
                    placeholder={trips.length > 0 ? `${t('trips.search_trip_placeholder')} (${trips.length})` : t('trips.search_trip_placeholder')} 
                    value={tripSearchQuery} 
                    onChange={(e) => setTripSearchQuery(e.target.value)} 
                    onClick={(e) => e.stopPropagation()} 
                    className="glass-input"
                  />
                </div>
                <div className="trip-menu-list">
                  {(trips || [])
                    .filter(t => (t.title || '').toLowerCase().includes(tripSearchQuery.toLowerCase()))
                    .map(trip => (
                      <button 
                        key={trip.id} 
                        data-testid={'trip-select-' + trip.id}
                        onClick={() => { handleTripSelect(trip); setIsTripMenuOpen(false); setTripSearchQuery(''); }} 
                        className={`trip-menu-item ${selectedTrip?.id === trip.id ? 'active' : ''}`}
                      >
                        <div className="trip-menu-indicator" />
                        {trip.title}
                      </button>
                    ))}
                </div>
              </div>
            )}
        </div>

        <div className="trip-header-actions">
          {selectedTrip?.currencies?.length > 0 && (
            <div className="currency-switcher">
              {selectedTrip.currencies.map(currCode => {
                const currData = CURRENCIES.find(c => c.code === currCode);
                return (
                  <button 
                    key={currCode} 
                    onClick={() => setActiveCurrency(currCode)} 
                    className={`currency-btn ${activeCurrency === currCode ? 'active' : ''}`}
                  >
                    {renderFlag(currData?.flag, '1.1rem')}
                    <span className="currency-code">{currCode}</span>
                  </button>
                );
              })}
            </div>
          )}

          {selectedTrip && (
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => setIsActionsMenuOpen(!isActionsMenuOpen)} 
                className="icon-btn" 
                aria-label={t('trips.trip_menu_label')}
                data-testid="trip-actions-menu-btn"
                style={{ 
                  width: '48px', height: '48px', borderRadius: '14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--card-action-bg)', border: '1px solid var(--glass-border)'
                }}
              >
                <MoreVertical size={22} />
              </button>
              <AnimatePresence>
                {isActionsMenuOpen && (
                  <>
                    <div className="menu-overlay" onClick={() => setIsActionsMenuOpen(false)} />
                    <Motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="glass-card trip-actions-dropdown"
                    >
                      {[
                        { icon: <Edit2 size={16} />, label: t('trips.edit_trip'), testId: 'edit-trip-btn', onClick: () => onEditTrip(selectedTrip) },
                        { icon: <FileText size={16} />, label: t('trips.view_trip_summary'), testId: 'view-trip-details-btn', onClick: () => { setIsDetailsOpen(true); if (setExternalIsDetailsOpen) setExternalIsDetailsOpen(true); } },
                        { icon: <ListTodo size={16} />, label: t('trips.checklists'), testId: 'view-checklists-btn', onClick: () => onViewChecklists() },
                        { icon: <Compass size={16} />, label: t('trips.manage_itinerary'), testId: 'view-itinerary-btn', onClick: () => onViewItinerary() }
                      ].map((item, idx) => (
                        <button 
                          key={idx} 
                          data-testid={item.testId}
                          onClick={() => { item.onClick(); setIsActionsMenuOpen(false); }} 
                          className="menu-dropdown-item"
                        >
                          <span className="item-icon">{item.icon}</span>
                          {item.label}
                        </button>
                      ))}
                    </Motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {isDetailsOpen && selectedTrip ? (
        <TripDetails 
          trip={selectedTrip} expenses={expenses} showValues={showValues}
          onBack={() => setIsDetailsOpen(false)} 
          onEdit={() => onEditTrip(selectedTrip)}
          onViewChecklists={() => { setIsDetailsOpen(false); onViewChecklists(); }} 
        />
      ) : selectedTrip ? (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="mobile-only">
            {selectedTrip && (
              <div className="trip-active-header glass-card" style={{ padding: '1.5rem', marginBottom: '0.5rem', border: '1px solid var(--primary-light)', background: 'rgba(99,102,241,0.05)', borderRadius: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                  <div>
                    <div className="trip-hero-badge" style={{ marginBottom: '0.5rem' }}>
                      {new Date(selectedTrip.end_date) < new Date() ? t('trips.status_completed') : 
                       new Date(selectedTrip.start_date) > new Date() ? t('trips.status_next') : t('trips.status_ongoing')}
                    </div>
                    <h4 style={{ margin: '0.25rem 0 0.4rem 0', fontSize: '1.4rem', fontWeight: '900' }}>{selectedTrip.title}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <Calendar size={14} /> {formatDate(selectedTrip.start_date, { month: 'short', day: '2-digit' })} - {formatDate(selectedTrip.end_date, { month: 'short', day: '2-digit' })}
                    </div>
                    {(Array.isArray(selectedTrip.participants) && selectedTrip.participants.length > 0) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                        <Users size={14} /> {selectedTrip.participants.join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', opacity: 0.8 }}>{t('trips.budget_progress')}</span>
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
                    <span style={{ color: 'var(--text-muted)' }}>{t('trips.consumed')}: <b style={{ color: 'var(--text-main)' }}>{activeCurrency} {(Number(totalSpent) || 0).toLocaleString(i18n.language)}</b></span>
                    <span style={{ color: 'var(--text-muted)' }}>{t('trips.total_target')}: {activeCurrency} {(Number(totalBudget) || 0).toLocaleString(i18n.language)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="desktop-only">
            {selectedTrip && (
              <div style={{ marginBottom: '0.5rem' }}>
                <div 
                  className="glass-card" 
                  style={{ 
                    padding: '2rem', 
                    background: 'var(--bg-card)',
                    border: '1px solid var(--glass-border)',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.5rem',
                    boxShadow: 'var(--shadow)',
                    cursor: 'default'
                  }}
                >
                  {/* Background Decoration */}
                  <div style={{ position: 'absolute', right: '-20px', bottom: '-20px', opacity: 0.03, transform: 'rotate(-10deg)', pointerEvents: 'none' }}>
                    <Plane size={240} color="var(--primary)" />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        display: 'inline-flex', 
                        padding: '0.35rem 0.75rem', 
                        borderRadius: '8px', 
                        background: 'color-mix(in srgb, var(--primary) 15%, transparent)', 
                        color: 'var(--primary)',
                        fontSize: '0.7rem',
                        fontWeight: '800',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
                        marginBottom: '1rem'
                      }}>
                        {new Date(selectedTrip.end_date) < new Date() ? t('trips.status_completed') : 
                         new Date(selectedTrip.start_date) > new Date() ? t('trips.status_next') : t('trips.status_ongoing')}
                      </div>
                      <h2 style={{ fontSize: '2.25rem', fontWeight: '900', color: 'var(--text-main)', margin: '0 0 0.5rem 0', letterSpacing: '-0.02em' }}>
                        {selectedTrip.title}
                      </h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)', fontSize: '1rem', fontWeight: '600' }}>
                        <Calendar size={18} />
                        {formatDate(selectedTrip.start_date, { month: 'long', day: '2-digit' })} - {formatDate(selectedTrip.end_date, { month: 'long', day: '2-digit', year: 'numeric' })}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>{t('trips.active_currency_label')}</div>
                      <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '0.75rem', 
                        padding: '0.75rem 1.25rem',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '16px'
                      }}>
                        {renderFlag(CURRENCIES.find(c => c.code === activeCurrency)?.flag, '1.5rem')}
                        <span style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--text-main)' }}>{activeCurrency}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bento-grid">
            <div className="glass-card hero-card-main" style={{ padding: '2rem', position: 'relative', overflow: 'hidden' }}>
              <div className="hero-card-bg-icon" style={{ bottom: '-30px', right: '-30px', opacity: 0.03, transform: 'rotate(-15deg)' }}>
                <DollarSign size={140} />
              </div>
              <div className="hero-card-header" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="hero-card-icon-wrapper" style={{ background: 'var(--primary)', color: 'white', padding: '0.4rem', borderRadius: '10px' }}>
                  <DollarSign size={18} />
                </div>
                <span className="hero-card-label">{t('trips.total_invested')}</span>
              </div>
              
              <div className="hero-card-body">
                <div className="hero-card-main-value" style={{ marginBottom: '2rem' }}>
                  <div className="value-text" style={{ fontSize: '2.5rem', fontWeight: '900', color: 'var(--text-main)', letterSpacing: '-0.03em' }}>
                    {showValues ? `${activeCurrency} ${(Number(totalSpent) || 0).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}` : '••••••'}
                  </div>
                </div>
                
                <div className="hero-card-stats" style={{ display: 'flex', gap: '2rem' }}>
                  <div className="stat-item">
                    <div className="stat-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase', opacity: 0.5, fontWeight: '800', marginBottom: '0.25rem' }}>{t('trips.daily_average')}</div>
                    <div className="stat-value" style={{ fontSize: '1.1rem', fontWeight: '800' }}>{showValues ? `${activeCurrency} ${(Number(dailyAverage) || 0).toLocaleString(i18n.language, { maximumFractionDigits: 0 })}` : '•••'}</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase', opacity: 0.5, fontWeight: '800', marginBottom: '0.25rem' }}>{t('trips.remaining_target')}</div>
                    <div className={`stat-value ${remainingBudget > 0 ? 'text-success' : 'text-danger'}`} style={{ fontSize: '1.1rem', fontWeight: '800' }}>
                      {totalBudget > 0 ? `${Math.round((remainingBudget/totalBudget)*100)}%` : '--'}
                    </div>
                  </div>
                </div>
              </div>
            </div>



            <div className="glass-card hero-card-secondary" style={{ padding: '2rem', position: 'relative', overflow: 'hidden' }}>
              <div className="hero-card-bg-icon" style={{ bottom: '-30px', right: '-30px', opacity: 0.03, transform: 'rotate(-15deg)' }}>
                <TrendingUp size={140} />
              </div>
              <div className="hero-card-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="hero-card-header-left" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="hero-card-icon-wrapper">
                    <TrendingUp size={18} />
                  </div>
                  <span className="hero-card-label">{t('trips.financial_health')}</span>
                </div>
                <div className={`status-badge ${budgetProgress > 100 ? 'danger' : 'success'}`} style={{ 
                  padding: '0.4rem 0.75rem', 
                  borderRadius: '8px', 
                  background: budgetProgress > 100 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                  color: budgetProgress > 100 ? '#ef4444' : '#22c55e',
                  fontSize: '0.7rem',
                  fontWeight: '900',
                  border: '1px solid currentColor',
                  borderOpacity: 0.2
                }}>
                  {budgetProgress > 100 ? t('trips.overbudget') : t('trips.within_budget')}
                </div>
              </div>

              <div className="hero-card-body">
                <div className="progress-section" style={{ marginBottom: '2rem' }}>
                  <div className="progress-info" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <span className="progress-label" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('trips.budget_consumption')}</span>
                    <span className={`progress-percentage ${budgetProgress > 90 ? 'text-danger' : ''}`} style={{ fontWeight: '900' }}>{Math.round(budgetProgress)}%</span>
                  </div>
                  <div className="orbit-progress-bar" style={{ height: '10px', background: 'rgba(255,255,255,0.05)' }}>
                    <Motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(budgetProgress, 100)}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className={`progress-fill ${budgetProgress > 100 ? 'danger' : 'primary'}`}
                      style={{ height: '100%', borderRadius: '10px' }}
                    />
                        <div className="budget-details" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div className="budget-item">
                    <div className="budget-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase', opacity: 0.5, fontWeight: '800', marginBottom: '0.25rem' }}>{t('trips.cap')}</div>
                    <div className="budget-value" style={{ fontSize: '1.1rem', fontWeight: '800' }}>{activeCurrency} {(Number(totalBudget) || 0).toLocaleString(i18n.language)}</div>
                  </div>
                  <div className="budget-item text-right" style={{ textAlign: 'right' }}>
                    <div className="budget-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase', opacity: 0.5, fontWeight: '800', marginBottom: '0.25rem' }}>{t('trips.available')}</div>
                    <div className={`budget-value ${remainingBudget > 0 ? 'text-success' : 'text-danger'}`} style={{ fontSize: '1.1rem', fontWeight: '800' }}>
                      {activeCurrency} {(Number(remainingBudget) || 0).toLocaleString(i18n.language)}
                    </div>
                  </div>
                </div>
              </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bento-grid">
            <div className="glass-card" style={{ padding: '1.75rem', background: 'var(--bg-card)', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 className="hero-card-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <PieChart size={18} className="text-primary" /> {t('trips.expenses_by_category')}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem' }}>
                {Object.entries(categoryMap).slice(0, 4).map(([cat, total]) => (
                  <div key={cat} className="progress-section">
                    <div className="progress-info" style={{ marginBottom: '0.4rem' }}>
                      <span className="progress-label" style={{ fontSize: '0.8rem', fontWeight: '700' }}>{cat}</span>
                      <span className="progress-percentage" style={{ fontSize: '0.85rem', fontWeight: '900' }}>
                        {showValues ? (Number(total) || 0).toLocaleString(i18n.language, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '•••'}
                      </span>
                    </div>
                    <div className="orbit-progress-bar" style={{ height: '6px' }}>
                      <div className="progress-fill primary" style={{ width: `${(total/totalSpent)*100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-card" style={{ padding: '1.75rem', background: 'var(--bg-card)', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 className="hero-card-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Users size={18} className="text-primary" /> {t('trips.division_by_traveler')}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '220px', overflowY: 'auto' }} className="custom-scrollbar">
                {Object.entries(paidByMap).sort((a,b) => b[1]-a[1]).map(([person, total]) => (
                  <div key={person} className="progress-section">
                    <div className="progress-info" style={{ marginBottom: '0.4rem' }}>
                      <span className="progress-label" style={{ fontSize: '0.8rem', fontWeight: '700' }}>{person === 'N/A' ? t('trips.unidentified') : person}</span>
                      <span className="progress-percentage" style={{ fontSize: '0.85rem', fontWeight: '900' }}>
                        {showValues ? (Number(total) || 0).toLocaleString(i18n.language) : '•••'}
                      </span>
                    </div>
                    <div className="orbit-progress-bar" style={{ height: '6px' }}>
                      <div className="progress-fill primary" style={{ width: `${(total/totalSpent)*100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.1rem' }}>
                <DollarSign size={22} className="text-primary" /> {t('trips.expenses_title')}
              </h3>
              <button className="btn" onClick={() => setIsAddingExpense(true)} style={{ background: 'var(--primary)', color: 'white', padding: '0.6rem 1.2rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={16} /> {t('trips.new_expense_btn')}
              </button>
            </div>

            <div className="expense-filters">
              <div className="filter-group search">
                <Search size={18} className="filter-icon" />
                <input 
                  type="text" 
                  placeholder={t('trips.search_expense_placeholder')} 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="glass-input" 
                />
              </div>
              <div className="filter-group">
                <Filter size={18} className="filter-icon" />
                <select 
                  value={filterCategory} 
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="glass-input"
                >
                  <option value="all">{t('trips.all_categories')}</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ overflowX: 'auto', borderRadius: '16px' }}>
              {isExpensesLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 2rem', gap: '1.5rem', background: 'rgba(255,255,255,0.01)', borderRadius: '24px', border: '1px dashed var(--glass-border)' }}>
                  <div className="loading-spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(99, 102, 241, 0.1)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: '600' }}>{t('trips.syncing_data')}</p>
                </div>
              ) : filteredExpenses.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', borderRadius: '24px', border: '1px dashed var(--glass-border)' }}>
                  <AlertCircle size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                  <p style={{ fontSize: '1rem', fontWeight: '500' }}>{t('trips.no_entries_found')}</p>
                </div>
              ) : (
                <>
                  <div className="mobile-only">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {filteredExpenses.map((exp, idx) => {
                        const meta = getTripCategoryMeta(exp.trip_categories?.name);
                        const Icon = meta.icon;
                        return (
                          <Motion.div 
                            key={exp.id} 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="expense-item-card"
                          >
                            <div className="expense-card-top">
                              <div className="expense-card-info">
                                <div className="expense-card-icon" style={{ 
                                  background: `color-mix(in srgb, ${meta.color} 15%, transparent)`, 
                                  color: meta.color,
                                  border: `1px solid color-mix(in srgb, ${meta.color} 25%, transparent)`
                                }}>
                                  <Icon size={20} />
                                </div>
                                <div className="expense-card-details">
                                  <div className="expense-card-title">{exp.description}</div>
                                  <div className="expense-card-subtitle">
                                    {exp.date ? formatDate(exp.date, { day: '2-digit', month: 'short' }) : '--'} • {exp.trip_categories?.name || t('trips.general', 'Geral')}
                                  </div>
                                </div>
                              </div>
                              <div className="expense-card-amount">
                                <div className="expense-amount-value">
                                  {showValues ? (Number(exp.amount) || 0).toLocaleString(i18n.language, { minimumFractionDigits: 2 }) : '••••'}
                                </div>
                                <div className="expense-amount-currency">{exp.currency}</div>
                              </div>
                            </div>
                            
                            <div className="expense-card-footer">
                              <div className="expense-card-user">
                                <Users size={14} color="var(--primary)" /> {exp.paid_by}
                              </div>
                              <div className="expense-card-actions">
                                {exp.receipt_url && (
                                  <button className="icon-btn" onClick={async () => {
                                    const signedUrl = await getSignedUrl('trip-documents', exp.receipt_url);
                                    if (signedUrl) window.open(signedUrl, '_blank');
                                  }} title={t('trips.view_receipt')}><FileText size={16} /></button>
                                )}
                                <button className="icon-btn" onClick={() => setEditingExpense(exp)} title={t('trips.edit')}><Edit2 size={16} /></button>
                                <button className="icon-btn danger" onClick={() => deleteExpense(exp.id)} title={t('trips.delete')}><Trash2 size={16} /></button>
                              </div>
                            </div>
                          </Motion.div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="desktop-only">
                    <table className="orbit-table">
                      <thead>
                        <tr>
                          <th onClick={() => handleSort('date')} style={{ cursor: 'pointer' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{t('trips.date_col')} <ArrowUpDown size={12} /></div>
                          </th>
                          <th onClick={() => handleSort('description')} style={{ cursor: 'pointer' }}>{t('trips.description_col')}</th>
                          <th>{t('trips.category_col')}</th>
                          <th>{t('trips.paid_by_col')}</th>
                          <th className="text-right">{t('trips.value_col')}</th>
                          <th className="text-center">{t('trips.actions_col')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredExpenses.map((exp) => {
                          const meta = getTripCategoryMeta(exp.trip_categories?.name);
                          const Icon = meta.icon;
                          return (
                            <tr key={exp.id}>
                              <td>{exp.date ? formatDate(exp.date, { day: '2-digit', month: '2-digit' }) : '--'}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  <div style={{ 
                                    width: '32px', height: '32px', borderRadius: '8px', 
                                    background: `color-mix(in srgb, ${meta.color} 15%, transparent)`, 
                                    color: meta.color, 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: `1px solid color-mix(in srgb, ${meta.color} 25%, transparent)`
                                  }}>
                                    <Icon size={16} />
                                  </div>
                                  <div style={{ fontWeight: '700' }}>{exp.description}</div>
                                </div>
                              </td>
                              <td>
                                <span className="orbit-category-badge">
                                  {exp.trip_categories?.name || t('trips.general', 'Geral')}
                                </span>
                              </td>
                              <td>{exp.paid_by}</td>
                              <td className="text-right" style={{ fontWeight: '900' }}>
                                {showValues ? (Number(exp.amount) || 0).toLocaleString(i18n.language, { minimumFractionDigits: 2 }) : '••••'} 
                                <small style={{ fontSize: '0.65rem', opacity: 0.5, marginLeft: '0.25rem' }}>{exp.currency}</small>
                              </td>
                              <td>
                                <div className="expense-card-actions">
                                  {exp.receipt_url && (
                                    <button onClick={async () => {
                                      const signedUrl = await getSignedUrl('trip-documents', exp.receipt_url);
                                      if (signedUrl) window.open(signedUrl, '_blank');
                                    }} className="icon-btn" title={t('trips.view_receipt')}><FileText size={16} /></button>
                                  )}
                                  <button className="icon-btn" onClick={() => setEditingExpense(exp)} title={t('trips.edit')}><Edit2 size={16} /></button>
                                  <button className="icon-btn danger" onClick={() => deleteExpense(exp.id)} title={t('trips.delete')}><Trash2 size={16} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px dashed var(--glass-border)' }}>
          <Plane size={48} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
          <h3 style={{ margin: 0 }}>{t('trips.no_trips_selected')}</h3>
          <p style={{ marginTop: '0.5rem' }}>{t('trips.select_trip_desc')}</p>
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
