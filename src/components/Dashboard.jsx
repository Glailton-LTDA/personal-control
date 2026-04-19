import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Plane, 
  Wrench, 
  Settings, 
  LogOut,
  ChevronRight,
  Plus,
  BarChart2,
  DollarSign,
  Car,
  Sun,
  Moon,
  Menu,
  ChevronLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import FinanceList from './FinanceList';
import SummaryDashboard from './SummaryDashboard';
import FinanceSettings from './FinanceSettings';
import TransactionModal from './TransactionModal';
import SettingsView from './Settings';

const menuItems = [
  { id: 'finances', icon: LayoutDashboard, label: 'Finanças' },
  { id: 'investments', icon: TrendingUp, label: 'Investimentos' },
  { id: 'trips', icon: Plane, label: 'Viagens' },
  { id: 'car', icon: Wrench, label: 'Revisão Carro' },
  { id: 'settings', icon: Settings, label: 'Configurações' },
];

export default function Dashboard({ user }) {
  const [activeTab, setActiveTab] = useState('finances-dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [theme, setTheme] = useState('dark');

  const triggerRefresh = () => setRefreshKey(prev => prev + 1);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-dark)' }}>
      {/* Sidebar */}
      <motion.aside 
        animate={{ width: isSidebarOpen ? 260 : 80 }}
        className="glass-card"
        style={{ 
          margin: '1rem', 
          height: 'calc(100vh - 2rem)', 
          position: 'sticky', 
          top: '1rem',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 50
        }}
      >
        <div style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'space-between' : 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ 
              width: 40, height: 40, borderRadius: 10, background: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <LayoutDashboard color="white" size={24} />
            </div>
            {isSidebarOpen && <span style={{ fontWeight: 'bold', fontSize: '1.2rem', whiteSpace: 'nowrap' }}>Personal</span>}
          </div>
          <button 
            className="icon-btn" 
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            style={{ padding: '4px' }}
          >
            {isSidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav style={{ flex: 1, padding: '0.5rem', overflowY: 'hidden' }}>
          <div className="sidebar-group">
            {isSidebarOpen && <small style={{ color: 'var(--text-muted)', padding: '0 1rem', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>Finanças</small>}
            <button 
              className={`nav-btn ${activeTab === 'finances-dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('finances-dashboard')}
              title="Dashboard"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'flex-start' : 'center', gap: '1rem', padding: '0.75rem 1rem', border: 'none', background: activeTab === 'finances-dashboard' ? 'rgba(99, 102, 241, 0.1)' : 'transparent', color: activeTab === 'finances-dashboard' ? 'var(--primary)' : 'var(--text-muted)', borderRadius: '0.75rem', cursor: 'pointer', marginBottom: '0.5rem', transition: 'all 0.2s' }}
            >
              <BarChart2 size={20} /> {isSidebarOpen && <span style={{ whiteSpace: 'nowrap' }}>Dashboard</span>}
            </button>
            <button 
              className={`nav-btn ${activeTab === 'finances-transactions' ? 'active' : ''}`}
              onClick={() => setActiveTab('finances-transactions')}
              title="Transações"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'flex-start' : 'center', gap: '1rem', padding: '0.75rem 1rem', border: 'none', background: activeTab === 'finances-transactions' ? 'rgba(99, 102, 241, 0.1)' : 'transparent', color: activeTab === 'finances-transactions' ? 'var(--primary)' : 'var(--text-muted)', borderRadius: '0.75rem', cursor: 'pointer', marginBottom: '0.5rem', transition: 'all 0.2s' }}
            >
              <DollarSign size={20} /> {isSidebarOpen && <span style={{ whiteSpace: 'nowrap' }}>Transações</span>}
            </button>
            <button 
              className={`nav-btn ${activeTab === 'finances-settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('finances-settings')}
              title="Ajustes"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'flex-start' : 'center', gap: '1rem', padding: '0.75rem 1rem', border: 'none', background: activeTab === 'finances-settings' ? 'rgba(99, 102, 241, 0.1)' : 'transparent', color: activeTab === 'finances-settings' ? 'var(--primary)' : 'var(--text-muted)', borderRadius: '0.75rem', cursor: 'pointer', marginBottom: '0.5rem', transition: 'all 0.2s' }}
            >
              <Settings size={20} /> {isSidebarOpen && <span style={{ whiteSpace: 'nowrap' }}>Ajustes</span>}
            </button>
          </div>

          <div className="sidebar-group" style={{ marginTop: '1rem' }}>
            {isSidebarOpen && <small style={{ color: 'var(--text-muted)', padding: '0 1rem', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>Outros</small>}
            <button 
              className={`nav-btn ${activeTab === 'investments' ? 'active' : ''}`}
              onClick={() => setActiveTab('investments')}
              title="Investimentos"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'flex-start' : 'center', gap: '1rem', padding: '0.75rem 1rem', border: 'none', background: activeTab === 'investments' ? 'rgba(99, 102, 241, 0.1)' : 'transparent', color: activeTab === 'investments' ? 'var(--primary)' : 'var(--text-muted)', borderRadius: '0.75rem', cursor: 'pointer', marginBottom: '0.5rem', transition: 'all 0.2s' }}
            >
              <TrendingUp size={20} /> {isSidebarOpen && <span style={{ whiteSpace: 'nowrap' }}>Investimentos</span>}
            </button>
            <button 
              className={`nav-btn ${activeTab === 'trips' ? 'active' : ''}`}
              onClick={() => setActiveTab('trips')}
              title="Viagens"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'flex-start' : 'center', gap: '1rem', padding: '0.75rem 1rem', border: 'none', background: activeTab === 'trips' ? 'rgba(99, 102, 241, 0.1)' : 'transparent', color: activeTab === 'trips' ? 'var(--primary)' : 'var(--text-muted)', borderRadius: '0.75rem', cursor: 'pointer', marginBottom: '0.5rem', transition: 'all 0.2s' }}
            >
              <Plane size={20} /> {isSidebarOpen && <span style={{ whiteSpace: 'nowrap' }}>Viagens</span>}
            </button>
            <button 
              className={`nav-btn ${activeTab === 'car' ? 'active' : ''}`}
              onClick={() => setActiveTab('car')}
              title="Meu Carro"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'flex-start' : 'center', gap: '1rem', padding: '0.75rem 1rem', border: 'none', background: activeTab === 'car' ? 'rgba(99, 102, 241, 0.1)' : 'transparent', color: activeTab === 'car' ? 'var(--primary)' : 'var(--text-muted)', borderRadius: '0.75rem', cursor: 'pointer', marginBottom: '0.5rem', transition: 'all 0.2s' }}
            >
              <Car size={20} /> {isSidebarOpen && <span style={{ whiteSpace: 'nowrap' }}>Meu Carro</span>}
            </button>
          </div>
        </nav>

        <div style={{ padding: '0.5rem', borderTop: '1px solid var(--glass-border)' }}>
          <button
            onClick={() => supabase.auth.signOut()}
            title="Sair"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isSidebarOpen ? 'flex-start' : 'center',
              gap: '1rem',
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'transparent',
              color: 'var(--danger)',
              cursor: 'pointer'
            }}
          >
            <LogOut size={22} />
            {isSidebarOpen && <span>Sair</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
        <header style={{ 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
          marginBottom: '2rem', padding: '0.5rem' 
        }}>
          <div>
            <h2 style={{ fontSize: '1.5rem' }}>{menuItems.find(i => i.id === activeTab)?.label || 'Dashboard'}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Gerencie seus dados aqui</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button className="icon-btn" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            {activeTab === 'finances-transactions' && (
              <button className="btn-primary desktop-only" onClick={() => {
                setEditingTransaction(null);
                setModalOpen(true);
              }}>
                <Plus size={20} /> Novo Registro
              </button>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab + refreshKey}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {activeTab === 'finances-dashboard' && <SummaryDashboard refreshKey={refreshKey} isGeneral={true} />}
            {activeTab === 'finances-transactions' && (
              <FinanceList 
                refreshKey={refreshKey} 
                onEdit={(item) => {
                  setEditingTransaction(item);
                  setModalOpen(true);
                }}
              />
            )}
            {activeTab === 'finances-settings' && <FinanceSettings refreshKey={refreshKey} />}
            {activeTab === 'app-menu' && (
              <AppMenuGrid onNavigate={(tab) => setActiveTab(tab)} menuItems={menuItems} onLogout={() => supabase.auth.signOut()} />
            )}
            {activeTab === 'settings' && <SettingsView user={user} />}
            {activeTab !== 'finances-transactions' && activeTab !== 'finances-dashboard' && activeTab !== 'settings' && activeTab !== 'app-menu' && (
              <div className="glass-card" style={{ padding: '4rem', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)' }}>Módulo {activeTab} em desenvolvimento...</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

        <TransactionModal 
          isOpen={isModalOpen} 
          onClose={() => {
            setModalOpen(false);
            setEditingTransaction(null);
          }} 
          onRefresh={triggerRefresh}
          user={user}
          initialData={editingTransaction}
        />

        {/* Bottom Navigation for App Experience */}
        <nav className="bottom-nav">
          <button 
            className={`nav-item-mobile ${activeTab === 'finances-dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('finances-dashboard')}
          >
            <BarChart2 size={24} />
            <span>Resumo</span>
          </button>
          
          <button 
            className={`nav-item-mobile ${activeTab === 'finances-transactions' ? 'active' : ''}`}
            onClick={() => setActiveTab('finances-transactions')}
          >
            <DollarSign size={24} />
            <span>Faturas</span>
          </button>

          <button className="fab-button" onClick={() => {
            setEditingTransaction(null);
            setModalOpen(true);
          }}>
            <Plus size={32} />
          </button>

          <button 
            className={`nav-item-mobile ${activeTab === 'finances-settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('finances-settings')}
          >
            <Settings size={24} />
            <span>Ajustes</span>
          </button>

          <button 
            className={`nav-item-mobile ${activeTab === 'app-menu' ? 'active' : ''}`}
            onClick={() => setActiveTab('app-menu')}
          >
            <LayoutDashboard size={24} />
            <span>Menu</span>
          </button>
        </nav>
    </div>
  );
}

function AppMenuGrid({ onNavigate, menuItems, onLogout }) {
  const extraItems = [
    { id: 'profile', icon: Settings, label: 'Perfil e Conta', color: '#8b5cf6' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', padding: '1rem' }}>
      {menuItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          className="glass-card"
          style={{ 
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', 
            padding: '2rem 1rem', border: 'none', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          <div style={{ 
            width: 50, height: 50, borderRadius: 15, background: 'rgba(99, 102, 241, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)'
          }}>
            <item.icon size={28} />
          </div>
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'white' }}>{item.label}</span>
        </button>
      ))}
      <button
        onClick={onLogout}
        className="glass-card"
        style={{ 
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', 
          padding: '2rem 1rem', border: 'none', cursor: 'pointer', color: 'var(--danger)'
        }}
      >
        <div style={{ 
          width: 50, height: 50, borderRadius: 15, background: 'rgba(239, 68, 68, 0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <LogOut size={28} />
        </div>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Sair</span>
      </button>
    </div>
  );
}
