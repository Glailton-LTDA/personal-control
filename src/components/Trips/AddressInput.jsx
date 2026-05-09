import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin, X, Loader2, Hash } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function AddressInput({ value, onChange, placeholder = "Digite o endereço...", disabled = false }) {
  // baseAddress: the raw Nominatim address (never contains number/complement)
  const [baseAddress, setBaseAddress] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dropdownPos, setDropdownPos] = useState(null);
  const [numberValue, setNumberValue] = useState('');
  const [showNumberField, setShowNumberField] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState(null);
  const searchTimeoutRef = useRef(null);
  const inputContainerRef = useRef(null);
  const numberInputRef = useRef(null);
  // Guard to prevent external value sync from overwriting internal state
  // after we ourselves triggered the onChange
  const internalChangeRef = useRef(false);

  // Sync external value into local state, but only when it's truly external
  useEffect(() => {
    if (internalChangeRef.current) {
      internalChangeRef.current = false;
      return;
    }
    // External change (e.g., editing an existing item) — parse it
    if (!value) {
      setBaseAddress('');
      setInputValue('');
      setNumberValue('');
      setShowNumberField(false);
      return;
    }
    setInputValue(value);
  }, [value]);

  // Extract existing number/complement from value on mount
  useEffect(() => {
    if (value && value.includes(', ')) {
      // Try to detect a leading number/complement: pattern "NUMBER, rest_of_address"
      // Nominatim addresses typically start with a street name (letter),
      // so if the value starts with a non-letter token before the first comma,
      // that's likely the user-prepended number/complement.
      const firstCommaIdx = value.indexOf(', ');
      const prefix = value.substring(0, firstCommaIdx).trim();
      const rest = value.substring(firstCommaIdx + 2).trim();
      // Heuristic: if the prefix looks like a number/complement (contains at least one digit
      // and is short), treat it as the number field
      if (prefix && /\d/.test(prefix) && prefix.length <= 20 && rest.length > 0) {
        setNumberValue(prefix);
        setBaseAddress(rest);
        setInputValue(rest);
        setShowNumberField(true);
        return;
      }
    }
    // No number detected — the whole value is the base address
    if (value) {
      setBaseAddress(value);
      setInputValue(value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (disabled) return;
    setInputValue(query);
    setBaseAddress(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    if (!query || query.length < 2) {
      setSuggestions([]);
      if (!query) {
        internalChangeRef.current = true;
        onChange('', null);
      }
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
    if (disabled) return;
    const formattedName = suggestion.display_name;
    const coords = [parseFloat(suggestion.lon), parseFloat(suggestion.lat)];
    
    setBaseAddress(formattedName);
    setInputValue(formattedName);
    setSelectedCoords(coords);
    setSuggestions([]);
    setShowSuggestions(false);
    setShowNumberField(true);
    setNumberValue('');
    internalChangeRef.current = true;
    onChange(formattedName, coords);
    // Focus number field after render
    setTimeout(() => numberInputRef.current?.focus(), 100);
  };

  const handleNumberChange = (val) => {
    if (disabled) return;
    setNumberValue(val);
    // Always compose from the stable baseAddress, never from inputValue
    const fullAddress = val ? `${val}, ${baseAddress}` : baseAddress;
    internalChangeRef.current = true;
    onChange(fullAddress, selectedCoords);
  };

  const clearInput = () => {
    if (disabled) return;
    setBaseAddress('');
    setInputValue('');
    setSuggestions([]);
    setShowSuggestions(false);
    internalChangeRef.current = true;
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
          disabled={disabled}
          onChange={(e) => { setShowNumberField(false); handleSearch(e.target.value); }}
          onFocus={() => !disabled && suggestions.length > 0 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={placeholder}
          className="glass-input"
          style={{ 
            paddingLeft: '3rem', 
            paddingRight: (inputValue && !disabled) ? '3rem' : '1rem',
            cursor: disabled ? 'default' : 'text'
          }}
        />
        <div style={{ position: 'absolute', right: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isSearching && <Loader2 size={18} className="spin-loader" />}
          {inputValue && !isSearching && !disabled && (
            <button 
              type="button" 
              onClick={() => { clearInput(); setShowNumberField(false); setNumberValue(''); setSelectedCoords(null); }}
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

      {showNumberField && inputValue && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
          <Hash size={16} style={{ color: 'var(--primary)', opacity: 0.7, flexShrink: 0 }} />
          <input
            ref={numberInputRef}
            type="text"
            value={numberValue}
            disabled={disabled}
            onChange={(e) => handleNumberChange(e.target.value)}
            placeholder="Nº / Complemento (Ex: 1234, Apt 5B)"
            className="glass-input"
            style={{ 
              flex: 1,
              padding: '0.6rem 0.75rem',
              fontSize: '0.85rem',
              cursor: disabled ? 'default' : 'text'
            }}
          />
        </div>
      )}

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
