import React, { useState, useEffect, useMemo } from 'react';
import { formatDate } from '../../lib/utils';
import { 
  X, Calendar, MapPin, Users, Building, Plane, Ticket, 
  DollarSign, FileText, Globe, Clock, ChevronLeft,
  Briefcase, Utensils, Camera, Map, Train, Bus, Ship, Car,
  CheckCircle2, Circle, ExternalLink, ListTodo, Check, Bell, Compass, Edit2
} from 'lucide-react';

import { AIRPORTS } from '../../lib/constants';
import { estimateItineraryDistance } from '../../lib/geo';

import AttachmentManager from './AttachmentManager';
import { AnimatePresence, motion as Motion } from 'framer-motion';

export default function TripDetails({ trip, onBack, onEdit, onViewChecklists }) {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);


  const estimatedDistance = useMemo(() => estimateItineraryDistance(trip?.itinerary || []), [trip?.itinerary]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!trip) return null;

  return (
    <Motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fade-in"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={onBack} className="icon-btn" style={{ padding: '0.5rem' }}>
            <ChevronLeft size={24} />
          </button>
          <div>
            <h2 data-testid="trip-details-title" style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800' }}>{trip.title}</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Detalhes da Viagem</p>
          </div>
        </div>
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
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Info Card */}
          <div className="glass-card" style={{ padding: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
              <InfoItem icon={<Calendar size={20}/>} label="Período" value={`${formatDate(trip.start_date)} - ${formatDate(trip.end_date)}`} />
              <div data-testid="trip-details-location">
                <InfoItem icon={<MapPin size={20}/>} label="Destinos" value={trip.cities?.join(', ') || 'Nenhum'} />
              </div>
              <InfoItem icon={<Compass size={20}/>} label="Distância Estimada" value={`${Math.round(estimatedDistance).toLocaleString()} km`} />
              <InfoItem icon={<Users size={20}/>} label="Viajantes" value={trip.travelers?.join(', ') || 'Somente eu'} />
            </div>
          </div>

          {/* Attachments Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <AttachmentManager 
              label="Hospedagens (Hotéis/Airbnbs)" 
              icon={Building} 
              items={trip.accommodations || []} 
              tripId={trip.id}
              onItemsChange={() => {}} // Read-only here
            />
            <AttachmentManager 
              label="Transporte (Voos/Trens/Ônibus)" 
              icon={Plane} 
              items={trip.transportations || []} 
              tripId={trip.id}
              onItemsChange={() => {}} 
            />
            <AttachmentManager 
              label="Tickets & Ingressos" 
              icon={Ticket} 
              items={trip.tickets || []} 
              tripId={trip.id}
              onItemsChange={() => {}} 
            />
            <AttachmentManager 
              label="Documentos Diversos" 
              icon={FileText} 
              items={trip.misc_docs || []} 
              tripId={trip.id}
              onItemsChange={() => {}} 
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Budget Summary would go here */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <DollarSign size={20} color="var(--primary)" /> Orçamento
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
               {/* Simplified version for now */}
               <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Visualize o resumo financeiro desta viagem no dashboard.</p>
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
