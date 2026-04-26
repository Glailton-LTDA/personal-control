import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Loader2 } from 'lucide-react';

export default function AddressInput({ value, onChange, placeholder, style, className, onFocus, onBlur }) {
  const [localValue, setLocalValue] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dropdownPos, setDropdownPos] = useState(null);
  const searchTimeoutRef = useRef(null);
  const inputContainerRef = useRef(null);

  // Sync with external value changes
  useEffect(() => {
    if (value !== localValue) {
      setLocalValue(value || '');
    }
  }, [value]);

  // Update dropdown position when suggestions change or on focus
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
    setLocalValue(query);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    if (!query || query.length < 3) {
      setSuggestions([]);
      if (!query) onChange('');
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10`);
        const data = await response.json();
        setSuggestions(data.features || []);
      } catch (error) {
        console.error('Error fetching address:', error);
      } finally {
        setIsSearching(false);
      }
    }, 500);
  };

  const suggestionsDropdown = suggestions.length > 0 && dropdownPos && createPortal(
    <div style={{ 
      position: 'absolute', 
      top: `${dropdownPos.top}px`, 
      left: `${dropdownPos.left}px`, 
      width: `${dropdownPos.width}px`,
      zIndex: 999999, // Extremely high to be above everything
      marginTop: '0.5rem',
      background: '#0f172a',
      border: '1px solid var(--glass-border)',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
      pointerEvents: 'auto'
    }}>
      {suggestions.map((feat, fIdx) => {
        const { name, city, country, street, state, housenumber } = feat.properties;
        
        // Try to extract house number from user input if not in suggestion
        const inputHousenumber = localValue.match(/,\s*(\d+[a-zA-Z]?)/)?.[1] || localValue.match(/\s+(\d+[a-zA-Z]?)$/)?.[1];
        const effectiveHousenumber = housenumber || inputHousenumber;
        
        // If 'name' is just the street, and we have a housenumber, combine them
        let displayTitle = name;
        if (effectiveHousenumber && !name.includes(effectiveHousenumber)) {
          displayTitle = `${name}, ${effectiveHousenumber}`;
        }
        
        const displaySub = [street !== name ? street : null, city, state, country].filter(Boolean).join(', ');
        
        return (
          <div 
            key={fIdx}
            onMouseDown={(e) => {
              e.preventDefault(); 
              // Construct full address preserving house number
              const addressParts = [name];
              if (effectiveHousenumber && !name.includes(effectiveHousenumber)) {
                addressParts[0] = `${name}, ${effectiveHousenumber}`;
              }
              
              const fullAddress = [...addressParts, city, country].filter(Boolean).join(', ');
              
              setLocalValue(fullAddress);
              onChange(fullAddress, feat.geometry.coordinates);
              setSuggestions([]);
            }}
            style={{ 
              padding: '0.75rem 1rem', 
              cursor: 'pointer', 
              borderBottom: fIdx < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              transition: '0.2s',
              background: 'transparent'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <MapPin size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: 'white', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {displayTitle}
                </div>
                <div style={{ fontSize: '0.7rem', opacity: 0.5, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {displaySub}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>,
    document.getElementById('portal-root')
  );

  return (
    <div ref={inputContainerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input 
          className={className || "glass-input"}
          value={localValue}
          onFocus={onFocus}
          onChange={(e) => handleSearch(e.target.value)}
          onBlur={(e) => {
            if (onBlur) onBlur(e);
            setTimeout(() => {
              setSuggestions([]);
              onChange(localValue);
            }, 200);
          }}
          style={{ width: '100%', ...style }}
          placeholder={placeholder}
        />
        {isSearching && (
          <div style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)' }}>
            <Loader2 size={14} className="animate-spin" style={{ opacity: 0.5 }} />
          </div>
        )}
      </div>
      {suggestionsDropdown}
    </div>
  );
}
