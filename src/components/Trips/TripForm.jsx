import React, { useState, useEffect } from 'react';
import { motion as Motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { Plane, Save, X, MapPin, Globe, Building, Car, DollarSign, Ticket, Users, Calendar, ArrowLeft, Map, FileText } from 'lucide-react';
import CurrencySelector from './CurrencySelector';
import BadgeInput from './BadgeInput';
import CityBadgeInput from './CityBadgeInput';
import AttachmentManager from './AttachmentManager';
import ItineraryManager from './ItineraryManager';
import toast from 'react-hot-toast';
import { useEncryption } from '../../contexts/EncryptionContext';

export default function TripForm({ user, trip, onBack, onSave }) {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const { encryptObject } = useEncryption();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const prepareItems = (items) => {
    if (!Array.isArray(items)) return [];
    
    const safeGenerateId = () => {
      try {
        return crypto.randomUUID();
      } catch {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
      }
    };

    return items.map(item => {
      if (typeof item === 'string') {
        return { id: safeGenerateId(), name: item, receipt_url: null };
      }
      if (!item.id) {
        return { ...item, id: safeGenerateId() };
      }
      return item;
    });
  };

  const [formData, setFormData] = useState({
    title: trip?.title || '',
    cities: Array.isArray(trip?.cities) ? trip.cities : (trip?.cities ? [trip.cities] : []),
    countries: Array.isArray(trip?.countries) ? trip.countries : (trip?.countries ? [trip.countries] : []),
    hotels: prepareItems(trip?.hotels),
    transports: prepareItems(trip?.transports),
    tickets: prepareItems(trip?.tickets),
    misc_docs: prepareItems(trip?.misc_docs),
    daily_limits: trip?.daily_limits || {},
    currencies: trip?.currencies || ['BRL'],
    start_date: trip?.start_date || '',
    end_date: trip?.end_date || '',
    participants: Array.isArray(trip?.participants) ? trip.participants : (trip?.participants ? [trip.participants] : []),
    itinerary: Array.isArray(trip?.itinerary) ? trip.itinerary : []
  });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const handleAddToTickets = (e) => {
      const ticket = e.detail;
      setFormData(prev => ({
        ...prev,
        tickets: [...prev.tickets, ticket]
      }));
    };

    window.addEventListener('add-to-tickets', handleAddToTickets);
    return () => window.removeEventListener('add-to-tickets', handleAddToTickets);
  }, []);

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    setIsSaving(true);
    
    const encryptedPayload = await encryptObject(formData, [
      'title',
      'cities.*',
      'countries.*',
      'participants.*',
      'hotels.*.name',
      'hotels.*.address',
      'hotels.*.confirmation',
      'hotels.*.notes',
      'transports.*.name',
      'transports.*.confirmation',
      'transports.*.origin',
      'transports.*.destination',
      'transports.*.transport_id',
      'transports.*.coach',
      'transports.*.seats.*',
      'transports.*.notes',
      'tickets.*.name',
      'tickets.*.address',
      'tickets.*.confirmation',
      'tickets.*.notes',
      'misc_docs.*.name',
      'misc_docs.*.notes'
    ]);

    const payload = {
      user_id: user.id,
      title: encryptedPayload.title,
      cities: encryptedPayload.cities,
      countries: encryptedPayload.countries,
      hotels: encryptedPayload.hotels,
      transports: encryptedPayload.transports,
      tickets: encryptedPayload.tickets,
      misc_docs: encryptedPayload.misc_docs,
      daily_limits: formData.daily_limits,
      currencies: formData.currencies,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      participants: encryptedPayload.participants
    };

    let result;
    if (trip) {
      result = await supabase.from('trips').update(payload).eq('id', trip.id);
    } else {
      result = await supabase.from('trips').insert([payload]);
    }

    setIsSaving(false);
    if (!result.error) {
      toast.success(trip ? 'Viagem atualizada!' : 'Viagem criada com sucesso!');
      onSave();
    }
    else toast.error('Erro ao salvar: ' + result.error.message);
  }

  return (
    <Motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fade-in"
      style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '5rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <button 
          onClick={onBack}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem', 
            color: 'var(--text-main)', 
            fontWeight: '700',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--glass-border)',
            padding: '0.6rem 1.2rem',
            borderRadius: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          className="back-btn-hover"
        >
          <ArrowLeft size={20} /> 
          <span style={{ fontSize: '0.95rem' }}>Voltar</span>
        </button>
        <div style={{ textAlign: 'right' }}>
           <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-main)' }}>
             {trip ? 'Editar Viagem' : 'Nova Viagem'}
           </h2>
           <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
             {trip ? 'Atualize os detalhes da jornada' : 'Comece a planejar sua aventura'}
           </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Basic Info Card */}
        <div className="glass-card" style={{ padding: isMobile ? '1.25rem' : '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--glass-border)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Plane size={20} className="text-primary" /> Informações Básicas
          </h3>
          
          <div>
            <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}>Título da Viagem</label>
            <input 
              required className="glass-input" 
              style={{ width: '100%', padding: '1rem 1.25rem', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', borderRadius: '12px', fontSize: '1.1rem', fontWeight: '600' }} 
              value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ex: Férias no Peru" 
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', gridAutoFlow: 'row dense' }}>
            <div className="mobile-full">
              <CityBadgeInput 
                label="Locais Visitados" 
                icon={MapPin} 
                values={formData.cities} 
                placeholder="Ex: Londres, Reino Unido..."
                onValuesChange={(newValues) => {
                  // Update cities
                  setFormData(prev => {
                    const next = {...prev, cities: newValues};
                    
                    // Automatically derive countries from the "City, Country" strings
                    const derivedCountries = new Set(prev.countries);
                    newValues.forEach(val => {
                      const parts = val.split(',').map(p => p.trim());
                      if (parts.length > 1) {
                        derivedCountries.add(parts[parts.length - 1]);
                      }
                    });
                    
                    next.countries = Array.from(derivedCountries);
                    return next;
                  });
                }} 
              />
            </div>
            <div className="mobile-full">
              <BadgeInput 
                label="Países Detectados" 
                icon={Globe} 
                values={formData.countries} 
                placeholder="Identificados automaticamente..."
                onValuesChange={(newValues) => setFormData({...formData, countries: newValues})} 
                readOnly={true}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}><Calendar size={16} /> Início</label>
              <input 
                type="date" className="glass-input" 
                style={{ width: '100%', padding: '1rem', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', borderRadius: '12px' }} 
                value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} 
              />
            </div>
            <div>
              <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}><Calendar size={16} /> Fim</label>
              <input 
                type="date" className="glass-input" 
                style={{ width: '100%', padding: '1rem', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', borderRadius: '12px' }} 
                value={formData.end_date} onChange={e => setFormData({...formData, end_date: e.target.value})} 
              />
            </div>
          </div>
        </div>


        {/* Attachments Card */}
        <div className="glass-card" style={{ padding: isMobile ? '1.25rem' : '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--glass-border)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Building size={20} className="text-primary" /> Hospedagens e Transportes
          </h3>
          
          <AttachmentManager 
            label="Hospedagens (Hotéis/Airbnbs)" 
            icon={Building} 
            items={formData.hotels} 
            tripId={trip?.id || 'new'}
            onItemsChange={(newItems) => setFormData({...formData, hotels: newItems})} 
          />

          <AttachmentManager 
            label="Transportes (Voos/Trens/Aluguéis)" 
            icon={Car} 
            items={formData.transports} 
            tripId={trip?.id || 'new'}
            onItemsChange={(newItems) => setFormData({...formData, transports: newItems})} 
          />

          <AttachmentManager 
            label="Passeios, Ingressos e Tickets" 
            icon={Ticket} 
            items={formData.tickets} 
            tripId={trip?.id || 'new'}
            onItemsChange={(newItems) => setFormData({...formData, tickets: newItems})} 
            defaultExpanded={false}
          />

          <AttachmentManager 
            label="Documentos Diversos (Seguros/Recibos)" 
            icon={FileText} 
            items={formData.misc_docs} 
            tripId={trip?.id || 'new'}
            onItemsChange={(newItems) => setFormData({...formData, misc_docs: newItems})} 
            defaultExpanded={false}
          />
        </div>

        {/* Participants and Money Card */}
        <div className="glass-card" style={{ padding: isMobile ? '1.25rem' : '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--glass-border)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Users size={20} className="text-primary" /> Participantes e Fianças
          </h3>

          <BadgeInput 
            label="Participantes" 
            icon={Users} 
            values={formData.participants} 
            placeholder="Glailton, Deisianne..."
            onValuesChange={(newValues) => setFormData({...formData, participants: newValues})} 
          />

          <div>
            <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}><DollarSign size={16} /> Moedas Disponíveis</label>
            <CurrencySelector 
              selectedCurrencies={formData.currencies} 
              onSelectionChange={(newSelection) => setFormData({...formData, currencies: newSelection})}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <label className="modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem', fontWeight: '600', opacity: 0.7 }}><DollarSign size={16} /> Limites Diários por Moeda</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
              {formData.currencies.map(curr => (
                <div key={curr} className="glass-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700' }}>{curr}</span>
                  <input 
                    type="number" 
                    className="glass-input" 
                    style={{ width: '100%', padding: '0.75rem', background: 'var(--input-bg)', border: 'none', color: 'var(--text-main)', borderRadius: '8px', fontSize: '1rem', fontWeight: '700' }} 
                    value={formData.daily_limits[curr] || ''} 
                    onChange={e => setFormData({
                      ...formData, 
                      daily_limits: { ...formData.daily_limits, [curr]: parseFloat(e.target.value) || 0 }
                    })} 
                    placeholder="0.00" 
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Global Save Button */}
        <div style={{ 
          position: 'sticky', bottom: '1rem', zIndex: 10,
          background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(12px)',
          padding: '1rem', borderRadius: '20px', 
          border: '1px solid var(--glass-border)',
          display: 'flex', gap: '1rem'
        }}>
           <button 
             type="button" 
             onClick={onBack}
             className="btn" 
             style={{ flex: 1, padding: '1.25rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', fontWeight: '700', borderRadius: '16px', border: 'none' }}
           >
             Cancelar
           </button>
           <button 
             type="submit" 
             disabled={isSaving}
             className="btn" 
             style={{ flex: 2, padding: '1.25rem', background: 'var(--primary)', color: 'white', fontWeight: '800', fontSize: '1.1rem', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', border: 'none', cursor: 'pointer', boxShadow: '0 10px 25px rgba(99,102,241,0.5)' }}
           >
             {isSaving ? 'Salvando...' : <><Save size={22} /> {trip ? 'Atualizar Viagem' : 'Criar Viagem'}</>}
           </button>
        </div>
      </form>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          .mobile-full {
             grid-column: span 2;
          }
        }
        .back-btn-hover:hover {
          background: rgba(255, 255, 255, 0.1) !important;
          transform: translateX(-3px);
        }
      `}} />
    </Motion.div>
  );
}
