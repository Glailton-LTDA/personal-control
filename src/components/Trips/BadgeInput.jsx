import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

export default function BadgeInput({ label, icon: Icon, values, onValuesChange, placeholder, readOnly = false }) {
  const [inputValue, setInputValue] = useState('');

  const addValue = () => {
    if (inputValue.trim() && !values.includes(inputValue.trim())) {
      onValuesChange([...values, inputValue.trim()]);
      setInputValue('');
    }
  };

  const removeValue = (indexToRemove) => {
    if (readOnly) return;
    onValuesChange(values.filter((_, index) => index !== indexToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addValue();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}>
        {Icon && <Icon size={16} />} {label}
      </label>
      
      <div className={readOnly ? "" : "glass-card"} style={{ 
        padding: readOnly ? '0' : '0.5rem', 
        minHeight: readOnly ? 'auto' : '45px', 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '0.5rem', 
        background: readOnly ? 'transparent' : 'var(--input-bg)', 
        border: readOnly ? 'none' : '1px solid var(--glass-border)',
        borderRadius: '12px',
        alignItems: 'center'
      }}>
        {values.map((val, idx) => (
          <span 
            key={idx} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.4rem', 
              background: 'var(--primary)', 
              color: 'white', 
              padding: '0.2rem 0.6rem', 
              borderRadius: '8px', 
              fontSize: '0.85rem', 
              fontWeight: '600',
              animation: 'scaleIn 0.2s ease'
            }}
          >
            {val}
            {!readOnly && (
              <button 
                type="button"
                onClick={() => removeValue(idx)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: 'white', 
                  padding: 0, 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center',
                  opacity: 0.8
                }}
              >
                <X size={14} />
              </button>
            )}
          </span>
        ))}
        
        {!readOnly && (
          <>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={values.length === 0 ? placeholder : ""}
              style={{
                flex: 1,
                minWidth: '100px',
                background: 'none',
                border: 'none',
                color: 'var(--text-main)',
                outline: 'none',
                padding: '0.4rem',
                fontSize: '0.9rem'
              }}
            />
            
            {inputValue.trim() && (
              <button 
                type="button"
                onClick={addValue}
                style={{
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <Plus size={14} />
              </button>
            )}
          </>
        )}
        {readOnly && values.length === 0 && (
          <span style={{ fontSize: '0.85rem', opacity: 0.5, color: 'var(--text-muted)' }}>Nenhum informado</span>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scaleIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}} />
    </div>
  );
}
