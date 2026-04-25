import React, { useState, useRef, useEffect } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

export default function AddressInput({ value, onChange, placeholder, style, className }) {
  const [localValue, setLocalValue] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef(null);

  // Sync with external value changes
  useEffect(() => {
    if (value !== localValue) {
      setLocalValue(value || '');
    }
  }, [value]);

  const handleSearch = (query) => {
    setLocalValue(query);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    if (!query || query.length < 3) {
      setSuggestions([]);
      // If clearing, notify parent
      if (!query) onChange('');
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
        const data = await response.json();
        setSuggestions(data.features || []);
      } catch (error) {
        console.error('Error fetching address:', error);
      } finally {
        setIsSearching(false);
      }
    }, 500);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input 
          className={className || "glass-input"}
          value={localValue}
          onChange={(e) => handleSearch(e.target.value)}
          onBlur={() => {
            // Give time for mousedown to fire
            setTimeout(() => {
              setSuggestions([]);
              // Ensure parent is up to date with typed value if no suggestion was picked
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

      {suggestions.length > 0 && (
        <div style={{ 
          position: 'absolute', 
          top: '100%', 
          left: 0, 
          right: 0, 
          zIndex: 1000, 
          marginTop: '0.5rem',
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--glass-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}>
          {suggestions.map((feat, fIdx) => {
            const { name, city, country, street, state } = feat.properties;
            const displayTitle = name;
            const displaySub = [street, city, state, country].filter(Boolean).join(', ');
            
            return (
              <div 
                key={fIdx}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input from blurring
                  const fullAddress = [name, street, city, country].filter(Boolean).join(', ');
                  setLocalValue(fullAddress);
                  onChange(fullAddress, feat.geometry.coordinates);
                  setSuggestions([]);
                }}
                style={{ 
                  padding: '0.75rem 1rem', 
                  cursor: 'pointer', 
                  borderBottom: fIdx < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  transition: '0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
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
        </div>
      )}
    </div>
  );
}
