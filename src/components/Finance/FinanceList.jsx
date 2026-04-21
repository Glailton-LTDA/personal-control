import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  CreditCard,
  MoreVertical,
  Trash2,
  Edit2,
  Send,
  ArrowUp,
  ArrowDown,
  Mail,
  User,
  X,
  Copy
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import SummaryDashboard from './SummaryDashboard';

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#06b6d4', '#8b5cf6'];

export default function FinanceList({ refreshKey, onEdit, user }) {
  const [finances, setFinances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('personal-control-finance-tab') || 'DESPESA';
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [responsibles, setResponsibles] = useState([]);
  const [isEmailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedItemForEmail, setSelectedItemForEmail] = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = localStorage.getItem('personal-control-selected-month');
    return saved !== null ? Number(saved) : new Date().getMonth();
  });
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = localStorage.getItem('personal-control-selected-year');
    return saved !== null ? Number(saved) : 2026;
  });
  const [openMenuId, setOpenMenuId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'payment_date', direction: 'asc' });

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const years = [2024, 2025, 2026];

  useEffect(() => {
    localStorage.setItem('personal-control-selected-month', selectedMonth);
    localStorage.setItem('personal-control-selected-year', selectedYear);
    localStorage.setItem('personal-control-finance-tab', activeTab);
    fetchFinances();
    fetchResponsibles();
  }, [activeTab, selectedMonth, selectedYear, refreshKey]);

  async function fetchResponsibles() {
    const { data } = await supabase.from('finance_responsibles').select('*').order('name');
    if (data) setResponsibles(data);
  }

  async function fetchFinances() {
    setLoading(true);
    const monthStr = String(selectedMonth + 1).padStart(2, '0');
    const lastDayDate = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const start = `${selectedYear}-${monthStr}-01`;
    const end = `${selectedYear}-${monthStr}-${String(lastDayDate).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('finances')
      .select('*')
      .eq('type', activeTab)
      .gte('payment_date', start)
      .lte('payment_date', end);

    if (data) setFinances(data);
    setLoading(false);
  }

  async function handleDelete(id) {
    if (window.confirm('Tem certeza que deseja excluir este registro?')) {
      const { error } = await supabase.from('finances').delete().eq('id', id);
      if (!error) fetchFinances();
    }
    setOpenMenuId(null);
  }

  async function handleMarkAsPaid(id) {
    const { error } = await supabase
      .from('finances')
      .update({ status: 'PAGO' })
      .eq('id', id);
    
    if (!error) fetchFinances();
    setOpenMenuId(null);
  }

  async function handleSendEmail(item) {
    setSelectedItemForEmail(item);
    setEmailModalOpen(true);
  }

  async function sendEmailToRecipient(recipientEmail) {
    const item = selectedItemForEmail;
    if (!item) return;

    // 2. Formatar dados
    const formattedAmount = `R$ ${Number(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const formattedDate = new Date(item.payment_date).toLocaleDateString('pt-BR');
    const statusLabel = item.status === 'PAGO' ? 'Pago ✅' : 'Pendente ⏳';

    // 4. Montar o HTML
    const emailHtml = `
      <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
        <div style="background: #0f172a; padding: 20px; text-align: center; color: white;">
          <h2 style="margin: 0; font-size: 1.2rem;">Confirmação de Transação</h2>
        </div>
        <div style="padding: 20px;">
          <p>Olá! Seguem os detalhes da transação:</p>
          <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Descrição:</strong> ${item.description}</p>
            <p style="margin: 5px 0;"><strong>Valor:</strong> <span style="color: ${item.type === 'RECEITA' ? '#10b981' : '#ef4444'}">${formattedAmount}</span></p>
            <p style="margin: 5px 0;"><strong>Data:</strong> ${formattedDate}</p>
            <p style="margin: 5px 0;"><strong>Categoria:</strong> ${item.category}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> ${statusLabel}</p>
          </div>
          <p style="text-align: center; font-style: italic; color: #64748b; margin-top: 30px;">
            🐈 Ufa! Estamos livres dessa conta! Até que enfim! 💸
          </p>
        </div>
      </div>
    `;

    try {
      setEmailLoading(true);
      const { error: fnError } = await supabase.functions.invoke('send-finance-email', {
        body: { 
          to: recipientEmail,
          subject: `${item.type === 'RECEITA' ? 'Receita' : 'Despesa'} registrada: ${item.description}`,
          html: emailHtml
        }
      });

      if (fnError) throw fnError;

      await supabase
        .from('finances')
        .update({ email_sent: true })
        .eq('id', item.id);

      alert(`✅ E-mail enviado com sucesso para ${recipientEmail}!`);
      fetchFinances();
      setEmailModalOpen(false);
    } catch (err) {
      alert(`❌ Erro ao enviar e-mail: ${err.message}`);
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleCopyMonth() {
    if (!window.confirm(`Deseja copiar todas as transações de ${selectedMonth === 0 ? months[11] : months[selectedMonth - 1]} para o mês atual (${months[selectedMonth]})? Todas as cópias serão marcadas como PENDENTE.`)) {
      return;
    }

    try {
      setLoading(true);
      
      const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
      const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
      
      const start = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
      const end = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-31`;

      const { data: previousData, error: fetchError } = await supabase
        .from('finances')
        .select('*')
        .gte('payment_date', start)
        .lte('payment_date', end);

      if (fetchError) throw fetchError;
      if (!previousData || previousData.length === 0) {
        alert('Nenhuma transação encontrada no mês anterior.');
        return;
      }

      const newEntries = previousData.map(item => {
        const { id, created_at, email_sent, payment_date, ...rest } = item;
        
        // Ajustar a data para o mês atual, mantendo o dia original (se possível)
        const originalDate = new Date(payment_date);
        const day = originalDate.getDate();
        
        // Garantir que o dia seja válido no mês atual (ex: 31 de fevereiro)
        const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        const adjustedDay = Math.min(day, lastDayOfMonth);
        
        const newDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(adjustedDay).padStart(2, '0')}`;

        return {
          ...rest,
          payment_date: newDate,
          status: 'PENDENTE'
        };
      });

      const { error: insertError } = await supabase.from('finances').insert(newEntries);
      if (insertError) throw insertError;

      alert(`✅ ${newEntries.length} transações copiadas com sucesso!`);
      fetchFinances();
    } catch (err) {
      alert(`❌ Erro ao copiar transações: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = [...finances].sort((a, b) => {
    if (sortConfig.key === 'amount') {
      return sortConfig.direction === 'asc' ? a.amount - b.amount : b.amount - a.amount;
    }
    if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
    if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const revenueData = finances
    .filter(f => f.type === 'RECEITA')
    .reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + Number(curr.amount);
      return acc;
    }, {});

  const revenuePieData = Object.entries(revenueData).map(([name, value]) => ({ name, value }));

  const filteredFinances = sortedData.filter(item => 
    item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Mini Dash for Month */}
      <SummaryDashboard user={user} isGeneral={false} month={selectedMonth} year={selectedYear} refreshKey={refreshKey} />


      {/* Header and filters section below */}

      {/* Header & Filters */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div className="mobile-filters-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '1rem' }}>
          <div className="tabs-container">
            <button 
              className={`tab-btn ${activeTab === 'RECEITA' ? 'active' : ''}`}
              onClick={() => setActiveTab('RECEITA')}
            >
              Receitas
            </button>
            <button 
              className={`tab-btn ${activeTab === 'DESPESA' ? 'active' : ''}`}
              onClick={() => setActiveTab('DESPESA')}
            >
              Despesas
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'nowrap' }}>
            <select 
              className="select-filter"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '0.75rem', padding: '0.25rem' }}>
              <button 
                className="icon-btn" 
                onClick={() => setSelectedMonth(prev => prev === 0 ? 11 : prev - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <span style={{ minWidth: '80px', textAlign: 'center', fontWeight: 600, fontSize: '0.9rem' }}>
                {months[selectedMonth].substring(0, 3)}
              </span>
              <button 
                className="icon-btn"
                onClick={() => setSelectedMonth(prev => prev === 11 ? 0 : prev + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <button 
              className="icon-btn" 
              onClick={handleCopyMonth}
              title="Copiar transações do mês anterior"
              style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', borderRadius: '0.75rem' }}
            >
              <Copy size={18} />
            </button>
          </div>
        </div>

        {/* Mobile Sort Bar */}
        <div className="mobile-only sort-bar-mobile">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center', marginRight: '4px' }}>Ordenar:</span>
          <button 
            className={`sort-chip ${sortConfig.key === 'payment_date' ? 'active' : ''}`}
            onClick={() => handleSort('payment_date')}
          >
            Data {sortConfig.key === 'payment_date' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}
          </button>
          <button 
            className={`sort-chip ${sortConfig.key === 'status' ? 'active' : ''}`}
            onClick={() => handleSort('status')}
          >
            Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}
          </button>
          <button 
            className={`sort-chip ${sortConfig.key === 'amount' ? 'active' : ''}`}
            onClick={() => handleSort('amount')}
          >
            Valor {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}
          </button>
        </div>

        <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
          <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
          <input 
            type="text" 
            placeholder="Pesquisar por descrição ou categoria..." 
            style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 3rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '0.75rem', color: 'white', outline: 'none' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="finance-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('payment_date')} style={{ cursor: 'pointer' }}>
                  DATA {sortConfig.key === 'payment_date' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}
                </th>
                <th onClick={() => handleSort('description')} style={{ cursor: 'pointer' }}>
                  DESCRIÇÃO {sortConfig.key === 'description' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}
                </th>
                <th onClick={() => handleSort('category')} style={{ cursor: 'pointer' }}>
                  CATEGORIA {sortConfig.key === 'category' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}
                </th>
                 <th onClick={() => handleSort('amount')} style={{ cursor: 'pointer' }}>
                  VALOR {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}
                </th>
                {activeTab === 'DESPESA' && <th>PAGO POR</th>}
                {activeTab === 'DESPESA' && <th>AVISO</th>}
                <th>STATUS</th>
                <th>AÇÕES</th>
              </tr>
            </thead>
            <tbody style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.3s' }}>
              {loading && finances.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={activeTab === 'DESPESA' ? 8 : 6} style={{ padding: '12px' }}>
                      <div className="skeleton" style={{ height: '2.5rem', width: '100%' }} />
                    </td>
                  </tr>
                ))
              ) : filteredFinances.length === 0 ? (
                <tr><td colSpan={activeTab === 'DESPESA' ? 8 : 6} style={{ textAlign: 'center', padding: '2rem' }}>Nenhum registro encontrado.</td></tr>
              ) : filteredFinances.map((item) => (
                <tr key={item.id}>
                  <td data-label="Data">
                    {(() => {
                      const [year, month, day] = item.payment_date.split('-').map(Number);
                      return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
                    })()}
                  </td>
                  <td data-label="Descrição">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {item.credit_card && <CreditCard size={14} color="var(--primary)" title="Cartão de Crédito" />}
                      {item.description}
                    </div>
                  </td>
                  <td data-label="Categoria"><span className="badge">{item.category}</span></td>
                  <td data-label="Valor" style={{ fontWeight: 600, color: item.type === 'RECEITA' ? 'var(--success)' : 'white' }}>
                    {item.type === 'RECEITA' ? '+' : '-'} R$ {Number(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  {activeTab === 'DESPESA' && (
                    <td data-label="Pago Por">
                      {item.paid_by || '-'}
                    </td>
                  )}
                  {activeTab === 'DESPESA' && (
                    <td data-label="Aviso" style={{ textAlign: 'center' }}>
                      <Send 
                        size={16} 
                        color={item.email_sent ? 'var(--primary)' : 'var(--text-muted)'} 
                        style={{ opacity: item.email_sent ? 1 : 0.3 }}
                        title={item.email_sent ? 'E-mail enviado' : 'Ainda não enviado'}
                      />
                    </td>
                  )}
                  <td data-label="Status">
                    <span 
                      className={`status-badge ${item.status === 'PAGO' ? 'paid' : 'pending'}`}
                      onClick={() => item.status === 'PENDENTE' && handleMarkAsPaid(item.id)}
                      style={{ cursor: item.status === 'PENDENTE' ? 'pointer' : 'default' }}
                      title={item.status === 'PENDENTE' ? 'Clique para marcar como pago' : ''}
                    >
                      {item.status === 'PAGO' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {item.status}
                    </span>
                  </td>
                  <td data-label={isMobile ? "" : "Ações"} className="actions-cell">
                    <div className="actions-row">
                      {item.status === 'PENDENTE' && (
                        <button className="action-btn success" onClick={() => handleMarkAsPaid(item.id)} title="Marcar Pago">
                          <CheckCircle2 size={18} />
                        </button>
                      )}
                      <button className="action-btn primary" onClick={() => handleSendEmail(item)} title="Enviar E-mail">
                        <Send size={18} />
                      </button>
                      <button className="action-btn" onClick={() => onEdit(item)} title="Editar">
                        <Edit2 size={18} />
                      </button>
                      <button className="action-btn danger" onClick={() => handleDelete(item.id)} title="Excluir">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Email Recipient Modal */}
      {isEmailModalOpen && (
        <div className="modal-overlay" onClick={() => setEmailModalOpen(false)}>
          <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Mail size={20} /> Selecionar Destinatário
              </h3>
              <button className="icon-btn" onClick={() => setEmailModalOpen(false)}><X size={20} /></button>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Escolha para quem deseja enviar os detalhes desta transação:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {responsibles.map(resp => (
                <button
                  key={resp.id}
                  onClick={() => sendEmailToRecipient(resp.email)}
                  disabled={emailLoading || !resp.email}
                  className="glass-card"
                  style={{ 
                    display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--glass-border)',
                    textAlign: 'left', cursor: 'pointer', opacity: resp.email ? 1 : 0.5
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                    <User size={20} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>{resp.name}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{resp.email || 'Sem e-mail'}</p>
                  </div>
                </button>
              ))}
            </div>

            {emailLoading && (
              <div style={{ marginTop: '1.5rem', textAlign: 'center', color: 'var(--primary)', fontSize: '0.85rem' }}>
                Enviando e-mail...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
