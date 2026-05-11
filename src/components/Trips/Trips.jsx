import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import TripsList from './TripsList';
import TripsSettings from './TripsSettings';
import TripsItinerary from './TripsItinerary';
import TripForm from './TripForm';
import ExpenseModal from './ExpenseModal';
import TripChecklists from './TripChecklists';
import TripsStats from './TripsStats';
import { Plus, TrendingUp, DollarSign } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';

export default function Trips({ user, refreshKey, mode, showValues }) {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [trips, setTrips] = useState([]);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  
  // Navigation state within Trips module
  const [currentView, setCurrentView] = useState(() => {
    const savedView = localStorage.getItem('pc_trips_view_v2');
    if (mode === 'settings') return 'settings';
    if (mode === 'itinerary') return 'itinerary';
    if (mode === 'checklists') return 'checklists';
    if (mode === 'stats') return 'stats';
    return savedView || 'main';
  });
  const [editingTrip, setEditingTrip] = useState(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Persist currentView
  useEffect(() => {
    if (currentView !== 'form') {
      localStorage.setItem('pc_trips_view_v2', currentView);
    }
  }, [currentView]);

  useEffect(() => {
    if (mode === 'settings') setCurrentView('settings');
    else if (mode === 'itinerary') setCurrentView('itinerary');
    else if (mode === 'checklists') setCurrentView('checklists');
    else if (mode === 'stats') setCurrentView('stats');
    else if (mode === 'list') setCurrentView('main');
  }, [mode]);

  const STORAGE_KEY = 'pc_selected_trip_v2';

  // Persistent Selected Trip
  useEffect(() => {
    if (selectedTrip && selectedTrip.id && !selectedTrip._isPlaceholder) {
      localStorage.setItem(STORAGE_KEY, selectedTrip.id);
    }
  }, [selectedTrip]);

  const fetchTrips = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .order('start_date', { ascending: false });
    
    if (error) {
      console.error('Error fetching trips:', error);
      return;
    }

    if (data && data.length > 0) {
      setTrips(data);
      
      const savedTripId = localStorage.getItem(STORAGE_KEY);
      
      setSelectedTrip(current => {
        if (current?.id && !current._isPlaceholder) {
          const updated = data.find(t => String(t.id) === String(current.id));
          return updated || current;
        }
        
        if (savedTripId) {
          const saved = data.find(t => String(t.id) === String(savedTripId));
          if (saved) return saved;
        }

        return data[0];
      });
    }
  }, [user]);

  const fetchCategories = useCallback(async () => {
    const targetUserId = selectedTrip?.user_id || user?.id;
    if (!targetUserId) return;
    const { data } = await supabase
      .from('trip_categories')
      .select('*')
      .eq('user_id', targetUserId)
      .order('name', { ascending: true });
    if (data) {
      setCategories(data);
    }
  }, [selectedTrip?.user_id, user?.id]);

  useEffect(() => {
    fetchTrips();
  }, [user, refreshKey, localRefreshKey, fetchTrips]);

  useEffect(() => {
    fetchCategories();
  }, [user, selectedTrip?.user_id, fetchCategories]);

  const handleExpenseSaved = () => {
    setIsAddingExpense(false);
    setLocalRefreshKey(prev => prev + 1);
  };

  const handleOpenForm = (trip = null) => {
    setEditingTrip(trip);
    setCurrentView('form');
  };

  const handleFormSave = () => {
    setLocalRefreshKey(prev => prev + 1);
    setCurrentView(mode === 'settings' ? 'settings' : 'main');
    setEditingTrip(null);
  };

  // Rendering Views
  if (currentView === 'form') {
    return (
      <TripForm 
        user={user} 
        trip={editingTrip} 
        onBack={() => setCurrentView(mode === 'settings' ? 'settings' : 'main')} 
        onSave={handleFormSave} 
      />
    );
  }

  if (currentView === 'settings') {
    return (
      <TripsSettings 
        user={user} 
        refreshKey={refreshKey || localRefreshKey} 
        onEditTrip={handleOpenForm} 
        onAddTrip={() => handleOpenForm(null)}
        onSelectTrip={(trip) => {
          setSelectedTrip(trip);
          setIsDetailsOpen(false);
          setCurrentView('main');
        }}
      />
    );
  }

  if (currentView === 'itinerary') {
    return (
      <TripsItinerary 
        user={user} 
        initialTripId={selectedTrip?.id} 
        onBack={() => {
          window.dispatchEvent(new CustomEvent('set-active-tab', { detail: { tab: 'trips-list' } }));
          setCurrentView('main');
        }} 
      />
    );
  }

  if (currentView === 'checklists') {
    return (
      <TripChecklists 
        user={user} 
        trip={selectedTrip} 
        onBack={() => setCurrentView('main')} 
        onSave={() => setLocalRefreshKey(prev => prev + 1)}
      />
    );
  }

  if (currentView === 'stats') {
    return (
      <TripsStats 
        trips={trips} 
        onBack={() => {
          window.dispatchEvent(new CustomEvent('set-active-tab', { detail: { tab: 'trips-list' } }));
          setCurrentView('main');
        }} 
      />
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      <TripsList 
        user={user} 
        refreshKey={refreshKey || localRefreshKey} 
        onTripSelect={(trip) => {
          setSelectedTrip(trip);
          setIsDetailsOpen(true);
        }}
        externalSelectedTrip={selectedTrip}
        isDetailsOpen={isDetailsOpen}
        setIsDetailsOpen={setIsDetailsOpen}
        trips={trips}
        showValues={showValues}
        onEditTrip={handleOpenForm}
        onViewChecklists={() => setCurrentView('checklists')}
        onViewStats={() => setCurrentView('stats')}
        onViewItinerary={() => setCurrentView('itinerary')}
      />

      {/* Premium FAB - Global Trip Expense Trigger */}
      <AnimatePresence>
        {selectedTrip && currentView === 'main' && (
          <Motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsAddingExpense(true)}
            style={{
              position: 'fixed',
              bottom: '2.5rem',
              right: '2.5rem',
              height: '64px',
              padding: '0 1.5rem',
              borderRadius: '20px',
              background: 'var(--primary)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              boxShadow: '0 15px 35px -5px rgba(99, 102, 241, 0.5)',
              border: 'none',
              cursor: 'pointer',
              zIndex: 100,
              fontWeight: '900',
              fontSize: '0.9rem',
              letterSpacing: '0.02em'
            }}
            title={t('trips.expenses')}
          >
            <Plus size={24} strokeWidth={3} />
            {!isMobile && <span>{t('trips.expenses').toUpperCase()}</span>}
          </Motion.button>
        )}
      </AnimatePresence>

      {isAddingExpense && (
        <ExpenseModal 
          user={user}
          trip={selectedTrip}
          categories={categories}
          onClose={() => setIsAddingExpense(false)}
          onSave={handleExpenseSaved}
        />
      )}
    </div>
  );
}
