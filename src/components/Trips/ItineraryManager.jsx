import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Calendar, Clock, MapPin, CheckCircle, Circle, 
  Plus, Trash2, ChevronDown, ChevronUp, Map, 
  ExternalLink, Ticket, Check, Bell, GripVertical,
  Navigation, Info
} from 'lucide-react';
import AddressInput from './AddressInput';
import { motion as Motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';

const ItineraryItem = ({ entry, isMobile, focusedId, setFocusedId, updateEntry, removeEntry, addToTickets, idx, totalItems }) => {
  const { t } = useTranslation();
  const controls = useDragControls();
  
  return (
    <Reorder.Item 
      key={entry.id}
      value={entry}
      dragListener={false}
      dragControls={controls}
      className="glass-card"
      style={{ 
        padding: isMobile ? '1.25rem' : '1.75rem',
        borderLeft: `5px solid ${entry.completed ? 'var(--success)' : 'var(--glass-border)'}`,
        background: entry.completed ? 'color-mix(in srgb, var(--success) 5%, var(--bg-card))' : 'var(--bg-card)',
        opacity: entry.completed ? 0.7 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? '1rem' : '1.25rem',
        position: 'relative',
        zIndex: focusedId === entry.id ? 1000 : totalItems - idx,
        overflow: 'visible',
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        transition: 'border-color 0.3s, background 0.3s',
        boxShadow: focusedId === entry.id ? '0 12px 24px -8px rgba(0,0,0,0.5)' : 'none'
      }}
      whileDrag={{ scale: 1.02, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)', zIndex: 1000, background: 'rgba(30, 41, 59, 0.8)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: isMobile ? '0.75rem' : '1.25rem' }}>
        <div 
          onPointerDown={(e) => controls.start(e)}
          style={{ 
            cursor: 'grab', 
            opacity: 0.3, 
            flexShrink: 0, 
            marginTop: '0.6rem',
            touchAction: 'none',
            padding: '0.5rem',
            margin: '-0.5rem',
            transition: '0.2s'
          }} 
          onMouseEnter={(e) => e.currentTarget.style.opacity = 0.8}
          onMouseLeave={(e) => e.currentTarget.style.opacity = 0.3}
          title={t('trips.drag_to_reorder')}
        >
          <GripVertical size={isMobile ? 20 : 22} />
        </div>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.85rem', overflow: 'visible' }}>
          <textarea 
            value={entry.activity || ''}
            placeholder={t('trips.what_to_do_placeholder')}
            onFocus={() => setFocusedId(entry.id)}
            onBlur={() => setFocusedId(null)}
            rows={1}
            onChange={(e) => {
              updateEntry(entry.id, 'activity', e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            ref={el => {
              if (el) {
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: '1px solid var(--glass-border)',
              color: 'var(--text-main)',
              fontSize: '1.15rem',
              fontWeight: '900',
              width: '100%',
              padding: '0.2rem 0',
              outline: 'none',
              resize: 'none',
              fontFamily: 'Inter, sans-serif',
              overflow: 'hidden',
              minHeight: '1.5rem',
              transition: '0.3s'
            }}
          />

          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            overflow: 'visible'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button 
                type="button"
                onClick={() => updateEntry(entry.id, 'completed', !entry.completed)}
                style={{ 
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0, 
                  color: entry.completed ? 'var(--success)' : 'var(--text-muted)', 
                  display: 'flex', alignItems: 'center', transition: '0.2s',
                  transform: entry.completed ? 'scale(1.1)' : 'scale(1)'
                }}
              >
                {entry.completed ? <CheckCircle size={24} /> : <Circle size={24} />}
              </button>
              
              <div style={{ position: 'relative', width: isMobile ? '120px' : '140px' }}>
                <Clock size={16} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.3 }} />
                <input 
                  type="time"
                  value={entry.time || ''}
                  onFocus={() => setFocusedId(entry.id)}
                  onBlur={() => setFocusedId(null)}
                  onChange={(e) => updateEntry(entry.id, 'time', e.target.value)}
                  className="glass-input"
                  style={{ 
                    width: '100%', padding: '0.6rem 0.8rem 0.6rem 2.5rem', 
                    fontSize: '0.9rem', fontWeight: '800', borderRadius: '12px',
                    background: 'var(--tabs-bg)', border: '1px solid var(--glass-border)',
                    color: 'var(--text-main)'
                  }}
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
                  placeholder={t('trips.location_placeholder')}
                  style={{ 
                    padding: '0.6rem 1rem', fontSize: '0.95rem', borderRadius: '12px',
                    background: 'var(--tabs-bg)', border: '1px solid var(--glass-border)',
                    color: 'var(--text-main)'
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {entry.location && (
                <button 
                  type="button"
                  onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entry.location)}`, '_blank')}
                  title={t('trips.view_on_map')}
                  className="action-btn"
                  style={{ width: '40px', height: '40px' }}
                >
                  <Navigation size={18} />
                </button>
              )}
              <button 
                type="button"
                onClick={() => addToTickets(entry)}
                title={t('trips.tickets')}
                className="action-btn"
                style={{ width: '40px', height: '40px' }}
              >
                <Ticket size={18} />
              </button>
              <button 
                type="button"
                onClick={() => removeEntry(entry.id)}
                title={t('common.delete')}
                className="action-btn danger"
                style={{ width: '40px', height: '40px' }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          {isMobile && (
            <div style={{ width: '100%', marginTop: '0.25rem' }}>
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
                placeholder={t('trips.location_placeholder')}
                style={{ 
                  padding: '0.75rem 1rem', fontSize: '0.9rem', borderRadius: '12px',
                  background: 'var(--tabs-bg)', border: '1px solid var(--glass-border)',
                  color: 'var(--text-main)'
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: isMobile ? '1rem' : '2rem', 
        paddingLeft: isMobile ? '0' : '3.5rem', 
        borderTop: '1px solid var(--glass-border)', 
        paddingTop: '1.25rem' 
      }}>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-main)', fontWeight: '700' }}>
            <input 
              type="checkbox" 
              checked={entry.needs_booking}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              onChange={(e) => {
                const val = e.target.checked;
                updateEntry(entry.id, { 
                  needs_booking: val,
                  ...(!val ? { is_booked: false } : {})
                });
              }}
            />
            {t('trips.booking_required')}
          </label>

          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.6rem', 
            fontSize: '0.85rem', 
            cursor: entry.needs_booking ? 'pointer' : 'default',
            opacity: entry.needs_booking ? 1 : 0.3,
            color: entry.is_booked ? 'var(--success)' : 'var(--text-main)',
            fontWeight: '700',
            transition: '0.3s'
          }}>
            <input 
              type="checkbox" 
              disabled={!entry.needs_booking}
              checked={entry.is_booked}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              onChange={(e) => updateEntry(entry.id, 'is_booked', e.target.checked)}
            />
            {entry.is_booked ? t('trips.booked') : t('common.pending')}
            {entry.needs_booking && !entry.is_booked && (
              <Bell size={14} style={{ color: 'var(--warning)', animation: 'pulse 2s infinite' }} />
            )}
            {entry.is_booked && (
              <Check size={14} style={{ color: 'var(--success)' }} />
            )}
          </label>
        </div>

        <div style={{ flex: 1, minWidth: isMobile ? '100%' : '240px', position: 'relative' }}>
          <Info size={14} style={{ position: 'absolute', left: '0.8rem', top: '0.7rem', opacity: 0.3 }} />
          <textarea 
            value={entry.notes || ''}
            onFocus={() => setFocusedId(entry.id)}
            onBlur={() => setFocusedId(null)}
            rows={1}
            onChange={(e) => {
              updateEntry(entry.id, 'notes', e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            ref={el => {
              if (el) {
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
              }
            }}
            className="glass-input"
            placeholder={t('trips.notes_placeholder')}
            style={{ 
              width: '100%', 
              padding: '0.6rem 0.8rem 0.6rem 2.5rem', 
              fontSize: '0.85rem', 
              background: 'var(--tabs-bg)', 
              border: '1px solid var(--glass-border)', 
              borderRadius: '12px', 
              color: 'var(--text-main)',
              resize: 'none',
              fontFamily: 'inherit',
              overflow: 'hidden',
              minHeight: '42px',
              transition: '0.3s'
            }}
          />
        </div>
      </div>
    </Reorder.Item>
  );
};

export default function ItineraryManager({ trip, items, onItemsChange, onAddToTickets }) {
  const { t, i18n } = useTranslation();
  const generateDays = useCallback(() => {
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
  }, [trip.start_date, trip.end_date]);

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
  }, [trip.id, generateDays]);

  useEffect(() => {
    if (activeDay && trip.id) {
      localStorage.setItem(`pc_itinerary_active_day_${trip.id}`, activeDay);
    }
  }, [activeDay, trip.id]);

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
    confirmToast(t('trips.confirm_delete_itinerary'), () => {
      onItemsChange(prev => prev.filter(item => item.id !== id));
    }, { danger: true });
  };

  const addToTickets = (entry) => {
    if (onAddToTickets) {
      onAddToTickets(entry);
    } else {
      toast(`${t('common.tip')}: ${t('trips.add_tip_desc', { activity: entry.activity || entry.location })}`, {
        icon: '🎫',
        duration: 4000
      });
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit' });
  };

  const getDayName = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString(i18n.language, { weekday: 'short' });
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="custom-scrollbar" style={{ 
        display: 'flex', 
        gap: '0.85rem', 
        overflowX: 'auto', 
        padding: '0.5rem 0.2rem 1.25rem',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {days.map(day => (
          <button
            key={day}
            onClick={() => setActiveDay(day)}
            style={{
              padding: '1rem 1.25rem',
              borderRadius: '20px',
              border: '1px solid',
              borderColor: activeDay === day ? 'var(--primary)' : 'var(--glass-border)',
              background: activeDay === day ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'var(--bg-card)',
              color: activeDay === day ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: '85px',
              transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              fontWeight: activeDay === day ? '900' : '700',
              boxShadow: activeDay === day ? '0 10px 20px -5px rgba(99, 102, 241, 0.3)' : 'none',
              transform: activeDay === day ? 'translateY(-2px)' : 'translateY(0)'
            }}
          >
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.6, letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{getDayName(day)}</span>
            <span style={{ fontSize: '1.25rem', color: activeDay === day ? 'var(--primary)' : 'var(--text-main)' }}>{formatDate(day)}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row', 
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'flex-start' : 'center',
          gap: isMobile ? '1rem' : '1.5rem',
          background: 'var(--tabs-bg)',
          padding: '1rem 1.5rem',
          borderRadius: '20px',
          border: '1px solid var(--glass-border)'
        }}>
          <h3 style={{ margin: 0, fontSize: isMobile ? '1.1rem' : '1.25rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-main)' }}>
            <Calendar size={22} className="text-primary" />
            {t('trips.agenda')} <span style={{ opacity: 0.3, fontWeight: '400' }}>•</span> {activeDay && formatDate(activeDay)}
          </h3>
          
          <div style={{ 
            display: 'flex', 
            gap: '0.75rem', 
            width: isMobile ? '100%' : 'auto', 
            justifyContent: isMobile ? 'space-between' : 'flex-end',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {entriesForDay.length > 1 && (
                <button 
                  onClick={sortDayByTime}
                  className="btn"
                  style={{ 
                    background: 'var(--tabs-bg)', 
                    color: 'var(--text-main)', 
                    padding: '0.6rem 1rem', 
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    border: '1px solid var(--glass-border)'
                  }}
                >
                  <Clock size={16} /> <span className="btn-text">{t('common.sort')}</span>
                </button>
              )}
              <button 
                type="button"
                onClick={openInGoogleMaps}
                disabled={entriesForDay.length === 0}
                className="btn"
                style={{ 
                  background: 'var(--tabs-bg)', 
                  color: 'var(--text-main)', 
                  padding: '0.6rem 1rem', 
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.8rem',
                  fontWeight: '800',
                  border: '1px solid var(--glass-border)',
                  opacity: entriesForDay.length === 0 ? 0.3 : 1
                }}
              >
                <Map size={16} /> <span className="btn-text">{t('trips.view_route')}</span>
              </button>
            </div>
            <button 
              type="button"
              onClick={() => addEntry(activeDay)}
              className="btn"
              style={{ 
                background: 'var(--primary)', 
                color: 'white', 
                padding: '0.6rem 1.25rem', 
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                fontWeight: '900',
                border: 'none',
                boxShadow: '0 4px 12px -2px rgba(99, 102, 241, 0.4)'
              }}
            >
              <Plus size={18} /> {t('trips.launch_activity')}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {entriesForDay.length === 0 ? (
            <div className="glass-card" style={{ padding: '5rem 2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--tabs-bg)', borderRadius: '32px', border: '1px dashed var(--glass-border)' }}>
              <div style={{ opacity: 0.2, marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                <Calendar size={64} />
              </div>
              <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '900', color: 'var(--text-main)' }}>{t('trips.empty_day_title')}</h4>
              <p style={{ marginTop: '0.75rem', maxWidth: '320px', margin: '0.75rem auto 0', lineHeight: '1.6', fontSize: '0.95rem' }}>
                {t('trips.empty_day_desc')}
              </p>
              <button 
                onClick={() => addEntry(activeDay)} 
                className="btn" 
                style={{ 
                  marginTop: '1.5rem', background: 'var(--primary)', color: 'white', 
                  padding: '0.75rem 1.5rem', borderRadius: '14px', fontWeight: '800' 
                }}
              >
                <Plus size={18} /> {t('trips.first_activity')}
              </button>
            </div>
          ) : (
            <Reorder.Group 
              axis="y" 
              values={entriesForDay} 
              onReorder={handleReorder}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem', listStyle: 'none', padding: 0 }}
            >
              <AnimatePresence>
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
              </AnimatePresence>
            </Reorder.Group>
          )}
        </div>
      </div>
    </div>
  );
}
