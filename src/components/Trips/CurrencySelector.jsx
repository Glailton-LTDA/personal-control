import React, { useState } from 'react';
import { Search, X, Check } from 'lucide-react';
import { CURRENCIES } from '../../constants/currencies';

const CurrencySelector = ({ selectedCurrencies = [], onSelectionChange, single = false }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCurrencies = CURRENCIES.filter(curr => 
    curr.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    curr.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (curr.country && curr.country.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const toggleCurrency = (code) => {
    if (single) {
      onSelectionChange([code]);
      return;
    }
    
    if (selectedCurrencies.includes(code)) {
      onSelectionChange(selectedCurrencies.filter(c => c !== code));
    } else {
      onSelectionChange([...selectedCurrencies, code]);
    }
  };

  const renderFlag = (flag, size = '1.5rem') => {
    if (!flag) return null;
    if (flag.startsWith('data:image')) {
      return (
        <img 
          src={flag} 
          alt="flag" 
          style={{ 
            width: size, 
            height: size, 
            objectFit: 'contain',
            borderRadius: '4px'
          }} 
        />
      );
    }
    return <span style={{ fontSize: size }}>{flag}</span>;
  };

  return (
    <div className="currency-selector" style={{ background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
      <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255,255,255,0.02)' }}>
        <Search size={16} style={{ opacity: 0.5, color: 'var(--text-main)' }} />
        <input 
          className="glass-input" 
          style={{ background: 'transparent', border: 'none', padding: 0, fontSize: '0.9rem', width: '100%', outline: 'none', color: 'var(--text-main)' }}
          placeholder="Buscar moeda (USD, Euro, Brasil...)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', opacity: 0.5, cursor: 'pointer' }}>
            <X size={14} />
          </button>
        )}
      </div>

      <div className="scrollbar-thin" style={{ maxHeight: '250px', overflowY: 'auto', padding: '0.5rem' }}>
        {filteredCurrencies.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5, fontSize: '0.9rem', color: 'var(--text-main)' }}>Nenhuma moeda encontrada</div>
        ) : (
          filteredCurrencies.map(curr => {
            const isSelected = selectedCurrencies.includes(curr.code);
            return (
              <div 
                key={curr.code}
                onClick={() => toggleCurrency(curr.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                  marginBottom: '4px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '2rem', display: 'flex', justifyContent: 'center' }}>
                    {renderFlag(curr.flag, '1.5rem')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: '700', fontSize: '0.95rem', color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>{curr.code}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{curr.name}</span>
                  </div>
                </div>
                {isSelected && <Check size={18} color="var(--primary)" strokeWidth={3} />}
              </div>
            );
          })
        )}
      </div>

      {!single && selectedCurrencies.length > 0 && (
        <div style={{ padding: '0.75rem', borderTop: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {selectedCurrencies.map(code => {
              const curr = CURRENCIES.find(c => c.code === code);
              return (
                <div key={code} style={{ background: 'var(--primary)', color: 'white', padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)' }}>
                  {renderFlag(curr?.flag, '1.1rem')}
                  {code}
                  <X size={14} style={{ cursor: 'pointer', opacity: 0.8 }} onClick={(e) => { e.stopPropagation(); toggleCurrency(code); }} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CurrencySelector;
