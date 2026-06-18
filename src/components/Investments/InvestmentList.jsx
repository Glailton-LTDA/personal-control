import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { 
  Plus, Search, Filter, TrendingUp, ArrowUpDown, ChevronDown, ChevronRight,
  Trash2, Edit2, Calendar, Copy, Wallet
} from 'lucide-react';
import InvestmentModal from './InvestmentModal';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import { motion as Motion } from 'framer-motion';
import { CURRENCIES } from '../../constants/currencies';

const GRADIENTS = {
  income: 'var(--stat-income)',
  expense: 'var(--stat-expense)',
  pending: 'var(--stat-pending)',
  balance: 'var(--stat-balance)',
  purple: 'rgba(139, 92, 246, 0.1)',
};

function StatCard({ title, value, icon, color, gradient, loading, showValues, testId, currency = 'BRL' }) {
  return (
    <div 
      className="glass-card" 
      data-testid={testId}
      style={{ 
        padding: '1.5rem', 
        background: 'var(--bg-card)',
        border: '1px solid var(--glass-border)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '140px',
        boxShadow: 'var(--shadow)'
      }}
    >
      {/* Background Gradient Overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `linear-gradient(135deg, transparent 60%, ${gradient} 100%)`,
        opacity: 0.6,
        pointerEvents: 'none'
      }} />
      {/* Background Icon Glow */}
      <div style={{ 
        position: 'absolute', 
        right: '-10px', 
        top: '-10px', 
        opacity: 0.05, 
        transform: 'rotate(-15deg)' 
      }}>
        {React.cloneElement(icon, { size: 100, color: color })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ 
          color: color, 
          background: `color-mix(in srgb, ${color} 15%, transparent)`, 
          padding: '0.6rem', 
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`
        }}>
          {icon}
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </span>
      </div>

      <div>
        <div style={{ 
          fontSize: '1.75rem', 
          fontWeight: 900, 
          color: (value || 0) < 0 && title.includes('Saldo') ? 'var(--danger)' : 'var(--text-main)',
          letterSpacing: '-0.02em'
        }}>
          {loading ? (
            <div className="skeleton" style={{ height: '2rem', width: '80%' }} />
          ) : (
            <>{showValues ? `${currency} ${(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${currency} ••••••`}</>
          )}
        </div>
        {!loading && (
          <div style={{ 
            marginTop: '0.25rem', 
            height: '4px', 
            width: '40px', 
            background: color, 
            borderRadius: '2px',
            opacity: 0.6
          }} />
        )}
      </div>
    </div>
  );
}

export default function InvestmentList({ user, showValues = true }) {
  const { t } = useTranslation();
  const [records, setRecords] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState(() => {
    const saved = localStorage.getItem('investment_filter_year');
    return saved ? Number(saved) : new Date().getFullYear();
  });
  const [filterMonth, setFilterMonth] = useState(() => {
    const saved = localStorage.getItem('investment_filter_month');
    return saved ? Number(saved) : new Date().getMonth() + 1;
  });
  const [activeCurrency, setActiveCurrency] = useState(() => {
    return localStorage.getItem('investment_active_currency') || 'BRL';
  });

  useEffect(() => {
    localStorage.setItem('investment_filter_year', filterYear);
    localStorage.setItem('investment_filter_month', filterMonth);
    localStorage.setItem('investment_active_currency', activeCurrency);
  }, [filterYear, filterMonth, activeCurrency]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const toggleGroup = (groupName) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  };
  
  const years = [2024, 2025, 2026];
  const months = [
    { value: 0, label: t('investments.all_months') },
    { value: 1, label: t('common.months.jan') },
    { value: 2, label: t('common.months.feb') },
    { value: 3, label: t('common.months.mar') },
    { value: 4, label: t('common.months.apr') },
    { value: 5, label: t('common.months.may') },
    { value: 6, label: t('common.months.jun') },
    { value: 7, label: t('common.months.jul') },
    { value: 8, label: t('common.months.aug') },
    { value: 9, label: t('common.months.sep') },
    { value: 10, label: t('common.months.oct') },
    { value: 11, label: t('common.months.nov') },
    { value: 12, label: t('common.months.dec') }
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    
    // Fetch accounts first to have the mapping (names, colors, institutions)
    const { data: accountsData } = await supabase
      .from('investment_accounts')
      .select('*, institution:investment_institutions(name), type:investment_account_types(name)');
    if (accountsData) {
      setAccounts(accountsData);
    }

    let query = supabase
      .from('investment_records')
      .select(`
        *,
        investment_accounts (
          *,
          institution:investment_institutions(name),
          type:investment_account_types(name)
        )
      `)
      .order('record_date', { ascending: false });

    // Filter by year
    const startOfYear = `${filterYear}-01-01`;
    const endOfYear = `${filterYear}-12-31`;
    query = query.gte('record_date', startOfYear).lte('record_date', endOfYear);

    // Filter by month if not 0
    if (filterMonth !== 0) {
      const startOfMonth = `${filterYear}-${String(filterMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(filterYear, filterMonth, 0).getDate();
      const endOfMonth = `${filterYear}-${String(filterMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      query = query.gte('record_date', startOfMonth).lte('record_date', endOfMonth);
    }

    const { data, error } = await query;
    if (!error && data) {
      setRecords(data);
      // Expand all groups by default
      const allInstitutions = new Set(data.map(r => r.investment_accounts?.institution?.name || t('investments.other_institution')));
      setExpandedGroups(allInstitutions);
    }
    setLoading(false);
  }, [filterYear, filterMonth, t]);

  useEffect(() => {
    fetchData();
  }, [user, filterYear, filterMonth, fetchData]);

  async function handleCopyFromPreviousMonth() {
    if (filterMonth === 0) {
      toast.error(t('investments.error_copy'));
      return;
    }

    let prevMonth = filterMonth - 1;
    let prevYear = filterYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = filterYear - 1;
    }

    const prevLabel = months.find(m => m.value === prevMonth).label;
    confirmToast(t('investments.confirm_copy', { month: prevLabel, year: prevYear }), async () => {
      await performCopy(prevMonth, prevYear);
    }, { confirmText: t('investments.confirm_copy_btn') });
  }

  async function performCopy(prevMonth, prevYear) {
    setLoading(true);

    try {
      // 1. Get records from previous month
      const startOfPrev = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
      const lastDayPrev = new Date(prevYear, prevMonth, 0).getDate();
      const endOfPrev = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayPrev).padStart(2, '0')}`;

      const { data: prevRecords, error: fetchError } = await supabase
        .from('investment_records')
        .select('*')
        .gte('record_date', startOfPrev)
        .lte('record_date', endOfPrev);

      if (fetchError) throw fetchError;
      if (!prevRecords || prevRecords.length === 0) {
        toast.error(t('investments.error_no_previous'));
        return;
      }

      // 2. Identify already existing accounts in current month to avoid duplicates
      const existingAccountIds = records.map(r => r.account_id);
      
      const recordsToInsert = prevRecords
        .filter(r => {
          const acc = accounts.find(a => a.id === r.account_id);
          return (acc?.currency || 'BRL') === activeCurrency && !existingAccountIds.includes(r.account_id);
        })
        .map(r => ({
          user_id: user.id,
          account_id: r.account_id,
          final_balance: r.final_balance, 
          yield: 0, 
          record_date: `${filterYear}-${String(filterMonth).padStart(2, '0')}-01`
        }));

      if (recordsToInsert.length === 0) {
        toast.error(t('investments.error_already_exists'));
        return;
      }

      const { error: insertError } = await supabase
        .from('investment_records')
        .insert(recordsToInsert);

      if (insertError) throw insertError;
      
      fetchData();
      toast.success(t('investments.records_copied', { count: recordsToInsert.length }));
    } catch (err) {
      console.error(err);
      toast.error(t('investments.error_copy_records'));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    confirmToast(t('investments.confirm_delete_record'), async () => {
      const { error } = await supabase.from('investment_records').delete().eq('id', id);
      if (!error) {
        fetchData();
        toast.success(t('investments.record_deleted'));
      } else {
        toast.error(t('investments.error_delete_record', { error: error.message }));
      }
    }, { danger: true });
  }

  const formatCurrency = (val) => {
    if (!showValues) return `${activeCurrency} ••••••`;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: activeCurrency }).format(val);
  };

  const availableCurrencies = useMemo(() => {
    const currs = new Set(accounts.map(a => a.currency || 'BRL'));
    currs.add('BRL');
    if (activeCurrency) currs.add(activeCurrency);
    return Array.from(currs);
  }, [accounts, activeCurrency]);

  const filteredRecords = useMemo(() => {
    return records.filter(r => (r.investment_accounts?.currency || 'BRL') === activeCurrency);
  }, [records, activeCurrency]);

  // Prepare chart data: Yield per Institution for the selected period
  const chartData = Object.values(filteredRecords.reduce((acc, curr) => {
    const instName = curr.investment_accounts?.institution?.name || t('investments.unknown_institution');
    if (!acc[instName]) acc[instName] = { name: instName, yield: 0, color: curr.investment_accounts?.color || '#6366f1' };
    acc[instName].yield += Number(curr.yield);
    return acc;
  }, {})).sort((a, b) => b.yield - a.yield);

  const totalYield = filteredRecords.reduce((sum, r) => sum + Number(r.yield), 0);
  
  // Fix: Sum only the latest balance for each account in the filtered set
  const latestBalancesByAccount = filteredRecords.reduce((acc, r) => {
    const existing = acc[r.account_id];
    if (!existing || new Date(r.record_date) > new Date(existing.record_date)) {
      acc[r.account_id] = r;
    }
    return acc;
  }, {});
  const totalBalance = Object.values(latestBalancesByAccount).reduce((sum, r) => sum + Number(r.final_balance), 0);

  // Group records by Institution for the table view
  const groupedRecords = useMemo(() => {
    // First, find latest record per account to get correct balances
    const latestByAccount = filteredRecords.reduce((acc, r) => {
      if (!acc[r.account_id] || new Date(r.record_date) > new Date(acc[r.account_id].record_date)) {
        acc[r.account_id] = r;
      }
      return acc;
    }, {});

    const groups = filteredRecords.reduce((acc, record) => {
      const inst = record.investment_accounts?.institution?.name || t('investments.other_institution');
      if (!acc[inst]) {
        acc[inst] = { 
          name: inst, 
          balance: 0, 
          yield: 0, 
          items: [], 
          color: record.investment_accounts?.color || '#94a3b8' 
        };
      }
      // Yield is cumulative for the period
      acc[inst].yield += Number(record.yield);
      acc[inst].items.push(record);
      return acc;
    }, {});

    // Now set the correct balances using only the latest records
    Object.values(latestByAccount).forEach(record => {
      const inst = record.investment_accounts?.institution?.name || t('investments.other_institution');
      if (groups[inst]) {
        groups[inst].balance += Number(record.final_balance);
      }
    });
    
    return Object.values(groups).sort((a, b) => b.balance - a.balance);
  }, [filteredRecords, t]);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const flatItems = useMemo(() => {
    const list = [];
    groupedRecords.forEach(group => {
      list.push({
        type: 'group-header',
        id: `group-header-${group.name}`,
        group,
      });
      if (expandedGroups.has(group.name)) {
        group.items.forEach(record => {
          list.push({
            type: 'group-item',
            id: `record-${record.id}`,
            record,
            groupColor: group.color,
          });
        });
      }
    });
    return list;
  }, [groupedRecords, expandedGroups]);

  const parentRef = useRef(null);

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = flatItems[index];
      if (item?.type === 'group-header') {
        return isMobile ? 70 : 65;
      }
      return isMobile ? 100 : 60;
    },
    overscan: 5,
    initialRect: { width: 1000, height: 800 },
  });

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '1.5rem', 
      paddingBottom: '0',
      flex: 1,
      minHeight: 0,
      height: '100%'
    }}>
      
      {/* Filters and Summary Header */}
      <div className="glass-card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <TrendingUp size={18} color="var(--primary)" />
          <span style={{ fontWeight: 600 }}>{t('investments.investment_sheet')}</span>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Moeda Toggle */}
          {availableCurrencies.length > 1 && (
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--card-action-bg)', padding: '4px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginRight: '0.5rem' }}>
              {availableCurrencies.map(currCode => {
                const currData = CURRENCIES.find(c => c.code === currCode);
                const isSelected = activeCurrency === currCode;
                return (
                  <button 
                    key={currCode}
                    onClick={() => setActiveCurrency(currCode)} 
                    style={{
                      background: isSelected ? 'var(--primary)' : 'transparent',
                      border: 'none',
                      color: isSelected ? 'white' : 'var(--text-muted)',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      transition: '0.2s'
                    }}
                  >
                    {currData?.flag && (
                      <span style={{ fontSize: '1rem', display: 'inline-flex', alignItems: 'center' }}>
                        {currData.flag.startsWith('data:image') ? (
                          <img src={currData.flag} alt={currCode} style={{ width: '14px', height: '14px', borderRadius: '2px', objectFit: 'contain' }} />
                        ) : currData.flag}
                      </span>
                    )}
                    {currCode}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--card-action-bg)', padding: '4px', borderRadius: '14px', border: '1px solid var(--glass-border)' }}>
            <Calendar size={16} style={{ marginLeft: '8px', color: 'var(--text-muted)' }} />
            <select 
              value={filterYear}
              onChange={e => setFilterYear(Number(e.target.value))}
              className="select-filter"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontWeight: 700, outline: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--card-action-bg)', padding: '4px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <select 
              value={filterMonth}
              onChange={e => setFilterMonth(Number(e.target.value))}
              className="select-filter"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontWeight: 700, outline: 'none', cursor: 'pointer', fontSize: '0.85rem', paddingLeft: '8px' }}
            >
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          {filterMonth !== 0 && (
            <button 
              onClick={handleCopyFromPreviousMonth}
              className="icon-btn"
              title={t('investments.copy_previous')}
              style={{ 
                height: '40px', 
                width: '40px', 
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                color: 'var(--primary)',
                borderRadius: '12px'
              }}
            >
              <Copy size={18} />
            </button>
          )}
        </div>
      </div>

      {/* FAB - Floating Action Button */}
      <button 
        className="btn-primary contextual-fab" 
        onClick={() => { setEditingRecord(null); setIsModalOpen(true); }}
        title={t('investments.new_register')}
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          zIndex: 100,
          boxShadow: '0 12px 24px rgba(99, 102, 241, 0.4)'
        }}
      >
        <Plus size={32} />
      </button>

      <Motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}
      >
        <StatCard 
          title={t('investments.yield_period')} 
          value={totalYield} 
          icon={<TrendingUp size={22}/>} 
          color="#10b981" 
          gradient={GRADIENTS.income}
          showValues={showValues} 
          currency={activeCurrency}
        />
        <StatCard 
          title={t('investments.total_final_balance')} 
          value={totalBalance} 
          icon={<Wallet size={22}/>} 
          color="#6366f1" 
          gradient={GRADIENTS.balance}
          showValues={showValues} 
          testId="summary-card-total-balance-list"
          currency={activeCurrency}
        />
      </Motion.div>

      {/* Layout: Chart on top, Table below */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Chart */}
        {chartData.length > 0 && (
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h4 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={18} /> {t('investments.yield_by_institution')}
            </h4>
            
            <div className="responsive-grid" style={{ 
              display: 'grid', 
              gridTemplateColumns: '1.2fr 1fr', 
              gap: '2rem', 
              alignItems: 'center' 
            }}>
              
              <div style={{ height: '280px', position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={5}
                      dataKey="yield"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val) => formatCurrency(val)}
                      contentStyle={{ 
                        background: 'var(--bg-card)', 
                        backdropFilter: 'blur(12px)',
                        border: '1px solid var(--glass-border)', 
                        borderRadius: '16px',
                        boxShadow: 'var(--shadow)',
                        padding: '12px',
                        color: 'var(--text-main)'
                      }}
                      itemStyle={{ color: 'var(--text-main)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center text for donut */}
                <div style={{ 
                  position: 'absolute', 
                  top: '50%', 
                  left: '50%', 
                  transform: 'translate(-50%, -50%)', 
                  textAlign: 'center',
                  pointerEvents: 'none'
                }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{t('investments.total')}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: totalYield >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {showValues ? formatCurrency(totalYield) : 'R$ ••••••'}
                  </div>
                </div>
              </div>

              <div className="chart-legend">
                {chartData.map((item, index) => {
                  const percentage = totalYield > 0 ? (item.yield / totalYield) * 100 : 0;
                  return (
                    <div key={index} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '0.75rem 1rem',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: '10px',
                      border: '1px solid var(--glass-border)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color }}></div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{item.name}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{formatCurrency(item.yield)}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{percentage.toFixed(1)}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '0 0.5rem' }}>
          <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>{t('investments.details')}</h4>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>
            {records.length} {records.length === 1 ? t('investments.record_label') : t('investments.records_label')}
          </span>
        </div>
        <div 
          ref={parentRef}
          style={{ 
            flex: 1,
            minHeight: 0,
            overflowY: 'auto', 
            position: 'relative',
            borderRadius: '24px',
            paddingRight: '6px',
            paddingBottom: isMobile ? '80px' : '0'
          }}
          className="custom-scrollbar"
        >
          {!isMobile && !loading && flatItems.length > 0 && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '150px 2fr 1fr 1fr 140px', 
              textAlign: 'left', 
              borderBottom: '1px solid var(--glass-border)', 
              background: 'var(--bg-card)',
              position: 'sticky',
              top: 0,
              zIndex: 20,
              fontWeight: 700,
            }}>
              <div style={{ padding: '1.25rem 1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{t('investments.table_date')}</div>
              <div style={{ padding: '1.25rem 1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{t('investments.table_account')}</div>
              <div style={{ padding: '1.25rem 1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{t('investments.table_final_balance')}</div>
              <div style={{ padding: '1.25rem 1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{t('investments.table_yield')}</div>
              <div style={{ padding: '1.25rem 1rem', textAlign: 'right' }}></div>
            </div>
          )}
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('investments.loading_records')}</div>
          ) : flatItems.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('investments.no_records')}</div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = flatItems[virtualRow.index];
                if (!item) return null;

                if (isMobile) {
                  if (item.type === 'group-header') {
                    const group = item.group;
                    return (
                      <div
                        key={item.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className="mobile-group-card"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                          margin: 0,
                        }}
                      >
                        <div className="mobile-group-header" onClick={() => toggleGroup(group.name)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: group.color }}></div>
                            <span style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.9rem' }}>{group.name.toUpperCase()}</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>{formatCurrency(group.balance)}</div>
                            <div style={{ fontSize: '0.75rem', color: group.yield >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                              {formatCurrency(group.yield)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const record = item.record;
                  return (
                    <div
                      key={item.id}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="mobile-item-card"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                        borderBottom: '1px solid var(--glass-border)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{record.investment_accounts?.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(record.record_date).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' })}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="action-btn" onClick={() => { setEditingRecord(record); setIsModalOpen(true); }}><Edit2 size={16} /></button>
                          <button className="action-btn danger" onClick={() => handleDelete(record.id)}><Trash2 size={16} /></button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {t('investments.balance_label')}: <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{formatCurrency(record.final_balance)}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: record.yield >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                          {record.yield >= 0 ? '+' : ''}{formatCurrency(record.yield)}
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  if (item.type === 'group-header') {
                    const group = item.group;
                    const isExpanded = expandedGroups.has(group.name);
                    return (
                      <div
                        key={item.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                          display: 'grid',
                          gridTemplateColumns: '150px 2fr 1fr 1fr 140px',
                          background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                          borderBottom: '1px solid var(--glass-border)',
                          cursor: 'pointer',
                          alignItems: 'center',
                        }}
                        onClick={() => toggleGroup(group.name)}
                      >
                        <div style={{ padding: '1.25rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 800 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            {t('investments.summary')}
                          </div>
                        </div>
                        <div style={{ padding: '1.25rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: group.color }}></div>
                            <span style={{ fontWeight: 900, color: 'var(--text-main)', letterSpacing: '0.5px' }}>{group.name.toUpperCase()}</span>
                          </div>
                        </div>
                        <div style={{ padding: '1.25rem 1rem', fontWeight: 900, fontSize: '1.05rem', color: 'var(--text-main)' }}>{formatCurrency(group.balance)}</div>
                        <div style={{ padding: '1.25rem 1rem', color: group.yield >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 900, fontSize: '1.05rem' }}>
                          {formatCurrency(group.yield)}
                        </div>
                        <div style={{ padding: '1.25rem 1rem' }}></div>
                      </div>
                    );
                  }

                  const record = item.record;
                  return (
                    <div
                      key={item.id}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                        display: 'grid',
                        gridTemplateColumns: '150px 2fr 1fr 1fr 140px',
                        borderBottom: '1px solid var(--glass-border)',
                        fontSize: '0.9rem',
                        alignItems: 'center',
                        background: 'var(--bg-card)',
                      }}
                    >
                      <div style={{ padding: '1.25rem 1rem', color: 'var(--text-muted)', paddingLeft: '1.5rem' }}>
                        {new Date(record.record_date).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' })}
                      </div>
                      <div style={{ padding: '1.25rem 1rem', paddingLeft: '2.5rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{record.investment_accounts?.name}</div>
                      </div>
                      <div style={{ padding: '1.25rem 1rem', color: 'var(--text-main)', fontWeight: 500 }}>{formatCurrency(record.final_balance)}</div>
                      <div style={{ padding: '1.25rem 1rem', color: record.yield >= 0 ? 'var(--success)' : 'var(--danger)', opacity: 0.9, fontWeight: 600 }}>
                        {formatCurrency(record.yield)}
                      </div>
                      <div style={{ padding: '1.25rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          <button className="action-btn" onClick={() => { setEditingRecord(record); setIsModalOpen(true); }}><Edit2 size={18} /></button>
                          <button className="action-btn danger" onClick={() => handleDelete(record.id)}><Trash2 size={18} /></button>
                        </div>
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          )}
        </div>
      </div>

      <InvestmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onRefresh={fetchData}
        user={user}
        initialData={editingRecord}
        accounts={accounts}
      />
    </div>
  );
}

