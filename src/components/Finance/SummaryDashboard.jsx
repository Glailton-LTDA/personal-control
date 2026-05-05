import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { TrendingUp, TrendingDown, Wallet, Calendar, Filter, Clock, Eye, EyeOff } from 'lucide-react';

import { useEncryption } from '../../contexts/EncryptionContext';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function SummaryDashboard({ user, isGeneral, month, year: initialYear, refreshKey, showValues = true, onToggleValues }) {
  const [data, setData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [revenueCategoryData, setRevenueCategoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ income: 0, expense: 0, balance: 0, pending: 0 });
  const [selectedYear, setSelectedYear] = useState(initialYear || 2026);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(window.innerWidth < 1024);
  const { decryptObject } = useEncryption();

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
          ? date.toLocaleDateString('pt-BR', { month: 'short' })
          : date.toLocaleDateString('pt-BR', { day: '2-digit' });
        
        if (!monthsMap.has(label)) {
          monthsMap.set(label, { name: label, income: 0, expense: 0, difference: 0 });
        }
        
        const current = monthsMap.get(label);
        const amount = Number(item.amount);
        const cat = item.category || 'Outros';

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
  }, [isGeneral]);

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
      const decrypted = await decryptObject(finances, ['description', 'category']);
      processCharts(decrypted);
    }
    setLoading(false);
  }, [isGeneral, month, selectedYear, user?.id, processCharts, decryptObject]);

  useEffect(() => {
    fetchData();
  }, [isGeneral, month, selectedYear, refreshKey, fetchData]);

  const formatValue = (val) => {
    if (!showValues) return 'R$ ••••••';
    return `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header with Year Filter for General View */}
      <div className="glass-card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isGeneral ? <Filter size={18} color="var(--primary)" /> : <Calendar size={18} color="var(--primary)" />}
          <span style={{ fontWeight: 600 }}>{isGeneral ? "Filtrar Ano Fiscal" : "Resumo do Mês"}</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {onToggleValues && (
            <button 
              className="icon-btn" 
              onClick={onToggleValues}
              style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem' }}
              title={showValues ? "Ocultar Valores" : "Mostrar Valores"}
            >
              {showValues ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          )}

          {isGeneral && (
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{ 
                background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)',
                color: 'white', padding: '0.5rem 1rem', borderRadius: '0.5rem', outline: 'none'
              }}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        <StatCard title={isGeneral ? "Receita Anual" : "Receita Mensal"} value={stats.income} icon={<TrendingUp size={20}/>} color="var(--success)" loading={loading && data.length === 0} showValues={showValues} />
        <StatCard title={isGeneral ? "Despesa Anual" : "Despesa Mensal"} value={stats.expense} icon={<TrendingDown size={20}/>} color="var(--danger)" loading={loading && data.length === 0} showValues={showValues} />
        <StatCard title="Total a Pagar" value={stats.pending} icon={<Clock size={20}/>} color="var(--pending)" loading={loading && data.length === 0} showValues={showValues} />
        <StatCard title="Saldo Final" value={stats.balance} icon={<Wallet size={20}/>} color="var(--primary)" loading={loading && data.length === 0} showValues={showValues} />
      </div>

      {/* Main Bar Chart */}
      <div className="glass-card" style={{ padding: '1.5rem', minHeight: '400px' }}>
        <h4 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Calendar size={18} /> {isGeneral ? `Evolução Mensal de ${selectedYear}` : 'Detalhamento Diário'}
        </h4>
        <div style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            {loading && data.length === 0 ? (
              <div className="skeleton" style={{ width: '100%', height: '100%' }} />
            ) : (
              <BarChart data={data} style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="var(--text-muted)" 
                  fontSize={isMobile ? 10 : 12} 
                  interval={isMobile ? 1 : 0}
                  angle={isMobile ? -45 : 0}
                  textAnchor={isMobile ? "end" : "middle"}
                  height={isMobile ? 50 : 30}
                />
                <YAxis stroke="var(--text-muted)" fontSize={10} tickFormatter={(v) => isMobile ? `${v/1000}k` : formatValue(v)} width={isMobile ? 40 : 80} />
                <Tooltip 
                  formatter={(val) => formatValue(val)}
                  contentStyle={{ 
                    background: 'rgba(30, 41, 59, 0.9)', 
                    border: '1px solid var(--glass-border)', 
                    borderRadius: '12px',
                    boxShadow: '0 10px 15px rgba(0,0,0,0.2)'
                  }} 
                />
                <Legend verticalAlign="top" height={isMobile ? 60 : 36} wrapperStyle={{ fontSize: isMobile ? '10px' : '12px' }}/>
                <Bar dataKey="income" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} opacity={0.9} />
                <Bar dataKey="expense" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.9} />
                <Bar dataKey="difference" name="Resultado" fill="var(--primary)" radius={[4, 4, 0, 0]} opacity={0.9} />
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
            <TrendingUp size={18} color="var(--success)" /> Distribuição de Receitas
          </h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Ganhos por categoria</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
            <div style={{ height: '180px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueCategoryData}
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {revenueCategoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => formatValue(val)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div style={{ maxHeight: '180px', overflowY: 'auto', paddingRight: '5px' }}>
              {revenueCategoryData.map((item, index) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-main)', opacity: 0.9 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[index % COLORS.length], flexShrink: 0 }}></div>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px' }}>{item.name}</span>
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{stats.income > 0 ? Math.round((item.value / stats.income) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Expenses Distribution */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h4 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingDown size={18} color="var(--danger)" /> Distribuição de Gastos
          </h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Despesas por categoria</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
            <div style={{ height: '180px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => formatValue(val)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div style={{ maxHeight: '180px', overflowY: 'auto', paddingRight: '5px' }}>
              {categoryData.map((item, index) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-main)', opacity: 0.9 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[index % COLORS.length], flexShrink: 0 }}></div>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px' }}>{item.name}</span>
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{stats.expense > 0 ? Math.round((item.value / stats.expense) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color, loading, showValues }) {
  return (
    <div className="glass-card" style={{ padding: '1.25rem', borderLeft: `6px solid ${color}`, transition: 'transform 0.2s', opacity: loading ? 0.7 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{title}</span>
        <div style={{ color: color, background: `${color}15`, padding: '0.4rem', borderRadius: '0.5rem' }}>{icon}</div>
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: (value || 0) < 0 ? 'var(--danger)' : 'var(--text-main)' }}>
        {loading ? (
          <div className="skeleton" style={{ height: '1.8rem', width: '80%', marginTop: '4px' }} />
        ) : (
          <>{showValues ? `R$ ${(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ ••••••'}</>
        )}
      </div>
    </div>
  );
}
