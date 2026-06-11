import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion as Motion } from 'framer-motion';
import {
  Globe, Compass, Loader2, ChevronLeft, MapPin, Navigation, Calendar, Map, Plane, Award
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
import { db } from '../../lib/offline/db';
import { countryToCode } from '../../data/countries';
import { geoCentroid, geoBounds } from "d3-geo";
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
  'Argentina': 'Argentina',
  'Peru': 'Peru',
  'Reino Unido': 'United Kingdom',
  'Paraguai': 'Paraguay',
  'Vaticano': 'Vatican City',
  'Bolívia': 'Bolivia'
};

// Fallback coordinates for microstates or countries missing from 110m resolution
const MICROSTATE_COORDS = {
  'Vaticano': { center: [12.4534, 41.9029], scale: 8000 },
  'Vatican City': { center: [12.4534, 41.9029], scale: 8000 },
  'Monaco': { center: [7.4128, 43.7384], scale: 8000 },
  'San Marino': { center: [12.4578, 43.9424], scale: 6000 },
  'Andorra': { center: [1.5218, 42.5063], scale: 5000 },
  'Liechtenstein': { center: [9.5209, 47.1410], scale: 5000 },
  'Malta': { center: [14.4419, 35.9173], scale: 4000 },
  'Maldivas': { center: [73.5361, 1.9772], scale: 3000 },
  'Singapura': { center: [103.8198, 1.3521], scale: 4000 }
};

const getFlagCode = (countryName) => {
  if (!countryName) return null;
  const normalized = countryName.toLowerCase().trim();
  return countryToCode[normalized] || null;
};

const continentMapping = {
  'Europa': 'Europe',
  'América do Sul': 'SouthAmerica',
  'América do Norte': 'NorthAmerica',
  'Ásia': 'Asia',
  'África': 'Africa',
  'Oceania': 'Oceania'
};

