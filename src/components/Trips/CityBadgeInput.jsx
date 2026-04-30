import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, MapPin, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function CityBadgeInput({ label, icon: Icon, values, onValuesChange, onCountryFound, placeholder, readOnly = false }) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dropdownPos, setDropdownPos] = useState(null);
  const searchTimeoutRef = useRef(null);
  const inputContainerRef = useRef(null);

  useEffect(() => {
    if (suggestions.length > 0 && inputContainerRef.current) {
      const rect = inputContainerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    } else {
      setDropdownPos(null);
    }
  }, [suggestions]);

  const handleSearch = (query) => {
    setInputValue(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }

    // Nominatim requires a user-agent and recommends a longer debounce
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=8&accept-language=pt-BR`,
          {
            headers: {
              'Accept-Language': 'pt-BR'
            }
          }
        );
        const data = await response.json();
        
        // Map Nominatim results to a common format
        const formatted = data.map(item => ({
          name: item.address.city || item.address.town || item.address.village || item.address.municipality || item.display_name.split(',')[0],
          sub: [item.address.state, item.address.country].filter(Boolean).join(', '),
          country: item.address.country,
          id: item.place_id
        }));

        setSuggestions(formatted);
      } catch (error) {
        console.error('Error fetching cities:', error);
      } finally {
        setIsSearching(false);
      }
    }, 600); // 600ms debounce for Nominatim etiquette
  };

  const addCity = (cityName, countryName) => {
    const formatted = countryName ? `${cityName}, ${countryName}` : cityName;
    if (!values.includes(formatted)) {
      onValuesChange([...values, formatted]);
      if (countryName && onCountryFound) {
        onCountryFound(countryName);
      }
    }
    setInputValue('');
    setSuggestions([]);
  };

  const removeValue = (indexToRemove) => {
    if (readOnly) return;
    onValuesChange(values.filter((_, index) => index !== indexToRemove));
  };

  const suggestionsDropdown = suggestions.length > 0 && dropdownPos && createPortal(
    <div style={{ 
      position: 'absolute', 
      top: `${dropdownPos.top}px`, 
      left: `${dropdownPos.left}px`, 
      width: `${dropdownPos.width}px`,
      zIndex: 999999,
      marginTop: '0.5rem',
      background: '#0f172a',
      border: '1px solid var(--glass-border)',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
      animation: 'fadeInDown 0.2s ease-out'
    }}>
      {suggestions.map((item, idx) => (
        <div 
          key={item.id || idx}
          onMouseDown={(e) => {
            e.preventDefault();
            addCity(item.name, item.country);
          }}
          style={{ 
            padding: '0.75rem 1rem', 
            cursor: 'pointer', 
            borderBottom: idx < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            transition: '0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              width: '24px', height: '24px', borderRadius: '6px', 
              background: 'rgba(99, 102, 241, 0.1)', display: 'flex', 
              alignItems: 'center', justifyContent: 'center' 
            }}>
              <MapPin size={12} style={{ color: 'var(--primary)' }} />
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'white' }}>{item.name}</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>{item.sub}</div>
            </div>
          </div>
        </div>
      ))}
    </div>,
    document.getElementById('portal-root') || document.body
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}>
        {Icon && <Icon size={16} />} {label}
      </label>
      
      <div ref={inputContainerRef} className={readOnly ? "" : "glass-card"} style={{ 
        padding: readOnly ? '0' : '0.5rem', 
        minHeight: readOnly ? 'auto' : '45px', 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '0.5rem', 
        background: readOnly ? 'transparent' : 'var(--input-bg)', 
        border: readOnly ? 'none' : '1px solid var(--glass-border)',
        borderRadius: '12px',
        alignItems: 'center',
        position: 'relative'
      }}>
        {values.map((val, idx) => (
          <span key={idx} style={{ 
            display: 'flex', alignItems: 'center', gap: '0.4rem', 
            background: 'var(--primary)', color: 'white', 
            padding: '0.2rem 0.6rem', borderRadius: '8px', 
            fontSize: '0.85rem', fontWeight: '600'
          }}>
            {val}
            {!readOnly && (
              <button type="button" onClick={() => removeValue(idx)} style={{ background: 'none', border: 'none', color: 'white', padding: 0, cursor: 'pointer' }}>
                <X size={14} />
              </button>
            )}
          </span>
        ))}
        
        {!readOnly && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative' }}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputValue.trim()) {
                  e.preventDefault();
                  addCity(inputValue.trim(), null);
                }
              }}
              onBlur={() => setTimeout(() => setSuggestions([]), 200)}
              placeholder={values.length === 0 ? placeholder : ""}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: 'var(--text-main)',
                outline: 'none',
                padding: '0.4rem',
                fontSize: '0.9rem'
              }}
            />
            {isSearching && (
              <Loader2 size={16} className="spin-loader" style={{ position: 'absolute', right: '0.5rem' }} />
            )}
          </div>
        )}
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
          color: var(--primary) !important;
        }
      `}} />
    </div>
  );
}
