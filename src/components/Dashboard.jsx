import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import {
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
  List,
  LayoutGrid,
  ChevronRight,
  Coins,
  Bell,
  Search,
  User,
  Shield,
  HelpCircle,
  FileText,
  Mail,
  Smartphone,
  Check,
  Filter
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTranslation } from 'react-i18next';
import FinanceList from './Finance/FinanceList';
import SummaryDashboard from './Finance/SummaryDashboard';
import FinanceSettings from './Finance/FinanceSettings';
import TransactionModal from './Finance/TransactionModal';
import SettingsView from './Settings';
import MyCars from './MyCars/MyCars';
import Investments from './Investments/Investments';
import Trips from './Trips/Trips';
import CustomLists from './CustomLists/CustomLists';
import Launchpad from './Launchpad';
import Footer from './Footer';

const defaultMenuItems = [
  { id: 'launchpad', icon: LayoutGrid, key: 'launchpad' },
  { id: 'finances', icon: Coins, key: 'finances' },
  { id: 'cars', icon: Car, key: 'cars' },
  { id: 'investments', icon: TrendingUp, key: 'investments' },
  { id: 'trips', icon: Plane, key: 'trips' },
  { id: 'lists', icon: List, key: 'lists' },
  { id: 'settings', icon: Settings, key: 'settings' },
];

const moduleSubItems = {
  finances: [
    { tab: 'finances-dashboard', icon: BarChart2, key: 'dashboard' },
    { tab: 'finances-transactions', icon: DollarSign, key: 'transactions' },
    { tab: 'finances-settings', icon: Settings, key: 'settings' },
  ],
  cars: [
    { tab: 'cars-list', icon: Car, key: 'my_cars' },
    { tab: 'cars-settings', icon: Settings, key: 'settings' }
  ],
  investments: [
    { tab: 'investments-dashboard', icon: BarChart2, key: 'dashboard' },
    { tab: 'investments-list', icon: DollarSign, key: 'investment_sheet' },
    { tab: 'investments-settings', icon: Settings, key: 'settings' }
  ],
  trips: [
    { tab: 'trips-list', icon: Globe, key: 'list' },
    { tab: 'trips-itinerary', icon: Calendar, key: 'itineraries' },
    { tab: 'trips-stats', icon: PieChart, key: 'my_journey' },
    { tab: 'trips-settings', icon: Settings, key: 'trip_settings' }
  ],
  lists: [
    { tab: 'lists-manager', icon: List, key: 'manage_lists' },
    { tab: 'lists-settings', icon: Settings, key: 'settings' }
  ],
  settings: [
    { tab: 'settings-general', icon: Settings, key: 'general' },
    { tab: 'settings-security', icon: ShieldCheck, key: 'security' }
  ]
};

