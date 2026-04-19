import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, Wallet, Calendar, Filter } from 'lucide-react';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function SummaryDashboard({ isGeneral, month, year: initialYear, refreshKey }) {
  const [data, setData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ income: 0, expense: 0, balance: 0 });
  const [selectedYear, setSelectedYear] = useState(initialYear || 2026);

  const years = [2024, 2025, 2026];

  useEffect(() => {
    fetchData();
  }, [isGeneral, month, selectedYear, refreshKey]);

  async function fetchData() {
    setLoading(true);
    let query = supabase.from('finances').select('*');

    if (isGeneral) {
      const startOfYear = `${selectedYear}-01-01`;
      const endOfYear = `${selectedYear}-12-31`;
      query = query.gte('payment_date', startOfYear).lte('payment_date', endOfYear);
    } else if (month !== undefined) {
      const firstDay = new Date(selectedYear, month, 1).toISOString();
      const lastDay = new Date(selectedYear, month + 1, 0, 23, 59, 59).toISOString();
      query = query.gte('payment_date', firstDay).lte('payment_date', lastDay);
    }

    const { data: finances, error } = await query;

    if (finances) {
      processCharts(finances);
    }
    setLoading(false);
  }

  function processCharts(finances) {
    const monthsMap = {};
    const categoriesMap = {};
    let totalIncome = 0;
    let totalExpense = 0;

    finances.sort((a, b) => new Date(a.payment_date) - new Date(b.payment_date));

    finances.forEach(item => {
      const date = new Date(item.payment_date);
      const label = isGeneral 
        ? date.toLocaleDateString('pt-BR', { month: 'short' })
        : date.toLocaleDateString('pt-BR', { day: '2-digit' });
      
      if (!monthsMap[label]) monthsMap[label] = { name: label, income: 0, expense: 0, difference: 0 };
      
      const amount = Number(item.amount);
      if (item.type === 'RECEITA') {
        monthsMap[label].income += amount;
        totalIncome += amount;
      } else {
        monthsMap[label].expense += amount;
        totalExpense += amount;
        const cat = item.category || 'Outros';
        categoriesMap[cat] = (categoriesMap[cat] || 0) + amount;
      }
      monthsMap[label].difference = monthsMap[label].income - monthsMap[label].expense;
    });

    setData(Object.values(monthsMap));
    setCategoryData(Object.entries(categoriesMap).map(([name, value]) => ({ name, value })));
    setStats({ income: totalIncome, expense: totalExpense, balance: totalIncome - totalExpense });
  }

  const formatValue = (val) => `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando dados...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header with Year Filter for General View */}
      {isGeneral && (
        <div className="glass-card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Filter size={18} color="var(--primary)" />
            <span style={{ fontWeight: 600 }}>Filtrar Ano Fiscal</span>
          </div>
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
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <StatCard title={isGeneral ? "Receita Anual" : "Receita Mensal"} value={stats.income} icon={<TrendingUp size={20}/>} color="var(--success)" />
        <StatCard title={isGeneral ? "Despesa Anual" : "Despesa Mensal"} value={stats.expense} icon={<TrendingDown size={20}/>} color="var(--danger)" />
        <StatCard title="Saldo Final" value={stats.balance} icon={<Wallet size={20}/>} color="var(--primary)" />
      </div>

      <div className="dashboard-grid">
        
        {/* Main Chart */}
        <div className="glass-card chart-container" style={{ padding: '1.5rem' }}>
          <h4 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={18} /> {isGeneral ? `Evolução Mensal de ${selectedYear}` : 'Detalhamento Diário'}
          </h4>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
              <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(v) => `R$ ${v/1000}k`} />
              <Tooltip 
                formatter={(val) => formatValue(val)}
                contentStyle={{ background: 'var(--bg-dark)', border: '1px solid var(--glass-border)', borderRadius: '1rem' }} 
              />
              <Legend verticalAlign="top" height={36}/>
              <Bar dataKey="income" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="difference" name="Resultado" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Categories Chart */}
        <div className="glass-card chart-container" style={{ padding: '1.5rem' }}>
          <h4>Distribuição de Gastos</h4>
          <ResponsiveContainer width="100%" height="85%">
            <PieChart>
              <Pie
                data={categoryData}
                innerRadius={60}
                outerRadius={90}
                paddingAngle={5}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(val) => formatValue(val)} />
              <Legend verticalAlign="bottom" align="center" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  return (
    <div className="glass-card" style={{ padding: '1.25rem', borderLeft: `6px solid ${color}`, transition: 'transform 0.2s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{title}</span>
        <div style={{ color: color, background: `${color}15`, padding: '0.4rem', borderRadius: '0.5rem' }}>{icon}</div>
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: value < 0 ? 'var(--danger)' : 'inherit' }}>
        R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