export default function TripsStats({ trips, onBack }) {
  const [itineraries, setItineraries] = useState({});
  const [isLoadingItineraries, setIsLoadingItineraries] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const { t } = useTranslation();
  const [continentFilter, setContinentFilter] = useState('All');
  const [viewMode, setViewMode] = useState('dashboard');
  
  const [dynamicMapConfig, setDynamicMapConfig] = useState({ center: [0, 0], scale: 400 });
  const geometriesRef = React.useRef([]);

  const handleSelectCountry = (country) => {
    // 1. Check for manual fallback (microstates)
    const microConfig = MICROSTATE_COORDS[country.name] || MICROSTATE_COORDS[countryNameMap[country.name]];
    if (microConfig) {
      setDynamicMapConfig(microConfig);
    } 
    // 2. Try to find in geometries
    else if (geometriesRef.current.length > 0) {
      const feature = geometriesRef.current.find(g => 
        g.properties.name === country.name || 
        g.properties.name === countryNameMap[country.name]
      );

      if (feature) {
        const center = geoCentroid(feature);
        const bounds = geoBounds(feature);
        
        const dx = bounds[1][0] - bounds[0][0];
        const dy = bounds[1][1] - bounds[0][1];
        const maxDelta = Math.max(dx, dy);
        
        let scale = 180 / (maxDelta || 1);
        scale = Math.min(Math.max(scale * 150, 400), 3000);

        if (maxDelta < 0.1) scale = 5000;
        
        setDynamicMapConfig({ center, scale });
      } else {
        // Fallback for unknown
        setDynamicMapConfig({ center: [0, 0], scale: 400 });
      }
    }
    setSelectedCountry(country);
  };

  useEffect(() => {
    async function fetchAllItineraries() {
      if (!trips || trips.length === 0) {
        setIsLoadingItineraries(false);
        return;
      }

      try {
        const tripIds = trips.map(t => t.id);
        let data;
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          data = await db.trip_itinerary.where('trip_id').anyOf(tripIds).toArray();
        } else {
          try {
            const { data: remoteData, error } = await supabase
              .from('trip_itinerary')
              .select('*')
              .in('trip_id', tripIds);
            if (error) throw error;
            data = remoteData;
            if (data) {
              await Promise.all(data.map(item => db.trip_itinerary.put(item)));
            }
          } catch (err) {
            console.warn('Failed to load itineraries from Supabase for stats, falling back to Dexie:', err);
            data = await db.trip_itinerary.where('trip_id').anyOf(tripIds).toArray();
          }
        }

        const decryptedData = data || [];

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
  }, [trips]);

  const stats = useMemo(() => {
    if (!trips || trips.length === 0) return null;

    const countries = new Set();
    const cities = new Set();
    const continents = new Set();
    let totalKm = 0;
    let totalDays = 0;
    const mapPoints = [];

    const countryToCities = {};

    // We no longer need the complex normalization as we rely on explicit city lists

    trips.forEach(trip => {
      const tripCountries = Array.isArray(trip.countries) ? trip.countries : [];
      const tripItinerary = itineraries[trip.id] || [];

      // 1. Process explicit Countries list for continent stats
      tripCountries.forEach(c => {
        countries.add(c);
        if (!countryToCities[c]) countryToCities[c] = new Set();
        const continent = getContinent(c);
        if (continent) continents.add(continent);
      });

      // 2. Process the trip.cities array (THE SOURCE OF TRUTH)
      // Expected format: "City Name, Country Name" or just "City Name"
      if (Array.isArray(trip.cities)) {
        trip.cities.forEach(cityStr => {
          if (!cityStr || typeof cityStr !== 'string') return;

          const parts = cityStr.split(',').map(p => p.trim());
          let cityName = parts[0];
          let countryName = parts[parts.length - 1];

          // If it's a "City, Country" format, we use the country for attribution
          // Otherwise, we try to match against the trip's countries list
          let attributedCountry = null;

          if (parts.length > 1 && tripCountries.includes(countryName)) {
            attributedCountry = countryName;
          } else {
            attributedCountry = tripCountries.find(c => cityStr.includes(c)) || tripCountries[0];
          }

          if (attributedCountry) {
            countries.add(attributedCountry);
            if (!countryToCities[attributedCountry]) countryToCities[attributedCountry] = new Set();

            const displayCity = cityName;
            const normalizedCity = displayCity.toLowerCase();

            // Avoid adding the country name itself as a city
            if (normalizedCity !== attributedCountry.toLowerCase()) {
              // Case-insensitive check to avoid duplicates like "Lisboa" and "lisboa"
              const alreadyHasCity = Array.from(countryToCities[attributedCountry])
                .some(c => c.toLowerCase() === normalizedCity);

              if (!alreadyHasCity) {
                countryToCities[attributedCountry].add(displayCity);
                cities.add(`${displayCity.trim()}, ${attributedCountry}`);
              }
            }
          }
        });
      }

      // Itinerary data (KM and Map Points)
      if (tripItinerary.length > 0) {
        totalKm += estimateItineraryDistance(tripItinerary);

        // Collect map points from itinerary
        tripItinerary.forEach(item => {
          if (item.coordinates && Array.isArray(item.coordinates) && item.coordinates.length === 2) {
            mapPoints.push({
              coordinates: [Number(item.coordinates[0]), Number(item.coordinates[1])],
              name: item.location || item.activity || t('trips.stats_destination')
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
      'Europe': 44, 'SouthAmerica': 12, 'NorthAmerica': 23,
      'Asia': 48, 'Africa': 54, 'Oceania': 14
    };



    const continentStats = Object.keys(continentTotals).map(key => {
      const visitedInContinent = Array.from(countries).filter(c => {
        const cont = getContinent(c);
        return continentMapping[cont] === key || cont === key;
      }).length;
      return {
        key,
        name: t(`trips.continents.${key}`),
        progress: continentTotals[key] > 0 ? Math.round((visitedInContinent / continentTotals[key]) * 100) : 0,
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
        cityCount: countryToCities[c]?.size || 0,
        cities: Array.from(countryToCities[c] || [])
      })).sort((a, b) => b.cityCount - a.cityCount),
      continentStats,
      mapPoints
    };
  }, [trips, itineraries, t]);

  if (!stats) return (
    <div className="trips-stats-empty">
      <Compass size={64} color="rgba(124, 58, 237, 0.3)" />
      <h3>{t('trips.no_trips')}</h3>
      <p>{t('trips.no_trips_desc')}</p>
    </div>
  );

  const summaryCards = [
    { id: 'countries', label: t('trips.countries_visited'), value: stats.countriesCount.toString().padStart(2, '0'), color: '#8b5cf6', icon: <Globe size={24} />, trend: t('trips.trend_horizons') },
    { id: 'cities', label: t('trips.cities_visited'), value: stats.citiesCount.toString().padStart(2, '0'), color: '#10b981', icon: <MapPin size={24} />, trend: t('trips.trend_explored') },
    { id: 'km', label: t('trips.km_traveled'), value: stats.totalKm > 1000 ? `${(stats.totalKm / 1000).toFixed(1)}K` : Math.round(stats.totalKm), color: '#3b82f6', icon: <Navigation size={24} />, trend: t('trips.trend_distance') },
    { id: 'days', label: t('trips.days_out'), value: stats.totalDays.toString().padStart(2, '0'), color: '#f59e0b', icon: <Calendar size={24} />, trend: t('trips.trend_time') },
    { id: 'continents', label: t('trips.continents_visited'), value: stats.continentsCount.toString().padStart(2, '0'), color: '#ec4899', icon: <Globe size={24} />, trend: t('trips.trend_world') },
    { id: 'trips', label: t('trips.total_trips'), value: stats.tripsCount.toString().padStart(2, '0'), color: '#06b6d4', icon: <Plane size={24} />, trend: t('trips.trend_adventures') },
  ];

  return (
    <div className="trips-stats-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <button
          onClick={viewMode === 'all' ? () => setViewMode('dashboard') : onBack}
          data-testid="back-to-trips-btn"
          className="icon-btn"
          style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h2 data-testid="journey-title" style={{ margin: 0, fontSize: '1.75rem', fontWeight: '900', letterSpacing: '-0.02em' }}>
            {viewMode === 'all' ? t('trips.visited_countries') : t('trips.journey_title')}
          </h2>
          <p style={{ margin: '0.25rem 0 0 0', opacity: 0.5, fontSize: '0.9rem' }}>
            {viewMode === 'all' ? t('trips.gallery_desc') : t('trips.stats_desc')}
          </p>
        </div>
      </div>

      {viewMode === 'dashboard' ? (
        <>
          {/* Summary Cards */}
          <div className="summary-grid">
            {summaryCards.map((card, i) => (
              <Motion.div
                key={i}
                data-testid={`stats-card-${card.id}`}
                className="glass-card summary-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                style={{
                  padding: '1.5rem',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--glass-border)',
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '140px',
                  boxShadow: 'var(--shadow)',
                  cursor: 'default'
                }}
              >
                {/* Background Icon Glow */}
                <div style={{
                  position: 'absolute',
                  right: '-10px',
                  top: '-10px',
                  opacity: 0.05,
                  transform: 'rotate(-15deg)',
                  pointerEvents: 'none'
                }}>
                  {React.cloneElement(card.icon, { size: 100, color: card.color })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{
                    color: card.color,
                    background: `color-mix(in srgb, ${card.color} 15%, transparent)`,
                    padding: '0.6rem',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid color-mix(in srgb, ${card.color} 25%, transparent)`
                  }}>
                    {card.icon}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {card.label}
                  </span>
                </div>

                <div>
                  <div style={{
                    fontSize: '1.75rem',
                    fontWeight: 900,
                    color: 'var(--text-main)',
                    letterSpacing: '-0.02em',
                    lineHeight: 1
                  }}>
                    {card.value}
                  </div>
                  <div style={{
                    marginTop: '0.25rem',
                    height: '4px',
                    width: '40px',
                    background: card.color,
                    borderRadius: '2px',
                    opacity: 0.6
                  }} />
                </div>
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
                      <h2>{t('trips.adventure_map')}</h2>
                      <p>{t('trips.map_desc')}</p>
                    </div>
                    {isLoadingItineraries && <Loader2 size={16} className="animate-spin" style={{ opacity: 0.5 }} />}
                  </div>
                </div>

                <div className="map-container" style={{ position: 'relative', overflow: 'hidden', background: '#0f172a', borderRadius: '1.5rem', minHeight: '400px' }}>
                  <ComposableMap projectionConfig={{ scale: 140 }}>
                    <ZoomableGroup center={[0, 20]} zoom={1}>
                      <Geographies geography={geoUrl}>
                        {({ geographies }) => {
                          if (geometriesRef.current.length === 0) {
                            geometriesRef.current = geographies;
                          }
                          return geographies.map((geo) => (
                            <Geography
                              key={geo.rsmKey}
                              geography={geo}
                              fill="rgba(255, 255, 255, 0.03)"
                              stroke="rgba(255, 255, 255, 0.1)"
                              strokeWidth={0.5}
                              style={{
                                default: { outline: "none" },
                                hover: { fill: "rgba(99, 102, 241, 0.2)", outline: "none" },
                                pressed: { outline: "none" },
                              }}
                            />
                          ))
                        }}
                      </Geographies>

                      {stats.mapPoints.map((point, index) => (
                        <Marker key={index} coordinates={point.coordinates}>
                          <g transform="translate(-6, -6)">
                            <circle cx="6" cy="6" r="4" fill="var(--primary)" stroke="#fff" strokeWidth={1} />
                            <circle cx="6" cy="6" r="6" fill="var(--primary)" className="map-pulse" style={{ opacity: 0.4 }} />
                          </g>
                        </Marker>
                      ))}
                    </ZoomableGroup>
                  </ComposableMap>

                  <div className="map-legend">
                    <div className="legend-item">
                      <div className="legend-dot" style={{ background: '#7c3aed' }}></div>
                      <span>{t('trips.visited_locations')}</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="side-content">
              <section className="continents-card">
                <h3 className="section-subtitle">{t('trips.exploration_by_continent')}</h3>
                <div className="continent-list">
                  {stats.continentStats.map((cont, i) => (
                    <div key={i} className="continent-item">
                      <div className="continent-info">
                        <span>{cont.name}</span>
                        <span className="progress-value">{cont.count} {cont.count === 1 ? t('trips.country_singular') : t('trips.country_plural')} • {cont.progress}%</span>
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
                  <h3 className="section-subtitle">{t('trips.countries_visited')}</h3>
                  <button className="see-all-btn" onClick={() => setViewMode('all')}>
                    {t('trips.see_all')}
                  </button>
                </div>
                <div className="countries-grid">
                  {stats.countriesList.slice(0, 8).map((country, i) => (
                    <div
                      key={i}
                      className="country-chip clickable"
                      onClick={() => handleSelectCountry(country)}
                    >
                      {getFlagCode(country.name) ? (
                        <img
                          src={`https://flagcdn.com/w40/${getFlagCode(country.name)}.png`}
                          alt={country.name}
                          style={{ width: '24px', height: '16px', borderRadius: '3px', objectFit: 'cover' }}
                        />
                      ) : (
                        <div className="country-flag-placeholder" style={{ width: '24px', height: '16px' }}><Globe size={10} /></div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>{country.name}</span>
                        <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '600' }}>
                          {country.cityCount} {country.cityCount === 1 ? t('trips.city_singular') : t('trips.city_plural')}
                        </span>
                      </div>
                    </div>
                  ))}
                  {stats.countriesList.length === 0 && (
                    <p className="empty-text">{t('trips.no_countries_recorded')}</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      ) : (
        <div className="all-countries-view">
          <div className="filters-bar" style={{ marginBottom: '2rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {['All', 'Europe', 'SouthAmerica', 'NorthAmerica', 'Asia', 'Africa', 'Oceania'].map(cont => (
              <button
                key={cont}
                onClick={() => setContinentFilter(cont)}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '10px',
                  border: '1px solid var(--glass-border)',
                  background: continentFilter === cont ? 'var(--primary)' : 'var(--bg-card)',
                  color: continentFilter === cont ? 'white' : 'var(--text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {cont === 'All' ? t('common.months.all') : t(`trips.continents.${cont}`)}
              </button>
            ))}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '1.25rem'
          }}>
            {stats.countriesList
              .filter(c => {
                if (continentFilter === 'All') return true;
                const cont = getContinent(c.name);
                return continentMapping[cont] === continentFilter || cont === continentFilter;
              })
              .map((country, i) => (
                <Motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="country-card-full"
                  onClick={() => handleSelectCountry(country)}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '1.25rem',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {getFlagCode(country.name) ? (
                    <img
                      src={`https://flagcdn.com/w80/${getFlagCode(country.name)}.png`}
                      alt={country.name}
                      style={{
                        width: '60px', height: '40px', borderRadius: '8px',
                        marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.1)',
                        objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                      }}
                    />
                  ) : (
                    <div className="flag-big-placeholder" style={{
                      width: '60px', height: '40px', background: 'rgba(255,255,255,0.05)',
                      borderRadius: '8px', marginBottom: '1rem', border: '1px solid var(--glass-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Globe size={20} opacity={0.3} />
                    </div>
                  )}
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: '800' }}>{country.name}</h4>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                    {country.cityCount} {country.cityCount === 1 ? t('trips.city_singular') : t('trips.city_plural')}
                  </p>
                  <div style={{ marginTop: '1rem', fontSize: '0.65rem', color: 'var(--primary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('common.view')}
                  </div>
                </Motion.div>
              ))}
          </div>
        </div>
      )}

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
                <p>{selectedCountry.cityCount} {selectedCountry.cityCount === 1 ? t('trips.city_singular') : t('trips.city_plural')}</p>
              </div>
              <button className="close-modal-btn" onClick={() => setSelectedCountry(null)}>&times;</button>
            </div>

            <div className="modal-map-container">
              <ComposableMap
                projection="geoMercator"
                projectionConfig={{
                  scale: dynamicMapConfig.scale
                }}
              >
                <ZoomableGroup
                  center={dynamicMapConfig.center}
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
                      // Show points that belong to trips covering this country
                      return trips.some(t =>
                        t.countries.includes(selectedCountry.name) &&
                        itineraries[t.id]?.some(i => (i.location === p.name || i.activity === p.name) && i.coordinates)
                      );
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

            <div style={{ padding: '1.5rem 2rem', borderTop: '1px solid rgba(255,255,255,0.05)', overflowY: 'auto', maxHeight: '200px' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', opacity: 0.5, textTransform: 'uppercase' }}>{t('trips.registered_cities')}</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {Array.from(stats.countriesList.find(cl => cl.name === selectedCountry.name)?.cities || []).map((city, idx) => (
                  <span key={idx} style={{ padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.85rem', color: '#e2e8f0' }}>
                    {city}
                  </span>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button className="modal-primary-btn" onClick={() => setSelectedCountry(null)}>{t('common.cancel')}</button>
            </div>
          </Motion.div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 1rem;
          margin-bottom: 2rem;
        }
        .summary-card {
          background: var(--bg-card);
          border: 1px solid var(--glass-border);
          padding: 1.5rem 1rem;
          border-radius: 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 0.5rem;
          transition: all 0.3s ease;
        }
        .summary-card:hover {
          transform: translateY(-5px);
          border-color: var(--primary);
          background: rgba(99, 102, 241, 0.05);
        }
        .summary-value {
          font-size: 2.5rem;
          font-weight: 900;
          line-height: 1;
          letter-spacing: -0.05em;
        }
        .summary-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.05em;
        }
        @media (max-width: 1200px) {
          .summary-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 768px) {
          .summary-grid { grid-template-columns: repeat(2, 1fr); }
        }
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
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 2rem;
        }
        .country-modal-content {
          background: var(--bg-canvas);
          border: 1px solid var(--glass-border);
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
          color: var(--text-main);
        }
        .modal-title-group p {
          font-size: 0.875rem;
          color: var(--text-muted);
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
          background: var(--map-bg);
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
        .country-card-full:hover {
          background: rgba(124, 58, 237, 0.05) !important;
          border-color: var(--primary) !important;
          transform: translateY(-5px);
          box-shadow: 0 10px 30px rgba(99, 102, 241, 0.2);
        }
        .map-legend {
          position: absolute;
          bottom: 1rem;
          left: 1rem;
          background: var(--bg-card);
          backdrop-filter: blur(8px);
          padding: 0.5rem 0.75rem;
          border-radius: 0.75rem;
          border: 1px solid var(--glass-border);
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
