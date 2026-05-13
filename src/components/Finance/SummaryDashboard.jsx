import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { TrendingUp, TrendingDown, Wallet, Calendar, Filter, Clock, Eye, EyeOff } from 'lucide-react';


import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const GRADIENTS = {
  income: 'var(--stat-income)',
  expense: 'var(--stat-expense)',
  pending: 'var(--stat-pending)',
  balance: 'var(--stat-balance)',
};


export default function SummaryDashboard({ user, isGeneral, month, year: initialYear, refreshKey, showValues = true, onToggleValues }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [revenueCategoryData, setRevenueCategoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ income: 0, expense: 0, balance: 0, pending: 0 });
  const [selectedYear, setSelectedYear] = useState(initialYear || 2026);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const years = [2024, 2025, 2026];

  const processCharts = useCallback((finances) => {
    const monthsMap = new Map();
    const incomeCategoriesMap = {};
    const expenseCategoriesMap = {};
    let totalIncome = 0;
    let totalExpense = 0;
    let totalPending = 0;

    const sortedFinances = [...finances].sort((a, b) => {
      const dateA = a.payment_date ? new Date(a.payment_date) : new Date(0);
      const dateB = b.payment_date ? new Date(b.payment_date) : new Date(0);
      return dateA - dateB;
    });

    sortedFinances.forEach(item => {
      try {
        if (!item.payment_date) return;
        const parts = String(item.payment_date).split('-');
        if (parts.length !== 3) return;
        const [year, month, day] = parts.map(Number);
        const date = new Date(year, month - 1, day);
        
        const label = isGeneral 
          ? date.toLocaleDateString(i18n.language, { month: 'short' })
          : date.toLocaleDateString(i18n.language, { day: '2-digit' });
        
        if (!monthsMap.has(label)) {
          monthsMap.set(label, { name: label, income: 0, expense: 0, difference: 0 });
        }
        
        const current = monthsMap.get(label);
        const amount = Number(item.amount);
        const cat = item.category || t('common.other', 'Outros');

        if (item.type === 'RECEITA') {
          current.income += amount;
          totalIncome += amount;
          incomeCategoriesMap[cat] = (incomeCategoriesMap[cat] || 0) + amount;
        } else {
          current.expense += amount;
          totalExpense += amount;
          expenseCategoriesMap[cat] = (expenseCategoriesMap[cat] || 0) + amount;
          if (item.status === 'PENDENTE') {
            totalPending += amount;
          }
        }
        current.difference = current.income - current.expense;
      } catch (e) {
        console.error("Error processing finance item:", e);
      }
    });

    setData(Array.from(monthsMap.values()));
    setCategoryData(Object.entries(expenseCategoriesMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value));
    setRevenueCategoryData(Object.entries(incomeCategoriesMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value));
    setStats({ income: totalIncome, expense: totalExpense, balance: totalIncome - totalExpense, pending: totalPending });
  }, [isGeneral, i18n.language, t]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    
    let query = supabase.from('finances').select('*').eq('user_id', user?.id);

    if (isGeneral) {
      const startOfYear = `${selectedYear}-01-01`;
      const endOfYear = `${selectedYear}-12-31`;
      query = query.gte('payment_date', startOfYear).lte('payment_date', endOfYear);
    } else if (month !== undefined) {
      const monthStr = String(month + 1).padStart(2, '0');
      const lastDayDate = new Date(selectedYear, month + 1, 0).getDate();
      const start = `${selectedYear}-${monthStr}-01`;
      const end = `${selectedYear}-${monthStr}-${String(lastDayDate).padStart(2, '0')}`;
      query = query.gte('payment_date', start).lte('payment_date', end);
    }

    const { data: finances } = await query;
    if (finances) {
      processCharts(finances);
    }
    setLoading(false);
  }, [isGeneral, month, selectedYear, user?.id, processCharts]);

  useEffect(() => {
    fetchData();
  }, [isGeneral, month, selectedYear, refreshKey, fetchData]);

  const formatValue = (val) => {
    if (!showValues) return `${t('common.currency_symbol', 'R$')} ••••••`;
    return `${t('common.currency_symbol', 'R$')} ${Number(val).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header with Year Filter for General View */}
      <div className="glass-card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isGeneral ? <Filter size={18} color="var(--primary)" /> : <Calendar size={18} color="var(--primary)" />}
          <span style={{ fontWeight: 600 }}>{isGeneral ? t('finances.filter_year') : t('finances.monthly_summary')}</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {onToggleValues && (
            <button 
              className="icon-btn" 
              onClick={onToggleValues}
              style={{ padding: '0.5rem', background: 'var(--tabs-bg)', borderRadius: '0.5rem' }}
              title={showValues ? t('finances.hide_values') : t('finances.show_values')}
            >
              {showValues ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          )}

          {isGeneral && (
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{ 
                background: 'var(--card-action-bg)', border: '1px solid var(--glass-border)',
                color: 'var(--text-main)', padding: '0.5rem 1rem', borderRadius: '0.5rem', outline: 'none',
                fontWeight: '600'
              }}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <Motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}
      >
        <StatCard 
          title={isGeneral ? t('finances.annual_revenue') : t('finances.monthly_revenue')} 
          value={stats.income} 
          icon={<TrendingUp size={22}/>} 
          color="#10b981" 
          gradient={GRADIENTS.income}
          loading={loading} 
          showValues={showValues} 
          lang={i18n.language}
          data-testid="stat-card-income"
        />
        <StatCard 
          title={isGeneral ? t('finances.annual_expense') : t('finances.monthly_expense')} 
          value={stats.expense} 
          icon={<TrendingDown size={22}/>} 
          color="#ef4444" 
          gradient={GRADIENTS.expense}
          loading={loading} 
          showValues={showValues} 
          lang={i18n.language}
          data-testid="stat-card-expense"
        />
        <StatCard 
          title={t('finances.to_pay')} 
          value={stats.pending} 
          icon={<Clock size={22}/>} 
          color="#f59e0b" 
          gradient={GRADIENTS.pending}
          loading={loading} 
          showValues={showValues} 
          lang={i18n.language}
          data-testid="stat-card-pending"
        />
        <StatCard 
          title={t('finances.final_balance')} 
          value={stats.balance} 
          icon={<Wallet size={22}/>} 
          color="#6366f1" 
          gradient={GRADIENTS.balance}
          loading={loading} 
          showValues={showValues} 
          lang={i18n.language}
          data-testid="stat-card-balance"
        />
      </Motion.div>

      {/* Main Bar Chart */}
      <div className="glass-card" style={{ padding: '1.5rem', minHeight: '400px' }}>
        <h4 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Calendar size={18} /> {isGeneral ? `${t('finances.monthly_evolution')} ${selectedYear}` : t('finances.daily_detail')}
        </h4>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            {loading && data.length === 0 ? (
              <div className="skeleton" style={{ width: '100%', height: '100%' }} />
            ) : (
              <BarChart data={data} style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} strokeOpacity={0.5} />
                <XAxis 
                  dataKey="name" 
                  stroke="var(--text-muted)" 
                  fontSize={isMobile ? 10 : 12} 
                  interval={isMobile ? 1 : 0}
                  angle={isMobile ? -45 : 0}
                  textAnchor={isMobile ? "end" : "middle"}
                  height={isMobile ? 50 : 30}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  stroke="var(--text-muted)" 
                  fontSize={10} 
                  tickFormatter={(v) => isMobile ? `${v/1000}k` : formatValue(v)} 
                  width={isMobile ? 40 : 80}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  cursor={{ fill: 'var(--map-hover)' }}
                  formatter={(val) => formatValue(val)}
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
                <Legend verticalAlign="top" height={isMobile ? 60 : 36} wrapperStyle={{ fontSize: isMobile ? '10px' : '12px', paddingBottom: '1rem' }}/>
                <Bar dataKey="income" name={t('finances.income_label')} fill="url(#colorIncome)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expense" name={t('finances.expense_label')} fill="url(#colorExpense)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="difference" name={t('finances.result_label')} fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Distribution Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: '1.5rem' }}>
        
        {/* Revenues Distribution */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h4 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={18} color="var(--success)" /> {t('finances.revenue_distribution')}
          </h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{t('finances.by_category')}</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr', gap: '1rem', alignItems: 'center' }}>
            <div style={{ height: '220px', position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueCategoryData}
                    innerRadius={65}
                    outerRadius={85}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {revenueCategoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      background: 'var(--bg-card)', 
                      backdropFilter: 'blur(12px)',
                      border: '1px solid var(--glass-border)', 
                      borderRadius: '12px',
                      color: 'var(--text-main)',
                      boxShadow: 'var(--shadow)'
                    }} 
                    itemStyle={{ color: 'var(--text-main)' }}
                    formatter={(val) => formatValue(val)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ 
                position: 'absolute', 
                top: '50%', 
                left: '50%', 
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none'
              }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>{t('finances.total')}</span>
                <span style={{ fontSize: 14, fontWeight: 800 }}>{showValues ? `${t('common.currency_symbol', 'R$')} ${(stats.income/1000).toFixed(1)}k` : '••••'}</span>
              </div>
            </div>
            
            <div style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '5px' }}>
              {revenueCategoryData.map((item, index) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', fontSize: '0.75rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '3px', background: COLORS[index % COLORS.length], flexShrink: 0 }}></div>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px', fontWeight: 500 }}>{item.name}</span>
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{stats.income > 0 ? Math.round((item.value / stats.income) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Expenses Distribution */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h4 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingDown size={18} color="var(--danger)" /> {t('finances.expense_distribution')}
          </h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{t('finances.by_category')}</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr', gap: '1rem', alignItems: 'center' }}>
            <div style={{ height: '220px', position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    innerRadius={65}
                    outerRadius={85}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      background: 'var(--bg-card)', 
                      backdropFilter: 'blur(12px)',
                      border: '1px solid var(--glass-border)', 
                      borderRadius: '12px',
                      color: 'var(--text-main)',
                      boxShadow: 'var(--shadow)'
                    }} 
                    itemStyle={{ color: 'var(--text-main)' }}
                    formatter={(val) => formatValue(val)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ 
                position: 'absolute', 
                top: '50%', 
                left: '50%', 
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none'
              }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>{t('finances.total')}</span>
                <span style={{ fontSize: 14, fontWeight: 800 }}>{showValues ? `${t('common.currency_symbol', 'R$')} ${(stats.expense/1000).toFixed(1)}k` : '••••'}</span>
              </div>
            </div>
            
            <div style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '5px' }}>
              {categoryData.map((item, index) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', fontSize: '0.75rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '3px', background: COLORS[index % COLORS.length], flexShrink: 0 }}></div>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px', fontWeight: 500 }}>{item.name}</span>
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{stats.expense > 0 ? Math.round((item.value / stats.expense) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color, gradient, loading, showValues, 'data-testid': testId }) {
  const { t, i18n } = useTranslation();
  return (
    <div 
      data-testid={testId}
      className="glass-card" 
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
