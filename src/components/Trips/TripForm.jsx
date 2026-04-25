import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plane, Save, X, MapPin, Globe, Building, Car, DollarSign, Ticket, Users, Calendar, ArrowLeft } from 'lucide-react';
import CurrencySelector from './CurrencySelector';
import BadgeInput from './BadgeInput';
import AttachmentManager from './AttachmentManager';
import { motion } from 'framer-motion';

export default function TripForm({ user, trip, onBack, onSave }) {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

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
      } catch (e) {
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
    daily_limits: trip?.daily_limits || {},
    currencies: trip?.currencies || ['BRL'],
    start_date: trip?.start_date || '',
    end_date: trip?.end_date || '',
    participants: Array.isArray(trip?.participants) ? trip.participants : (trip?.participants ? [trip.participants] : [])
  });

  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    setIsSaving(true);
    
    const payload = {
      user_id: user.id,
      title: formData.title,
      cities: formData.cities,
      countries: formData.countries,
      hotels: formData.hotels,
      transports: formData.transports,
      tickets: formData.tickets,
      daily_limits: formData.daily_limits,
      currencies: formData.currencies,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      participants: formData.participants
    };

    let result;
    if (trip) {
      result = await supabase.from('trips').update(payload).eq('id', trip.id);
    } else {
      result = await supabase.from('trips').insert([payload]);
    }

    setIsSaving(false);
    if (!result.error) onSave();
    else alert('Erro ao salvar: ' + result.error.message);
  }

  return (
    <motion.div 
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
        <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--glass-border)' }}>
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
              <BadgeInput 
                label="Cidades" 
                icon={MapPin} 
                values={formData.cities} 
                placeholder="Cusco, Lima..."
                onValuesChange={(newValues) => setFormData({...formData, cities: newValues})} 
              />
            </div>
            <div className="mobile-full">
              <BadgeInput 
                label="Países" 
                icon={Globe} 
                values={formData.countries} 
                placeholder="Peru, Chile..."
                onValuesChange={(newValues) => setFormData({...formData, countries: newValues})} 
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

        {/* Itinerary / Attachments Card */}
        <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--glass-border)' }}>
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
        </div>

        {/* Participants and Money Card */}
        <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--glass-border)' }}>
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

        {/* Global Save Button - Sticky at bottom on mobile? */}
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
    </motion.div>
  );
}
