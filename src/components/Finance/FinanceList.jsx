import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { confirmToast } from '../../lib/toast';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  CreditCard,
  Trash2,
  Edit2,
  Send,
  ArrowUp,
  ArrowDown,
  Mail,
  User,
  X,
  Copy,
  Eye,
  EyeOff,
  ShoppingCart,
  Home,
  Car,
  Utensils,
  Zap,
  Heart,
  GraduationCap,
  Plane,
  TrendingUp,
  Smartphone,
  Coffee,
  Package,
  DollarSign,
  Repeat
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import SummaryDashboard from './SummaryDashboard';
import { useEncryption } from '../../contexts/EncryptionContext';

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#06b6d4', '#8b5cf6'];

// Mapa keyword → { icon, color } para chips e ícones de categoria
const CATEGORY_META = [
  { keywords: ['aliment', 'comida', 'restaur', 'refeiç', 'mercado', 'superm'],   icon: Utensils,      color: '#f97316' },
  { keywords: ['aluguel', 'moradia', 'casa', 'condom', 'iptu'],                  icon: Home,          color: '#6366f1' },
  { keywords: ['transporte', 'uber', 'ônibus', 'onibus', 'gasolina', 'carro', 'estacion'], icon: Car, color: '#06b6d4' },
  { keywords: ['saúde', 'saude', 'médico', 'medico', 'farmácia', 'farmacia', 'plano'],     icon: Heart,        color: '#ef4444' },
  { keywords: ['educaç', 'educac', 'escola', 'curso', 'facul', 'livro'],         icon: GraduationCap, color: '#8b5cf6' },
  { keywords: ['viagem', 'viag', 'hotel', 'passag', 'hospedagem'],               icon: Plane,         color: '#0ea5e9' },
  { keywords: ['invest', 'poupan', 'ativo', 'fundo'],                            icon: TrendingUp,    color: '#10b981' },
  { keywords: ['celular', 'telefon', 'internet', 'telecom', 'digital', 'assin'], icon: Smartphone,    color: '#a855f7' },
  { keywords: ['café', 'cafe', 'lazer', 'entretenimento', 'cinema', 'bar'],      icon: Coffee,        color: '#fb923c' },
  { keywords: ['compra', 'roupa', 'loja'],                                        icon: ShoppingCart,  color: '#ec4899' },
  { keywords: ['energia', 'luz', 'água', 'agua', 'gás', 'gas', 'utilid'],       icon: Zap,           color: '#eab308' },
  { keywords: ['receit', 'salário', 'salario', 'renda', 'receita'],              icon: DollarSign,    color: '#10b981' },
  { keywords: ['parcel', 'cartão', 'cartao', 'crédito', 'credito'],              icon: CreditCard,    color: '#64748b' },
  { keywords: ['fixo', 'recorr', 'mensalid'],                                    icon: Repeat,        color: '#94a3b8' },
];

function getCategoryMeta(category = '') {
  const lower = category.toLowerCase();
  const match = CATEGORY_META.find(m => m.keywords.some(k => lower.includes(k)));
  return match || { icon: Package, color: '#64748b' };
}

