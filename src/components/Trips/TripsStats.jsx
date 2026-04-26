import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Globe, Map, MapPin, Compass, Award, 
  Calendar, DollarSign, ArrowLeft, TrendingUp,
  Briefcase, Camera, Flag, Zap
} from 'lucide-react';
import { getContinent } from '../../data/continents';
import { estimateItineraryDistance } from '../../lib/geo';

export default function TripsStats({ trips, onBack }) {
  const stats = useMemo(() => {
    if (!trips || trips.length === 0) return null;

    const countries = new Set();
    const cities = new Set();
    const continents = new Set();
    let totalKm = 0;
    let totalDays = 0;

    trips.forEach(trip => {
      // Countries
      if (Array.isArray(trip.countries)) {
        trip.countries.forEach(c => {
          countries.add(c);
          continents.add(getContinent(c));
        });
      }

      // Cities
      if (Array.isArray(trip.cities)) {
        trip.cities.forEach(c => cities.add(c));
      }

      // KM
      totalKm += estimateItineraryDistance(trip.itinerary);

      // Days
      if (trip.start_date && trip.end_date) {
        const start = new Date(trip.start_date);
        const end = new Date(trip.end_date);
        const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        totalDays += diff > 0 ? diff : 0;
      }
    });

    return {
      tripsCount: trips.length,
      countriesCount: countries.size,
      citiesCount: cities.size,
      continentsCount: continents.size,
      totalKm,
      totalDays,
      continentsList: Array.from(continents),
      countriesList: Array.from(countries)
    };
  }, [trips]);

  if (!stats) return null;

  const cards = [
    { label: 'Países Visitados', value: stats.countriesCount, icon: Flag, color: '#6366f1' },
    { label: 'Cidades Exploradas', value: stats.citiesCount, icon: MapPin, color: '#10b981' },
    { label: 'KM Percorridos', value: `${stats.totalKm.toLocaleString()} km`, icon: Compass, color: '#f59e0b' },
    { label: 'Dias Viajando', value: stats.totalDays, icon: Calendar, color: '#ef4444' },
    { label: 'Continentes', value: stats.continentsCount, icon: Globe, color: '#3b82f6' },
    { label: 'Total de Viagens', value: stats.tripsCount, icon: Briefcase, color: '#8b5cf6' },
  ];

  return (
    <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button 
          onClick={onBack} 
          data-testid="back-to-trips-btn"
          className="icon-btn" 
          style={{ background: 'var(--bg-card)', padding: '10px' }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '900', letterSpacing: '-0.02em' }}>Minha Jornada</h2>
          <p style={{ margin: 0, opacity: 0.6, fontSize: '0.9rem' }}>Estatísticas globais das suas aventuras</p>
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
        gap: '1.5rem',
        marginBottom: '2.5rem'
      }}>
        {cards.map((card, idx) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="glass-card"
            style={{ 
              padding: '1.5rem', 
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '14px', 
              background: `${card.color}15`, 
              color: card.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <card.icon size={24} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: '900', color: 'var(--text-main)' }}>{card.value}</div>
            <div style={{ fontSize: '0.8rem', fontWeight: '700', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</div>
            
            {/* Background Accent */}
            <div style={{ 
              position: 'absolute', 
              bottom: '-10px', 
              right: '-10px', 
              opacity: 0.05, 
              color: card.color,
              transform: 'rotate(-15deg)'
            }}>
              <card.icon size={80} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="responsive-grid" style={{ gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem' }}>
        <div className="glass-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <Award style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800' }}>Países Visitados</h3>
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {stats.countriesList.map(country => (
              <div 
                key={country}
                style={{ 
                  padding: '0.5rem 1rem', 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid var(--glass-border)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.95rem',
                  fontWeight: '600'
                }}
              >
                <Flag size={14} style={{ opacity: 0.6 }} />
                {country}
              </div>
            ))}
            {stats.countriesList.length === 0 && (
              <p style={{ opacity: 0.5, fontStyle: 'italic' }}>Nenhum país registrado ainda.</p>
            )}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <Globe style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800' }}>Continentes</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {['América do Sul', 'Europa', 'América do Norte', 'Ásia', 'África', 'Oceania'].map(cont => {
              const visited = stats.continentsList.includes(cont);
              return (
                <div 
                  key={cont}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    opacity: visited ? 1 : 0.3
                  }}
                >
                  <span style={{ fontWeight: '600' }}>{cont}</span>
                  {visited ? (
                    <div style={{ padding: '4px 10px', background: 'var(--success)15', color: 'var(--success)', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '800' }}>
                      VISITADO
                    </div>
                  ) : (
                    <div style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '800' }}>
                      FALTANDO
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
