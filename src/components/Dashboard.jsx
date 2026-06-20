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
  Filter,
  Music as MusicIcon
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
import MarkdownNotes from './CustomLists/MarkdownNotes';
import Music from './Music/Music';
import Launchpad from './Launchpad';
import Footer from './Footer';
import { useRouter } from '../hooks/useRouter';

const defaultMenuItems = [
  { id: 'launchpad', icon: LayoutGrid, key: 'launchpad' },
  { id: 'finances', icon: Coins, key: 'finances' },
  { id: 'cars', icon: Car, key: 'cars' },
  { id: 'investments', icon: TrendingUp, key: 'investments' },
  { id: 'trips', icon: Plane, key: 'trips' },
  { id: 'lists', icon: List, key: 'lists' },
  { id: 'music', icon: MusicIcon, key: 'music' },
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
    { tab: 'lists-notes', icon: FileText, key: 'notes' },
    { tab: 'lists-settings', icon: Settings, key: 'settings' }
  ],
  music: [
    { tab: 'music-repertoire', icon: MusicIcon, key: 'repertoire' },
    { tab: 'music-setlists', icon: List, key: 'setlists' },
    { tab: 'music-settings', icon: Settings, key: 'settings' }
  ],
  settings: [
    { tab: 'settings-general', icon: Settings, key: 'general' },
    { tab: 'settings-security', icon: ShieldCheck, key: 'security' }
  ]
};

const getModuleInitialTab = (id) => {
  if (id === 'launchpad') return 'launchpad';
  if (id === 'finances') return 'finances-dashboard';
  if (id === 'cars') return 'cars-list';
  if (id === 'investments') return 'investments-dashboard';
  if (id === 'trips') return 'trips-list';
  if (id === 'lists') return 'lists-manager';
  if (id === 'music') return 'music-repertoire';
  if (id === 'settings') return 'settings-general';
  return id;
};

