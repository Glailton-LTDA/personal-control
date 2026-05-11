import React, { useState, useEffect, useMemo } from 'react';
import { formatDate } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { 
  Calendar, MapPin, Users, Building, Globe, ChevronLeft,
  Navigation, DollarSign
} from 'lucide-react';

import { estimateItineraryDistance } from '../../lib/geo';
import AttachmentManager from './AttachmentManager';
import { motion as Motion } from 'framer-motion';
import { CURRENCIES } from '../../constants/currencies';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

export default function TripDetails({ trip, onBack, expenses = [], showValues = true }) {
  const { t } = useTranslation();
  const [selectedCurrency, setSelectedCurrency] = useState(localStorage.getItem(`pc_trip_${trip.id}_currency`) || trip.currencies?.[0] || 'BRL');
  const [itinerary, setItinerary] = useState([]);
  const estimatedDistance = useMemo(() => estimateItineraryDistance(itinerary), [itinerary]);

  useEffect(() => {
    const fetchItinerary = async () => {
      if (!trip?.id) return;
      const { data } = await supabase
        .from('trip_itinerary')
        .select('day, time, location, coordinates')
        .eq('trip_id', trip.id);
      
      if (data) setItinerary(data);
    };
    
    fetchItinerary();
  }, [trip?.id]);

  return (
    <Motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="fade-in"
      data-testid="trip-details"
    >
      {/* Header Simplificado Orbit */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            onClick={onBack} 
            className="icon-btn" 
            style={{ width: '42px', height: '42px' }} 
            data-testid="trip-details-back-btn"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 data-testid="trip-details-title" style={{ margin: 0, fontSize: '1.75rem', fontWeight: '900', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              {trip?.title || t('trips.loading')}
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '800', letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.7 }}>
              {t('trips.trip_summary_label')}
            </p>
          </div>
        </div>
      </div>

      <div className="trip-details-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Main Info Card */}
          <div className="glass-card" style={{ padding: '2rem', borderRadius: '24px' }}>
            <div className="info-items-container">
              <InfoItem icon={<Calendar size={20}/>} label={t('trips.period_label')} value={`${formatDate(trip.start_date)} - ${formatDate(trip.end_date)}`} />
              <div data-testid="trip-details-location">
                <InfoItem icon={<MapPin size={20}/>} label={t('trips.destinations_label')} value={trip.cities?.join(', ') || t('trips.none')} />
              </div>
              <div data-testid="trip-details-countries">
                <InfoItem icon={<Globe size={20}/>} label={t('trips.countries_label')} value={trip.countries?.join(', ') || t('trips.none')} />
              </div>
              <InfoItem icon={<Navigation size={20}/>} label={t('trips.estimated_distance_label')} value={`${(Math.round(estimatedDistance) || 0).toLocaleString(i18n.language)} km`} />
              <div className="info-item-full" data-testid="trip-details-participants">
                <InfoItem icon={<Users size={20}/>} label={t('trips.travelers_label')} value={trip.participants?.join(', ') || 'Glailton Costa, Deisianne Saraiva'} />
              </div>
            </div>
          </div>

          <div className="attachments-list">
            <AttachmentManager label={t('trips.accommodations_label')} icon={Building} items={trip.hotels || []} tripId={trip.id} onItemsChange={() => {}} readOnly={true} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Financial Card */}
          <div className="glass-card" style={{ padding: '2rem', borderRadius: '24px' }}>
            <h3 style={{ margin: '0 0 2rem 0', fontSize: '1.1rem', fontWeight: '900', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <DollarSign size={20} className="text-primary" /> {t('trips.financial_summary_title')}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(() => {
                const totals = expenses.reduce((acc, exp) => {
                  const curr = exp.currency || 'BRL';
                  acc[curr] = (acc[curr] || 0) + (parseFloat(exp.amount) || 0);
                  return acc;
                }, {});

                const activeCurrencies = Array.from(new Set([...(trip?.currencies || []), ...Object.keys(totals)]));

                const getCurrencyInfo = (code) => {
                  const found = CURRENCIES.find(c => c.code === code);
                  if (found) return found;
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
                    return <img src={flag} alt="flag" style={{ width: size, height: size, objectFit: 'contain', borderRadius: '4px' }} />;
                  }
                  return <span style={{ fontSize: size }}>{flag}</span>;
                };

                if (activeCurrencies.length === 0) {
                  return <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>{t('trips.no_expenses_recorded')}</p>;
                }

                return activeCurrencies.sort().map(curr => {
                  const info = getCurrencyInfo(curr);
                  const isSelected = selectedCurrency === curr;
                  return (
                    <div 
                      key={curr} 
                      className={`financial-summary-row ${isSelected ? 'active' : ''}`}
                      data-testid={`currency-select-${curr}`}
                      onClick={() => {
                        localStorage.setItem(`pc_trip_${trip.id}_currency`, curr);
                        setSelectedCurrency(curr);
                        window.dispatchEvent(new CustomEvent('trip-currency-changed', { detail: { tripId: trip.id, currency: curr } }));
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {renderFlag(info.flag)}
                        <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>{curr}</span>
                      </div>
                      <span style={{ fontWeight: '900', fontSize: '1.25rem', color: 'var(--text-main)' }}>
                        {showValues ? `${info.symbol} ${(Number(totals[curr]) || 0).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}` : '••••••'}
                      </span>
                    </div>
                  );
                });
              })()}
              <p style={{ margin: '1rem 0 0', color: 'var(--text-muted)', fontSize: '0.65rem', opacity: 0.6 }}>
                {t('trips.financial_disclaimer')}
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
    <div className="info-item-clean">
      <div className="info-item-icon">
        {icon}
      </div>
      <div className="info-item-content">
        <p className="info-item-label">{label}</p>
        <p className="info-item-value">{value}</p>
      </div>
    </div>
  );
}
