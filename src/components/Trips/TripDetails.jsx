import React from 'react';
import { formatDate } from '../../lib/utils';
import { 
  X, Calendar, MapPin, Users, Building, Plane, Ticket, 
  DollarSign, FileText, Globe, Clock, ChevronLeft,
  Briefcase, Utensils, Camera, Map
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function TripDetails({ trip, onClose, expenses, showValues }) {
  const [isMobile, setIsMobile] = React.useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!trip) return null;

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
    const isTransport = typeIcon === Plane;
    const isTour = typeIcon === Ticket;

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
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: `${color}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color }}>
              {React.createElement(typeIcon, { size: 20 })}
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '800' }}>{item.name}</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.2rem' }}>
                {item.confirmation && (
                  <span style={{ fontSize: '0.7rem', opacity: 0.5, fontWeight: '700', letterSpacing: '0.02em', background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>CONF: {item.confirmation}</span>
                )}
                {isTransport && item.transport_id && (
                  <span style={{ fontSize: '0.7rem', opacity: 0.7, fontWeight: '700', color: 'var(--success)', background: 'rgba(16,185,129,0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{item.transport_id}</span>
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
          <div style={{ fontSize: '0.85rem', padding: '0.75rem', borderLeft: `2px solid ${color}`, background: `${color}05`, borderRadius: '0 8px 8px 0', opacity: 0.8 }}>
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
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900', letterSpacing: '-0.02em' }}>{trip.title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem', opacity: 0.6, fontSize: '0.9rem' }}>
            <Calendar size={14} /> 
            {trip.start_date ? formatDate(trip.start_date) : 'A definir'}
            {trip.end_date && ` — ${formatDate(trip.end_date)}`}
          </div>
        </div>
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
            {renderSectionHeader('Transportes e Voos', Plane, '#10b981')}
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

          {/* Placeholder for future Roteiro */}
          <section style={{ opacity: 0.3, marginBottom: '4rem' }}>
            {renderSectionHeader('Roteiro Dia a Dia (Em breve)', Calendar, 'gray')}
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', borderRadius: '24px', border: '1px dashed var(--glass-border)' }}>
              <Clock size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
              <p style={{ fontWeight: '700' }}>Planejamento Detalhado</p>
              <p style={{ fontSize: '0.9rem' }}>A funcionalidade de cronograma diário será habilitada em uma futura atualização.</p>
            </div>
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
                <Clock size={14} /> Média Diária Estimada
              </div>
              {currencies.slice(0, 1).map(curr => {
                const start = trip.start_date ? new Date(trip.start_date) : null;
                const end = trip.end_date ? new Date(trip.end_date) : new Date();
                const days = start ? Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1) : 1;
                const avg = (totals[curr] || 0) / days;
                return (
                  <div key={curr} style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--success)' }}>
                    {showValues ? avg.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '••••'} <small style={{ fontSize: '0.7rem' }}>{curr}/dia</small>
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