export default function Dashboard({ user }) {
  const { t } = useTranslation();
  const { currentPath: activeTab, navigate: routerNavigate } = useRouter('launchpad');
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
  const [visibleModules, setVisibleModules] = useState(() => {
    const saved = localStorage.getItem('personal-control-visible-modules');
    return saved ? JSON.parse(saved) : defaultMenuItems.map(i => i.id);
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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth < 1024);
  const [isBottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [isSidebarExpanded, setSidebarExpanded] = useState(false);

  const navigate = useCallback((tab) => {
    routerNavigate(tab);
    setDrawerOpen(false);
    setBottomSheetOpen(false);
    setSidebarExpanded(false);
  }, [routerNavigate]);

  const handleNavClick = useCallback((e, tab) => {
    if (!e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      navigate(tab);
    }
  }, [navigate]);

  const handleTabletNavClick = useCallback((e, tab) => {
    if (!isSidebarExpanded) {
      e.preventDefault();
      e.stopPropagation();
      setSidebarExpanded(true);
    } else {
      handleNavClick(e, tab);
    }
  }, [isSidebarExpanded, handleNavClick]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const menuItems = menuOrder.map(id => defaultMenuItems.find(i => i.id === id)).filter(Boolean);

  useEffect(() => {
    localStorage.setItem('personal-control-menu-order', JSON.stringify(menuOrder));
  }, [menuOrder]);

  useEffect(() => {
    localStorage.setItem('personal-control-show-values', showValues);
  }, [showValues]);

  useEffect(() => {
    localStorage.setItem('personal-control-visible-modules', JSON.stringify(visibleModules));
  }, [visibleModules]);

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
      .select('menu_order, visible_modules')
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

    if (data?.visible_modules) {
      const currentVisible = new Set(data.visible_modules);
      currentVisible.add('launchpad');
      currentVisible.add('settings');
      setVisibleModules(Array.from(currentVisible));
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
  }, [navigate]);

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
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        {/* Brand/Logo */}
        <a
          href="/launchpad"
          onClick={(e) => handleNavClick(e, 'launchpad')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', textDecoration: 'none', flexShrink: 0 }}
        >
          <div style={{ width: 38, height: 38, background: 'var(--primary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px var(--primary)' }}>
            <LayoutGrid color="white" size={24} />
          </div>
          {!isMobile && (
            <span style={{ fontWeight: 900, fontSize: '1.25rem', letterSpacing: '-0.03em', color: 'var(--text-main)' }}>
              Personal Control
            </span>
          )}
        </a>

        {/* Primary Nav (Desktop only) */}
        {!isMobile && !isTablet && (
          <nav style={{ display: 'flex', gap: '0.5rem', flex: 1, justifyContent: 'center', overflowX: 'auto', scrollbarWidth: 'none', padding: '0 1rem' }}>
            {menuItems.filter(item => visibleModules.includes(item.id)).map(item => {
              const isActive = activeTab === item.id || activeTab.startsWith(item.id);
              const targetTab = getModuleInitialTab(item.id);
              return (
                <a
                  key={item.id}
                  href={`/${targetTab}`}
                  data-testid={`sidebar-group-${item.id}`}
                  onClick={(e) => handleNavClick(e, targetTab)}
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
                    whiteSpace: 'nowrap',
                    textDecoration: 'none',
                    flexShrink: 0
                  }}
                >
                  <item.icon size={18} />
                  <span className="hide-mobile">{t(`nav.${item.id}`)}</span>
                </a>
              );
            })}
          </nav>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.75rem' : '1.5rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="icon-btn" onClick={() => setShowValues(!showValues)} title={showValues ? t('dashboard.hide_values') : t('dashboard.show_values')}>
              {showValues ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <button className="icon-btn" onClick={toggleTheme} title={t('dashboard.toggle_theme')}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingLeft: isMobile ? '0.5rem' : '1rem', borderLeft: '1px solid var(--glass-border)' }}>
            {!isMobile && (
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>{user?.email?.split('@')[0]}</p>
              </div>
            )}
            <div
              onClick={() => supabase.auth.signOut()}
              style={{ width: 35, height: 35, borderRadius: '10px', background: 'linear-gradient(135deg, var(--primary), #818cf8)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '0.9rem' }}>
              {user?.email?.[0]?.toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      {/* ── Tablet Left Sidebar ── */}
      {isTablet && (
        <aside className={`tablet-sidebar ${isSidebarExpanded ? 'expanded' : ''}`} onClick={() => setSidebarExpanded(!isSidebarExpanded)}>
          {menuItems.filter(item => visibleModules.includes(item.id)).map(item => {
            const isActive = activeTab === item.id || activeTab.startsWith(item.id);
            const targetTab = getModuleInitialTab(item.id);
            return (
              <a
                key={item.id}
                href={`/${targetTab}`}
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                onClick={(e) => handleTabletNavClick(e, targetTab)}
                title={t(`nav.${item.id}`)}
              >
                <item.icon size={22} />
                <span>{t(`nav.${item.id}`)}</span>
              </a>
            );
          })}
        </aside>
      )}

      {/* ── Mobile Bottom Navigation ── */}
      {isMobile && (
        <nav className="bottom-nav">
          {(() => {
            const activeMenuItems = menuItems.filter(item => visibleModules.includes(item.id));
            const maxDirectItems = 5;
            const showMoreButton = activeMenuItems.length > maxDirectItems;
            const directItems = showMoreButton ? activeMenuItems.slice(0, 4) : activeMenuItems;

            return (
              <>
                {directItems.map(item => {
                  const isActive = activeTab === item.id || activeTab.startsWith(item.id);
                  const targetTab = getModuleInitialTab(item.id);
                  return (
                    <a
                      key={item.id}
                      href={`/${targetTab}`}
                      className={`bottom-nav-item ${isActive ? 'active' : ''}`}
                      onClick={(e) => handleNavClick(e, targetTab)}
                    >
                      <item.icon size={20} />
                      <span>{t(`nav.${item.id}`)}</span>
                    </a>
                  );
                })}
                {showMoreButton && (
                  <button
                    className="bottom-nav-item"
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => setBottomSheetOpen(true)}
                  >
                    <Menu size={20} />
                    <span>{t('nav.more') || 'Mais'}</span>
                  </button>
                )}
              </>
            );
          })()}
        </nav>
      )}

      {/* ── Mobile Bottom Sheet Drawer ── */}
      <AnimatePresence>
        {isMobile && isBottomSheetOpen && (
          <>
            <Motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bottom-sheet-overlay"
              onClick={() => setBottomSheetOpen(false)}
              style={{ zIndex: 200 }}
            />
            <Motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bottom-sheet"
              style={{ zIndex: 201 }}
            >
              <div className="bottom-sheet-header">
                <span className="bottom-sheet-title">{t('nav.modules') || t('nav.more') || 'Módulos'}</span>
                <button className="bottom-sheet-close" onClick={() => setBottomSheetOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className="bottom-sheet-grid">
                {menuItems.filter(item => visibleModules.includes(item.id)).slice(4).map(item => {
                  const isActive = activeTab === item.id || activeTab.startsWith(item.id);
                  const targetTab = getModuleInitialTab(item.id);
                  return (
                    <a
                      key={item.id}
                      href={`/${targetTab}`}
                      className={`bottom-sheet-item ${isActive ? 'active' : ''}`}
                      onClick={(e) => handleNavClick(e, targetTab)}
                    >
                      <item.icon size={24} />
                      <span>{t(`nav.${item.id}`)}</span>
                    </a>
                  );
                })}
              </div>
            </Motion.div>
          </>
        )}
      </AnimatePresence>

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
                activeTab.startsWith('music') ? t('nav.music') :
                activeTab.startsWith('settings') ? t('nav.settings') : ''}
            </span>
          </div>
          {(() => {
            const currentModule = activeTab.split('-')[0];
            const subItems = moduleSubItems[currentModule] || [];
            return (
              <div style={{ display: 'flex', gap: '2rem' }}>
                {subItems.map(item => (
                  <a
                    key={item.tab}
                    href={`/${item.tab}`}
                    data-testid={`sidebar-sub-item-${item.tab}`}
                    onClick={(e) => handleNavClick(e, item.tab)}
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
                      whiteSpace: 'nowrap',
                      textDecoration: 'none'
                    }}
                  >
                    <item.icon size={16} strokeWidth={activeTab === item.tab ? 2.5 : 2} />
                    {t(`nav.sub.${currentModule}.${item.key}`)}
                  </a>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Main Content Area ── */}
      {(() => {
        const isScrollLockedTab = ['investments-list', 'trips-list', 'trips-itinerary', 'music-repertoire', 'music-setlists'].includes(activeTab);
        return (
          <main style={{ 
            flex: 1, 
            padding: activeTab === 'launchpad' ? 0 : isMobile ? '1rem' : '2rem', 
            overflowY: isScrollLockedTab ? 'hidden' : 'auto', 
            position: 'relative',
            display: isScrollLockedTab ? 'flex' : 'block',
            flexDirection: isScrollLockedTab ? 'column' : 'row'
          }}>
            <AnimatePresence mode="wait">
              <Motion.div
                key={activeTab + refreshKey}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.1 }}
                style={isScrollLockedTab ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' } : undefined}
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
                    menuItems={menuItems.filter(i => i.id !== 'launchpad' && visibleModules.includes(i.id))}
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
                    visibleModules={visibleModules}
                    setVisibleModules={setVisibleModules}
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
                  activeTab === 'lists-notes' ? (
                    <MarkdownNotes user={user} refreshKey={refreshKey} />
                  ) : (
                    <CustomLists user={user} refreshKey={refreshKey} mode={activeTab.replace('lists-', '')} />
                  )
                )}
                {activeTab.startsWith('music') && (
                  <Music user={user} refreshKey={refreshKey} mode={activeTab.replace('music-', '')} navigate={navigate} />
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
                  !activeTab.startsWith('music') &&
                  !activeTab.startsWith('investments') && (
                    <div className="glass-card" style={{ padding: '4rem', textAlign: 'center' }}>
                      <p style={{ color: 'var(--text-muted)' }}>{t('dashboard.module_development', { module: activeTab })}</p>
                    </div>
                  )}
              </Motion.div>
            </AnimatePresence>
          </main>
        );
      })()}
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
            title={activeTab.includes('finance') ? t('dashboard.new_transaction') : t('dashboard.new_car')}
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
