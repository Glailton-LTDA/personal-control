import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function MultiSelect({ options = [], selected = [], onChange, placeholder: placeholderProp, searchPlaceholder: searchPlaceholderProp, maxHeight = '220px' }) {
  const { t } = useTranslation();
  const placeholder = placeholderProp || t('common.select');
  const searchPlaceholder = searchPlaceholderProp || t('common.search');
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(opt =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggle = (value) => {
    const next = selected.includes(value)
      ? selected.filter(s => s !== value)
      : [...selected, value];
    onChange(next);
  };

  const remove = (value) => {
    onChange(selected.filter(s => s !== value));
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          background: 'var(--input-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: '8px',
          padding: '8px 12px',
          cursor: 'pointer',
          minHeight: '42px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', flex: 1, alignItems: 'center' }}>
          {selected.length === 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{placeholder}</span>
          )}
          {selected.map(value => {
            const opt = options.find(o => o.value === value);
            return opt ? (
              <span
                key={value}
                style={{
                  background: 'var(--primary)',
                  color: '#fff',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {opt.label}
                <X
                  size={12}
                  style={{ cursor: 'pointer', opacity: 0.8 }}
                  onClick={(e) => { e.stopPropagation(); remove(value); }}
                />
              </span>
            ) : null;
          })}
        </div>
        <ChevronDown
          size={16}
          style={{
            opacity: 0.5,
            transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            flexShrink: 0,
          }}
        />
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            background: 'var(--bg-canvas)',
            border: '1px solid var(--glass-border)',
            borderRadius: '10px',
            overflow: 'hidden',
            zIndex: 1000,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ padding: '0.6rem', borderBottom: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--input-bg)', borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
              <Search size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
              <input
                autoFocus
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-main)',
                  width: '100%',
                  fontSize: '0.85rem',
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div style={{ maxHeight, overflowY: 'auto', padding: '0.35rem' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {t('common.no_results')}
              </div>
            ) : (
              filtered.map(opt => {
                const isSel = selected.includes(opt.value);
                return (
                  <div
                    key={opt.value}
                    onClick={() => toggle(opt.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: isSel ? 'rgba(99,102,241,0.12)' : 'transparent',
                      color: 'var(--text-main)',
                      fontSize: '0.875rem',
                      marginBottom: '2px',
                      transition: 'background 0.15s',
                    }}
                  >
                    <span style={{ fontWeight: isSel ? 700 : 400 }}>{opt.label}</span>
                    {isSel && <Check size={16} color="var(--primary)" strokeWidth={3} />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
