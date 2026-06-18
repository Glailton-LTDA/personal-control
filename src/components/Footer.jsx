import React from 'react';
import { Shield, Cpu, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const version = "1.7.0";

  return (
    <footer style={{
      padding: '2rem',
      borderTop: '1px solid var(--glass-border)',
      background: 'rgba(0,0,0,0.2)',
      marginTop: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.5rem'
      }}>
        {/* Info Group */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Cpu size={14} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Version: <span style={{ color: 'var(--text-main)' }}>{version}</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={14} style={{ color: '#10b981' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Status: <span style={{ color: '#10b981' }}>{t('common.synced') || 'Sincronizado'}</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Globe size={14} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Region: <span style={{ color: 'var(--text-main)' }}>Global</span>
            </span>
          </div>
        </div>

        {/* Links Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <a href="#" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            Privacy
          </a>
          <a href="#" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            Terms
          </a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--text-main)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            <Globe size={16} />
          </a>
        </div>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '1rem',
        borderTop: '1px solid rgba(255,255,255,0.03)'
      }}>
        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.02em' }}>
          &copy; {currentYear} Personal Control. All rights reserved. Developed with Orbit Design System.
        </p>
      </div>
    </footer>
  );
}
