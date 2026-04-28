import React, { useMemo, useState, useEffect } from 'react';
import { motion as Motion } from 'framer-motion';
import { 
  Globe, Compass, Loader2, ChevronLeft
} from 'lucide-react';
import { 
  ComposableMap, 
  Geographies, 
  Geography, 
  Marker,
  ZoomableGroup
} from "react-simple-maps";
import { getContinent } from '../../data/continents';
import { estimateItineraryDistance } from '../../lib/geo';
import { supabase } from '../../lib/supabase';
import { useEncryption } from '../../contexts/EncryptionContext';
import './TripsStats.css';

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Mapping for countries that might have different names in TopoJSON
const countryNameMap = {
  'Brasil': 'Brazil',
  'França': 'France',
  'Inglaterra': 'United Kingdom',
  'Espanha': 'Spain',
  'Itália': 'Italy',
  'Alemanha': 'Germany',
  'Estados Unidos': 'United States of America',
  'Japão': 'Japan',
  'Portugal': 'Portugal',
  'Argentina': 'Argentina'
};

// Zoom and center configurations for specific countries
const countryZoomConfig = {
  'Brasil': { center: [-55, -10], scale: 600 },
  'França': { center: [2, 46], scale: 2000 },
  'Inglaterra': { center: [-2, 54], scale: 2000 },
  'Espanha': { center: [-3, 40], scale: 2000 },
  'Itália': { center: [12, 42], scale: 2000 },
  'Portugal': { center: [-8, 39], scale: 3000 },
  'Argentina': { center: [-63, -38], scale: 600 },
  'Estados Unidos': { center: [-95, 37], scale: 600 },
  'Peru': { center: [-75, -9], scale: 1200 },
  'Paraguai': { center: [-58, -23], scale: 1500 }
};

