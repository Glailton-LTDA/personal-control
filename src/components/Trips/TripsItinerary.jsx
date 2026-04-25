import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Calendar, MapPin, ChevronLeft, Save, Loader2, 
  Search, Info, Plane
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ItineraryManager from './ItineraryManager';

export default function TripsItinerary({ user, initialTripId = null, onBack }) {
  const [trips, setTrips] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [itinerary, setItinerary] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchTrips();
  }, [user]);

  useEffect(() => {
    if (trips.length > 0 && !selectedTrip) {
      const tripId = initialTripId || localStorage.getItem('pc_selected_trip_v1');
      const trip = trips.find(t => String(t.id) === String(tripId)) || trips[0];
      handleSelectTrip(trip);
    }
  }, [trips, initialTripId]);

  async function fetchTrips() {
    setIsLoading(true);
    const { data } = await supabase.from('trips').select('*').order('start_date', { ascending: false });
    if (data) setTrips(data);
    setIsLoading(false);
  }

  const handleSelectTrip = (trip) => {
    setSelectedTrip(trip);
    setItinerary(trip.itinerary || []);
    if (trip.id) localStorage.setItem('pc_selected_trip_v1', trip.id);
  };

  const handleSave = async () => {
    if (!selectedTrip) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('trips')
        .update({ itinerary })
        .eq('id', selectedTrip.id);
      
      if (error) throw error;
      
      setTrips(trips.map(t => t.id === selectedTrip.id ? { ...t, itinerary } : t));
      window.dispatchEvent(new CustomEvent('trip-updated'));
      alert('Roteiro salvo com sucesso!');
    } catch (error) {
      console.error('Error saving itinerary:', error);
      alert('Erro ao salvar roteiro.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredTrips = trips.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.cities && t.cities.some(c => c.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  const formatDateSafely = (dateStr) => {
    if (!dateStr) return 'Sem data';
    try {
      const date = new Date(dateStr + 'T00:00:00');
      if (isNaN(date.getTime())) return 'Data inválida';
      return date.toLocaleDateString('pt-BR');
    } catch (e) {
      return 'Data inválida';
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '4rem' }}>
        <Loader2 className="animate-spin" size={32} style={{ opacity: 0.5 }} />
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? '0.5rem' : '1rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '1.5rem' : '2rem', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {onBack && (
            <button 
              onClick={onBack} 
              className="icon-btn"
              title="Voltar para Viagens"
              data-testid="back-button"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: isMobile ? '1.2rem' : '1.5rem', fontWeight: '900', color: 'var(--text-main)' }}>Roteiros</h2>
            {!isMobile && <p style={{ margin: 0, opacity: 0.5, fontSize: '0.9rem', color: 'var(--text-main)' }}>Planeje cada passo da sua jornada</p>}
          </div>
        </div>
        
        <button 
          onClick={handleSave} 
          disabled={isSaving || !selectedTrip}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: isMobile ? '0.6rem 1rem' : '0.75rem 1.5rem', fontSize: isMobile ? '0.85rem' : '1rem' }}
        >
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {isMobile ? 'Salvar' : 'Salvar Alterações'}
        </button>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', 
        gap: isMobile ? '1rem' : '2rem',
        alignItems: 'start'
      }}>
        {/* Sidebar: Trip Selection */}
        {(!isMobile || !selectedTrip) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="glass-input-container" style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
              <input 
                type="text" 
                placeholder="Buscar viagem..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="glass-input"
                style={{ width: '100%', paddingLeft: '2.5rem', borderRadius: '12px', color: 'var(--text-main)' }}
              />
            </div>

            <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: isMobile ? '300px' : 'calc(100vh - 250px)', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {filteredTrips.map(trip => (
                <button
                  key={trip.id}
                  onClick={() => handleSelectTrip(trip)}
                  className="glass-card"
                  style={{
                    padding: '0.75rem',
                    textAlign: 'left',
                    border: '1px solid',
                    borderColor: selectedTrip?.id === trip.id ? 'var(--primary)' : 'var(--glass-border)',
                    background: selectedTrip?.id === trip.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    transition: '0.2s',
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Plane size={18} style={{ color: 'var(--text-main)', opacity: 0.7 }} />
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ 
                      fontWeight: '700', 
                      fontSize: '0.85rem', 
                      color: 'var(--text-main)', 
                      whiteSpace: 'nowrap', 
                      textOverflow: 'ellipsis', 
                      overflow: 'hidden' 
                    }}>
                      {trip.title}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {formatDateSafely(trip.start_date)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main Content: Itinerary Manager */}
        <div 
          className="glass-card" 
          style={{ 
            padding: isMobile ? '1rem' : '2rem', 
            border: '1px solid var(--glass-border)', 
            borderRadius: isMobile ? '16px' : '24px',
            position: 'relative'
          }}
        >
          {isMobile && selectedTrip && (
            <button 
              onClick={() => setSelectedTrip(null)}
              style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--text-main)', fontSize: '0.7rem', padding: '0.4rem 0.75rem', borderRadius: '8px', marginBottom: '1rem', cursor: 'pointer', fontWeight: '700' }}
            >
              ← TROCAR VIAGEM
            </button>
          )}

          {selectedTrip ? (
            <ItineraryManager 
              trip={selectedTrip}
              items={itinerary}
              onItemsChange={setItinerary}
            />
          ) : (
            <div style={{ height: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
              <Info size={48} style={{ marginBottom: '1rem' }} />
              <p style={{ fontWeight: '700' }}>Selecione uma viagem para editar o roteiro</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
