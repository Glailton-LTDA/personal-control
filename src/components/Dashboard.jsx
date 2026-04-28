import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
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
  ChevronDown,
  Eye,
  EyeOff,
  Calendar,
  Globe,
  PieChart,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import FinanceList from './Finance/FinanceList';
import SummaryDashboard from './Finance/SummaryDashboard';
import FinanceSettings from './Finance/FinanceSettings';
import TransactionModal from './Finance/TransactionModal';
import SettingsView from './Settings';
import MyCars from './MyCars/MyCars';
import Investments from './Investments/Investments';
import Trips from './Trips/Trips';

const defaultMenuItems = [
  { id: 'finances', icon: LayoutDashboard, label: 'Finanças' },
  { id: 'cars', icon: Car, label: 'Carros' },
  { id: 'investments', icon: TrendingUp, label: 'Investimentos' },
  { id: 'trips', icon: Plane, label: 'Minhas Viagens' },
  { id: 'settings', icon: Settings, label: 'Configurações' },
];

const moduleSubItems = {
  finances: [
    { tab: 'finances-dashboard', icon: BarChart2, label: 'Dashboard' },
    { tab: 'finances-transactions', icon: DollarSign, label: 'Transações' },
    { tab: 'finances-settings', icon: Settings, label: 'Ajustes' },
  ],
  cars: [
    { tab: 'cars-list', icon: Car, label: 'Meus Carros' },
    { tab: 'cars-settings', icon: Settings, label: 'Ajustes' }
  ],
  investments: [
    { tab: 'investments-dashboard', icon: BarChart2, label: 'Dashboard' },
    { tab: 'investments-list', icon: TrendingUp, label: 'Planilha de Investimentos' },
    { tab: 'investments-settings', icon: Settings, label: 'Ajustes' }
  ],
  trips: [
    { tab: 'trips-list', icon: Globe, label: 'Listagem' },
    { tab: 'trips-itinerary', icon: Calendar, label: 'Roteiros' },
    { tab: 'trips-stats', icon: PieChart, label: 'Minha Jornada' },
    { tab: 'trips-settings', icon: Settings, label: 'Ajustes de Viagens' }
  ],
  settings: [
    { tab: 'settings-general', icon: Settings, label: 'Geral' },
    { tab: 'settings-security', icon: ShieldCheck, label: 'Segurança' }
  ]
};

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
  const [expandedSections, setExpandedSections] = useState(() => {
    const saved = localStorage.getItem('personal-control-expanded-sections');
    return saved ? JSON.parse(saved) : {
      finances: true,
      cars: false,
      investments: false,
      trips: false,
      settings: false,
    };
  });
  const [showValues, setShowValues] = useState(() => {
    const saved = localStorage.getItem('personal-control-show-values');
    return saved !== null ? saved === 'true' : true;
  });
  const [menuOrder, setMenuOrder] = useState(() => {
    const saved = localStorage.getItem('personal-control-menu-order');
    return saved ? JSON.parse(saved) : defaultMenuItems.map(i => i.id);
  });
  const drawerRef = useRef(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1100);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1100);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const menuItems = menuOrder.map(id => defaultMenuItems.find(i => i.id === id)).filter(Boolean);

  useEffect(() => {
    localStorage.setItem('personal-control-menu-order', JSON.stringify(menuOrder));
  }, [menuOrder]);

  useEffect(() => {
    localStorage.setItem('personal-control-active-tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('personal-control-show-values', showValues);
  }, [showValues]);

  useEffect(() => {
    localStorage.setItem('personal-control-expanded-sections', JSON.stringify(expandedSections));
  }, [expandedSections]);

  const triggerRefresh = () => setRefreshKey(prev => prev + 1);

  const toggleSection = (section) => {
    const isExpanding = !expandedSections[section];
    setExpandedSections(prev => ({ ...prev, [section]: isExpanding }));
    
    if (isExpanding) {
      const subItems = moduleSubItems[section] || [];
      if (subItems.length > 0) {
        setActiveTab(subItems[0].tab);
      }
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const fetchMenuOrder = useCallback(async () => {
    const { data } = await supabase
      .from('notification_settings')
      .select('menu_order')
      .single();
    
    if (data?.menu_order) {
      setMenuOrder(data.menu_order);
    }
  }, []);

  const fetchInvitations = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from('car_shares')
      .select('*', { count: 'exact', head: true })
      .eq('shared_with_email', user.email)
      .eq('status', 'PENDING');
    setInvitationCount(count || 0);
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchInvitations();
      fetchMenuOrder();
    }
  }, [user, refreshKey, fetchInvitations, fetchMenuOrder]);

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

  useEffect(() => {
    const handleNavigate = (e) => {
      if (e.detail?.tripId) {
        localStorage.setItem('pc_selected_trip_v1', e.detail.tripId);
      }
      // Força o refresh para garantir que o componente Trips remonte 
      // mesmo que já estejamos em uma aba de trips, evitando de-sync do currentView
      triggerRefresh();
      navigate('trips-itinerary');
    };
    
    const handleSetTab = (e) => {
      if (e.detail?.tab) navigate(e.detail.tab);
    };

    window.addEventListener('navigate-to-itinerary', handleNavigate);
    window.addEventListener('set-active-tab', handleSetTab);
    
    return () => {
      window.removeEventListener('navigate-to-itinerary', handleNavigate);
      window.removeEventListener('set-active-tab', handleSetTab);
    };
  }, []);

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
        {menuItems.map((module, idx) => {
          const subItems = moduleSubItems[module.id] || [];
          const isExpanded = expandedSections[module.id] || false;
          
          return (
            <div key={module.id} className="sidebar-group" style={{ marginTop: idx === 0 ? 0 : '1rem' }}>
              {!collapsed && (
                <button
                  type="button"
                  data-testid={`sidebar-group-${module.id}`}
                  aria-label={module.label}
                  onClick={() => toggleSection(module.id)}
                  className="sidebar-group-header"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 1rem',
                    marginBottom: '0.5rem',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    borderRadius: '8px',
                    transition: 'var(--transition)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <module.icon size={18} />
                    <small style={{ fontSize: '0.85rem', fontWeight: 600 }}>{module.label}</small>
                  </div>
                  <Motion.div animate={{ rotate: isExpanded ? 0 : -90 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={14} />
                  </Motion.div>
                </button>
              )}
              <AnimatePresence initial={false}>
                {(isExpanded || collapsed) && (
                  <Motion.div
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    {subItems.map((item) => (
                      <button key={item.tab} onClick={() => onNavigate(item.tab)} title={item.label}
                        style={{ ...navBtnStyle(item.tab), justifyContent: collapsed ? 'center' : 'flex-start' }}>
                        <div style={{ position: 'relative' }}>
                          <item.icon size={20} />
                          {item.tab === 'cars-list' && invitationCount > 0 && (
                            <span style={{ position: 'absolute', top: -5, right: -5, background: 'var(--danger)', color: 'white', borderRadius: '50%', width: 14, height: 14, fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-sidebar)' }}>
                              {invitationCount}
                            </span>
                          )}
                        </div>
                        {!collapsed && (
                          <span style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {item.label}
                            {item.tab === 'cars-list' && invitationCount > 0 && <span style={{ fontSize: '0.65rem', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', padding: '1px 6px', borderRadius: '4px' }}>Novo</span>}
                          </span>
                        )}
                      </button>
                    ))}
                  </Motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      <div style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: collapsed ? '0' : '0.75rem', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <div style={{ 
            width: 32, height: 32, borderRadius: '50%', 
            background: 'rgba(99,102,241,0.2)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 700, 
            flexShrink: 0 
          }}>
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          {!collapsed && (
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <p style={{ 
                fontSize: '0.75rem', 
                fontWeight: 600, 
                color: 'var(--text-main)', 
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {user?.email?.split('@')[0]}
              </p>
              <p style={{ 
                fontSize: '0.65rem', 
                color: 'var(--text-muted)', 
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {user?.email}
              </p>
            </div>
          )}
        </div>
      </div>

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
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-dark)', width: '100%', overflowX: 'hidden', position: 'relative' }}>

      {/* ── Desktop Sidebar ── */}
      <Motion.aside
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
      </Motion.aside>

      {/* ── Mobile Drawer Overlay ── */}
      <AnimatePresence>
        {isDrawerOpen && (
          <Motion.div
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
          <Motion.div
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


            <SidebarContent collapsed={false} onNavigate={(tab) => { navigate(tab); setDrawerOpen(false); }} />
          </Motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, padding: isMobile ? '0.5rem' : '1rem', overflowY: 'auto', overflowX: 'hidden', width: '100%', minWidth: 0 }}>
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
              <h2 data-testid="header-title" style={{ fontSize: '1.5rem' }}>
                {activeTab === 'cars-list' ? 'Meus Carros' :
                 activeTab === 'cars-settings' ? 'Configurações da Frota' :
                 activeTab === 'investments-dashboard' ? 'Dashboard de Investimentos' :
                 activeTab === 'investments-list' ? 'Planilha de Investimentos' :
                 activeTab === 'investments-settings' ? 'Ajustes de Investimentos' :
                 activeTab === 'trips-list' ? 'Minhas Viagens' :
                 activeTab === 'trips-itinerary' ? 'Roteiros' :
                 activeTab === 'trips-stats' ? 'Minha Jornada' :
                 activeTab === 'trips-settings' ? 'Ajustes de Viagens' :
                 menuItems.find(i => i.id === activeTab)?.label ||
                 menuItems.find(i => i.id === (String(activeTab || '').split('-')[0]))?.label || 'Dashboard'}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Gerencie seus dados aqui</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button className="icon-btn" onClick={() => setShowValues(!showValues)} title={showValues ? "Ocultar Valores" : "Mostrar Valores"}>
              {showValues ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
            <button className="icon-btn" onClick={toggleTheme} title="Alternar Tema">
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        <AnimatePresence>
          <Motion.div
            key={activeTab + refreshKey}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {activeTab === 'finances-dashboard' && <SummaryDashboard user={user} refreshKey={refreshKey} isGeneral={true} showValues={showValues} onToggleValues={() => setShowValues(!showValues)} />}
            {activeTab === 'finances-transactions' && (
              <FinanceList
                user={user}
                refreshKey={refreshKey}
                showValues={showValues}
                onEdit={(item) => { setEditingTransaction(item); setModalOpen(true); }}
                onToggleValues={() => setShowValues(!showValues)}
              />
            )}
            {activeTab === 'finances-settings' && <FinanceSettings user={user} refreshKey={refreshKey} showValues={showValues} />}
            {activeTab === 'app-menu' && (
              <AppMenuGrid onNavigate={(tab) => setActiveTab(tab)} menuItems={menuItems} onLogout={() => supabase.auth.signOut()} />
            )}
            {activeTab.startsWith('settings') && <SettingsView user={user} menuOrder={menuOrder} setMenuOrder={setMenuOrder} menuItems={defaultMenuItems} />}
            {activeTab.startsWith('cars') && (
              <MyCars user={user} refreshKey={refreshKey} mode={activeTab === 'cars-settings' ? 'admin' : 'list'} />
            )}
            {activeTab.startsWith('investments') && (
              <Investments user={user} refreshKey={refreshKey} mode={activeTab.replace('investments-', '')} showValues={showValues} />
            )}
            {activeTab.startsWith('trips') && (
              <Trips user={user} refreshKey={refreshKey} mode={activeTab.replace('trips-', '')} showValues={showValues} />
            )}
            {activeTab !== 'finances-transactions' &&
              activeTab !== 'finances-dashboard' &&
              activeTab !== 'finances-settings' &&
              !activeTab.startsWith('settings') &&
              activeTab !== 'app-menu' &&
              !activeTab.startsWith('cars') &&
              !activeTab.startsWith('trips') &&
              !activeTab.startsWith('investments') && (
                <div className="glass-card" style={{ padding: '4rem', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)' }}>Módulo {activeTab} em desenvolvimento...</p>
                </div>
              )}
          </Motion.div>
        </AnimatePresence>
      </main>

      {/* ── Contextual FAB ── */}
      <AnimatePresence>
        {(activeTab.includes('finance') || activeTab === 'cars-list') && (
          <Motion.button
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
          </Motion.button>
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
