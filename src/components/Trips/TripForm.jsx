import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useOfflineCreateTrip, useOfflineUpdateTrip } from '../../hooks/useOfflineTrips';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { 
  Plane, Save, X, MapPin, Globe, Building, Car, DollarSign, 
  Ticket, Users, Calendar, ArrowLeft, Map, FileText, Info
} from 'lucide-react';
import CurrencySelector from './CurrencySelector';
import BadgeInput from './BadgeInput';
import CityBadgeInput from './CityBadgeInput';
import AttachmentManager from './AttachmentManager';
import toast from 'react-hot-toast';

export default function TripForm({ user, trip, onBack, onSave }) {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [isSaving, setIsSaving] = useState(false);
  const createTripMutation = useOfflineCreateTrip(user.id);
  const updateTripMutation = useOfflineUpdateTrip(user.id);

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
    daily_limits: Object.fromEntries(
      Object.entries(trip?.daily_limits || {}).map(([k, v]) => [k, (v || 0).toFixed(2).replace('.', ',')])
    ),
    currencies: trip?.currencies || ['BRL'],
    start_date: trip?.start_date || '',
    end_date: trip?.end_date || '',
    participants: Array.isArray(trip?.participants) ? trip.participants : (trip?.participants ? [trip.participants] : []),
    itinerary: Array.isArray(trip?.itinerary) ? trip.itinerary : []
  });

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
    if (!formData.title) {
      toast.error(t('trips.trip_title_req'));
      return;
    }

    setIsSaving(true);
    
    const tripId = trip?.id || crypto.randomUUID();

    const payload = {
      id: tripId,
      user_id: user.id,
      title: formData.title,
      cities: formData.cities,
      countries: formData.countries,
      hotels: formData.hotels,
      transports: formData.transports,
      tickets: formData.tickets,
      misc_docs: formData.misc_docs,
      daily_limits: Object.fromEntries(
        Object.entries(formData.daily_limits).map(([k, v]) => [k, parseFloat(String(v).replace(',', '.')) || 0])
      ),
      currencies: formData.currencies,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      participants: formData.participants
    };

    try {
      if (trip) {
        await updateTripMutation.mutateAsync({ id: trip.id, ...payload });
        toast.success(t('trips.trip_update_success'));
      } else {
        await createTripMutation.mutateAsync(payload);
        toast.success(t('trips.trip_create_success'));
      }
      onSave();
    } catch (err) {
      toast.error(t('finances.error_save') + ': ' + err.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="fade-in"
      style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '8rem' }}
    >
      {/* Header with Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3rem' }}>
        <button 
          onClick={onBack}
          className="action-btn"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem', 
            color: 'white', 
            fontWeight: '800',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--glass-border)',
            padding: '0.75rem 1.25rem',
            borderRadius: '16px',
            fontSize: '0.9rem',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <ArrowLeft size={20} className="text-primary" /> 
          <span>{t('trips.voltar').toUpperCase()}</span>
        </button>
        <div style={{ textAlign: 'right' }}>
           <h2 style={{ margin: 0, fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: '900', color: 'white', letterSpacing: '-0.02em', lineHeight: 1 }}>
             {trip ? t('trips.edit_trip').toUpperCase() : t('trips.new_trip').toUpperCase()}
           </h2>
           <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '700', letterSpacing: '0.05em' }}>
             {trip ? t('trips.update_journey').toUpperCase() : t('trips.plan_adventure').toUpperCase()}
           </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Basic Info Section */}
        <section className="glass-card" style={{ padding: isMobile ? '1.5rem' : '2.5rem', display: 'flex', flexDirection: 'column', gap: '2rem', borderRadius: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '10px', borderRadius: '12px', display: 'flex' }}>
              <Plane size={24} className="text-primary" />
            </div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: 'white' }}>{t('trips.essential_info').toUpperCase()}</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: '900', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>{t('trips.trip_title').toUpperCase()}</label>
            <input 
              required className="glass-input" 
              style={{ 
                width: '100%', 
                padding: '1.25rem', 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid var(--glass-border)', 
                color: 'white', 
                borderRadius: '16px', 
                fontSize: '1.25rem', 
                fontWeight: '900',
                transition: '0.3s'
              }} 
              value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder={t('trips.placeholders.trip_title')}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '2rem' }}>
            <CityBadgeInput 
              label={t('trips.locations_visited').toUpperCase()} 
              icon={MapPin} 
              values={formData.cities} 
              placeholder={t('trips.placeholders.locations')}
              onValuesChange={(newValues) => {
                setFormData(prev => {
                  const next = {...prev, cities: newValues};
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
            <BadgeInput 
              label={t('trips.detected_countries').toUpperCase()} 
              icon={Globe} 
              values={formData.countries} 
              placeholder={t('trips.placeholders.auto_detected')}
              onValuesChange={(newValues) => setFormData({...formData, countries: newValues})} 
              readOnly={true}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '900', color: 'var(--text-muted)', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={16} className="text-primary" /> {t('trips.start_date').toUpperCase()}
              </label>
              <input 
                type="date" className="glass-input" 
                style={{ width: '100%', padding: '1.15rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '16px', fontWeight: '800' }} 
                value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} 
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '900', color: 'var(--text-muted)', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={16} className="text-primary" /> {t('trips.end_date').toUpperCase()}
              </label>
              <input 
                type="date" className="glass-input" 
                style={{ width: '100%', padding: '1.15rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '16px', fontWeight: '800' }} 
                value={formData.end_date} onChange={e => setFormData({...formData, end_date: e.target.value})} 
              />
            </div>
          </div>
        </section>

        {/* Assets & Logistics Section */}
        <section className="glass-card" style={{ padding: isMobile ? '1.5rem' : '2.5rem', display: 'flex', flexDirection: 'column', gap: '2rem', borderRadius: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '10px', borderRadius: '12px', display: 'flex' }}>
              <Building size={24} className="text-primary" />
            </div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: 'white' }}>{t('trips.logistics_attachments').toUpperCase()}</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <AttachmentManager 
              label={t('trips.hospedagem').toUpperCase()} 
              icon={Building} 
              items={formData.hotels} 
              tripId={trip?.id || 'new'}
              onItemsChange={(newItems) => setFormData({...formData, hotels: newItems})} 
            />
            <AttachmentManager 
              label={t('trips.transporte').toUpperCase()} 
              icon={Car} 
              items={formData.transports} 
              tripId={trip?.id || 'new'}
              onItemsChange={(newItems) => setFormData({...formData, transports: newItems})} 
            />
            <AttachmentManager 
              label={t('trips.ingressos').toUpperCase()} 
              icon={Ticket} 
              items={formData.tickets} 
              tripId={trip?.id || 'new'}
              onItemsChange={(newItems) => setFormData({...formData, tickets: newItems})} 
              defaultExpanded={false}
            />
            <AttachmentManager 
              label={t('trips.documentos').toUpperCase()} 
              icon={FileText} 
              items={formData.misc_docs} 
              tripId={trip?.id || 'new'}
              onItemsChange={(newItems) => setFormData({...formData, misc_docs: newItems})} 
              defaultExpanded={false}
            />
          </div>
        </section>

        {/* Finance & Participants Section */}
        <section className="glass-card" style={{ padding: isMobile ? '1.5rem' : '2.5rem', display: 'flex', flexDirection: 'column', gap: '2rem', borderRadius: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '10px', borderRadius: '12px', display: 'flex' }}>
              <Users size={24} className="text-primary" />
            </div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: 'white' }}>{t('trips.finance_participants').toUpperCase()}</h3>
          </div>

          <BadgeInput 
            label={t('trips.participants').toUpperCase()} 
            icon={Users} 
            values={formData.participants} 
            placeholder={t('trips.placeholders.participants')}
            onValuesChange={(newValues) => setFormData({...formData, participants: newValues})} 
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: '900', color: 'var(--text-muted)', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <DollarSign size={16} className="text-primary" /> {t('trips.active_currencies').toUpperCase()}
            </label>
            <CurrencySelector 
              selectedCurrencies={formData.currencies} 
              onSelectionChange={(newSelection) => setFormData({...formData, currencies: newSelection})}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
               <Info size={16} className="text-primary" />
               <label style={{ fontSize: '0.75rem', fontWeight: '900', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>{t('trips.daily_limits_desc').toUpperCase()}</label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1.25rem' }}>
              {formData.currencies.map(curr => (
                <div key={curr} className="glass-card" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: '18px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '0.75rem', transition: '0.3s' }}>
                  <span style={{ fontSize: '0.85rem', color: 'white', fontWeight: '900' }}>{curr}</span>
                  <input 
                    type="text" 
                    className="glass-input" 
                    style={{ 
                      width: '100%', 
                      padding: '0.85rem', 
                      background: 'rgba(255,255,255,0.03)', 
                      border: '1px solid rgba(255,255,255,0.1)', 
                      color: 'var(--primary)', 
                      borderRadius: '12px', 
                      fontSize: '1.15rem', 
                      fontWeight: '900',
                      textAlign: 'right'
                    }} 
                    value={formData.daily_limits[curr] || ''} 
                    placeholder="0,00"
                    onChange={e => {
                      let val = e.target.value.replace(/\D/g, '');
                      if (!val) {
                        setFormData({
                          ...formData, 
                          daily_limits: { ...formData.daily_limits, [curr]: '' }
                        });
                        return;
                      }
                      val = (parseInt(val) / 100).toFixed(2);
                      setFormData({
                        ...formData, 
                        daily_limits: { ...formData.daily_limits, [curr]: val.replace('.', ',') }
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Fixed Action Bar */}
        <div style={{ 
          position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
          width: 'calc(100% - 3rem)', maxWidth: '800px',
          background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(20px)',
          padding: '1rem', borderRadius: '24px', 
          border: '1px solid var(--glass-border)',
          display: 'flex', gap: '1rem',
          zIndex: 100,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}>
           <button 
             type="button" 
             onClick={onBack}
             className="btn" 
             style={{ 
               flex: 1, 
               padding: '1.15rem', 
               background: 'rgba(255,255,255,0.05)', 
               borderRadius: '18px', 
               fontWeight: '900', 
               fontSize: '0.9rem',
               color: 'white',
               border: '1px solid var(--glass-border)'
             }}
           >
             {t('trips.cancel').toUpperCase()}
           </button>
           <button 
             type="submit" 
             disabled={isSaving}
             className="btn-primary" 
             style={{ 
               flex: 2, 
               padding: '1.15rem', 
               borderRadius: '18px', 
               display: 'flex', 
               alignItems: 'center', 
               justifyContent: 'center', 
               gap: '0.75rem', 
               fontSize: '1rem', 
               fontWeight: '900',
               boxShadow: '0 12px 24px -6px rgba(99, 102, 241, 0.5)'
             }}
           >
             {isSaving ? t('trips.salvando').toUpperCase() : <><Save size={22} /> {trip ? t('trips.update_trip').toUpperCase() : t('trips.create_trip').toUpperCase()}</>}
           </button>
        </div>
      </form>
    </Motion.div>
  );
}

