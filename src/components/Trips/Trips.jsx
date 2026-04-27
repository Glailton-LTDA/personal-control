import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import TripsList from './TripsList';
import TripsSettings from './TripsSettings';
import TripsItinerary from './TripsItinerary';
import TripForm from './TripForm';
import ExpenseModal from './ExpenseModal';
import TripChecklists from './TripChecklists';
import TripsStats from './TripsStats';
import { Plus, TrendingUp } from 'lucide-react';
import { useEncryption } from '../../contexts/EncryptionContext';

export default function Trips({ user, refreshKey, mode, showValues }) {
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [categories, setCategories] = useState([]);
  const [trips, setTrips] = useState([]);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const { decryptObject } = useEncryption();
  
  // New state for page-based navigation within Trips module
  const [currentView, setCurrentView] = useState(() => {
    if (mode === 'settings') return 'settings';
    if (mode === 'itinerary') return 'itinerary';
    if (mode === 'checklists') return 'checklists';
    return 'main';
  });
  const [editingTrip, setEditingTrip] = useState(null);

  useEffect(() => {
    if (mode === 'settings') setCurrentView('settings');
    else if (mode === 'itinerary') setCurrentView('itinerary');
    else if (mode === 'checklists') setCurrentView('checklists');
    else if (mode === 'stats') setCurrentView('stats');
    else if (mode === 'main') setCurrentView('main');
  }, [mode]);

  useEffect(() => {
    // If mode prop changes, update currentView
    if (mode === 'settings') setCurrentView('settings');
    else if (mode === 'itinerary') setCurrentView('itinerary');
    else if (mode === 'checklists') setCurrentView('checklists');
    else if (mode === 'stats') setCurrentView('stats');
    else if (mode === 'list') setCurrentView('main');
  }, [mode]);

  const STORAGE_KEY = 'pc_selected_trip_v1';

  // Persistent Selected Trip - SAVING
  useEffect(() => {
    if (selectedTrip && selectedTrip.id && !selectedTrip._isPlaceholder) {
      localStorage.setItem(STORAGE_KEY, selectedTrip.id);
    }
  }, [selectedTrip]);

  const fetchTrips = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('trips').select('*').order('created_at', { ascending: false });
    
    if (data && data.length > 0) {
      const decryptedTrips = await decryptObject(data, ['title', 'cities', 'hotels']);
      setTrips(decryptedTrips);
      
      const savedTripId = localStorage.getItem(STORAGE_KEY);
      
      let tripToSelect = null;

      // 1. Prioridade: Se já temos um objeto real em memória, atualizamos ele com dados novos do banco
      if (selectedTrip?.id && !selectedTrip._isPlaceholder) {
        tripToSelect = decryptedTrips.find(t => String(t.id) === String(selectedTrip.id));
      } 
      
      // 2. Segunda Prioridade: Se não temos nada ou a atualização falhou, tentamos o localStorage
      if (!tripToSelect && savedTripId) {
        tripToSelect = decryptedTrips.find(t => String(t.id) === String(savedTripId));
      }

      // 3. Fallback: Se nada funcionou, pegamos a primeira (mais recente)
      setSelectedTrip(tripToSelect || decryptedTrips[0]);
    }
  }, [user, decryptObject, selectedTrip?.id, selectedTrip?._isPlaceholder]);

  const fetchCategories = useCallback(async () => {
    const targetUserId = selectedTrip?.user_id || user?.id;
    if (!targetUserId) return;
    const { data } = await supabase.from('trip_categories').select('*').eq('user_id', targetUserId).order('name', { ascending: true });
    if (data) {
      const decryptedCats = await decryptObject(data, ['name']);
      setCategories(decryptedCats);
    }
  }, [selectedTrip?.user_id, user?.id, decryptObject]);

  useEffect(() => {
    fetchTrips();
    fetchCategories();
  }, [user, refreshKey, localRefreshKey, selectedTrip?.user_id, fetchTrips, fetchCategories]);

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
    return <TripsSettings user={user} refreshKey={refreshKey || localRefreshKey} onEditTrip={handleOpenForm} onAddTrip={() => handleOpenForm(null)} />;
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
        onTripSelect={setSelectedTrip}
        externalSelectedTrip={selectedTrip}
        trips={trips}
        showValues={showValues}
        onEditTrip={handleOpenForm}
        onViewChecklists={() => setCurrentView('checklists')}
        onViewStats={() => setCurrentView('stats')}
        onViewItinerary={() => setCurrentView('itinerary')}
      />

      {/* FAB - Global Trip Expense Trigger */}
      {selectedTrip && (
        <button
          onClick={() => setIsAddingExpense(true)}
// ... rest of the file
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            width: '60px',
            height: '60px',
            borderRadius: '18px',
            background: 'var(--primary)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 25px rgba(99, 102, 241, 0.4)',
            border: 'none',
            cursor: 'pointer',
            zIndex: 100,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          className="fab-hover"
          title="Novo Gasto de Viagem"
        >
          <Plus size={32} />
        </button>
      )}

      {isAddingExpense && (
        <ExpenseModal 
          user={user}
          trip={selectedTrip}
          categories={categories}
          onClose={() => setIsAddingExpense(false)}
          onSave={handleExpenseSaved}
        />
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .fab-hover:hover {
          transform: scale(1.1) translateY(-5px);
          box-shadow: 0 15px 30px rgba(99, 102, 241, 0.5);
          filter: brightness(1.1);
        }
        .fab-hover:active {
          transform: scale(0.95);
        }
      `}} />
    </div>
  );
}
