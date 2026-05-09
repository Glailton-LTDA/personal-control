import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { motion as Motion, AnimatePresence } from 'framer-motion';
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
  ArrowUpDown,
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
  Repeat,
  Plus
} from 'lucide-react';
import SummaryDashboard from './SummaryDashboard';

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
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState(() => localStorage.getItem('personal-control-finance-view') || 'lista');
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('personal-control-finance-tab') || 'DESPESA');
  const [searchTerm, setSearchTerm] = useState('');
  const [responsibles, setResponsibles] = useState([]);
  const [isEmailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedItemForEmail, setSelectedItemForEmail] = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState(null);

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = [2024, 2025, 2026];

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = localStorage.getItem('personal-control-selected-month');
    return saved !== null ? Number(saved) : new Date().getMonth();
  });
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = localStorage.getItem('personal-control-selected-year');
    return saved !== null ? Number(saved) : 2026;
  });

  const [sortConfig, setSortConfig] = useState({ key: 'payment_date', direction: 'asc' });
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    async function fetchNotificationSettings() {
      const { data } = await supabase.from('notification_settings').select('*').maybeSingle();
      if (data) setNotificationSettings(data);
    }
    fetchNotificationSettings();
  }, [refreshKey]);



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
      setFinances(data);
    }
    setLoading(false);
  }, [activeTab, selectedMonth, selectedYear]);

  useEffect(() => {
    localStorage.setItem('personal-control-selected-month', selectedMonth);
    localStorage.setItem('personal-control-selected-year', selectedYear);
    localStorage.setItem('personal-control-finance-tab', activeTab);
    localStorage.setItem('personal-control-finance-view', activeView);
    fetchFinances();
    fetchResponsibles();
  }, [activeTab, activeView, selectedMonth, selectedYear, refreshKey, fetchFinances, fetchResponsibles]);

  const handleDelete = async (id) => {
    confirmToast('Tem certeza que deseja excluir este registro?', async () => {
      const { error } = await supabase.from('finances').delete().eq('id', id);
      if (!error) {
        fetchFinances();
        toast.success('Registro excluído');
      } else {
        toast.error('Erro ao excluir: ' + error.message);
      }
    }, { danger: true });
  };

  const handleMarkAsPaid = async (id) => {
    const { error } = await supabase.from('finances').update({ status: 'PAGO' }).eq('id', id);
    if (!error) {
      fetchFinances();
      if (notificationSettings?.auto_send_on_paid && notificationSettings?.recipient_email) {
        const item = finances.find(f => f.id === id);
        if (item) sendEmailToRecipient(notificationSettings.recipient_email, { ...item, status: 'PAGO' });
      }
    }
  };

  const sendEmailToRecipient = async (recipientEmail, overrideItem = null) => {
    const item = overrideItem || selectedItemForEmail;
    if (!item) return;
    try {
      setEmailLoading(true);
      const { error: fnError } = await supabase.functions.invoke('send-finance-email', {
        body: { to: recipientEmail, subject: `${item.type === 'RECEITA' ? 'Receita' : 'Despesa'} registrada: ${item.description}`, data: item, bcc: notificationSettings?.bcc_email }
      });
      if (fnError) throw fnError;
      await supabase.from('finances').update({ email_sent: true }).eq('id', item.id);
      toast.success(`E-mail enviado para ${recipientEmail}!`);
      fetchFinances();
      setEmailModalOpen(false);
    } catch (err) {
      toast.error(`Erro ao enviar e-mail: ${err.message}`);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleCopyMonth = () => {
    confirmToast(`Deseja copiar todas as transações de ${selectedMonth === 0 ? months[11] : months[selectedMonth - 1]} para o mês atual (${months[selectedMonth]})?`, async () => {
      try {
        setLoading(true);
        const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
        const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
        const start = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
        const end = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-31`;
        const { data: previousData } = await supabase.from('finances').select('*').gte('payment_date', start).lte('payment_date', end);
        if (!previousData || previousData.length === 0) {
          toast.error('Nenhuma transação encontrada no mês anterior.');
          return;
        }
        const newEntries = previousData.map(item => {
          const { id: _id, user_id: _user_id, created_at: _created_at, email_sent: _email_sent, payment_date, ...rest } = item;
          const originalDate = new Date(payment_date);
          const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
          const newDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(Math.min(originalDate.getDate(), lastDayOfMonth)).padStart(2, '0')}`;
          return { ...rest, payment_date: newDate, status: 'PENDENTE' };
        });
        const { error } = await supabase.from('finances').insert(newEntries);
        if (error) throw error;
        toast.success(`${newEntries.length} transações copiadas!`);
        fetchFinances();
      } catch (err) {
        toast.error(`Erro ao copiar: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }, { confirmText: 'Sim, copiar tudo' });
  };
  const handleSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const filteredAndSortedFinances = useMemo(() => {
    let result = finances.filter(item => 
      item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    result.sort((a, b) => {
      if (sortConfig.key === 'amount') return sortConfig.direction === 'asc' ? a.amount - b.amount : b.amount - a.amount;
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [finances, searchTerm, sortConfig]);

  const groupedFinances = useMemo(() => {
    const groups = {};
    filteredAndSortedFinances.forEach(item => {
      const date = item.payment_date || 'Sem Data';
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
    });
    return Object.entries(groups).sort(([a], [b]) => sortConfig.direction === 'asc' ? a.localeCompare(b) : b.localeCompare(a));
  }, [filteredAndSortedFinances, sortConfig.direction]);

  const totalAmount = useMemo(() => {
    return filteredAndSortedFinances.reduce((acc, curr) => acc + Number(curr.amount), 0);
  }, [filteredAndSortedFinances]);

  const formatDate = (dateStr) => {
    if (dateStr === 'Sem Data') return dateStr;
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' });
  };

  const getDayShort = (dateStr) => {
    if (dateStr === 'Sem Data') return '--';
    return dateStr.split('-')[2];
  };

  function handleSendEmail(item) {
    if (notificationSettings?.skip_email_modal && notificationSettings?.recipient_email) {
      setSelectedItemForEmail(item);
      sendEmailToRecipient(notificationSettings.recipient_email, item);
      return;
    }
    setSelectedItemForEmail(item);
    setEmailModalOpen(true);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* HEADER FILTERS */}
      <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="tabs-container" style={{ marginBottom: 0, padding: '4px', background: 'var(--card-action-bg)' }}>
          <button className={`tab-btn ${activeView === 'resumo' ? 'active' : ''}`} onClick={() => setActiveView('resumo')}>Dashboard</button>
          <button className={`tab-btn ${activeView === 'lista' ? 'active' : ''}`} onClick={() => setActiveView('lista')}>Movimentações</button>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'center' : 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--card-action-bg)', padding: '4px', borderRadius: '14px', border: '1px solid var(--glass-border)' }}>
            <select 
              className="select-filter" 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{ border: 'none', background: 'transparent', color: 'var(--text-main)', fontWeight: 700 }}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--card-action-bg)', borderRadius: '14px', padding: '4px', border: '1px solid var(--glass-border)', flex: isMobile ? 1 : 'none' }}>
            <button className="icon-btn" style={{ padding: '8px', border: 'none' }} onClick={() => setSelectedMonth(prev => prev === 0 ? 11 : prev - 1)}><ChevronLeft size={18} /></button>
            <span style={{ flex: 1, minWidth: isMobile ? '0' : '100px', textAlign: 'center', fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{months[selectedMonth]}</span>
            <button className="icon-btn" style={{ padding: '8px', border: 'none' }} onClick={() => setSelectedMonth(prev => prev === 11 ? 0 : prev + 1)}><ChevronRight size={18} /></button>
          </div>

          <button 
            className="btn-primary" 
            onClick={handleCopyMonth} 
            title="Copiar mês anterior" 
            style={{ height: '48px', width: '48px', padding: 0, borderRadius: '14px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', border: '1px solid rgba(99,102,241,0.2)', boxShadow: 'none' }}
          >
            <Copy size={20} />
          </button>
        </div>
      </div>

      {activeView === 'resumo' ? (
        <SummaryDashboard user={user} isGeneral={false} month={selectedMonth} year={selectedYear} refreshKey={refreshKey} showValues={showValues} onToggleValues={onToggleValues} />
      ) : (
        <Motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="glass-card" 
          style={{ padding: isMobile ? '1.25rem' : '2.5rem', minHeight: '60vh' }}
        >
          {/* Sub Header - View Specific */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div className="tabs-container" style={{ padding: '4px', width: isMobile ? '100%' : 'auto', display: 'flex' }}>
              <button 
                className={`tab-btn ${activeTab === 'RECEITA' ? 'active' : ''}`} 
                onClick={() => setActiveTab('RECEITA')} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  flex: isMobile ? 1 : 'none',
                  justifyContent: isMobile ? 'center' : 'flex-start'
                }}
              >
                <div style={{ padding: '4px', background: activeTab === 'RECEITA' ? 'var(--success)' : 'var(--tabs-bg)', borderRadius: '6px', color: activeTab === 'RECEITA' ? 'white' : 'var(--success)' }}>
                  <ArrowUp size={14} /> 
                </div>
                Receitas
              </button>
              <button 
                className={`tab-btn ${activeTab === 'DESPESA' ? 'active' : ''}`} 
                onClick={() => setActiveTab('DESPESA')} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  flex: isMobile ? 1 : 'none',
                  justifyContent: isMobile ? 'center' : 'flex-start'
                }}
              >
                <div style={{ padding: '4px', background: activeTab === 'DESPESA' ? 'var(--danger)' : 'var(--tabs-bg)', borderRadius: '6px', color: activeTab === 'DESPESA' ? 'white' : 'var(--danger)' }}>
                  <ArrowDown size={14} />
                </div>
                Despesas
              </button>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flex: 1, width: isMobile ? '100%' : 'auto', maxWidth: isMobile ? 'none' : '600px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                <input type="text" placeholder="Filtrar por descrição..." className="glass-input" style={{ paddingLeft: '3.25rem', height: '48px', fontSize: '0.95rem', fontWeight: 600 }} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <button 
                className="icon-btn" 
                onClick={() => handleSort('amount')}
                title="Ordenar por valor"
                style={{ height: '48px', width: '48px', border: '1px solid var(--glass-border)', borderRadius: '14px', flexShrink: 0 }}
              >
                <ArrowUpDown size={20} />
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: isMobile ? 'flex-start' : 'center', 
            marginBottom: '3rem', 
            padding: isMobile ? '1rem 1.25rem' : '1.5rem 2rem', 
            background: 'var(--card-action-bg)', 
            borderRadius: '24px', 
            border: '1px solid var(--glass-border)',
            flexDirection: isMobile ? 'column' : 'row',
            gap: '1.25rem'
          }}>
            <div>
              <h2 style={{ fontSize: isMobile ? '1.1rem' : '1.35rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>{activeTab === 'RECEITA' ? 'Fluxo de Receitas' : 'Fluxo de Gastos'}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>{filteredAndSortedFinances.length} registros</span>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted)', opacity: 0.5 }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>{months[selectedMonth]} {selectedYear}</span>
              </div>
            </div>
            <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', display: 'block', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Total Acumulado</span>
              <span style={{ fontSize: isMobile ? '1.5rem' : '1.85rem', fontWeight: 900, color: activeTab === 'RECEITA' ? 'var(--success)' : 'var(--danger)', letterSpacing: '-0.03em' }}>
                {showValues ? `R$ ${totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ ••••••'}
              </span>
            </div>
          </div>

          {/* Transactions List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: '80px', borderRadius: '20px' }} />)
            ) : groupedFinances.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '5rem 2rem', background: 'var(--card-action-bg)', borderRadius: '32px', border: '2px dashed var(--glass-border)' }}>
                <div style={{ width: 80, height: 80, background: 'var(--tabs-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                   <Package size={40} style={{ opacity: 0.2 }} />
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Nenhum registro encontrado</h3>
                <p style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.9rem' }}>Tente ajustar seus filtros ou mude o período selecionado.</p>
              </div>
            ) : (
              groupedFinances.map(([dateStr, items]) => (
                <div key={dateStr} style={{ position: 'relative' }}>
                  {/* Sticky Date Header */}
                  <div style={{ 
                    position: 'sticky', 
                    top: '-1px', 
                    zIndex: 10, 
                    background: 'var(--bg-card)', 
                    padding: '0.75rem 1.5rem', 
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    backdropFilter: 'blur(12px)',
                    margin: isMobile ? '0 -1.25rem' : '0 -2.5rem',
                    borderBottom: '1px solid var(--glass-border)',
                    borderTopLeftRadius: isMobile ? '0' : '20px',
                    borderTopRightRadius: isMobile ? '0' : '20px'
                  }}>
                    <div style={{ 
                      width: '44px', 
                      height: '44px', 
                      borderRadius: '12px', 
                      background: 'var(--stat-balance)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontSize: '1.2rem', 
                      fontWeight: 900, 
                      color: 'var(--primary)', 
                      border: '1px solid rgba(99, 102, 241, 0.2)',
                      boxShadow: '0 4px 12px rgba(99, 102, 241, 0.1)'
                    }}>
                      {getDayShort(dateStr)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'capitalize', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>{formatDate(dateStr).split(',')[0]}</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{formatDate(dateStr).split(',').slice(1).join(',')}</span>
                    </div>
                    <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--glass-border), transparent)' }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {items.map((item) => {
                      const meta = getCategoryMeta(item.category);
                      const CategoryIcon = meta.icon;
                      return (
                        <Motion.div 
                          layout
                          key={item.id}
                          data-testid={`finance-row-${item.description}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          whileHover={isMobile ? {} : { x: 6, background: 'var(--card-action-bg)', borderColor: 'var(--primary)' }}
                          style={{ padding: 0, background: 'none', border: 'none' }}
                        >
                          <div style={{ 
                            display: 'flex', 
                            flexDirection: isMobile ? 'column' : 'row',
                            alignItems: isMobile ? 'flex-start' : 'center', 
                            gap: isMobile ? '1rem' : '1.5rem', 
                            padding: isMobile ? '1.25rem' : '1.5rem 2rem', 
                            borderRadius: '24px', 
                            border: '1px solid var(--glass-border)',
                            background: 'var(--card-action-bg)',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            cursor: 'pointer',
                            position: 'relative'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', width: '100%' }}>
                              <div style={{ 
                                width: isMobile ? '40px' : '48px', 
                                height: isMobile ? '40px' : '48px', 
                                borderRadius: '12px', 
                                background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, 
                                color: meta.color,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: `1px solid color-mix(in srgb, ${meta.color} 20%, transparent)`,
                                flexShrink: 0
                              }}>
                                <CategoryIcon size={isMobile ? 20 : 24} />
                               </div>
                               <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 800, fontSize: isMobile ? '0.95rem' : '1rem', color: 'var(--text-main)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{item.description}</span>
                                  {item.credit_card && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(99, 102, 241, 0.1)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                                      <CreditCard size={10} color="var(--primary)" />
                                      <span style={{ fontSize: '9px', color: 'var(--primary)', fontWeight: 800 }}>CARD</span>
                                    </div>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                                  <div className="cat-chip" style={{ '--cat-color': meta.color, fontSize: '10px', padding: '2px 8px' }}>
                                    {item.category}
                                  </div>
                                  {activeTab === 'DESPESA' && item.paid_by && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                      <User size={12} style={{ opacity: 0.6 }} /> {item.paid_by}
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              {isMobile && (
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ fontWeight: 900, fontSize: '1rem', color: activeTab === 'RECEITA' ? 'var(--success)' : 'var(--text-main)', letterSpacing: '-0.02em' }}>
                                    {showValues ? `${activeTab === 'RECEITA' ? '+' : '-'} R$ ${Number(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ ••••••'}
                                  </div>
                                  <div className={`status-badge ${item.status === 'PAGO' ? 'paid' : 'pending'}`} style={{ marginTop: '0.25rem', fontSize: '9px', padding: '2px 8px' }}>
                                    {item.status === 'PAGO' ? 'PAGO' : 'PENDENTE'}
                                  </div>
                                </div>
                              )}
                            </div>

                            {!isMobile && (
                              <>
                                <div style={{ textAlign: 'right', minWidth: '130px' }}>
                                  <div style={{ fontWeight: 900, fontSize: '1.25rem', color: activeTab === 'RECEITA' ? 'var(--success)' : 'var(--text-main)', letterSpacing: '-0.02em' }}>
                                    {showValues ? `${activeTab === 'RECEITA' ? '+' : '-'} R$ ${Number(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ ••••••'}
                                  </div>
                                  <Motion.span 
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className={`status-badge ${item.status === 'PAGO' ? 'paid' : 'pending'}`} 
                                    onClick={(e) => { e.stopPropagation(); item.status === 'PENDENTE' && handleMarkAsPaid(item.id); }}
                                    style={{ 
                                      cursor: item.status === 'PENDENTE' ? 'pointer' : 'default', 
                                      marginTop: '0.5rem', 
                                      fontSize: '10px',
                                      padding: '4px 10px',
                                      fontWeight: 800,
                                      letterSpacing: '0.02em'
                                    }}
                                  >
                                    {item.status === 'PAGO' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                    {item.status === 'PAGO' ? 'PAGO' : 'PENDENTE'}
                                  </Motion.span>
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem', paddingLeft: '1rem', borderLeft: '1px solid var(--glass-border)' }}>
                                  <button className="action-btn" onClick={(e) => { e.stopPropagation(); handleSendEmail(item); }} title="Enviar E-mail" style={{ color: item.email_sent ? 'var(--primary)' : 'var(--text-muted)' }}><Send size={18} /></button>
                                  {item.status === 'PENDENTE' && (
                                    <button className="action-btn success" onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(item.id); }} title="Marcar como Pago" style={{ color: 'var(--success)' }}><CheckCircle2 size={18} /></button>
                                  )}
                                  <button className="action-btn" onClick={(e) => { e.stopPropagation(); onEdit(item); }} title="Editar"><Edit2 size={18} /></button>
                                  <button className="action-btn danger" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} title="Excluir"><Trash2 size={18} /></button>
                                </div>
                              </>
                            )}

                            {isMobile && (
                              <div style={{ display: 'flex', gap: '0.75rem', width: '100%', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <button className="action-btn" onClick={(e) => { e.stopPropagation(); handleSendEmail(item); }} style={{ color: item.email_sent ? 'var(--primary)' : 'var(--text-muted)' }}><Send size={16} /></button>
                                  <button className="action-btn" onClick={(e) => { e.stopPropagation(); onEdit(item); }}><Edit2 size={16} /></button>
                                  <button className="action-btn danger" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}><Trash2 size={16} /></button>
                                </div>
                                {item.status === 'PENDENTE' && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(item.id); }}
                                    className="action-btn success"
                                    style={{ 
                                      background: 'var(--success)', 
                                      color: 'white', 
                                      borderRadius: '10px', 
                                      padding: '8px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                                    }}
                                    title="Pagar Agora"
                                  >
                                    <CheckCircle2 size={20} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </Motion.div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </Motion.div>
      )}

      {/* Email Selection Modal - Refactored */}
      <AnimatePresence>
        {isEmailModalOpen && (
          <Motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="modal-overlay" 
            onClick={() => setEmailModalOpen(false)}
            style={{ zIndex: 1001 }}
          >
            <Motion.div 
              initial={{ scale: 0.95, y: 20 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.95, y: 20 }}
              className="modal-content glass-card" 
              onClick={e => e.stopPropagation()} 
              style={{ maxWidth: '450px', padding: '2.5rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                   <div style={{ padding: '0.5rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', color: 'var(--primary)' }}>
                      <Mail size={24} />
                   </div>
                   <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.02em' }}>Enviar Comprovante</h3>
                </div>
                <button className="icon-btn" onClick={() => setEmailModalOpen(false)}><X size={20} /></button>
              </div>

              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem', fontWeight: 500 }}>Selecione o responsável que deve receber os detalhes desta transação via e-mail.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {responsibles.map(resp => (
                  <Motion.button 
                    key={resp.id} 
                    whileHover={{ scale: 1.02, background: 'var(--card-action-bg)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => sendEmailToRecipient(resp.email)} 
                    disabled={emailLoading || !resp.email} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '1.25rem', 
                      padding: '1.25rem', 
                      background: 'var(--card-action-bg)',
                      borderRadius: '20px',
                      border: '1px solid var(--glass-border)', 
                      textAlign: 'left', 
                      cursor: 'pointer', 
                      opacity: resp.email ? 1 : 0.5,
                      width: '100%',
                      color: 'inherit'
                    }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: '12px', background: resp.is_main ? 'rgba(99,102,241,0.1)' : 'var(--tabs-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: resp.is_main ? 'var(--primary)' : 'var(--text-muted)' }}>
                      <User size={22} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '1rem', margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {resp.name}
                        {resp.is_main && <span style={{ fontSize: '9px', background: 'var(--primary)', color: 'white', padding: '1px 6px', borderRadius: '4px', fontWeight: 900 }}>FIXO</span>}
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0', fontWeight: 500 }}>{resp.email || 'Sem e-mail cadastrado'}</p>
                    </div>
                    <ChevronRight size={18} style={{ opacity: 0.3 }} />
                  </Motion.button>
                ))}
              </div>
              
              {emailLoading && (
                <Motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }}
                  style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}
                >
                  <div className="spinner" style={{ width: 16, height: 16, border: '2px solid rgba(99,102,241,0.2)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  Processando envio...
                </Motion.div>
              )}
            </Motion.div>
          </Motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

