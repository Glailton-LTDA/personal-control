import React, { useState, useEffect } from 'react';
import { 
  Calendar, Clock, MapPin, CheckCircle2, Circle, 
  Plus, Trash2, ChevronDown, ChevronUp, Map, 
  ExternalLink, Ticket, Check, Bell, GripVertical
} from 'lucide-react';
import AddressInput from './AddressInput';
import { AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';

const ItineraryItem = ({ entry, isMobile, focusedId, setFocusedId, updateEntry, removeEntry, addToTickets, idx, totalItems }) => {
  const controls = useDragControls();
  
  return (
    <Reorder.Item 
      key={entry.id}
      value={entry}
      dragListener={false}
      dragControls={controls}
      className="glass-card"
      style={{ 
        padding: isMobile ? '0.75rem' : '1.25rem',
        borderLeft: `4px solid ${entry.completed ? 'var(--success)' : 'var(--glass-border)'}`,
        opacity: entry.completed ? 0.6 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? '0.75rem' : '1rem',
        position: 'relative',
        zIndex: focusedId === entry.id ? 1000 : totalItems - idx,
        overflow: 'visible',
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box'
      }}
      whileDrag={{ scale: 1.02, boxShadow: '0 20px 40px rgba(0,0,0,0.4)', zIndex: 1000 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: isMobile ? '0.5rem' : '1rem' }}>
        <div 
          onPointerDown={(e) => controls.start(e)}
          style={{ cursor: 'grab', opacity: 0.3, flexShrink: 0, marginTop: '0.75rem' }} 
          title="Arraste para reordenar"
        >
          <GripVertical size={isMobile ? 16 : 20} />
        </div>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflow: 'visible' }}>
          <input 
            type="text"
            value={entry.activity || ''}
            placeholder="O que vamos fazer?"
            onFocus={() => setFocusedId(entry.id)}
            onBlur={() => setFocusedId(null)}
            onChange={(e) => updateEntry(entry.id, 'activity', e.target.value)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              color: 'white',
              fontSize: '1rem',
              fontWeight: '700',
              width: '100%',
              padding: '0.2rem 0',
              outline: 'none'
            }}
          />

          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            gap: '0.5rem',
            flexWrap: 'wrap',
            overflow: 'visible'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button 
                type="button"
                onClick={() => updateEntry(entry.id, 'completed', !entry.completed)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: entry.completed ? 'var(--success)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
              >
                {entry.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
              </button>
              
              <div style={{ position: 'relative', width: isMobile ? '100px' : '125px' }}>
                <Clock size={14} style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                <input 
                  type="time"
                  value={entry.time || ''}
                  onFocus={() => setFocusedId(entry.id)}
                  onBlur={() => setFocusedId(null)}
                  onChange={(e) => updateEntry(entry.id, 'time', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '0.4rem 1.8rem 0.4rem 0.5rem', fontSize: '0.8rem', fontWeight: '800', borderRadius: '8px' }}
                />
              </div>
            </div>

            {!isMobile && (
              <div style={{ flex: 1, marginLeft: '0.5rem' }}>
                <AddressInput 
                  value={entry.location}
                  onFocus={() => setFocusedId(entry.id)}
                  onBlur={() => setFocusedId(null)}
                  onChange={(val, coords) => {
                    updateEntry(entry.id, { 
                      location: val, 
                      ...(coords ? { coordinates: coords } : {}) 
                    });
                  }}
                  placeholder="Local ou endereço..."
                  style={{ padding: '0.45rem 0.75rem', fontSize: '0.9rem' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              {entry.location && (
                <button 
                  type="button"
                  onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entry.location)}`, '_blank')}
                  title="Ver no Mapa"
                  className="icon-btn"
                  style={{ opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem' }}
                >
                  <ExternalLink size={18} />
                </button>
              )}
              <button 
                type="button"
                onClick={() => addToTickets(entry)}
                title="Tickets"
                className="icon-btn"
                style={{ opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem' }}
              >
                <Ticket size={18} />
              </button>
              <button 
                type="button"
                onClick={() => removeEntry(entry.id)}
                title="Remover"
                style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: 'none', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', marginLeft: '0.25rem' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {isMobile && (
            <div style={{ width: '100%', marginTop: '-0.25rem' }}>
              <AddressInput 
                value={entry.location}
                onFocus={() => setFocusedId(entry.id)}
                onBlur={() => setFocusedId(null)}
                onChange={(val, coords) => {
                  updateEntry(entry.id, { 
                    location: val, 
                    ...(coords ? { coordinates: coords } : {}) 
                  });
                }}
                placeholder="Local ou endereço..."
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: isMobile ? '0.75rem' : '1.5rem', 
        paddingLeft: isMobile ? '0.5rem' : '3rem', 
        borderTop: '1px solid rgba(255,255,255,0.05)', 
        paddingTop: '0.75rem' 
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-main)' }}>
          <input 
            type="checkbox" 
            checked={entry.needs_booking}
            onChange={(e) => {
              const val = e.target.checked;
              updateEntry(entry.id, { 
                needs_booking: val,
                ...(!val ? { is_booked: false } : {})
              });
            }}
          />
          Reservar?
        </label>

        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.4rem', 
          fontSize: '0.75rem', 
          cursor: entry.needs_booking ? 'pointer' : 'default',
          opacity: entry.needs_booking ? 1 : 0.3,
          color: 'var(--text-main)'
        }}>
          <input 
            type="checkbox" 
            disabled={!entry.needs_booking}
            checked={entry.is_booked}
            onChange={(e) => updateEntry(entry.id, 'is_booked', e.target.checked)}
          />
          OK?
          {entry.needs_booking && !entry.is_booked && (
            <Bell size={12} style={{ color: 'var(--warning)' }} />
          )}
          {entry.is_booked && (
            <Check size={12} style={{ color: 'var(--success)' }} />
          )}
        </label>

        <div style={{ flex: 1, minWidth: isMobile ? '140px' : '200px' }}>
          <input 
            type="text"
            value={entry.notes || ''}
            onFocus={() => setFocusedId(entry.id)}
            onBlur={() => setFocusedId(null)}
            onChange={(e) => updateEntry(entry.id, 'notes', e.target.value)}
            className="glass-input"
            placeholder="Nota rápida..."
            style={{ width: '100%', padding: '0.4rem', fontSize: '0.8rem', background: 'transparent', border: 'none', borderBottom: '1px solid var(--glass-border)', borderRadius: 0, color: 'var(--text-main)' }}
          />
        </div>
      </div>
    </Reorder.Item>
  );
};

export default function ItineraryManager({ trip, items, onItemsChange, onAddToTickets }) {
  const [activeDay, setActiveDay] = useState(() => {
    if (!trip.id) return null;
    return localStorage.getItem(`pc_itinerary_active_day_${trip.id}`);
  });
  const [focusedId, setFocusedId] = useState(null);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (trip.id) {
      const savedDay = localStorage.getItem(`pc_itinerary_active_day_${trip.id}`);
      if (savedDay) {
        setActiveDay(savedDay);
      } else {
        const days = generateDays();
        if (days.length > 0) setActiveDay(days[0]);
      }
    }
  }, [trip.id]);

  useEffect(() => {
    if (activeDay && trip.id) {
      localStorage.setItem(`pc_itinerary_active_day_${trip.id}`, activeDay);
    }
  }, [activeDay, trip.id]);

  const generateDays = () => {
    if (!trip.start_date || !trip.end_date) return [];
    
    const start = new Date(trip.start_date + 'T00:00:00');
    const end = new Date(trip.end_date + 'T00:00:00');
    const days = [];
    
    let current = new Date(start);
    while (current <= end) {
      days.push(new Date(current).toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return days;
  };

  const days = generateDays();

  if (!activeDay && days.length > 0) setActiveDay(days[0]);

  const addEntry = (day) => {
    const newEntry = {
      id: crypto.randomUUID(),
      day,
      time: '',
      activity: '',
      location: '',
      completed: false,
      needs_booking: false,
      is_booked: false,
      coordinates: null,
      notes: ''
    };
    onItemsChange(prev => [...prev, newEntry]);
  };

  const updateEntry = (id, fieldOrUpdates, value) => {
    onItemsChange(prev => prev.map(item => {
      if (item.id === id) {
        if (typeof fieldOrUpdates === 'string') {
          return { ...item, [fieldOrUpdates]: value };
        }
        return { ...item, ...fieldOrUpdates };
      }
      return item;
    }));
  };

  const handleReorder = (newOrderForDay) => {
    onItemsChange(prev => {
      const otherDays = prev.filter(item => item.day !== activeDay);
      return [...otherDays, ...newOrderForDay];
    });
  };

  const sortDayByTime = () => {
    onItemsChange(prev => {
      const dayItems = prev.filter(item => item.day === activeDay);
      const otherDays = prev.filter(item => item.day !== activeDay);
      
      const sortedDay = [...dayItems].sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time);
        if (a.time && !b.time) return -1;
        if (!a.time && b.time) return 1;
        return 0;
      });
      
      return [...otherDays, ...sortedDay];
    });
  };

  const removeEntry = (id) => {
    confirmToast('Remover esta atividade?', () => {
      onItemsChange(prev => prev.filter(item => item.id !== id));
    }, { danger: true });
  };

  const addToTickets = (entry) => {
    if (onAddToTickets) {
      onAddToTickets(entry);
    } else {
      // Fallback tip
      toast(`Dica: Você pode adicionar "${entry.activity || entry.location}" na aba de Ingressos em Ajustes da Viagem.`, {
        icon: '🎫',
        duration: 5000
      });
    }
  };

  const formatDate = (dateStr) => {
    const [, month, day] = dateStr.split('-');
    return `${day}/${month}`;
  };

  const getDayName = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', { weekday: 'short' });
  };

  const entriesForDay = React.useMemo(() => {
    if (!activeDay) return [];
    return items.filter(item => item.day === activeDay);
  }, [items, activeDay]);

  const openInGoogleMaps = () => {
    const waypoints = entriesForDay
      .filter(e => e.location)
      .map(e => encodeURIComponent(e.location))
      .join('/');
    
    if (waypoints) {
      window.open(`https://www.google.com/maps/dir/${waypoints}`, '_blank');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="custom-scrollbar" style={{ 
        display: 'flex', 
        gap: '0.75rem', 
        overflowX: 'auto', 
        paddingBottom: '0.5rem',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {days.map(day => (
          <button
            key={day}
            onClick={() => setActiveDay(day)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '16px',
              border: '1px solid',
              borderColor: activeDay === day ? 'var(--primary)' : 'var(--glass-border)',
              background: activeDay === day ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
              color: activeDay === day ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: '70px',
              transition: '0.2s',
              fontWeight: activeDay === day ? '800' : '600'
            }}
          >
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.6, color: 'var(--text-muted)' }}>{getDayName(day)}</span>
            <span style={{ fontSize: '1.1rem', color: activeDay === day ? 'var(--primary)' : 'var(--text-main)' }}>{formatDate(day)}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row', 
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'flex-start' : 'center',
          gap: isMobile ? '0.75rem' : '1rem'
        }}>
          <h3 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.1rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-main)' }}>
            <Calendar size={18} style={{ color: 'var(--primary)' }} />
            Roteiro do Dia {activeDay && formatDate(activeDay)}
          </h3>
          
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            width: isMobile ? '100%' : 'auto', 
            justifyContent: isMobile ? 'flex-start' : 'flex-end',
            flexWrap: 'wrap'
          }}>
            {entriesForDay.length > 1 && (
              <button 
                onClick={sortDayByTime}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.7rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <Clock size={14} />
                ORDENAR
              </button>
            )}
            <button 
              type="button"
              onClick={openInGoogleMaps}
              disabled={entriesForDay.length === 0}
              className="btn-secondary"
              style={{ fontSize: '0.7rem', padding: '0.4rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem', opacity: entriesForDay.length === 0 ? 0.3 : 1 }}
            >
              <Map size={14} /> Ver Rota
            </button>
            <button 
              type="button"
              onClick={() => addEntry(activeDay)}
              className="btn-primary"
              style={{ fontSize: '0.7rem', padding: '0.4rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <Plus size={14} /> Adicionar
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {entriesForDay.length === 0 ? (
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', opacity: 0.4, border: '1px dashed var(--glass-border)', color: 'var(--text-main)' }}>
              Nenhuma atividade planejada para este dia.
            </div>
          ) : (
            <Reorder.Group 
              axis="y" 
              values={entriesForDay} 
              onReorder={handleReorder}
              style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}
            >
              {entriesForDay.map((entry, idx) => (
                <ItineraryItem 
                  key={entry.id}
                  entry={entry}
                  idx={idx}
                  totalItems={entriesForDay.length}
                  isMobile={isMobile}
                  focusedId={focusedId}
                  setFocusedId={setFocusedId}
                  updateEntry={updateEntry}
                  removeEntry={removeEntry}
                  addToTickets={addToTickets}
                />
              ))}
            </Reorder.Group>
          )}
        </div>
      </div>
    </div>
  );
}
