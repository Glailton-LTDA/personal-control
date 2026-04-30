import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin, X, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function AddressInput({ value, onChange, placeholder = "Digite o endereço..." }) {
  const [inputValue, setInputValue] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dropdownPos, setDropdownPos] = useState(null);
  const searchTimeoutRef = useRef(null);
  const inputContainerRef = useRef(null);

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  useEffect(() => {
    if (showSuggestions && suggestions.length > 0 && inputContainerRef.current) {
      const rect = inputContainerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    } else {
      setDropdownPos(null);
    }
  }, [showSuggestions, suggestions]);

  const handleSearch = (query) => {
    setInputValue(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    if (!query || query.length < 2) {
      setSuggestions([]);
      if (!query) onChange('', null);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=10&accept-language=pt-BR`
        );
        const data = await response.json();
        setSuggestions(data || []);
        setShowSuggestions(true);
      } catch (error) {
        console.error('Error fetching addresses:', error);
      } finally {
        setIsSearching(false);
      }
    }, 600);
  };

  const handleSelect = (suggestion) => {
    const formattedName = suggestion.display_name;
    const coords = [parseFloat(suggestion.lon), parseFloat(suggestion.lat)];
    
    setInputValue(formattedName);
    setSuggestions([]);
    setShowSuggestions(false);
    onChange(formattedName, coords);
  };

  const clearInput = () => {
    setInputValue('');
    setSuggestions([]);
    setShowSuggestions(false);
    onChange('', null);
  };

  const suggestionsDropdown = showSuggestions && suggestions.length > 0 && dropdownPos && createPortal(
    <div style={{ 
      position: 'absolute',
      top: `${dropdownPos.top}px`,
      left: `${dropdownPos.left}px`,
      width: `${dropdownPos.width}px`,
      background: '#0f172a',
      border: '1px solid var(--glass-border)',
      borderRadius: '12px',
      marginTop: '0.5rem',
      maxHeight: '300px',
      overflowY: 'auto',
      zIndex: 999999,
      boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
      animation: 'fadeInDown 0.2s ease-out'
    }}>
      {suggestions.map((s, idx) => (
        <div
          key={idx}
          onMouseDown={(e) => {
            e.preventDefault();
            handleSelect(s);
          }}
          style={{
            padding: '0.75rem 1rem',
            cursor: 'pointer',
            borderBottom: idx < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <Search size={14} style={{ marginTop: '3px', opacity: 0.5, flexShrink: 0 }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
            {s.display_name}
          </span>
        </div>
      ))}
    </div>,
    document.getElementById('portal-root') || document.body
  );

  return (
    <div ref={inputContainerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <MapPin 
          size={18} 
          style={{ 
            position: 'absolute', 
            left: '1rem', 
            color: 'var(--primary)',
            opacity: 0.7
          }} 
        />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={placeholder}
          className="glass-input"
          style={{ 
            paddingLeft: '3rem', 
            paddingRight: inputValue ? '3rem' : '1rem' 
          }}
        />
        <div style={{ position: 'absolute', right: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isSearching && <Loader2 size={18} className="spin-loader" />}
          {inputValue && !isSearching && (
            <button 
              type="button" 
              onClick={clearInput}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: 'var(--text-muted)', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {suggestionsDropdown}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .spin-loader {
          animation: spin 1s linear infinite;
          color: var(--primary);
        }
      `}} />
    </div>
  );
}
