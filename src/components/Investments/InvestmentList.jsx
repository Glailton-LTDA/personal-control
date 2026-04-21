import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { 
  Plus, Search, Filter, TrendingUp, ArrowUpDown, ChevronDown, 
  Trash2, Edit2, Calendar, Copy
} from 'lucide-react';
import InvestmentModal from './InvestmentModal';

export default function InvestmentList({ user }) {
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

  useEffect(() => {
    localStorage.setItem('investment_filter_year', filterYear);
    localStorage.setItem('investment_filter_month', filterMonth);
  }, [filterYear, filterMonth]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  
  const years = [2024, 2025, 2026];
  const months = [
    { value: 0, label: 'Todos' },
    { value: 1, label: 'Janeiro' },
    { value: 2, label: 'Fevereiro' },
    { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Maio' },
    { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' },
    { value: 11, label: 'Novembro' },
    { value: 12, label: 'Dezembro' }
  ];

  useEffect(() => {
    fetchData();
  }, [user, filterYear, filterMonth]);

  async function fetchData() {
    setLoading(true);
    
    // Fetch accounts first to have the mapping (names, colors, institutions)
    const { data: accountsData } = await supabase
      .from('investment_accounts')
      .select('*');
    if (accountsData) setAccounts(accountsData);

    let query = supabase
      .from('investment_records')
      .select(`
        *,
        investment_accounts (*)
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
    if (!error) setRecords(data);
    setLoading(false);
  }

  async function handleCopyFromPreviousMonth() {
    if (filterMonth === 0) {
      alert('Selecione um mês específico para copiar dados.');
      return;
    }

    let prevMonth = filterMonth - 1;
    let prevYear = filterYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = filterYear - 1;
    }

    if (!window.confirm(`Copiar os registros de ${months.find(m => m.value === prevMonth).label}/${prevYear} para este mês?`)) {
      return;
    }

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
        alert('Nenhum registro encontrado no mês anterior.');
        return;
      }

      // 2. Identify already existing accounts in current month to avoid duplicates
      const existingAccountIds = records.map(r => r.account_id);
      
      const recordsToInsert = prevRecords
        .filter(r => !existingAccountIds.includes(r.account_id))
        .map(r => ({
          user_id: user.id,
          account_id: r.account_id,
          final_balance: r.final_balance, 
          yield: 0, 
          record_date: `${filterYear}-${String(filterMonth).padStart(2, '0')}-01`
        }));

      if (recordsToInsert.length === 0) {
        alert('Todos os registros do mês anterior já existem neste mês.');
        return;
      }

      const { error: insertError } = await supabase
        .from('investment_records')
        .insert(recordsToInsert);

      if (insertError) throw insertError;
      
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Erro ao copiar registros.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (window.confirm('Excluir este registro?')) {
      const { error } = await supabase.from('investment_records').delete().eq('id', id);
      if (!error) fetchData();
    }
  }

  const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  // Prepare chart data: Yield per Institution for the selected period
  const chartData = Object.values(records.reduce((acc, curr) => {
    const instName = curr.investment_accounts?.institution || 'Desconhecido';
    if (!acc[instName]) acc[instName] = { name: instName, yield: 0, color: curr.investment_accounts?.color || '#6366f1' };
    acc[instName].yield += Number(curr.yield);
    return acc;
  }, {})).sort((a, b) => b.yield - a.yield);

  const totalYield = records.reduce((sum, r) => sum + Number(r.yield), 0);
  const totalBalance = records.reduce((sum, r) => sum + Number(r.final_balance), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
      
      {/* Filters and Summary Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="glass-card" style={{ padding: '0.4rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'var(--transition)' }}>
            <Calendar size={18} color="var(--primary)" />
            <select 
              value={filterYear}
              onChange={e => setFilterYear(Number(e.target.value))}
              className="select-filter"
              style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 700, outline: 'none', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          
          <div className="glass-card" style={{ padding: '0.4rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'var(--transition)' }}>
            <Filter size={18} color="var(--primary)" />
            <select 
              value={filterMonth}
              onChange={e => setFilterMonth(Number(e.target.value))}
              className="select-filter"
              style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 700, outline: 'none', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          {filterMonth !== 0 && (
            <button 
              onClick={handleCopyFromPreviousMonth}
              className="glass-card"
              style={{ 
                padding: '0.4rem 1rem', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                cursor: 'pointer',
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                color: 'var(--primary)',
                fontWeight: 600,
                fontSize: '0.85rem'
              }}
            >
              <Copy size={16} />
              Copiar do Mês Anterior
            </button>
          )}
        </div>
      </div>

      {/* FAB - Floating Action Button */}
      <button 
        className="contextual-fab" 
        onClick={() => { setEditingRecord(null); setIsModalOpen(true); }}
        title="Novo Registro"
      >
        <Plus size={32} />
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '6px solid var(--primary)' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Rendimento no Período</p>
          <h3 style={{ fontSize: '1.75rem', fontWeight: 800, color: totalYield >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(totalYield)}</h3>
        </div>
        <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '6px solid var(--success)' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Saldo Final Total</p>
          <h3 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{formatCurrency(totalBalance)}</h3>
        </div>
      </div>

      {/* Layout: Chart on top, Table below */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Chart */}
        {chartData.length > 0 && (
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h4 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={18} /> Rendimentos por Instituição
            </h4>
            <div style={{ height: chartData.length * 45 + 60, minHeight: '120px', maxHeight: '400px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: -10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" stroke="var(--text-muted)" fontSize={11} width={110} tick={{ fill: 'var(--text-muted)' }} />
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
                  <Bar dataKey="yield" name="Rendimento" radius={[0, 4, 4, 0]} barSize={25}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                <th style={{ padding: '1rem', fontSize: '0.85rem' }}>Data</th>
                <th style={{ padding: '1rem', fontSize: '0.85rem' }}>Conta</th>
                <th style={{ padding: '1rem', fontSize: '0.85rem' }}>Saldo Final</th>
                <th style={{ padding: '1rem', fontSize: '0.85rem' }}>Rendimento</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Buscando registros...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum registro encontrado.</td></tr>
              ) : records.map(record => (
                <tr key={record.id} style={{ borderBottom: '1px solid var(--glass-border)', fontSize: '0.9rem' }}>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                    {new Date(record.record_date).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' })}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: record.investment_accounts?.color || 'var(--text-muted)' }}></div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{record.investment_accounts?.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{record.investment_accounts?.institution}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', fontWeight: 500 }}>{formatCurrency(record.final_balance)}</td>
                  <td style={{ padding: '1rem', color: record.yield >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {formatCurrency(record.yield)}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button className="icon-btn" onClick={() => { setEditingRecord(record); setIsModalOpen(true); }}><Edit2 size={14} /></button>
                      <button className="icon-btn danger" onClick={() => handleDelete(record.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
