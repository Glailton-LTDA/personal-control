import React from 'react';
import { formatDate } from '../../lib/utils';
import { 
  X, Calendar, MapPin, Users, Building, Plane, Ticket, 
  DollarSign, FileText, Globe, Clock, ChevronLeft,
  Briefcase, Utensils, Camera, Map, Train, Bus, Ship, Car,
  CheckCircle2, Circle, ExternalLink, ListTodo, Check, Bell
} from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { AIRPORTS } from '../../data/airports';

export default function TripDetails({ trip, onClose, expenses, showValues, onViewChecklists }) {
  const [isMobile, setIsMobile] = React.useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!trip) return null;

  const toggleEntryCompletion = async (entryId) => {
    const updatedItinerary = (trip.itinerary || []).map(entry => 
      entry.id === entryId ? { ...entry, completed: !entry.completed } : entry
    );
    
    // Optimistic update (optional, but let's do it via the prop if possible)
    // Since we don't have a direct setTrip here, we'll just do the DB update
    // and hope the parent re-renders or the user is fine with the DB update.
    // In a real app, you'd use a state manager or refresh the trip.
    await supabase.from('trips').update({ itinerary: updatedItinerary }).eq('id', trip.id);
    
    // We can dispatch a global event to tell the parent to refresh if needed
    window.dispatchEvent(new CustomEvent('trip-updated'));
  };

  const itineraryByDay = (trip.itinerary || []).reduce((acc, entry) => {
    if (!acc[entry.day]) acc[entry.day] = [];
    acc[entry.day].push(entry);
    return acc;
  }, {});

  // Sort entries within each day by time
  Object.keys(itineraryByDay).forEach(day => {
    itineraryByDay[day].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  });

  const sortedDays = Object.keys(itineraryByDay).sort();

  // Calculate total spent per currency
  const currencies = trip.currencies || ['BRL'];
  const totals = currencies.reduce((acc, curr) => {
    acc[curr] = expenses
      .filter(exp => exp.currency === curr)
      .reduce((sum, exp) => sum + (exp.amount || 0), 0);
    return acc;
  }, {});

  const renderSectionHeader = (title, Icon, color = 'var(--primary)') => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', marginTop: '1rem' }}>
      <div style={{ padding: '0.6rem', background: `${color}15`, borderRadius: '12px', color: color }}>
        <Icon size={20} />
      </div>
      <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.01em' }}>{title}</h3>
    </div>
  );

  const renderItemCard = (item, typeIcon, color = 'var(--primary)') => {
    const isHotel = typeIcon === Building;
    const isTransport = !!item.transports_type || typeIcon === Plane;
    const isTour = typeIcon === Ticket;

    const TRANSPORT_TYPES = {
      flight: { icon: Plane, color: '#10b981', label: 'Voo', originLabel: 'Origem', destLabel: 'Destino', idLabel: 'Voo', coachLabel: 'Portão' },
      train: { icon: Train, color: '#3b82f6', label: 'Trem', originLabel: 'Partida', destLabel: 'Chegada', idLabel: 'Trem', coachLabel: 'Carro' },
      bus: { icon: Bus, color: '#f59e0b', label: 'Ônibus', originLabel: 'Partida', destLabel: 'Chegada', idLabel: 'Linha', coachLabel: 'Plataforma' },
      ship: { icon: Ship, color: '#06b6d4', label: 'Navio', originLabel: 'Porto de Saída', destLabel: 'Porto de Chegada', idLabel: 'Cabine', coachLabel: 'Deck' },
      car: { icon: Car, color: '#ef4444', label: 'Carro', originLabel: 'Retirada', destLabel: 'Devolução', idLabel: 'Placa', coachLabel: '' },
      generic: { icon: MapPin, color: 'var(--primary)', label: 'Transporte', originLabel: 'Origem', destLabel: 'Destino', idLabel: 'ID', coachLabel: '' }
    };

    const currentType = TRANSPORT_TYPES[item.transports_type] || TRANSPORT_TYPES.flight;
    const finalIcon = isTransport ? currentType.icon : typeIcon;
    const finalColor = isTransport ? currentType.color : color;

    const startLabel = isHotel ? 'Check-in' : isTransport ? 'Partida' : 'Data';
    const endLabel = isHotel ? 'Check-out' : isTransport ? 'Chegada' : null;

    return (
      <div key={item.id} className="glass-card" style={{ 
        padding: '1.5rem', 
        borderRadius: '24px', 
        background: 'rgba(255,255,255,0.03)', 
        border: '1px solid var(--glass-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        position: 'relative'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: `${finalColor}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: finalColor }}>
              {React.createElement(finalIcon, { size: 20 })}
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '800' }}>{item.name}</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.2rem' }}>
                {item.confirmation && (
                  <span style={{ fontSize: '0.7rem', opacity: 0.5, fontWeight: '700', letterSpacing: '0.02em', background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>CONF: {item.confirmation}</span>
                )}
                {isTransport && item.transport_id && (
                  <span style={{ fontSize: '0.7rem', opacity: 0.7, fontWeight: '700', color: finalColor, background: `${finalColor}10`, padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                    {currentType.idLabel}: {item.transport_id}
                  </span>
                )}
                {isTransport && item.coach && (
                  <span style={{ fontSize: '0.7rem', opacity: 0.7, fontWeight: '700', color: finalColor, background: `${finalColor}10`, padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                    {currentType.coachLabel}: {item.coach}
                  </span>
                )}
                {isTransport && item.seats?.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {item.seats.map(s => (
                      <span key={s} style={{ fontSize: '0.7rem', fontWeight: '800', background: 'var(--primary)', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>🛋️ {s}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          {item.receipt_url && (
            <a href={item.receipt_url} target="_blank" rel="noopener noreferrer" className="btn" style={{ padding: '0.5rem 0.75rem', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', fontSize: '0.7rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '800', textTransform: 'uppercase', flexShrink: 0 }}>
              <FileText size={14} /> Voucher
            </a>
          )}
        </div>

        {isTransport && item.origin && item.destination && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: '1.5rem', 
            background: 'rgba(255,255,255,0.02)', 
            padding: '1rem', 
            borderRadius: '16px', 
            margin: '0.25rem 0',
            border: '1px solid rgba(255,255,255,0.03)'
          }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ 
                fontSize: item.transports_type === 'flight' ? '1.5rem' : '1rem', 
                fontWeight: '900', 
                letterSpacing: '0.05em', 
                color: 'var(--text-main)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {item.origin}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.5, fontWeight: '600' }}>
                {item.transports_type === 'flight' ? (AIRPORTS.find(a => a.iata === item.origin)?.city || 'Origem') : currentType.originLabel}
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', opacity: 0.3 }}>
              {React.createElement(finalIcon, { size: 18, style: { transform: item.transports_type === 'flight' ? 'rotate(90deg)' : 'none' } })}
              <div style={{ width: '40px', height: '1px', background: 'currentColor' }}></div>
            </div>

            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ 
                fontSize: item.transports_type === 'flight' ? '1.5rem' : '1rem', 
                fontWeight: '900', 
                letterSpacing: '0.05em', 
                color: 'var(--text-main)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {item.destination}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.5, fontWeight: '600' }}>
                {item.transports_type === 'flight' ? (AIRPORTS.find(a => a.iata === item.destination)?.city || 'Destino') : currentType.destLabel}
              </div>
            </div>
          </div>
        )}

        {isTour && item.address && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: '10px' }}>
            <MapPin size={14} style={{ color: color }} />
            <span style={{ fontStyle: 'italic' }}>{item.address}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: endLabel ? '1fr 1fr' : '1fr', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '0.85rem', borderRadius: '14px' }}>
          <div>
            <div style={{ fontSize: '0.65rem', opacity: 0.4, fontWeight: '800', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{startLabel}</div>
            <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>
              {item.start_date ? formatDate(item.start_date) : 'N/A'}
              {item.start_time && <span style={{ marginLeft: '0.3rem', opacity: 0.6 }}>• {item.start_time}</span>}
            </div>
          </div>
          {endLabel && (
            <div>
              <div style={{ fontSize: '0.65rem', opacity: 0.4, fontWeight: '800', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{endLabel}</div>
              <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>
                {item.end_date ? formatDate(item.end_date) : 'N/A'}
                {item.end_time && <span style={{ marginLeft: '0.3rem', opacity: 0.6 }}>• {item.end_time}</span>}
              </div>
            </div>
          )}
        </div>

        {item.notes && (
          <div style={{ fontSize: '0.85rem', padding: '0.75rem', borderLeft: `2px solid ${finalColor}`, background: `${finalColor}05`, borderRadius: '0 8px 8px 0', opacity: 0.8 }}>
            {item.notes}
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      data-testid="trip-details-modal"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#0f172a',
        zIndex: 1000,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}
      className="custom-scrollbar"
    >
      {/* Header Bar */}
      <div style={{ 
        padding: isMobile ? '1rem 1.25rem' : '1.5rem 2rem', 
        borderBottom: '1px solid var(--glass-border)', 
        display: 'flex', 
        alignItems: 'center', 
        gap: isMobile ? '1rem' : '1.5rem',
        background: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <button 
          onClick={onClose}
          aria-label="Voltar"
          style={{ 
            background: 'rgba(255,255,255,0.05)', 
            border: 'none', 
            borderRadius: '12px', 
            padding: '0.6rem', 
            color: 'white', 
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <ChevronLeft size={24} />
        </button>
        <div style={{ flex: 1 }}>
          <h2 data-testid="trip-details-title" style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900', letterSpacing: '-0.02em' }}>{trip.title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem', opacity: 0.6, fontSize: '0.9rem' }}>
            <Calendar size={14} /> 
            {trip.start_date ? formatDate(trip.start_date) : 'A definir'}
            {trip.end_date && ` — ${formatDate(trip.end_date)}`}
          </div>
          {(trip.cities?.length > 0 || trip.countries?.length > 0) && (
            <div data-testid="trip-details-location" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.2rem', opacity: 0.5, fontSize: '0.8rem' }}>
              <MapPin size={12} />
              {trip.cities?.join(', ')} {trip.countries?.length > 0 && ` — ${trip.countries?.join(', ')}`}
            </div>
          )}
        </div>

        {onViewChecklists && (
          <button 
            onClick={onViewChecklists}
            className="btn-primary"
            style={{ 
              padding: '0.65rem 1.25rem', 
              borderRadius: '12px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.6rem',
              fontWeight: '800',
              fontSize: '0.9rem',
              boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)'
            }}
          >
            <ListTodo size={18} /> Checklist
          </button>
        )}
      </div>

      {/* Main Content Container */}
      <div style={{ 
        maxWidth: '1200px', 
        width: '100%', 
        margin: '0 auto', 
        padding: isMobile ? '1rem 1.25rem' : '2rem',
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 340px',
        gap: '2.5rem'
      }}>
        
        {/* Left Column: Logistics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
          
          {/* Summary Section */}
          <section>
            {renderSectionHeader('Logística de Viagem', Map)}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.5rem' }}>
              <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--primary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', opacity: 0.7 }}>
                  <MapPin size={18} /> <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Destinos</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {trip.countries?.map(c => <span key={c} style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', padding: '0.35rem 0.75rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '700' }}>🌍 {c}</span>)}
                  {trip.cities?.map(c => <span key={c} style={{ background: 'rgba(255,255,255,0.05)', padding: '0.35rem 0.75rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '700' }}>📍 {c}</span>)}
                </div>
              </div>

              <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--success)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', opacity: 0.7 }}>
                  <Users size={18} /> <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Viajantes</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {trip.participants?.map(p => <span key={p} style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', padding: '0.35rem 0.75rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '700' }}>👤 {p}</span>)}
                </div>
              </div>
            </div>
          </section>

          {/* Hospedagem */}
          <section>
            {renderSectionHeader('Hospedagem', Building, '#6366f1')}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1.5rem' }}>
              {(!trip.hotels || trip.hotels.length === 0) ? (
                <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', opacity: 0.4, gridColumn: '1/-1', border: '1px dashed var(--glass-border)' }}>Nenhuma hospedagem registrada.</div>
              ) : (
                trip.hotels.map(h => renderItemCard(h, Building, '#6366f1'))
              )}
            </div>
          </section>

          {/* Transportes */}
          <section>
            {renderSectionHeader('Transportes', Plane, '#10b981')}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1.5rem' }}>
              {(!trip.transports || trip.transports.length === 0) ? (
                <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', opacity: 0.4, gridColumn: '1/-1', border: '1px dashed var(--glass-border)' }}>Nenhum transporte registrado.</div>
              ) : (
                trip.transports.map(t => renderItemCard(t, Plane, '#10b981'))
              )}
            </div>
          </section>

          {/* Passeios e Ingressos */}
          <section>
            {renderSectionHeader('Passeios e Ingressos', Ticket, '#f59e0b')}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1.5rem' }}>
              {(!trip.tickets || trip.tickets.length === 0) ? (
                <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', opacity: 0.4, gridColumn: '1/-1', border: '1px dashed var(--glass-border)' }}>Nenhum passeio ou ingresso registrado.</div>
              ) : (
                trip.tickets.map(t => renderItemCard(t, Ticket, '#f59e0b'))
              )}
            </div>
          </section>

          {/* Roteiro Dia a Dia */}
          <section style={{ marginBottom: '4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              {renderSectionHeader('Roteiro da Viagem', Calendar, 'var(--primary)')}
              <button 
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('navigate-to-itinerary', { detail: { tripId: trip.id } }));
                  onClose(); // Close modal
                }}
                style={{ background: 'rgba(99,102,241,0.1)', border: 'none', color: 'var(--primary)', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <ExternalLink size={14} /> EDITAR ROTEIRO COMPLETO
              </button>
            </div>
            
            {sortedDays.length === 0 ? (
              <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', opacity: 0.4, border: '1px dashed var(--glass-border)' }}>
                Nenhum roteiro planejado para esta viagem.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {sortedDays.map(day => (
                  <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: '900', color: 'var(--primary)' }}>{day.split('-').reverse().slice(0, 2).join('/')}</span>
                        <span style={{ fontSize: '0.8rem', opacity: 0.5, textTransform: 'uppercase', fontWeight: '800' }}>
                          {new Date(day + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}
                        </span>
                      </div>
                      <button 
                        onClick={() => {
                          const waypoints = itineraryByDay[day].filter(e => e.location).map(e => encodeURIComponent(e.location)).join('/');
                          if (waypoints) window.open(`https://www.google.com/maps/dir/${waypoints}`, '_blank');
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      >
                        <Map size={14} /> VER ROTA NO MAPA
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingLeft: '0.5rem' }}>
                      {itineraryByDay[day].map((entry, idx) => (
                        <div 
                          key={entry.id} 
                          style={{ 
                            display: 'flex', 
                            gap: '1rem', 
                            position: 'relative',
                            opacity: entry.completed ? 0.5 : 1,
                            transition: '0.3s'
                          }}
                        >
                          {/* Timeline Line */}
                          {idx < itineraryByDay[day].length - 1 && (
                            <div style={{ position: 'absolute', left: '11px', top: '24px', bottom: '-12px', width: '2px', background: 'rgba(255,255,255,0.05)' }}></div>
                          )}

                          <button 
                            onClick={() => toggleEntryCompletion(entry.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: entry.completed ? 'var(--success)' : 'var(--text-muted)', zIndex: 1, height: '24px' }}
                          >
                            {entry.completed ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                          </button>

                          <div style={{ flex: 1, paddingBottom: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              {entry.time && <span style={{ fontSize: '0.85rem', fontWeight: '900', color: 'white' }}>{entry.time}</span>}
                              <span style={{ fontSize: '0.95rem', fontWeight: '700', color: entry.completed ? 'var(--text-muted)' : 'var(--text-main)' }}>
                                {entry.location}
                              </span>
                              {entry.is_booked && <Check size={12} style={{ color: 'var(--success)' }} title="Reservado" />}
                              {!entry.is_booked && entry.needs_booking && <Bell size={12} style={{ color: 'var(--warning)' }} title="Precisa reservar" />}
                            </div>
                            {entry.notes && (
                              <div style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '0.2rem', fontStyle: 'italic' }}>
                                {entry.notes}
                              </div>
                            )}
                          </div>
                          
                          <button 
                            onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(entry.location)}`, '_blank')}
                            style={{ background: 'rgba(255,255,255,0.03)', border: 'none', borderRadius: '8px', padding: '0.4rem', color: 'var(--text-muted)', cursor: 'pointer' }}
                          >
                            <ExternalLink size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Despesas Recentes */}
          <section data-testid="trip-expenses-section" style={{ marginBottom: '4rem' }}>
            {renderSectionHeader('Despesas Recentes', DollarSign, '#ef4444')}
            {(!expenses || expenses.length === 0) ? (
              <div data-testid="no-expenses-msg" className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', opacity: 0.4, border: '1px dashed var(--glass-border)' }}>Nenhuma despesa registrada.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {expenses.map((exp, idx) => (
                  <div key={idx} data-testid={`expense-item-${idx}`} className="glass-card" style={{ padding: '1.25rem', borderRadius: '20px', border: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div data-testid={`expense-desc-${idx}`}>
                      <div style={{ fontWeight: '800', color: '#f8fafc' }}>{exp.description}</div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '0.2rem' }}>{formatDate(exp.date)} • {exp.paid_by}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '900', color: '#ef4444', fontSize: '1.1rem' }}>{exp.currency} {exp.amount.toLocaleString()}</div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.7, color: exp.trip_categories?.color }}>{exp.trip_categories?.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Financial Summary */}
        <div style={{ position: isMobile ? 'static' : 'sticky', top: '7rem', height: 'fit-content', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-card" style={{ padding: '2rem', border: '1px solid var(--primary)', background: 'linear-gradient(135deg, rgba(99,102,241,0.05), rgba(15,23,42,0.9))' }}>
            <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', fontWeight: '800', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>Resumo de Gastos</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {currencies.map(curr => (
                <div key={curr} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '800' }}>{curr}</div>
                    <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>Total</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: '900', fontSize: '1.2rem' }}>
                      {showValues ? (totals[curr] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '••••'}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '2rem', padding: '1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', opacity: 0.6, fontSize: '0.8rem' }}>
                <Clock size={14} /> Média Diária Real
              </div>
              {currencies.slice(0, 1).map(curr => {
                const currencyExpenses = expenses.filter(e => e.currency === curr);
                const uniqueDaysWithExpenses = new Set(currencyExpenses.map(e => e.date)).size;
                const days = Math.max(1, uniqueDaysWithExpenses);
                const avg = (totals[curr] || 0) / days;
                return (
                  <div key={curr} style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--success)' }}>
                    {showValues ? avg.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '••••'} <small style={{ fontSize: '0.7rem' }}>{curr}/dia ({days} {days === 1 ? 'dia' : 'dias'})</small>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ padding: '0 1rem' }}>
            <p style={{ fontSize: '0.75rem', opacity: 0.4, textAlign: 'center', lineHeight: '1.5' }}>
              Todos os comprovantes estão seguros no armazenamento em nuvem e podem ser acessados a qualquer momento clicando em "Ver Voucher".
            </p>
          </div>
        </div>

      </div>
    </motion.div>
    );
}
