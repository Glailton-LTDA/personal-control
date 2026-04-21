import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  TrendingUp,
  Plane,
  Wrench,
  Settings,
  LogOut,
  Plus,
  BarChart2,
  DollarSign,
  Car,
  Sun,
  Moon,
  Menu,
  X,
  ChevronLeft,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import FinanceList from './Finance/FinanceList';
import SummaryDashboard from './Finance/SummaryDashboard';
import FinanceSettings from './Finance/FinanceSettings';
import TransactionModal from './Finance/TransactionModal';
import SettingsView from './Settings';
import MyCars from './MyCars/MyCars';
import Investments from './Investments/Investments';

const menuItems = [
  { id: 'finances', icon: LayoutDashboard, label: 'Finanças' },
  { id: 'investments', icon: TrendingUp, label: 'Investimentos' },
  { id: 'trips', icon: Plane, label: 'Viagens' },
  { id: 'cars', icon: Car, label: 'Meus Carros' },
  { id: 'settings', icon: Settings, label: 'Configurações' },
];

export default function Dashboard({ user }) {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('personal-control-active-tab') || 'finances-dashboard';
  });
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [theme, setTheme] = useState('dark');
  const [invitationCount, setInvitationCount] = useState(0);
  const drawerRef = useRef(null);

  const triggerRefresh = () => setRefreshKey(prev => prev + 1);

  useEffect(() => {
    localStorage.setItem('personal-control-active-tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (user) {
      fetchInvitations();
    }
  }, [user, refreshKey]);

  async function fetchInvitations() {
    const { count } = await supabase
      .from('car_shares')
      .select('*', { count: 'exact', head: true })
      .eq('shared_with_email', user.email)
      .eq('status', 'PENDING');
    setInvitationCount(count || 0);
  }

  // Close drawer when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (isDrawerOpen && drawerRef.current && !drawerRef.current.contains(e.target)) {
        setDrawerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDrawerOpen]);

  const navigate = (tab) => {
    setActiveTab(tab);
    setDrawerOpen(false);
  };

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const navBtnStyle = (tabId) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 1rem',
    border: 'none',
    background: activeTab === tabId ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
    color: activeTab === tabId ? 'var(--primary)' : 'var(--text-muted)',
    borderRadius: '0.75rem',
    cursor: 'pointer',
    marginBottom: '0.5rem',
    transition: 'all 0.2s',
    textAlign: 'left',
  });

  const SidebarContent = ({ collapsed = false, onNavigate }) => (
    <>
      <nav style={{ flex: 1, padding: '0.5rem', overflowY: 'auto' }}>
        <div className="sidebar-group">
          {!collapsed && <small style={{ color: 'var(--text-muted)', padding: '0 1rem', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>Finanças</small>}
          {[
            { tab: 'finances-dashboard', icon: BarChart2, label: 'Dashboard' },
            { tab: 'finances-transactions', icon: DollarSign, label: 'Transações' },
            { tab: 'finances-settings', icon: Settings, label: 'Ajustes' },
          ].map(({ tab, icon: Icon, label }) => (
            <button key={tab} onClick={() => onNavigate(tab)} title={label}
              style={{ ...navBtnStyle(tab), justifyContent: collapsed ? 'center' : 'flex-start' }}>
              <Icon size={20} />
              {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
            </button>
          ))}
        </div>

        <div className="sidebar-group" style={{ marginTop: '1rem' }}>
          {!collapsed && <small style={{ color: 'var(--text-muted)', padding: '0 1rem', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>Meus Carros</small>}
          {[
            { tab: 'cars-list', icon: Car, label: 'Carros' },
            { tab: 'cars-settings', icon: Wrench, label: 'Ajustes' },
          ].map(({ tab, icon: Icon, label }) => (
            <button key={tab} onClick={() => onNavigate(tab)} title={label}
              style={{ ...navBtnStyle(tab), justifyContent: collapsed ? 'center' : 'flex-start' }}>
              <div style={{ position: 'relative' }}>
                <Icon size={20} />
                {tab === 'cars-list' && invitationCount > 0 && (
                  <span style={{ position: 'absolute', top: -5, right: -5, background: 'var(--danger)', color: 'white', borderRadius: '50%', width: 14, height: 14, fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-sidebar)' }}>
                    {invitationCount}
                  </span>
                )}
              </div>
              {!collapsed && (
                <span style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {label}
                  {tab === 'cars-list' && invitationCount > 0 && <span style={{ fontSize: '0.65rem', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', padding: '1px 6px', borderRadius: '4px' }}>Novo</span>}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="sidebar-group" style={{ marginTop: '1rem' }}>
          {!collapsed && <small style={{ color: 'var(--text-muted)', padding: '0 1rem', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>Investimentos</small>}
          {[
            { tab: 'investments-dashboard', icon: BarChart2, label: 'Dashboard' },
            { tab: 'investments-list', icon: TrendingUp, label: 'Planilha de Investimentos' },
            { tab: 'investments-settings', icon: Settings, label: 'Ajustes' },
          ].map(({ tab, icon: Icon, label }) => (
            <button key={tab} onClick={() => onNavigate(tab)} title={label}
              style={{ ...navBtnStyle(tab), justifyContent: collapsed ? 'center' : 'flex-start' }}>
              <Icon size={20} />
              {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
            </button>
          ))}
        </div>

        <div className="sidebar-group" style={{ marginTop: '1rem' }}>
          {!collapsed && <small style={{ color: 'var(--text-muted)', padding: '0 1rem', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>Outros</small>}
          {[
            { tab: 'trips', icon: Plane, label: 'Viagens' },
          ].map(({ tab, icon: Icon, label }) => (
            <button key={tab} onClick={() => onNavigate(tab)} title={label}
              style={{ ...navBtnStyle(tab), justifyContent: collapsed ? 'center' : 'flex-start' }}>
              <Icon size={20} />
              {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
            </button>
          ))}
        </div>
      </nav>

      <div style={{ padding: '0.5rem', borderTop: '1px solid var(--glass-border)' }}>
        <button
          onClick={() => supabase.auth.signOut()}
          title="Sair"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: '1rem', padding: '0.75rem 1rem', border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', borderRadius: '0.75rem' }}
        >
          <LogOut size={22} />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-dark)' }}>

      {/* ── Desktop Sidebar ── */}
      <motion.aside
        animate={{ width: isSidebarOpen ? 260 : 80 }}
        className="glass-card"
        style={{ margin: '1rem', height: 'calc(100vh - 2rem)', position: 'sticky', top: '1rem', display: 'flex', flexDirection: 'column', zIndex: 50 }}
      >
        <div style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'space-between' : 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <LayoutDashboard color="white" size={24} />
            </div>
            {isSidebarOpen && <span style={{ fontWeight: 'bold', fontSize: '1.2rem', whiteSpace: 'nowrap' }}>Personal</span>}
          </div>
          <button className="icon-btn" onClick={() => setSidebarOpen(!isSidebarOpen)} style={{ padding: '4px' }}>
            {isSidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <SidebarContent collapsed={!isSidebarOpen} onNavigate={navigate} />
      </motion.aside>

      {/* ── Mobile Drawer Overlay ── */}
      <AnimatePresence>
        {isDrawerOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, backdropFilter: 'blur(4px)' }}
            onClick={() => setDrawerOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDrawerOpen && (
          <motion.div
            key="drawer"
            ref={drawerRef}
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="glass-card"
            style={{
              position: 'fixed', top: 0, left: 0, bottom: 0,
              width: 280, zIndex: 300, display: 'flex', flexDirection: 'column',
              borderRadius: '0 1rem 1rem 0', padding: '0', overflow: 'hidden'
            }}
          >
            {/* Drawer header */}
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LayoutDashboard color="white" size={20} />
                </div>
                <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Personal</span>
              </div>
              <button className="icon-btn" onClick={() => setDrawerOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {/* Drawer user info */}
            <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 700, flexShrink: 0 }}>
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</span>
            </div>

            <SidebarContent collapsed={false} onNavigate={(tab) => { navigate(tab); setDrawerOpen(false); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Hamburger — mobile only */}
            <button
              className="icon-btn mobile-only"
              onClick={() => setDrawerOpen(true)}
              style={{ display: 'none' }} // overridden by .mobile-only CSS
            >
              <Menu size={24} />
            </button>
            <div>
              <h2 style={{ fontSize: '1.5rem' }}>
                {activeTab === 'cars-list' ? 'Meus Carros' :
                  activeTab === 'cars-settings' ? 'Configurações da Frota' :
                    activeTab === 'investments-dashboard' ? 'Dashboard de Investimentos' :
                      activeTab === 'investments-list' ? 'Planilha de Investimentos' :
                        activeTab === 'investments-settings' ? 'Ajustes de Investimentos' :
                          menuItems.find(i => i.id === activeTab)?.label ||
                          menuItems.find(i => i.id === activeTab.split('-')[0])?.label || 'Dashboard'}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Gerencie seus dados aqui</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button className="icon-btn" onClick={toggleTheme} title="Alternar Tema">
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab + refreshKey}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {activeTab === 'finances-dashboard' && <SummaryDashboard user={user} refreshKey={refreshKey} isGeneral={true} />}
            {activeTab === 'finances-transactions' && (
              <FinanceList
                user={user}
                refreshKey={refreshKey}
                onEdit={(item) => { setEditingTransaction(item); setModalOpen(true); }}
              />
            )}
            {activeTab === 'finances-settings' && <FinanceSettings user={user} refreshKey={refreshKey} />}
            {activeTab === 'app-menu' && (
              <AppMenuGrid onNavigate={(tab) => setActiveTab(tab)} menuItems={menuItems} onLogout={() => supabase.auth.signOut()} />
            )}
            {activeTab === 'settings' && <SettingsView user={user} />}
            {activeTab.startsWith('cars') && (
              <MyCars user={user} refreshKey={refreshKey} mode={activeTab === 'cars-settings' ? 'admin' : 'list'} />
            )}
            {activeTab.startsWith('investments') && (
              <Investments user={user} refreshKey={refreshKey} mode={activeTab.replace('investments-', '')} />
            )}
            {activeTab !== 'finances-transactions' &&
              activeTab !== 'finances-dashboard' &&
              activeTab !== 'finances-settings' &&
              activeTab !== 'settings' &&
              activeTab !== 'app-menu' &&
              !activeTab.startsWith('cars') &&
              !activeTab.startsWith('investments') && (
                <div className="glass-card" style={{ padding: '4rem', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)' }}>Módulo {activeTab} em desenvolvimento...</p>
                </div>
              )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Contextual FAB ── */}
      <AnimatePresence>
        {(activeTab.includes('finance') || activeTab === 'cars-list') && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="contextual-fab"
            onClick={() => {
              if (activeTab.includes('finance')) {
                setEditingTransaction(null);
                setModalOpen(true);
              } else if (activeTab === 'cars-list') {
                // We'll use a custom event to communicate with MyCars component
                window.dispatchEvent(new CustomEvent('open-add-car-modal'));
              }
            }}
            title={activeTab.includes('finance') ? "Nova Transação" : "Novo Carro"}
          >
            <Plus size={32} />
          </motion.button>
        )}
      </AnimatePresence>

      <TransactionModal
        isOpen={isModalOpen}
        onClose={() => { setModalOpen(false); setEditingTransaction(null); }}
        onRefresh={triggerRefresh}
        user={user}
        initialData={editingTransaction}
      />

    </div>
  );
}

function AppMenuGrid({ onNavigate, menuItems, onLogout }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', padding: '1rem' }}>
      {menuItems.map((item) => (
        <button
          key={item.id}
          onClick={() => {
            if (item.id === 'finances') onNavigate('finances-dashboard');
            else if (item.id === 'cars') onNavigate('cars-list');
            else onNavigate(item.id);
          }}
          className="glass-card"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem 1rem', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          <div style={{ width: 50, height: 50, borderRadius: 15, background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
            <item.icon size={28} />
          </div>
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'white' }}>{item.label}</span>
        </button>
      ))}
      <button
        onClick={onLogout}
        className="glass-card"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem 1rem', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}
      >
        <div style={{ width: 50, height: 50, borderRadius: 15, background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LogOut size={28} />
        </div>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Sair</span>
      </button>
    </div>
  );
}
