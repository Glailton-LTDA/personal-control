import React from 'react';
import { motion as Motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  Car, 
  TrendingUp, 
  Plane, 
  List, 
  Settings,
  LogOut,
  ChevronRight,
  Coins,
  Music
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

const moduleData = {
  finances: { color: '#6366f1', icon: Coins },
  cars: { color: '#3b82f6', icon: Car },
  investments: { color: '#10b981', icon: TrendingUp },
  trips: { color: '#a855f7', icon: Plane },
  lists: { color: '#f59e0b', icon: List },
  music: { color: '#f43f5e', icon: Music },
  settings: { color: '#94a3b8', icon: Settings },
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

export default function Launchpad({ user, onNavigate, onLogout, menuItems }) {
  const { t } = useTranslation();
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };

  return (
    <Motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      style={{ 
        maxWidth: '1200px', 
        margin: '0 auto', 
        padding: '2rem 1rem',
        minHeight: 'calc(100vh - 100px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}
    >
      <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
        <Motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.5rem' }}
          data-testid="welcome-message"
        >
          {t('common.welcome')}, <span style={{ color: 'var(--primary)' }}>
            {user?.user_metadata?.full_name || user?.user_metadata?.name || (user?.email?.split('@')[0]?.charAt(0).toUpperCase() + user?.email?.split('@')[0]?.slice(1))}
          </span>
        </Motion.h1>
        <Motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}
        >
          {t('common.what_to_manage')}
        </Motion.p>
      </header>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: '1.5rem' 
      }}>
        {menuItems.map((menuItem) => {
          const details = moduleData[menuItem.id] || { color: 'var(--primary)', icon: menuItem.icon };
          const Icon = details.icon;
          const targetTab = getModuleInitialTab(menuItem.id);

          return (
            <Motion.a
              key={menuItem.id}
              href={`/${targetTab}`}
              data-testid={`launchpad-item-${menuItem.id}`}
              variants={item}
              whileHover={{ 
                scale: 1.02, 
                backgroundColor: 'var(--card-action-bg)',
                borderColor: details.color 
              }}
              whileTap={{ scale: 0.98 }}
              onClick={(e) => {
                if (!e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                  e.preventDefault();
                  onNavigate(targetTab);
                }
              }}
              className="glass-card"
              style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'flex-start', 
                textAlign: 'left',
                padding: '2rem', 
                border: '1px solid var(--glass-border)', 
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                textDecoration: 'none',
                color: 'inherit'
              }}
            >
              {/* Decorative background glow */}
              <div style={{ 
                position: 'absolute', 
                top: '-20%', 
                right: '-10%', 
                width: '150px', 
                height: '150px', 
                background: details.color, 
                filter: 'blur(80px)', 
                opacity: 0.1,
                zIndex: 0
              }} />

              <div style={{ 
                width: '56px', 
                height: '56px', 
                borderRadius: '16px', 
                background: `color-mix(in srgb, ${details.color} 15%, transparent)`, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                color: details.color,
                marginBottom: '1.5rem',
                position: 'relative',
                zIndex: 1,
                border: `1px solid color-mix(in srgb, ${details.color} 30%, transparent)`
              }}>
                <Icon size={28} />
              </div>

              <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {t(`nav.${menuItem.id}`)}
                  <ChevronRight size={18} style={{ opacity: 0.3 }} />
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                  {t(`nav.${menuItem.id}_desc`)}
                </p>
              </div>
            </Motion.a>
          );
        })}

        {/* Logout Card */}
        <Motion.button
          variants={item}
          whileHover={{ scale: 1.02, backgroundColor: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
          whileTap={{ scale: 0.98 }}
          onClick={onLogout}
          className="glass-card"
          style={{ 
            display: 'flex', 
            flexDirection: 'row', 
            alignItems: 'center', 
            gap: '1.5rem',
            padding: '1.5rem 2rem', 
            border: '1px solid var(--glass-border)', 
            cursor: 'pointer',
            color: 'var(--danger)',
            gridColumn: '1 / -1',
            marginTop: '1rem'
          }}
        >
          <div style={{ 
            width: '44px', 
            height: '44px', 
            borderRadius: '12px', 
            background: 'rgba(239, 68, 68, 0.1)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}>
            <LogOut size={22} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontWeight: 700, fontSize: '1.1rem', display: 'block' }}>{t('common.logout')}</span>
            <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{t('settings.logout_desc')}</span>
          </div>
        </Motion.button>
      </div>
    </Motion.div>
  );
}
