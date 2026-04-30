import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { TrendingUp, Wallet, Calendar, Filter, ArrowUpRight, TrendingDown, Layers } from 'lucide-react';

export default function InvestmentDashboard({ user, showValues = true }) {
  const [data, setData] = useState([]);
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = localStorage.getItem('investment_dashboard_year');
    return saved ? Number(saved) : new Date().getFullYear();
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
  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

  const processData = useCallback((records) => {
    // 1. Monthly totals for the selected year
    const monthlyDataMap = {};
    for (let i = 1; i <= 12; i++) {
        const monthLabel = new Date(selectedYear, i-1, 1).toLocaleDateString('pt-BR', { month: 'short' });
        monthlyDataMap[i] = { name: monthLabel, yield: 0, balance: 0 };
    }

    let yearYield = 0;
    let allTimeYield = 0;
    let currentBalanceMap = {};
    let instYieldMap = {};
    let typeYieldMap = {};

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
        monthlyDataMap[rMonth].balance += Number(r.final_balance);
        yearYield += Number(r.yield);
        
        // Yield by Institution & Type
        instYieldMap[instName] = (instYieldMap[instName] || 0) + Number(r.yield);
        typeYieldMap[typeName] = (typeYieldMap[typeName] || 0) + Number(r.yield);
      }

      // Track last balance per account (only up to the selected year)
      if (rYear <= selectedYear) {
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
  }, [selectedYear]);

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
    fetchData();
  }, [user, selectedYear, fetchData]);

  const formatCurrency = (val) => {
    if (!showValues) return 'R$ ••••••';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
      
      {/* Header with Year Selector */}
      <div className="glass-card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <TrendingUp size={20} color="var(--primary)" />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Performance de Investimentos</h3>
        </div>
        <select 
          value={selectedYear} 
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="select-filter"
          style={{ padding: '0.4rem 0.8rem', borderRadius: '0.5rem' }}
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <StatCard title="Patrimônio Total" value={summary.currentBalance} icon={<Wallet size={20}/>} color="var(--primary)" showValues={showValues} />
        <StatCard title={`Rendimento ${selectedYear}`} value={summary.totalYieldYear} icon={<ArrowUpRight size={20}/>} color="var(--success)" showValues={showValues} />
        <StatCard title="Rendimento Total" value={summary.totalYieldAllTime} icon={<TrendingUp size={20}/>} color="#8b5cf6" showValues={showValues} />
        <StatCard title="Média Mensal" value={summary.totalYieldYear / 12} icon={<Calendar size={20}/>} color="var(--pending)" showValues={showValues} />
      </div>

      {/* Main Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem' }} className="responsive-grid">
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h4 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={18} /> Evolução de Rendimentos em {selectedYear}
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
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tick={{ fill: 'var(--text-muted)' }} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(v) => `R$ ${v}`} tick={{ fill: 'var(--text-muted)' }} />
                <Tooltip 
                  formatter={(val) => formatCurrency(val)}
                  contentStyle={{ 
                    background: 'var(--bg-canvas)', 
                    border: '1px solid var(--glass-border)', 
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow)'
                  }}
                  itemStyle={{ color: 'var(--text-main)' }}
                  labelStyle={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="yield" name="Rendimento" stroke="var(--success)" strokeWidth={3} fillOpacity={1} fill="url(#colorYield)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Wallet size={18} /> Alocação por Conta
          </h4>
          <div style={{ height: '380px', paddingTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={[...(summary.distribution || [])].sort((a,b) => b.amount - a.amount)} 
                layout="vertical" 
                margin={{ left: -10, right: 40, top: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="var(--text-muted)" fontSize={11} width={110} tick={{ fill: 'var(--text-muted)' }} />
                <Tooltip 
                  formatter={(val) => formatCurrency(val)}
                  contentStyle={{ 
                    background: 'var(--bg-canvas)', 
                    border: '1px solid var(--glass-border)', 
                    borderRadius: '8px',
                    boxShadow: 'var(--shadow)'
                  }}
                  itemStyle={{ color: 'var(--text-main)' }}
                  labelStyle={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}
                />
                <Bar dataKey="amount" name="Saldo" radius={[0, 4, 4, 0]} barSize={22}>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="responsive-grid">
        
        {/* Rendimento por Tipo de Conta */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={18} /> Rendimento por Tipo ({selectedYear})
          </h4>
          <div style={{ height: '300px', paddingTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={summary.typeYield || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {summary.typeYield?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(val) => formatCurrency(val)} 
                  contentStyle={{ background: 'var(--bg-canvas)', border: '1px solid var(--glass-border)', borderRadius: '12px' }} 
                />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Patrimônio por Instituição */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 size={18} style={{ color: 'var(--primary)' }} /> Patrimônio por Instituição
          </h4>
          <div style={{ height: '300px', paddingTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.instBalance || []} layout="vertical" margin={{ left: -10, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="var(--text-muted)" fontSize={11} width={110} />
                <Tooltip formatter={(val) => formatCurrency(val)} contentStyle={{ background: 'var(--bg-canvas)', border: '1px solid var(--glass-border)', borderRadius: '8px' }} />
                <Bar dataKey="value" name="Saldo" radius={[0, 4, 4, 0]} barSize={25}>
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

function StatCard({ title, value, icon, color, showValues }) {
  return (
    <div className="glass-card" style={{ padding: '1.25rem', borderLeft: `6px solid ${color}`, transition: 'transform 0.2s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{title}</span>
        <div style={{ color: color, background: `${color}15`, padding: '0.4rem', borderRadius: '0.5rem' }}>{icon}</div>
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
        {showValues ? (
          <>R$ {Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
        ) : (
          <>R$ ••••••</>
        )}
      </div>
    </div>
  );
}

const Building2 = ({ size, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/>
  </svg>
);
