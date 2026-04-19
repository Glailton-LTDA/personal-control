import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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
  ArrowDown
} from 'lucide-react';
import SummaryDashboard from './SummaryDashboard';

export default function FinanceList({ refreshKey, onEdit }) {
  const [finances, setFinances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('personal-control-finance-tab') || 'DESPESA';
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

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
  }, [activeTab, selectedMonth, selectedYear, refreshKey]);

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
    // 1. Buscar email do responsável
    const { data: resp } = await supabase
      .from('finance_responsibles')
      .select('email')
      .eq('name', item.paid_by)
      .single();

    if (!resp?.email) {
      alert('Responsável não possui e-mail cadastrado nas configurações.');
      return;
    }

    // 2. Formatar dados
    const formattedAmount = `R$ ${Number(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const formattedDate = new Date(item.payment_date).toLocaleDateString('pt-BR');
    const status = item.status === 'PAGO' ? 'Pago ✅' : 'Pendente ⏳';

    // 3. Montar o corpo (Simulação da lógica que pegaria do Settings)
    const template = `
Detalles do pagamento:
• Descrição: ${item.description}
• Valor: ${formattedAmount}
• Data do Pagamento: ${formattedDate}
• Pago por: ${item.paid_by}
• Status: ${status}

🐈 Ufa! Estamos livres dessa conta! Até que enfim! 💸
    `;

    // 4. Montar o HTML (baseado no seu template)
    const emailHtml = `
      <div style="font-family: sans-serif; color: #333;">
        <p><strong>Detalhes do pagamento:</strong></p>
        <ul>
          <li><strong>Descrição:</strong> ${item.description}</li>
          <li><strong>Valor:</strong> ${formattedAmount}</li>
          <li><strong>Data do Pagamento:</strong> ${formattedDate}</li>
          <li><strong>Pago por:</strong> ${item.paid_by}</li>
          <li><strong>Status:</strong> ${item.status === 'PAGO' ? 'PAGO' : 'PENDENTE'}</li>
        </ul>
        <p><strong>🐈 Ufa! Estamos livres dessa conta! Até que enfim! 💸</strong></p>
      </div>
    `;

    try {
      setLoading(true);
      const { data, error: fnError } = await supabase.functions.invoke('send-finance-email', {
        body: { 
          to: resp.email,
          subject: `Confirmação de Pagamento: ${item.description}`,
          html: emailHtml
        }
      });

      if (fnError) throw fnError;

      // 5. Marcar como enviado no banco se a função respondeu ok
      await supabase
        .from('finances')
        .update({ email_sent: true })
        .eq('id', item.id);

      alert(`✅ E-mail enviado com sucesso para ${resp.email}!`);
      fetchFinances();
    } catch (err) {
      alert(`❌ Erro ao enviar e-mail: ${err.message}. Verifique se a RESEND_API_KEY está configurada no Supabase.`);
    } finally {
      setLoading(false);
      setOpenMenuId(null);
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

  const filteredFinances = sortedData.filter(item => 
    item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Mini Dash for Month */}
      <SummaryDashboard isGeneral={false} month={selectedMonth} year={selectedYear} refreshKey={refreshKey} />

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
                  <td data-label={isMobile ? "" : "Ações"} style={{ position: 'relative' }}>
                    <div className="desktop-only">
                      <button className="icon-btn" onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}>
                        <MoreVertical size={18} />
                      </button>
                      
                      {openMenuId === item.id && (
                        <div className="action-menu">
                          {item.status === 'PENDENTE' && (
                            <button onClick={() => handleMarkAsPaid(item.id)} style={{ color: 'var(--success) !important' }}>
                              <CheckCircle2 size={14}/> Marcar como Pago
                            </button>
                          )}
                          <button onClick={() => handleSendEmail(item)}><Send size={14}/> Enviar E-mail</button>
                          <button onClick={() => {
                            onEdit(item);
                            setOpenMenuId(null);
                          }}><Edit2 size={14}/> Editar</button>
                          <button onClick={() => handleDelete(item.id)} className="delete"><Trash2 size={14}/> Deletar</button>
                        </div>
                      )}
                    </div>

                    {/* Mobile Quick Actions Area */}
                    <div className="mobile-only mobile-actions-row">
                      {item.status === 'PENDENTE' && (
                        <button className="mobile-action-btn success" onClick={() => handleMarkAsPaid(item.id)} title="Marcar Pago">
                          <CheckCircle2 size={20} />
                        </button>
                      )}
                      <button className="mobile-action-btn primary" onClick={() => handleSendEmail(item)} title="Enviar E-mail">
                        <Send size={20} />
                      </button>
                      <button className="mobile-action-btn" onClick={() => onEdit(item)} title="Editar">
                        <Edit2 size={20} />
                      </button>
                      <button className="mobile-action-btn danger" onClick={() => handleDelete(item.id)} title="Excluir">
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
