import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { TrendingUp, Wallet, Calendar, Filter, ArrowUpRight, TrendingDown, Layers, Eye, EyeOff, BarChart2, PieChart as PieChartIcon, Building2 } from 'lucide-react';
import { motion as Motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const GRADIENTS = {
  income: 'var(--stat-income)',
  expense: 'var(--stat-expense)',
  pending: 'var(--stat-pending)',
  balance: 'var(--stat-balance)',
  purple: 'rgba(139, 92, 246, 0.1)',
};

export default function InvestmentDashboard({ user, showValues = true, onToggleValues }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState([]);
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = localStorage.getItem('investment_dashboard_year');
    return saved ? Number(saved) : new Date().getFullYear();
  });
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = localStorage.getItem('investment_dashboard_month');
    return saved ? (saved === 'all' ? 0 : Number(saved)) : new Date().getMonth() + 1;
  });

  const [summary, setSummary] = useState({ 
    totalYieldYear: 0, 
    totalYieldAllTime: 0, 
    currentBalance: 0,
    distribution: [],
    instYield: [],
    instBalance: [],
    typeYield: [],
    typeBalance: []
  });

  const years = [2024, 2025, 2026];
  const months = [
    { value: 0, label: t('common.months.all') },
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

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

  const processData = useCallback((records) => {
    // 1. Monthly totals for the selected year
    const monthlyDataMap = {};
    for (let i = 1; i <= 12; i++) {
        const monthLabel = new Date(selectedYear, i-1, 1).toLocaleDateString(i18n.language, { month: 'short' });
        monthlyDataMap[i] = { name: monthLabel, yield: 0, balance: 0 };
    }

    let yearYield = 0;
    let allTimeYield = 0;
    let currentBalanceMap = {};
    let instYieldMap = {};
    let typeYieldMap = {};
    
    // Auxiliary map to track the latest balance per account per month for the monthly chart
    const latestMonthlyAccountBalance = {}; // key: "month-accountId"

    records.forEach(r => {
      const date = new Date(r.record_date);
      const rYear = date.getUTCFullYear();
      const rMonth = date.getUTCMonth() + 1;
      
      const acc = r.investment_accounts;
      const instName = acc?.institution?.name || 'Sem Instituição';
      const typeName = acc?.type?.name || 'Sem Tipo';
      
      if (rYear <= selectedYear) {
        allTimeYield += Number(r.yield);
      }

      if (rYear === selectedYear) {
        monthlyDataMap[rMonth].yield += Number(r.yield);
        
        // Track latest balance for this account in this specific month
        const key = `${rMonth}-${r.account_id}`;
        if (!latestMonthlyAccountBalance[key] || new Date(latestMonthlyAccountBalance[key].date) <= date) {
          latestMonthlyAccountBalance[key] = { amount: Number(r.final_balance), date: r.record_date };
        }

        yearYield += Number(r.yield);
        
        // Yield by Institution & Type
        instYieldMap[instName] = (instYieldMap[instName] || 0) + Number(r.yield);
        typeYieldMap[typeName] = (typeYieldMap[typeName] || 0) + Number(r.yield);
      }

      // Track last balance per account for "Patrimônio"
      // If a specific month is selected, we only want balances FROM that month.
      // If "All Months" is selected, we take the latest balance found in the year.
      const isRelevantForBalance = selectedMonth === 0 ? (rYear <= selectedYear) : (rYear === selectedYear && rMonth === selectedMonth);

      if (isRelevantForBalance) {
        if (!currentBalanceMap[r.account_id] || new Date(currentBalanceMap[r.account_id].date) <= date) {
          currentBalanceMap[r.account_id] = { 
            amount: Number(r.final_balance), 
            date: r.record_date,
            name: acc?.name,
            color: acc?.color,
            institution: instName,
            type: typeName
          };
        }
      }
    });

    // Calculate correct monthly balances after finding all latest records
    Object.keys(latestMonthlyAccountBalance).forEach(key => {
      const month = Number(key.split('-')[0]);
      monthlyDataMap[month].balance += latestMonthlyAccountBalance[key].amount;
    });

    const currentBalance = Object.values(currentBalanceMap).reduce((sum, item) => sum + item.amount, 0);
    
    // Process Grouped Balances
    const instBalanceMap = {};
    const typeBalanceMap = {};
    Object.values(currentBalanceMap).forEach(acc => {
      instBalanceMap[acc.institution] = (instBalanceMap[acc.institution] || 0) + acc.amount;
      typeBalanceMap[acc.type] = (typeBalanceMap[acc.type] || 0) + acc.amount;
    });

    const instYieldData = Object.keys(instYieldMap).map(name => ({ name, value: instYieldMap[name] })).sort((a,b) => b.value - a.value);
    const instBalanceData = Object.keys(instBalanceMap).map(name => ({ name, value: instBalanceMap[name] })).sort((a,b) => b.value - a.value);
    const typeYieldData = Object.keys(typeYieldMap).map(name => ({ name, value: typeYieldMap[name] })).sort((a,b) => b.value - a.value);
    const typeBalanceData = Object.keys(typeBalanceMap).map(name => ({ name, value: typeBalanceMap[name] })).sort((a,b) => b.value - a.value);

    setData(Object.values(monthlyDataMap));
    setSummary({ 
      totalYieldYear: yearYield, 
      totalYieldAllTime: allTimeYield, 
      currentBalance: currentBalance,
      distribution: Object.values(currentBalanceMap).filter(a => a.amount > 0),
      instYield: instYieldData,
      instBalance: instBalanceData,
      typeYield: typeYieldData,
      typeBalance: typeBalanceData
    });
  }, [selectedYear, selectedMonth, i18n.language]);

  const fetchData = useCallback(async () => {
    const { data: records, error } = await supabase
      .from('investment_records')
      .select(`
        *,
        investment_accounts (
          *,
          institution:investment_institutions(name),
          type:investment_account_types(name)
        )
      `)
      .order('record_date', { ascending: true });

    if (!error && records) {
      processData(records);
    }
  }, [processData]);

  useEffect(() => {
    localStorage.setItem('investment_dashboard_year', selectedYear);
    localStorage.setItem('investment_dashboard_month', selectedMonth === 0 ? 'all' : selectedMonth);
    fetchData();
  }, [user, selectedYear, selectedMonth, fetchData]);

  const formatCurrency = (val) => {
    if (!showValues) return `${t('common.currency_symbol', 'R$')} ••••••`;
    const locale = i18n.language === 'pt-BR' ? 'pt-BR' : 'en-US';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: t('common.currency_code', 'BRL') }).format(val);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
      
      {/* Header with Period Selectors */}
      <div className="glass-card" style={{ 
        padding: '1.25rem 1.5rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.25rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: '250px' }}>
          <div style={{ padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '1rem', color: 'var(--primary)', flexShrink: 0 }}>
            <Layers size={24} />
          </div>
          <div>
            <h3 data-testid="investment-dashboard-main-title" style={{ fontSize: '1.1rem', fontWeight: 900, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('investments.dashboard_title')}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500, margin: 0 }}>{t('investments.dashboard_desc')}</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'nowrap' }}>
          {onToggleValues && (
            <button 
              className="action-btn" 
              onClick={onToggleValues}
              style={{ width: '42px', height: '42px', borderRadius: '14px', background: 'var(--card-action-bg)', flexShrink: 0 }}
              title={showValues ? t('finances.hide_values') : t('finances.show_values')}
            >
              {showValues ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--card-action-bg)', padding: '4px', borderRadius: '14px', border: '1px solid var(--glass-border)', flexShrink: 0 }}>
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="select-filter"
              style={{ border: 'none', background: 'transparent', height: '34px', minWidth: '100px', fontSize: '0.85rem' }}
            >
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--card-action-bg)', padding: '4px', borderRadius: '14px', border: '1px solid var(--glass-border)', flexShrink: 0 }}>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="select-filter"
              style={{ border: 'none', background: 'transparent', height: '34px', fontSize: '0.85rem' }}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <Motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="responsive-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1.5rem' }}
      >
        <StatCard 
          title={t('investments.total_assets')} 
          value={summary.currentBalance} 
          icon={<Wallet size={22}/>} 
          color="#6366f1" 
          gradient={GRADIENTS.balance}
          showValues={showValues} 
          testId="summary-card-total-balance"
          lang={i18n.language}
        />
        <StatCard 
          title={`${t('investments.yield_year')} ${selectedYear}`} 
          value={summary.totalYieldYear} 
          icon={<TrendingUp size={22}/>} 
          color="#10b981" 
          gradient={GRADIENTS.income}
          showValues={showValues} 
          lang={i18n.language}
        />
        <StatCard 
          title={t('investments.total_yield')} 
          value={summary.totalYieldAllTime} 
          icon={<TrendingUp size={22}/>} 
          color="#8b5cf6" 
          gradient={GRADIENTS.purple}
          showValues={showValues} 
          lang={i18n.language}
        />
        <StatCard 
          title={t('investments.monthly_average')} 
          value={summary.totalYieldYear / 12} 
          icon={<TrendingUp size={22}/>} 
          color="#f59e0b" 
          gradient={GRADIENTS.pending}
          showValues={showValues} 
          lang={i18n.language}
        />
      </Motion.div>

      {/* Main Charts */}
      <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 450px), 1fr))', gap: '1.5rem' }}>
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h4 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={18} /> {t('investments.yield_evolution')} {selectedYear}
          </h4>
          <div style={{ height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} strokeOpacity={0.5} />
                <XAxis 
                  dataKey="name" 
                  stroke="var(--text-muted)" 
                  fontSize={11} 
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  stroke="var(--text-muted)" 
                  fontSize={11} 
                  tickFormatter={(v) => `${t('common.currency_symbol', 'R$')} ${v}`} 
                  axisLine={false}
                  tickLine={false}
                />
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
                  labelStyle={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="yield" name={t('investments.yield_label')} stroke="var(--success)" strokeWidth={3} fillOpacity={1} fill="url(#colorYield)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart2 size={18} /> {t('investments.allocation_by_account')}
          </h4>
          <div style={{ height: '380px', paddingTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={[...(summary.distribution || [])].sort((a,b) => b.amount - a.amount)} 
                layout="vertical" 
                margin={{ left: -10, right: 40, top: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--glass-border)" strokeOpacity={0.5} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="var(--text-muted)" fontSize={11} width={110} axisLine={false} tickLine={false} />
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
                  labelStyle={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}
                />
                <Bar dataKey="amount" name={t('investments.balance_label')} radius={[0, 4, 4, 0]} barSize={22}>
                  {summary.distribution?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Grouped Charts Grid */}
      <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 450px), 1fr))', gap: '1.5rem' }}>
        
        {/* Rendimento por Tipo de Conta */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PieChartIcon size={18} /> {t('investments.yield_by_type')} ({selectedYear})
          </h4>
          <div style={{ height: '300px', paddingTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={summary.typeYield || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {summary.typeYield?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
                <Legend iconType="circle" verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Patrimônio por Instituição */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart2 size={18} /> {t('investments.assets_by_institution')}
          </h4>
          <div style={{ height: '300px', paddingTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.instBalance || []} layout="vertical" margin={{ left: -10, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--glass-border)" strokeOpacity={0.5} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="var(--text-muted)" fontSize={11} width={110} axisLine={false} tickLine={false} />
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
                <Bar dataKey="value" name={t('investments.balance_label')} radius={[0, 6, 6, 0]} barSize={25}>
                  {summary.instBalance?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color, gradient, loading, showValues, testId }) {
  const { t, i18n } = useTranslation();
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
            <>{showValues ? `${t('common.currency_symbol', 'R$')} ${(value || 0).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${t('common.currency_symbol', 'R$')} ••••••`}</>
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

