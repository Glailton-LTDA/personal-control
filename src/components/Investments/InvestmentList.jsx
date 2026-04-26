import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { 
  Plus, Search, Filter, TrendingUp, ArrowUpDown, ChevronDown, ChevronRight,
  Trash2, Edit2, Calendar, Copy
} from 'lucide-react';
import InvestmentModal from './InvestmentModal';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';

export default function InvestmentList({ user, showValues = true }) {
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
    if (!error) {
      setRecords(data);
      // Expand all groups by default
      const allInstitutions = new Set(data.map(r => r.investment_accounts?.institution || 'Outros'));
      setExpandedGroups(allInstitutions);
    }
    setLoading(false);
  }

  async function handleCopyFromPreviousMonth() {
    if (filterMonth === 0) {
      toast.error('Selecione um mês específico para copiar dados.');
      return;
    }

    let prevMonth = filterMonth - 1;
    let prevYear = filterYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = filterYear - 1;
    }

    confirmToast(`Copiar os registros de ${months.find(m => m.value === prevMonth).label}/${prevYear} para este mês?`, async () => {
      await performCopy(prevMonth, prevYear);
    }, { confirmText: 'Sim, copiar tudo' });
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
        toast.error('Nenhum registro encontrado no mês anterior.');
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
        toast.error('Todos os registros do mês anterior já existem neste mês.');
        return;
      }

      const { error: insertError } = await supabase
        .from('investment_records')
        .insert(recordsToInsert);

      if (insertError) throw insertError;
      
      fetchData();
      toast.success(`${recordsToInsert.length} registros copiados!`);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao copiar registros.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    confirmToast('Deseja excluir este registro?', async () => {
      const { error } = await supabase.from('investment_records').delete().eq('id', id);
      if (!error) {
        fetchData();
        toast.success('Registro excluído');
      } else {
        toast.error('Erro ao excluir: ' + error.message);
      }
    }, { danger: true });
  }

  const formatCurrency = (val) => {
    if (!showValues) return 'R$ ••••••';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Prepare chart data: Yield per Institution for the selected period
  const chartData = Object.values(records.reduce((acc, curr) => {
    const instName = curr.investment_accounts?.institution || 'Desconhecido';
    if (!acc[instName]) acc[instName] = { name: instName, yield: 0, color: curr.investment_accounts?.color || '#6366f1' };
    acc[instName].yield += Number(curr.yield);
    return acc;
  }, {})).sort((a, b) => b.yield - a.yield);

  const totalYield = records.reduce((sum, r) => sum + Number(r.yield), 0);
  const totalBalance = records.reduce((sum, r) => sum + Number(r.final_balance), 0);

  // Group records by Institution for the table view
  const groupedRecords = useMemo(() => {
    const groups = records.reduce((acc, record) => {
      const inst = record.investment_accounts?.institution || 'Outros';
      if (!acc[inst]) {
        acc[inst] = { 
          name: inst, 
          balance: 0, 
          yield: 0, 
          items: [], 
          color: record.investment_accounts?.color || '#94a3b8' 
        };
      }
      acc[inst].balance += Number(record.final_balance);
      acc[inst].yield += Number(record.yield);
      acc[inst].items.push(record);
      return acc;
    }, {});
    
    return Object.values(groups).sort((a, b) => b.balance - a.balance);
  }, [records]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '100px' }}>
      
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
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h4 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={18} /> Rendimentos por Instituição
            </h4>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: window.innerWidth < 1024 ? '1fr' : '1.2fr 1fr', 
              gap: '2rem', 
              alignItems: 'center' 
            }} className="responsive-grid">
              
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
                        background: 'var(--bg-canvas)', 
                        border: '1px solid var(--glass-border)', 
                        borderRadius: '12px',
                        boxShadow: 'var(--shadow)'
                      }}
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
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total</div>
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

        {/* Desktop View: Table */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '0 0.5rem' }}>
          <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>Detalhamento</h4>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>
            {records.length} {records.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>
        <div className="glass-card desktop-only" style={{ overflow: 'hidden' }}>
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
              ) : groupedRecords.map(group => {
                const isExpanded = expandedGroups.has(group.name);
                return (
                  <React.Fragment key={group.name}>
                    <tr 
                      style={{ 
                        background: 'rgba(255,255,255,0.03)', 
                        borderBottom: '1px solid var(--glass-border)',
                        cursor: 'pointer'
                      }} 
                      onClick={() => toggleGroup(group.name)}
                      className="table-row-hover"
                    >
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          SUMÁRIO
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: group.color }}></div>
                          <span style={{ fontWeight: 800, color: 'var(--text-main)', letterSpacing: '0.5px' }}>{group.name.toUpperCase()}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 800 }}>{formatCurrency(group.balance)}</td>
                      <td style={{ padding: '0.75rem 1rem', color: group.yield >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 800 }}>
                        {formatCurrency(group.yield)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}></td>
                    </tr>
                    {isExpanded && group.items.map(record => (
                      <tr key={record.id} style={{ borderBottom: '1px solid var(--glass-border)', fontSize: '0.9rem' }} className="table-row-hover">
                        <td style={{ padding: '1rem', color: 'var(--text-muted)', paddingLeft: '1.5rem' }}>
                          {new Date(record.record_date).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' })}
                        </td>
                        <td style={{ padding: '1rem', paddingLeft: '2.5rem' }}>
                          <div style={{ fontWeight: 500 }}>{record.investment_accounts?.name}</div>
                        </td>
                        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{formatCurrency(record.final_balance)}</td>
                        <td style={{ padding: '1rem', color: record.yield >= 0 ? 'var(--success)' : 'var(--danger)', opacity: 0.8, fontSize: '0.85rem' }}>
                          {formatCurrency(record.yield)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button className="icon-btn" onClick={() => { setEditingRecord(record); setIsModalOpen(true); }}><Edit2 size={13} /></button>
                            <button className="icon-btn danger" onClick={() => handleDelete(record.id)}><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View: Grouped Cards */}
        <div className="mobile-only">
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Buscando registros...</div>
          ) : records.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum registro encontrado.</div>
          ) : (
            groupedRecords.map(group => {
              const isExpanded = expandedGroups.has(group.name);
              return (
                <div key={group.name} className="mobile-group-card">
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
                  
                  {isExpanded && group.items.map(record => (
                    <div key={record.id} className="mobile-item-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{record.investment_accounts?.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(record.record_date).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' })}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="icon-btn" onClick={() => { setEditingRecord(record); setIsModalOpen(true); }}><Edit2 size={14} /></button>
                          <button className="icon-btn danger" onClick={() => handleDelete(record.id)}><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          Saldo: <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{formatCurrency(record.final_balance)}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: record.yield >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                          {record.yield >= 0 ? '+' : ''}{formatCurrency(record.yield)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
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