export default function FinanceList({ refreshKey, onEdit, user, showValues = true, onToggleValues }) {
  const [finances, setFinances] = useState([]);
  const { decryptObject } = useEncryption();
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState(() => {
    return localStorage.getItem('personal-control-finance-view') || 'lista';
  }); // 'resumo' ou 'lista'
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('personal-control-finance-tab') || 'DESPESA';
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [responsibles, setResponsibles] = useState([]);
  const [isEmailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedItemForEmail, setSelectedItemForEmail] = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState(null);

  useEffect(() => {
    async function fetchNotificationSettings() {
      const { data } = await supabase.from('notification_settings').select('*').single();
      if (data) setNotificationSettings(data);
    }
    fetchNotificationSettings();
  }, [refreshKey]);

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

  const [sortConfig, setSortConfig] = useState({ key: 'payment_date', direction: 'asc' });

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const years = [2024, 2025, 2026];

  const fetchResponsibles = useCallback(async () => {
    const { data } = await supabase.from('finance_responsibles').select('*').order('name');
    if (data) setResponsibles(data);
  }, []);

  const fetchFinances = useCallback(async () => {
    setLoading(true);
    const monthStr = String(selectedMonth + 1).padStart(2, '0');
    const lastDayDate = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const start = `${selectedYear}-${monthStr}-01`;
    const end = `${selectedYear}-${monthStr}-${String(lastDayDate).padStart(2, '0')}`;

    const { data } = await supabase
      .from('finances')
      .select('*')
      .eq('type', activeTab)
      .gte('payment_date', start)
      .lte('payment_date', end);

    if (data) {
      const decryptedData = await decryptObject(data, ['description', 'category', 'paid_by']);
      setFinances(decryptedData);
    }
    setLoading(false);
  }, [activeTab, selectedMonth, selectedYear, decryptObject]);

  useEffect(() => {
    localStorage.setItem('personal-control-selected-month', selectedMonth);
    localStorage.setItem('personal-control-selected-year', selectedYear);
    localStorage.setItem('personal-control-finance-tab', activeTab);
    localStorage.setItem('personal-control-finance-view', activeView);
    fetchFinances();
    fetchResponsibles();
  }, [activeTab, activeView, selectedMonth, selectedYear, refreshKey, fetchFinances, fetchResponsibles]);

  async function handleDelete(id) {
    confirmToast('Tem certeza que deseja excluir este registro?', async () => {
      const { error } = await supabase.from('finances').delete().eq('id', id);
      if (!error) {
        fetchFinances();
        toast.success('Registro excluído');
      } else {
        toast.error('Erro ao excluir: ' + error.message);
      }
    }, { danger: true });
  }

  async function handleMarkAsPaid(id) {
    const { error } = await supabase
      .from('finances')
      .update({ status: 'PAGO' })
      .eq('id', id);
    
    if (!error) {
      fetchFinances();
      if (notificationSettings?.auto_send_on_paid && notificationSettings?.recipient_email) {
        const item = finances.find(f => f.id === id);
        if (item) {
          setSelectedItemForEmail({ ...item, status: 'PAGO' });
          setTimeout(() => {
            sendEmailToRecipient(notificationSettings.recipient_email, { ...item, status: 'PAGO' });
          }, 100);
        }
      }
    }
  }

  async function handleSendEmail(item) {
    if (notificationSettings?.skip_email_modal && notificationSettings?.recipient_email) {
      setSelectedItemForEmail(item);
      sendEmailToRecipient(notificationSettings.recipient_email, item);
      return;
    }
    setSelectedItemForEmail(item);
    setEmailModalOpen(true);
  }

  async function sendEmailToRecipient(recipientEmail, overrideItem = null) {
    const item = overrideItem || selectedItemForEmail;
    if (!item) return;

    const formattedAmount = `R$ ${Number(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const formattedDate = new Date(item.payment_date).toLocaleDateString('pt-BR');
    const statusLabel = item.status === 'PAGO' ? 'Pago ✅' : 'Pendente ⏳';

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
          html: emailHtml,
          bcc: notificationSettings?.bcc_email
        }
      });

      if (fnError) throw fnError;
 
       await supabase
         .from('finances')
         .update({ email_sent: true })
         .eq('id', item.id);
 
       toast.success(`E-mail enviado para ${recipientEmail}!`);
       fetchFinances();
       setEmailModalOpen(false);
     } catch (err) {
       toast.error(`Erro ao enviar e-mail: ${err.message}`);
     } finally {
      setEmailLoading(false);
    }
  }

  async function handleCopyMonth() {
    confirmToast(`Deseja copiar todas as transações de ${selectedMonth === 0 ? months[11] : months[selectedMonth - 1]} para o mês atual (${months[selectedMonth]})?`, async () => {
      await performCopyMonth();
    }, { confirmText: 'Sim, copiar tudo' });
  }

  async function performCopyMonth() {
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
        toast.error('Nenhuma transação encontrada no mês anterior.');
        return;
      }
      const newEntries = previousData.map(item => {
        const { id: _id, user_id: _user_id, created_at: _created_at, email_sent: _email_sent, payment_date, ...rest } = item;
        const originalDate = new Date(payment_date);
        const day = originalDate.getDate();
        const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        const adjustedDay = Math.min(day, lastDayOfMonth);
        const newDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(adjustedDay).padStart(2, '0')}`;
        return { ...rest, payment_date: newDate, status: 'PENDENTE' };
      });
      const { error: insertError } = await supabase.from('finances').insert(newEntries);
      if (insertError) throw insertError;
      toast.success(`${newEntries.length} transações copiadas!`);
      fetchFinances();
    } catch (err) {
      toast.error(`Erro ao copiar: ${err.message}`);
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

  const filteredFinances = sortedData.filter(item => 
    item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* GLOBAL FILTERS AT TOP */}
      <div className="glass-card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div className="tabs-container" style={{ marginBottom: 0 }}>
            <button className={`tab-btn ${activeView === 'resumo' ? 'active' : ''}`} onClick={() => setActiveView('resumo')}>Resumo</button>
            <button className={`tab-btn ${activeView === 'lista' ? 'active' : ''}`} onClick={() => setActiveView('lista')}>Transações</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select className="select-filter" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '0.75rem', padding: '0.25rem' }}>
            <button className="icon-btn" onClick={() => setSelectedMonth(prev => prev === 0 ? 11 : prev - 1)}><ChevronLeft size={18} /></button>
            <span style={{ minWidth: '80px', textAlign: 'center', fontWeight: 600, fontSize: '0.9rem' }}>{months[selectedMonth]}</span>
            <button className="icon-btn" onClick={() => setSelectedMonth(prev => prev === 11 ? 0 : prev + 1)}><ChevronRight size={18} /></button>
          </div>
          <button className="icon-btn" onClick={handleCopyMonth} title="Copiar transações do mês anterior" style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', borderRadius: '0.75rem' }}><Copy size={18} /></button>
        </div>
      </div>

      {activeView === 'resumo' ? (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <SummaryDashboard user={user} isGeneral={false} month={selectedMonth} year={selectedYear} refreshKey={refreshKey} showValues={showValues} onToggleValues={onToggleValues} />
        </div>
      ) : (
        <div className="glass-card fade-in" style={{ padding: '1.5rem' }}>
          <div className="mobile-filters-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '1rem' }}>
            <div className="tabs-container">
              <button className={`tab-btn ${activeTab === 'RECEITA' ? 'active' : ''}`} onClick={() => setActiveTab('RECEITA')}>Receitas</button>
              <button className={`tab-btn ${activeTab === 'DESPESA' ? 'active' : ''}`} onClick={() => setActiveTab('DESPESA')}>Despesas</button>
            </div>
          </div>
          
          <div className="mobile-only sort-bar-mobile">
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center', marginRight: '4px' }}>Ordenar:</span>
            <button className={`sort-chip ${sortConfig.key === 'payment_date' ? 'active' : ''}`} onClick={() => handleSort('payment_date')}>Data {sortConfig.key === 'payment_date' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</button>
            <button className={`sort-chip ${sortConfig.key === 'status' ? 'active' : ''}`} onClick={() => handleSort('status')}>Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</button>
            <button className={`sort-chip ${sortConfig.key === 'amount' ? 'active' : ''}`} onClick={() => handleSort('amount')}>Valor {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</button>
          </div>

          <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
            <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
            <input type="text" placeholder="Pesquisar por descrição ou categoria..." style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 3rem', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: '0.75rem', color: 'var(--text-main)', outline: 'none' }} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '0 0.5rem' }}>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Transações</h4>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>{filteredFinances.length} {filteredFinances.length === 1 ? 'registro' : 'registros'}</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="finance-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('payment_date')} style={{ cursor: 'pointer' }}>DATA {sortConfig.key === 'payment_date' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</th>
                  <th onClick={() => handleSort('description')} style={{ cursor: 'pointer' }}>DESCRIÇÃO {sortConfig.key === 'description' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</th>
                  <th onClick={() => handleSort('category')} style={{ cursor: 'pointer' }}>CATEGORIA {sortConfig.key === 'category' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</th>
                  <th onClick={() => handleSort('amount')} style={{ cursor: 'pointer' }}>VALOR {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>)}</th>
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
                      <td colSpan={activeTab === 'DESPESA' ? 8 : 6} style={{ padding: '12px' }}><div className="skeleton" style={{ height: '2.5rem', width: '100%' }} /></td>
                    </tr>
                  ))
                ) : filteredFinances.length === 0 ? (
                  <tr><td colSpan={activeTab === 'DESPESA' ? 8 : 6} style={{ textAlign: 'center', padding: '2rem' }}>Nenhum registro encontrado.</td></tr>
                ) : filteredFinances.map((item) => (
                  <tr key={item.id} data-testid={`finance-row-${item.description}`}>
                    <td data-label="Data">{(() => { try { if (!item.payment_date) return 'N/A'; const parts = String(item.payment_date).split('-'); if (parts.length !== 3) return 'N/A'; const [year, month, day] = parts.map(Number); return new Date(year, month - 1, day).toLocaleDateString('pt-BR'); } catch { return 'N/A'; } })()}</td>
                    <td data-label="Descrição">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        {/* Ícone contextual por categoria */}
                        {(() => { const meta = getCategoryMeta(item.category); const Icon = meta.icon; return (
                          <span className="cat-icon-wrap" style={{ '--cat-color': meta.color }}><Icon size={14} /></span>
                        ); })()}
                        {item.credit_card && <CreditCard size={13} color="var(--primary)" title="Cartão de Crédito" />}
                        {item.description}
                      </div>
                    </td>
                    <td data-label="Categoria">
                      {(() => { const meta = getCategoryMeta(item.category); return (
                        <span className="cat-chip" style={{ '--cat-color': meta.color }}>{item.category}</span>
                      ); })()}
                    </td>
                    <td data-label="Valor" style={{ fontWeight: 600, color: item.type === 'RECEITA' ? 'var(--success)' : 'white' }}>{item.type === 'RECEITA' ? '+' : '-'} {showValues ? `R$ ${Number(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ ••••••'}</td>
                    {activeTab === 'DESPESA' && <td data-label="Pago Por">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><User size={12} style={{ opacity: 0.5 }}/>{item.paid_by || '-'}</div>
                    </td>}
                    {activeTab === 'DESPESA' && <td data-label="Aviso" style={{ textAlign: 'center' }}><Send size={16} color={item.email_sent ? 'var(--primary)' : 'var(--text-muted)'} style={{ opacity: item.email_sent ? 1 : 0.3 }} title={item.email_sent ? 'E-mail enviado' : 'Ainda não enviado'}/></td>}
                    <td data-label="Status"><span className={`status-badge ${item.status === 'PAGO' ? 'paid' : 'pending'}`} onClick={() => item.status === 'PENDENTE' && handleMarkAsPaid(item.id)} style={{ cursor: item.status === 'PENDENTE' ? 'pointer' : 'default' }} title={item.status === 'PENDENTE' ? 'Clique para marcar como pago' : ''}>{item.status === 'PAGO' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}{item.status}</span></td>
                    <td data-label={isMobile ? "" : "Ações"} className="actions-cell">
                      <div className="actions-row">
                        {item.status === 'PENDENTE' && <button className="action-btn success" onClick={() => handleMarkAsPaid(item.id)} title="Marcar Pago"><CheckCircle2 size={18} /></button>}
                        <button className="action-btn primary" onClick={() => handleSendEmail(item)} title="Enviar E-mail"><Send size={18} /></button>
                        <button className="action-btn" onClick={() => onEdit(item)} title="Editar"><Edit2 size={18} /></button>
                        <button className="action-btn danger" onClick={() => handleDelete(item.id)} title="Excluir"><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isEmailModalOpen && (
        <div className="modal-overlay" onClick={() => setEmailModalOpen(false)}>
          <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Mail size={20} /> Selecionar Destinatário</h3>
              <button className="icon-btn" onClick={() => setEmailModalOpen(false)}><X size={20} /></button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Escolha para quem deseja enviar os detalhes desta transação:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {responsibles.map(resp => (
                <button key={resp.id} onClick={() => sendEmailToRecipient(resp.email)} disabled={emailLoading || !resp.email} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--glass-border)', textAlign: 'left', cursor: 'pointer', opacity: resp.email ? 1 : 0.5 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}><User size={20} /></div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>{resp.name}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{resp.email || 'Sem e-mail'}</p>
                  </div>
                </button>
              ))}
            </div>
            {emailLoading && <div style={{ marginTop: '1.5rem', textAlign: 'center', color: 'var(--primary)', fontSize: '0.85rem' }}>Enviando e-mail...</div>}
          </div>
        </div>
      )}
    </div>
  );
}