export default function Dashboard({ user }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('personal-control-active-tab') || 'launchpad';
  });
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('personal-control-theme') || 'dark';
  });
  const [expandedSections] = useState(() => {
    const saved = localStorage.getItem('personal-control-expanded-sections');
    return saved ? JSON.parse(saved) : {
      finances: true,
      cars: false,
      investments: false,
      trips: false,
      lists: false,
      settings: false,
    };
  });
  const [showValues, setShowValues] = useState(() => {
    const saved = localStorage.getItem('personal-control-show-values');
    return saved !== null ? saved === 'true' : true;
  });
  const [menuOrder, setMenuOrder] = useState(() => {
    const saved = localStorage.getItem('personal-control-menu-order');
    const savedOrder = saved ? JSON.parse(saved) : defaultMenuItems.map(i => i.id);

    // Ensure new items in defaultMenuItems are added to the order
    const currentIds = defaultMenuItems.map(i => i.id);
    const mergedOrder = [...savedOrder];

    currentIds.forEach(id => {
      if (!mergedOrder.includes(id)) {
        mergedOrder.push(id);
      }
    });

    // Remove ids that are no longer in defaultMenuItems
    return mergedOrder.filter(id => currentIds.includes(id));
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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('personal-control-theme', theme);
  }, [theme]);

  const fetchMenuOrder = useCallback(async () => {
    const { data } = await supabase
      .from('notification_settings')
      .select('menu_order')
      .maybeSingle();

    if (data?.menu_order) {
      // Ensure new items in defaultMenuItems are added even to data from Supabase
      const currentIds = defaultMenuItems.map(i => i.id);
      const mergedOrder = [...data.menu_order];

      currentIds.forEach(id => {
        if (!mergedOrder.includes(id)) {
          mergedOrder.push(id);
        }
      });

      // Filter out invalid IDs
      const finalOrder = mergedOrder.filter(id => currentIds.includes(id));
      setMenuOrder(finalOrder);
    }
  }, []);

  const fetchInvitations = useCallback(async () => {
    if (!user) return;
    // invitationCount logic removed as it was only for legacy sidebar
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-dark)', width: '100%' }}>

      {/* ── Main Header ── */}
      <header className="main-header" style={{
        height: isMobile ? '60px' : '70px',
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--glass-border)',
        display: 'flex',
        alignItems: 'center',
        padding: isMobile ? '0 1rem' : '0 2rem',
        gap: isMobile ? '1rem' : '3rem',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        {/* Brand/Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => navigate('launchpad')}>
          <div style={{ width: 38, height: 38, background: 'var(--primary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px var(--primary)' }}>
            <LayoutGrid color="white" size={24} />
          </div>
          {!isMobile && (
            <span style={{ fontWeight: 900, fontSize: '1.25rem', letterSpacing: '-0.03em', color: 'var(--text-main)' }}>
              Personal Control
            </span>
          )}
        </div>

        {/* Primary Nav */}
        <nav style={{ display: 'flex', gap: '0.5rem', flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {menuItems.map(item => {
            const isActive = activeTab === item.id || activeTab.startsWith(item.id);
            return (
              <button
                key={item.id}
                data-testid={`sidebar-group-${item.id}`}
                onClick={() => {
                  if (item.id === 'launchpad') navigate('launchpad');
                  else if (item.id === 'finances') navigate('finances-dashboard');
                  else if (item.id === 'cars') navigate('cars-list');
                  else if (item.id === 'investments') navigate('investments-dashboard');
                  else if (item.id === 'trips') navigate('trips-list');
                  else if (item.id === 'lists') navigate('lists-manager');
                  else if (item.id === 'settings') navigate('settings-general');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  background: isActive ? 'var(--primary)' : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  color: isActive ? 'white' : 'var(--text-muted)',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                }}
              >
                <item.icon size={18} />
                <span className="hide-mobile">{t(`nav.${item.id}`)}</span>
              </button>
            );
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="icon-btn" onClick={() => setShowValues(!showValues)} title={showValues ? "Ocultar Valores" : "Mostrar Valores"}>
              {showValues ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <button className="icon-btn" onClick={toggleTheme} title="Alternar Tema">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingLeft: '1rem', borderLeft: '1px solid var(--glass-border)' }}>
            <div className="hide-mobile" style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>{user?.email?.split('@')[0]}</p>
            </div>
            <div
              onClick={() => supabase.auth.signOut()}
              style={{ width: 35, height: 35, borderRadius: '10px', background: 'linear-gradient(135deg, var(--primary), #818cf8)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '0.9rem' }}>
              {user?.email?.[0]?.toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      {/* ── Contextual Sub-Header ── */}
      {activeTab !== 'launchpad' && (
        <div data-testid="sub-header" className="sub-header-container" style={{
          height: isMobile ? '50px' : '60px',
          background: 'var(--bg-card)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          padding: isMobile ? '0 1rem' : '0 2rem',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          gap: isMobile ? '1.5rem' : '2rem'
        }}>
          <div data-testid="header-title" style={{
            fontSize: isMobile ? '0.75rem' : '0.85rem',
            fontWeight: 800,
            color: 'var(--text-main)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            paddingRight: isMobile ? '1rem' : '2rem',
            borderRight: '1px solid var(--glass-border)',
            display: 'flex',
            alignItems: 'center',
            height: '30px',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}>
            <span data-testid="sub-header-title-text">
              {activeTab.startsWith('finances') ? t('nav.finances') :
                activeTab.startsWith('cars') ? t('nav.cars') :
                activeTab.startsWith('investments') ? t('nav.investments') :
                activeTab.startsWith('trips') ? t('nav.trips') :
                activeTab.startsWith('lists') ? t('nav.lists') :
                activeTab.startsWith('settings') ? t('nav.settings') : ''}
            </span>
          </div>
          {(() => {
            const currentModule = activeTab.split('-')[0];
            const subItems = moduleSubItems[currentModule] || [];
            return (
              <div style={{ display: 'flex', gap: '2rem' }}>
                {subItems.map(item => (
                  <button
                    key={item.tab}
                    data-testid={`sidebar-sub-item-${item.tab}`}
                    onClick={() => setActiveTab(item.tab)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '0.5rem 0',
                      color: activeTab === item.tab ? 'var(--primary)' : 'var(--text-muted)',
                      fontSize: '0.85rem',
                      fontWeight: activeTab === item.tab ? 700 : 500,
                      cursor: 'pointer',
                      borderBottom: activeTab === item.tab ? '2px solid var(--primary)' : '2px solid transparent',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <item.icon size={16} strokeWidth={activeTab === item.tab ? 2.5 : 2} />
                    {t(`nav.sub.${currentModule}.${item.key}`)}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Main Content Area ── */}
      <main style={{ flex: 1, padding: activeTab === 'launchpad' ? 0 : isMobile ? '1rem' : '2rem', overflowY: 'auto', position: 'relative' }}>
        <AnimatePresence mode="wait">
          <Motion.div
            key={activeTab + refreshKey}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.1 }}
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
            {activeTab === 'launchpad' && (
              <Launchpad
                user={user}
                onNavigate={navigate}
                menuItems={menuItems.filter(i => i.id !== 'launchpad')}
                onLogout={() => supabase.auth.signOut()}
              />
            )}
            {activeTab.startsWith('settings') && (
              <SettingsView 
                user={user} 
                menuOrder={menuOrder} 
                setMenuOrder={setMenuOrder} 
                menuItems={defaultMenuItems.map(i => ({ ...i, label: t(`nav.${i.key}`) }))} 
                activeTab={activeTab} 
                theme={theme}
                setTheme={setTheme}
              />
            )}
            {activeTab.startsWith('cars') && (
              <MyCars user={user} refreshKey={refreshKey} mode={activeTab === 'cars-settings' ? 'admin' : 'list'} />
            )}
            {activeTab.startsWith('investments') && (
              <Investments user={user} refreshKey={refreshKey} mode={activeTab.replace('investments-', '')} showValues={showValues} />
            )}
            {activeTab.startsWith('trips') && (
              <Trips user={user} refreshKey={refreshKey} mode={activeTab.replace('trips-', '')} showValues={showValues} />
            )}
            {activeTab.startsWith('lists') && (
              <CustomLists user={user} refreshKey={refreshKey} mode={activeTab.replace('lists-', '')} />
            )}

            {/* Fallback for development */}
            {activeTab !== 'finances-transactions' &&
              activeTab !== 'finances-dashboard' &&
              activeTab !== 'finances-settings' &&
              !activeTab.startsWith('settings') &&
              activeTab !== 'launchpad' &&
              !activeTab.startsWith('cars') &&
              !activeTab.startsWith('trips') &&
              !activeTab.startsWith('lists') &&
              !activeTab.startsWith('investments') && (
                <div className="glass-card" style={{ padding: '4rem', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)' }}>Módulo {activeTab} em desenvolvimento...</p>
                </div>
              )}
          </Motion.div>
        </AnimatePresence>
      </main>
      <Footer />

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
