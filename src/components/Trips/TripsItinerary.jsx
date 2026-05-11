import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { 
  Calendar, MapPin, ChevronLeft, Save, Loader2, 
  Search, Info, Plane
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import ItineraryManager from './ItineraryManager';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


export default function TripsItinerary({ user, initialTripId = null, onBack }) {
  const { t, i18n } = useTranslation();
  const [trips, setTrips] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [itinerary, setItinerary] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);

  const initialTripProcessed = useRef(false);

  const fetchTrips = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase.from('trips').select('*').order('start_date', { ascending: false });
      if (data) {
        setTrips(data);
      }
    } catch (error) {
      console.error('Error fetching trips:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchItinerary = useCallback(async (tripId) => {
    if (!tripId) return;
    try {
      const { data, error } = await supabase
        .from('trip_itinerary')
        .select('*')
        .eq('trip_id', tripId)
        .order('day', { ascending: true })
        .order('order_index', { ascending: true }); // Order by index
      
      if (error) throw error;
      
      if (data) {
        setItinerary(data);
      }
    } catch (err) {
      console.error('Error fetching itinerary:', err);
      toast.error(t('trips.error_loading_itinerary'));
    }
  }, [t]);

  const handleSelectTrip = useCallback((trip) => {
    setSelectedTrip(trip);
    fetchItinerary(trip.id);
    if (trip.id) localStorage.setItem('pc_selected_trip_v1', trip.id);
  }, [fetchItinerary]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  useEffect(() => {
    if (trips.length > 0) {
      if (!initialTripProcessed.current) {
        if (initialTripId) {
          const trip = trips.find(t => String(t.id) === String(initialTripId));
          if (trip) {
            handleSelectTrip(trip);
            initialTripProcessed.current = true;
            return;
          }
        }

        const savedId = localStorage.getItem('pc_selected_trip_v1');
        const trip = trips.find(t => String(t.id) === String(savedId)) || trips[0];
        if (trip) handleSelectTrip(trip);
        initialTripProcessed.current = true;
      } else if (selectedTrip) {
        // Sync selected trip with updated data (e.g. after decryption)
        const updated = trips.find(t => t.id === selectedTrip.id);
        if (updated) {
          setSelectedTrip(updated);
        }
      }
    }
  }, [trips, initialTripId, handleSelectTrip, selectedTrip]);


  const handleSave = async () => {
    if (!selectedTrip) return;
    setIsSaving(true);
    try {
      // 2. Prepare data (assign order_index based on position)
      const sanitizedItinerary = itinerary.map((item, index) => ({
        trip_id: selectedTrip.id,
        user_id: user.id,
        day: item.day,
        time: item.time || null,
        activity: item.activity || '',
        location: item.location || '',
        notes: item.notes || '',
        completed: !!item.completed,
        needs_booking: !!item.needs_booking,
        is_booked: !!item.is_booked,
        coordinates: item.coordinates || null,
        order_index: index // Save the order!
      }));

      // 3. Clear existing itinerary for this trip and insert new one
      // We use a transaction-like approach (delete then insert)
      const { error: deleteError } = await supabase
        .from('trip_itinerary')
        .delete()
        .eq('trip_id', selectedTrip.id);
      
      if (deleteError) throw deleteError;

      if (sanitizedItinerary.length > 0) {
        const { error: insertError } = await supabase
          .from('trip_itinerary')
          .insert(sanitizedItinerary);
        
        if (insertError) throw insertError;
      }
      
      toast.success(t('trips.itinerary_saved_success'));
    } catch (error) {
      console.error('Save error:', error);
      toast.error(t('trips.error_saving_itinerary'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPDF = () => {
    if (!selectedTrip || !itinerary.length) {
      toast.error(t('trips.select_trip_to_export'));
      return;
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;

      // Header
      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42); // Slate 900
      doc.text(selectedTrip.title, 14, 22);

      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // Slate 500
      const dates = `${formatDateSafely(selectedTrip.start_date)} - ${formatDateSafely(selectedTrip.end_date)}`;
      doc.text(dates, 14, 30);

      // Cities/Countries if available
      if (selectedTrip.cities?.length) {
        doc.text(`${t('trips.destinations')}: ${selectedTrip.cities.join(', ')}`, 14, 35);
      }

      doc.setDrawColor(226, 232, 240); // Slate 200
      doc.line(14, 40, pageWidth - 14, 40);

      // Table
      const tableColumn = [t('trips.day_col'), t('trips.time_col'), t('trips.activity_col'), t('trips.location_col')];
      const tableRows = itinerary.map(item => [
        formatDateSafely(item.day),
        item.time || '-',
        item.activity || '',
        item.location || ''
      ]);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 45,
        theme: 'striped',
        headStyles: { 
          fillColor: [79, 70, 229], // Indigo 600
          fontSize: 11,
          fontStyle: 'bold'
        },
        bodyStyles: { 
          fontSize: 10,
          textColor: [51, 65, 85] // Slate 700
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252] // Slate 50
        },
        margin: { top: 45 },
        didDrawPage: (data) => {
          // Footer
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184); // Slate 400
          doc.text(
            `${t('trips.generated_by')} PersonalControl - ${t('trips.page')} ${doc.internal.getNumberOfPages()}`,
            data.settings.margin.left,
            doc.internal.pageSize.height - 10
          );
        }
      });

      doc.save(`${t('trips.itinerary')}_${selectedTrip.title.replace(/\s+/g, '_')}.pdf`);
      toast.success(t('trips.pdf_generated_success'));
    } catch (error) {
      console.error('PDF Error:', error);
      toast.error(t('trips.error_generating_pdf'));
    }
  };

  const filteredTrips = trips.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.cities && t.cities.some(c => c.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  const formatDateSafely = (dateStr) => {
    if (!dateStr) return t('common.no_date');
    try {
      const date = new Date(dateStr + 'T00:00:00');
      if (isNaN(date.getTime())) return t('common.invalid_date');
      return date.toLocaleDateString(i18n.language);
    } catch {
      return t('common.invalid_date');
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
    <div style={{ padding: isMobile ? '0.5rem' : '1rem', maxWidth: '1200px', margin: '0 auto', overflowX: 'hidden', width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: isMobile ? '1.5rem' : '2rem', 
        gap: '0.75rem',
        flexWrap: isMobile ? 'wrap' : 'nowrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: isMobile ? '1 1 auto' : '0 0 auto' }}>
          {onBack && (
            <button 
              onClick={() => {
                if (isMobile && selectedTrip) {
                  setSelectedTrip(null);
                } else {
                  onBack();
                }
              }} 
              className="icon-btn"
              title={isMobile && selectedTrip ? t('trips.back_to_list') : t('trips.back_to_trips')}
              data-testid="back-button"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: isMobile ? '1.2rem' : '1.5rem', fontWeight: '900', color: 'var(--text-main)' }}>{t('trips.itineraries')}</h2>
            {!isMobile && <p style={{ margin: 0, opacity: 0.5, fontSize: '0.9rem', color: 'var(--text-main)' }}>{t('trips.plan_every_step')}</p>}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', flex: isMobile ? '1 1 auto' : '0 0 auto', justifyContent: 'flex-end' }}>
        <button 
          onClick={handleSave} 
          disabled={isSaving || !selectedTrip}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: isMobile ? '0.6rem 1rem' : '0.75rem 1.5rem', fontSize: isMobile ? '0.85rem' : '1rem' }}
        >
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {isMobile ? t('common.save') : t('common.save_changes')}
        </button>

        {selectedTrip && itinerary.length > 0 && (
          <button 
            onClick={handleExportPDF} 
            className="btn-secondary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.6rem', 
              padding: isMobile ? '0.6rem 1rem' : '0.75rem 1.5rem', 
              fontSize: isMobile ? '0.85rem' : '1rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--glass-border)'
            }}
          >
            <Plane size={18} style={{ transform: 'rotate(45deg)' }} />
            {isMobile ? 'PDF' : t('trips.export_pdf')}
          </button>
        )}
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: isMobile ? '100%' : '300px 1fr', 
        gap: isMobile ? '1rem' : '2rem',
        alignItems: 'start',
        width: '100%',
        minWidth: 0
      }}>
        {/* Sidebar: Trip Selection */}
        {(!isMobile || !selectedTrip) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="glass-input-container" style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
              <input 
                type="text" 
                placeholder={t('trips.search_trip_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="glass-input"
                style={{ width: '100%', paddingLeft: '2.5rem', borderRadius: '12px', color: 'var(--text-main)', boxSizing: 'border-box' }}
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
                    background: selectedTrip?.id === trip.id ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--tabs-bg)',
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
              padding: isMobile ? '0.75rem' : '2rem', 
              border: '1px solid var(--glass-border)', 
              borderRadius: isMobile ? '16px' : '24px',
              position: 'relative',
              width: '100%',
              minWidth: 0,
              overflow: 'hidden'
            }}
          >
          {isMobile && selectedTrip && (
            <button 
              onClick={() => setSelectedTrip(null)}
              style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--text-main)', fontSize: '0.7rem', padding: '0.4rem 0.75rem', borderRadius: '8px', marginBottom: '1rem', cursor: 'pointer', fontWeight: '700' }}
            >
              ← {t('trips.switch_trip')}
            </button>
          )}

          {selectedTrip ? (
            <ItineraryManager 
              trip={selectedTrip}
              items={itinerary}
              onItemsChange={setItinerary}
              onAddToTickets={async (entry) => {
                try {
                  const newTicket = {
                    id: crypto.randomUUID(),
                    name: entry.activity || entry.location,
                    notes: entry.notes || '',
                    start_date: entry.day,
                    start_time: entry.time
                  };
                  
                  const updatedTickets = [...(selectedTrip.tickets || []), newTicket];
                  
                  const { error } = await supabase
                    .from('trips')
                    .update({ tickets: updatedTickets })
                    .eq('id', selectedTrip.id);
                  
                  if (error) throw error;
                  
                  setSelectedTrip({ ...selectedTrip, tickets: updatedTickets });
                  setTrips(trips.map(t => t.id === selectedTrip.id ? { ...t, tickets: updatedTickets } : t));
                  toast.success(t('trips.added_to_tickets_success'));
                } catch (err) {
                  console.error('Error adding ticket:', err);
                  toast.error(t('trips.error_adding_ticket'));
                }
              }}
            />
          ) : (
            <div style={{ height: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
              <Info size={48} style={{ marginBottom: '1rem' }} />
              <p style={{ fontWeight: '700' }}>{t('trips.select_trip_to_edit')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
