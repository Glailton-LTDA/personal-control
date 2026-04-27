import React, { useState, useEffect, useMemo } from 'react';
import { formatDate } from '../../lib/utils';
import { 
  X, Calendar, MapPin, Users, Building, Plane, Ticket, 
  DollarSign, FileText, Globe, Clock, ChevronLeft,
  Briefcase, Utensils, Camera, Map, Train, Bus, Ship, Car,
  CheckCircle2, Circle, ExternalLink, ListTodo, Check, Bell, Compass, Edit2, MoreVertical
} from 'lucide-react';

import { AIRPORTS } from '../../lib/constants';
import { estimateItineraryDistance } from '../../lib/geo';

import AttachmentManager from './AttachmentManager';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { CURRENCIES } from '../../constants/currencies';

export default function TripDetails({ trip, onBack, onEdit, onViewChecklists, expenses = [], showValues = true }) {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
  const [showActions, setShowActions] = useState(false);
  const [itinerary, setItinerary] = useState([]);
  const estimatedDistance = useMemo(() => estimateItineraryDistance(itinerary), [itinerary]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    
    // Fetch itinerary for distance calculation
    const fetchItinerary = async () => {
      if (!trip?.id) return;
      const { data } = await supabase
        .from('trip_itinerary')
        .select('location, coordinates')
        .eq('trip_id', trip.id);
      
      if (data) setItinerary(data);
    };
    
    fetchItinerary();
    return () => window.removeEventListener('resize', handleResize);
  }, [trip?.id]);

  if (!trip) return null;

  return (
    <Motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fade-in"
    >
      <div style={{ 
        display: 'flex', 
        alignItems: isMobile ? 'flex-start' : 'center', 
        justifyContent: 'space-between', 
        marginBottom: '2rem',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? '1.5rem' : '0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={onBack} className="icon-btn" style={{ padding: '0.5rem' }}>
            <ChevronLeft size={24} />
          </button>
          <div>
            <h2 data-testid="trip-details-title" style={{ margin: 0, fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: '800', lineHeight: 1.2 }}>{trip.title}</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Detalhes da Viagem</p>
          </div>
        </div>

        {isMobile ? (
          <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={onEdit}
                className="btn-primary" 
                style={{ padding: '0.6rem 1rem', borderRadius: '12px', fontSize: '0.9rem' }}
              >
                <Edit2 size={18} />
              </button>
              <div style={{ position: 'relative' }}>
                <button 
                  onClick={() => setShowActions(!showActions)}
                  className="btn"
                  style={{ 
                    background: 'rgba(255,255,255,0.05)', 
                    color: 'white', 
                    padding: '0.6rem', 
                    borderRadius: '12px',
                    border: '1px solid var(--glass-border)'
                  }}
                >
                  <MoreVertical size={20} />
                </button>
                {showActions && (
                  <>
                    <div 
                      style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
                      onClick={() => setShowActions(false)} 
                    />
                    <div style={{ 
                      position: 'absolute', 
                      top: '100%', 
                      right: 0, 
                      marginTop: '0.5rem',
                      background: 'var(--card-bg)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '12px',
                      padding: '0.5rem',
                      zIndex: 50,
                      minWidth: '200px',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
                    }}>
                      <button 
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('set-active-tab', { detail: { tab: 'trips-itinerary' } }));
                          setShowActions(false);
                        }}
                        style={{ width: '100%', textAlign: 'left', padding: '0.75rem 1rem', borderRadius: '8px', background: 'transparent', border: 'none', color: 'white', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <Compass size={18} /> Editar Roteiro
                      </button>
                      <button 
                        onClick={() => {
                          onViewChecklists();
                          setShowActions(false);
                        }}
                        style={{ width: '100%', textAlign: 'left', padding: '0.75rem 1rem', borderRadius: '8px', background: 'transparent', border: 'none', color: 'white', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <ListTodo size={18} /> Checklists
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              onClick={() => {
                window.dispatchEvent(new CustomEvent('set-active-tab', { detail: { tab: 'trips-itinerary' } }));
              }}
              className="btn" 
              style={{ 
                background: 'rgba(255,255,255,0.05)', 
                color: 'white', 
                padding: '0.6rem 1.2rem', 
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.9rem',
                border: '1px solid var(--glass-border)'
              }}
            >
              <Compass size={18} /> EDITAR ROTEIRO COMPLETO
            </button>
            <button 
              onClick={onViewChecklists}
              className="btn" 
              style={{ 
                background: 'rgba(255,255,255,0.05)', 
                color: 'white', 
                padding: '0.6rem 1.2rem', 
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.9rem',
                border: '1px solid var(--glass-border)'
              }}
            >
              <ListTodo size={18} /> Checklists
            </button>
            <button 
              onClick={onEdit}
              className="btn-primary" 
              style={{ padding: '0.6rem 1.2rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Edit2 size={18} /> Editar
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', order: isMobile ? 1 : 0 }}>
          {/* Info Card */}
          <div className="glass-card" style={{ padding: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
              <InfoItem icon={<Calendar size={20}/>} label="Período" value={`${formatDate(trip.start_date)} - ${formatDate(trip.end_date)}`} />
              <div data-testid="trip-details-location">
                <InfoItem icon={<MapPin size={20}/>} label="Destinos" value={trip.cities?.join(', ') || 'Nenhum'} />
              </div>
              <InfoItem icon={<Globe size={20}/>} label="Países" value={trip.countries?.join(', ') || 'Nenhum'} />
              <InfoItem icon={<Compass size={20}/>} label="Distância Estimada" value={`${Math.round(estimatedDistance).toLocaleString()} km`} />
              <InfoItem icon={<Users size={20}/>} label="Viajantes" value={trip.participants?.join(', ') || 'Somente eu'} />
            </div>
          </div>

          {/* Attachments Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <AttachmentManager 
              label="Hospedagens (Hotéis/Airbnbs)" 
              icon={Building} 
              items={trip.hotels || []} 
              tripId={trip.id}
              onItemsChange={() => {}} 
              readOnly={true}
            />
            <AttachmentManager 
              label="Transporte (Voos/Trens/Ônibus)" 
              icon={Plane} 
              items={trip.transports || []} 
              tripId={trip.id}
              onItemsChange={() => {}} 
              readOnly={true}
            />
            <AttachmentManager 
              label="Tickets & Ingressos" 
              icon={Ticket} 
              items={trip.tickets || []} 
              tripId={trip.id}
              onItemsChange={() => {}} 
              readOnly={true}
            />
            <AttachmentManager 
              label="Documentos Diversos" 
              icon={FileText} 
              items={trip.misc_docs || []} 
              tripId={trip.id}
              onItemsChange={() => {}} 
              readOnly={true}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Financial Summary */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <DollarSign size={20} color="var(--primary)" /> Resumo Financeiro
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(() => {
                const totals = expenses.reduce((acc, exp) => {
                  const curr = exp.currency || 'BRL';
                  acc[curr] = (acc[curr] || 0) + (parseFloat(exp.amount) || 0);
                  return acc;
                }, {});

                const activeCurrencies = Object.keys(totals);

                const getCurrencyInfo = (code) => {
                  const found = CURRENCIES.find(c => c.code === code);
                  if (found) return found;
                  
                  // Fallback para moedas comuns se não encontrar na lista
                  const map = {
                    'BRL': { flag: '🇧🇷', symbol: 'R$' },
                    'USD': { flag: '🇺🇸', symbol: '$' },
                    'EUR': { flag: '🇪🇺', symbol: '€' }
                  };
                  return map[code] || { flag: '💰', symbol: code };
                };

                const renderFlag = (flag, size = '1.2rem') => {
                  if (!flag) return <span>💰</span>;
                  if (flag.startsWith('data:image')) {
                    return (
                      <img 
                        src={flag} 
                        alt="flag" 
                        style={{ 
                          width: size, 
                          height: size, 
                          objectFit: 'contain', 
                          borderRadius: '2px',
                          display: 'block'
                        }} 
                      />
                    );
                  }
                  return <span style={{ fontSize: size, lineHeight: 1 }}>{flag}</span>;
                };

                if (activeCurrencies.length === 0) {
                  return <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Nenhuma despesa registrada.</p>;
                }

                return activeCurrencies.sort().map(curr => {
                  const info = getCurrencyInfo(curr);
                  return (
                    <div key={curr} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '0.85rem 1rem',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ 
                          background: 'rgba(99, 102, 241, 0.2)', 
                          padding: '6px', 
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {renderFlag(info.flag, '1.1rem')}
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: '700' }}>{curr}</span>
                      </div>
                      <span style={{ fontSize: '1.2rem', fontWeight: '800', letterSpacing: '0.5px' }}>
                        {showValues ? `${info.symbol} ${totals[curr].toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '••••'}
                      </span>
                    </div>
                  );
                });
              })()}
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.5rem', lineHeight: '1.4' }}>
                * Os valores acima representam a soma bruta de cada moeda, sem conversão cambial aplicada.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Motion.div>
  );
}

function InfoItem({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <div style={{ color: 'var(--primary)', opacity: 0.8 }}>{icon}</div>
      <div>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em' }}>{label}</p>
        <p style={{ margin: '2px 0 0 0', fontWeight: '600', fontSize: '1rem' }}>{value}</p>
      </div>
    </div>
  );
}