export default function TripsStats({ trips, onBack }) {
  const [itineraries, setItineraries] = useState({});
  const [isLoadingItineraries, setIsLoadingItineraries] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const { decryptObject } = useEncryption();

  useEffect(() => {
    async function fetchAllItineraries() {
      if (!trips || trips.length === 0) {
        setIsLoadingItineraries(false);
        return;
      }

      try {
        const tripIds = trips.map(t => t.id);
        const { data, error } = await supabase
          .from('trip_itinerary')
          .select('*')
          .in('trip_id', tripIds);

        if (error) throw error;

        // Decrypt the data
        const decryptedData = await decryptObject(data, [
          'activity',
          'location',
          'notes'
        ]);

        const grouped = {};
        decryptedData.forEach(item => {
          if (!grouped[item.trip_id]) grouped[item.trip_id] = [];
          grouped[item.trip_id].push(item);
        });
        setItineraries(grouped);
      } catch (err) {
        console.error('Error fetching itineraries:', err);
      } finally {
        setIsLoadingItineraries(false);
      }
    }

    fetchAllItineraries();
  }, [trips, decryptObject]);

  const stats = useMemo(() => {
    if (!trips || trips.length === 0) return null;

    const countries = new Set();
    const cities = new Set();
    const continents = new Set();
    let totalKm = 0;
    let totalDays = 0;
    const mapPoints = [];

    const countryToCities = {};

    trips.forEach(trip => {
      // Countries & Continents
      if (Array.isArray(trip.countries)) {
        trip.countries.forEach(c => {
          countries.add(c);
          if (!countryToCities[c]) countryToCities[c] = new Set();
          
          // Basic heuristic: if only one country, all cities belong to it.
          // If multiple, we add all cities to all countries in that trip (best effort)
          if (Array.isArray(trip.cities)) {
            trip.cities.forEach(city => countryToCities[c].add(city));
          }

          const continent = getContinent(c);
          if (continent) continents.add(continent);
        });
      }

      // Cities
      if (Array.isArray(trip.cities)) {
        trip.cities.forEach(c => cities.add(c));
      }

      // KM Calculation
      const tripItinerary = itineraries[trip.id] || [];
      if (tripItinerary.length > 0) {
        // Distance
        const dist = estimateItineraryDistance(tripItinerary);
        totalKm += dist;
        
        // Map Points
        tripItinerary.forEach(item => {
          if (item.coordinates && Array.isArray(item.coordinates) && item.coordinates.length === 2) {
            mapPoints.push({
              coordinates: [item.coordinates[0], item.coordinates[1]], // [lon, lat]
              name: item.location || item.activity
            });
          }
        });
      }

      // Days
      if (trip.start_date && trip.end_date) {
        const start = new Date(trip.start_date);
        const end = new Date(trip.end_date);
        const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        totalDays += diff > 0 ? diff : 0;
      }
    });

    const continentTotals = {
      'Europa': 44,
      'América do Sul': 12,
      'América do Norte': 23,
      'Ásia': 48,
      'África': 54,
      'Oceania': 14
    };

    const continentStats = Object.keys(continentTotals).map(name => {
      const visitedInContinent = Array.from(countries).filter(c => getContinent(c) === name).length;
      const total = continentTotals[name];
      return {
        name,
        progress: total > 0 ? Math.round((visitedInContinent / total) * 100) : 0,
        count: visitedInContinent
      };
    });

    return {
      tripsCount: trips.length,
      countriesCount: countries.size,
      citiesCount: cities.size,
      continentsCount: continents.size,
      totalKm,
      totalDays,
      countriesList: Array.from(countries).map(c => ({
        name: c,
        cityCount: countryToCities[c]?.size || 0
      })).sort((a, b) => b.cityCount - a.cityCount), // Sort by most visited
      continentStats,
      mapPoints
    };
  }, [trips, itineraries]);

  if (!stats) return (
    <div className="trips-stats-empty">
      <Compass size={64} color="rgba(124, 58, 237, 0.3)" />
      <h3>Nenhuma viagem registrada</h3>
      <p>Suas estatísticas aparecerão aqui assim que você registrar sua primeira aventura.</p>
    </div>
  );

  const summaryCards = [
    { label: 'COUNTRIES', value: stats.countriesCount.toString().padStart(2, '0'), color: '#a78bfa' },
    { label: 'CITIES', value: stats.citiesCount.toString().padStart(2, '0'), color: '#4edea3' },
    { label: 'KM TRAVELLED', value: stats.totalKm > 1000 ? `${(stats.totalKm / 1000).toFixed(1)}K` : Math.round(stats.totalKm), color: '#d2bbff' },
    { label: 'DAYS AWAY', value: stats.totalDays.toString().padStart(2, '0'), color: '#adc6ff' },
    { label: 'CONTINENTS', value: stats.continentsCount.toString().padStart(2, '0'), color: '#7c3aed' },
  ];

  return (
    <div className="trips-stats-content">
      {/* Summary Cards */}
      <div className="summary-grid">
        {summaryCards.map((card, i) => (
          <Motion.div 
            key={i}
            className="summary-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <span className="summary-value" style={{ color: card.color }}>{card.value}</span>
            <span className="summary-label">{card.label}</span>
          </Motion.div>
        ))}
      </div>

      {/* Main Stats Grid */}
      <div className="dashboard-grid">
        <div className="col-span-2">
          <section className="visualization-card">
            <div className="section-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div>
                  <h2>Mapa de Aventuras</h2>
                  <p>Sua jornada mapeada pelo mundo</p>
                </div>
                {isLoadingItineraries && <Loader2 size={16} className="animate-spin" style={{ opacity: 0.5 }} />}
              </div>
            </div>
            
            <div className="map-container" style={{ position: 'relative', overflow: 'hidden', background: '#0f172a', borderRadius: '1.5rem', minHeight: '400px' }}>
              <ComposableMap projectionConfig={{ scale: 140 }}>
                <ZoomableGroup center={[0, 20]} zoom={1}>
                  <Geographies geography={geoUrl}>
                    {({ geographies }) =>
                      geographies.map((geo) => (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill="#1e293b"
                          stroke="#334155"
                          strokeWidth={0.5}
                          style={{
                            default: { outline: "none" },
                            hover: { fill: "#334155", outline: "none" },
                            pressed: { outline: "none" },
                          }}
                        />
                      ))
                    }
                  </Geographies>

                  {stats.mapPoints.map((point, index) => (
                    <Marker key={index} coordinates={point.coordinates}>
                      <circle r={4} fill="#7c3aed" stroke="#fff" strokeWidth={1} className="map-pulse" />
                      <title>{point.name}</title>
                    </Marker>
                  ))}
                </ZoomableGroup>
              </ComposableMap>
              
              <div className="map-legend">
                <div className="legend-item">
                  <div className="legend-dot" style={{ background: '#7c3aed' }}></div>
                  <span>Locais Visitados</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="side-content">
          <section className="continents-card">
            <h3 className="section-subtitle">EXPLORAÇÃO POR CONTINENTE</h3>
            <div className="continent-list">
              {stats.continentStats.map((cont, i) => (
                <div key={i} className="continent-item">
                  <div className="continent-info">
                    <span>{cont.name}</span>
                    <span className="progress-value">{cont.count} {cont.count === 1 ? 'país' : 'países'} • {cont.progress}%</span>
                  </div>
                  <div className="progress-track">
                    <Motion.div 
                      className="progress-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${cont.progress}%` }}
                      transition={{ duration: 1, delay: 0.5 }}
                      style={{ 
                        background: cont.progress > 0 ? 'linear-gradient(90deg, #7c3aed, #a78bfa)' : 'rgba(255,255,255,0.05)',
                        boxShadow: cont.progress > 0 ? '0 0 10px rgba(124, 58, 237, 0.3)' : 'none'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="countries-card">
            <div className="card-header">
              <h3 className="section-subtitle">PAÍSES VISITADOS</h3>
              <button className="see-all-btn" onClick={() => alert('Lista completa de países em breve!')}>
                Ver Todos
              </button>
            </div>
            <div className="countries-grid">
              {stats.countriesList.slice(0, 8).map((country, i) => (
                <div 
                  key={i} 
                  className="country-chip clickable"
                  onClick={() => setSelectedCountry(country)}
                >
                  <div className="country-flag-placeholder"></div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>{country.name}</span>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '600' }}>
                      {country.cityCount} {country.cityCount === 1 ? 'cidade' : 'cidades'}
                    </span>
                  </div>
                </div>
              ))}
              {stats.countriesList.length === 0 && (
                <p className="empty-text">Nenhum país registrado</p>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Country Detail Modal */}
      {selectedCountry && (
        <div className="country-modal-overlay" onClick={() => setSelectedCountry(null)}>
          <Motion.div 
            className="country-modal-content"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title-group">
                <h2>{selectedCountry.name}</h2>
                <p>{selectedCountry.cityCount} {selectedCountry.cityCount === 1 ? 'Cidade visitada' : 'Cidades visitadas'}</p>
              </div>
              <button className="close-modal-btn" onClick={() => setSelectedCountry(null)}>&times;</button>
            </div>

            <div className="modal-map-container">
              <ComposableMap 
                projectionConfig={{ 
                  scale: countryZoomConfig[selectedCountry.name]?.scale || 400 
                }}
              >
                <ZoomableGroup 
                  center={countryZoomConfig[selectedCountry.name]?.center || [0, 0]}
                  zoom={1}
                  maxZoom={1}
                >
                  <Geographies geography={geoUrl}>
                    {({ geographies }) =>
                      geographies.map((geo) => {
                        // Highlight the selected country
                        const isSelected = geo.properties.name === selectedCountry.name || 
                                           geo.properties.name === countryNameMap[selectedCountry.name];
                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            fill={isSelected ? "rgba(124, 58, 237, 0.2)" : "#1e293b"}
                            stroke={isSelected ? "#7c3aed" : "#334155"}
                            strokeWidth={isSelected ? 1.5 : 0.5}
                            style={{ default: { outline: "none" } }}
                          />
                        );
                      })
                    }
                  </Geographies>

                  {/* Markers only for this country */}
                  {stats.mapPoints
                    .filter(p => {
                      // Note: This is a simplification. Ideally we'd map cities to countries more robustly.
                      // For now we check if the city count matches what we calculated.
                      // Actually, the best way is to only show points that are within this country's trips.
                      return trips.some(t => t.countries.includes(selectedCountry.name) && itineraries[t.id]?.some(i => i.location === p.name || i.activity === p.name));
                    })
                    .map((point, index) => (
                      <Marker key={index} coordinates={point.coordinates}>
                        <circle r={6} fill="#7c3aed" stroke="#fff" strokeWidth={2} className="map-pulse" />
                        <title>{point.name}</title>
                      </Marker>
                    ))
                  }
                </ZoomableGroup>
              </ComposableMap>
            </div>
            
            <div className="modal-footer">
              <button className="modal-primary-btn" onClick={() => setSelectedCountry(null)}>Fechar Detalhes</button>
            </div>
          </Motion.div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .country-chip.clickable {
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .country-chip.clickable:hover {
          background: rgba(124, 58, 237, 0.1);
          border-color: rgba(124, 58, 237, 0.3);
          transform: translateY(-2px);
        }
        .country-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(2, 6, 23, 0.85);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 2rem;
        }
        .country-modal-content {
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 2rem;
          width: 100%;
          max-width: 800px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .modal-header {
          padding: 1.5rem 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .modal-title-group h2 {
          font-size: 1.5rem;
          font-weight: 800;
          margin: 0;
          color: #f8fafc;
        }
        .modal-title-group p {
          font-size: 0.875rem;
          color: #94a3b8;
          margin: 0.25rem 0 0 0;
        }
        .close-modal-btn {
          background: rgba(255, 255, 255, 0.05);
          border: none;
          color: #94a3b8;
          font-size: 1.25rem;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .close-modal-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }
        .modal-map-container {
          flex: 1;
          background: #020617;
          min-height: 300px;
          position: relative;
          overflow: hidden;
        }
        @media (max-width: 768px) {
          .country-modal-content {
            max-height: 95vh;
            border-radius: 1.5rem;
          }
          .modal-map-container {
            min-height: 250px;
          }
        }
        .modal-footer {
          padding: 1.5rem 2rem;
          display: flex;
          justify-content: flex-end;
          background: rgba(2, 6, 23, 0.3);
        }
        .modal-primary-btn {
          background: #7c3aed;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 0.75rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .modal-primary-btn:hover {
          background: #6d28d9;
          transform: translateY(-1px);
        }
        .map-pulse {
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.8; }
          70% { transform: scale(1.5); opacity: 0.2; }
          100% { transform: scale(1); opacity: 0; }
        }
        .map-legend {
          position: absolute;
          bottom: 1rem;
          left: 1rem;
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(8px);
          padding: 0.5rem 0.75rem;
          border-radius: 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.65rem;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
        }
        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
      `}} />
    </div>
  );
}
