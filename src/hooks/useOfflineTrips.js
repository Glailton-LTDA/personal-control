import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  db,
  getTripsFromDexie,
  getTripFromDexie,
  putTripInDexie,
  removeTripFromDexie,
  getTripExpensesFromDexie,
  putTripExpenseInDexie,
  removeTripExpenseFromDexie,
  getTripItineraryFromDexie,
  putTripItineraryInDexie,
  removeTripItineraryFromDexie,
  getTripChecklistsFromDexie,
  putTripChecklistInDexie,
  removeTripChecklistFromDexie,
  getTripChecklistItemsFromDexie,
  putTripChecklistItemInDexie,
  removeTripChecklistItemFromDexie,
  getTripCategoriesFromDexie,
  putTripCategoryInDexie,
  removeTripCategoryFromDexie,
  getTripSharesFromDexie,
  putTripShareInDexie,
  removeTripShareFromDexie,
  generateUUID,
} from '../lib/offline/db';
import { SyncEngine } from '../lib/offline/SyncEngine';

// --- TRIPS HOOKS ---

export function useOfflineTrips(userId) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleSync = () => {
      queryClient.invalidateQueries({ queryKey: ['offline_trips'] });
      queryClient.invalidateQueries({ queryKey: ['offline_expenses'] });
      queryClient.invalidateQueries({ queryKey: ['offline_itinerary'] });
      queryClient.invalidateQueries({ queryKey: ['offline_checklists'] });
      queryClient.invalidateQueries({ queryKey: ['offline_shares'] });
      queryClient.invalidateQueries({ queryKey: ['offline_trip_categories'] });
    };
    window.addEventListener('database-synced', handleSync);
    return () => {
      window.removeEventListener('database-synced', handleSync);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['offline_trips', userId],
    queryFn: async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return getTripsFromDexie();
      }
      try {
        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .order('start_date', { ascending: false });

        if (error) throw error;
        if (data) {
          await Promise.all(data.map(t => putTripInDexie(t)));
        }
        return data || [];
      } catch (err) {
        console.warn('Failed to load trips online, falling back to Dexie:', err);
        return getTripsFromDexie();
      }
    },
    enabled: !!userId,
  });
}

export function useOfflineCreateTrip(userId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload) => {
      const id = generateUUID();
      const trip = {
        id,
        user_id: userId,
        title: payload.title,
        destination: payload.destination || '',
        start_date: payload.start_date,
        end_date: payload.end_date,
        budget: payload.budget || 0,
        currencies: payload.currencies || ['BRL'],
        participants: payload.participants || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await putTripInDexie(trip);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('trips').insert([payload ? { ...payload, id } : trip]).select().single();
          if (error) {
            console.warn('Supabase insert failed, enqueuing...', error);
            await engine.enqueue('trips', id, 'insert', trip);
          } else if (data) {
            await putTripInDexie({ ...trip, ...data, updated_at: new Date().toISOString() });
          }
        } catch (err) {
          console.warn('Network issue on insert, enqueuing...', err);
          await engine.enqueue('trips', id, 'insert', trip);
        }
      } else {
        await engine.enqueue('trips', id, 'insert', trip);
      }

      engine.destroy();
      return trip;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_trips', userId] });
    },
  });
}

export function useOfflineUpdateTrip(userId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const existing = await getTripFromDexie(id);
      const updated = {
        ...existing,
        ...payload,
        updated_at: new Date().toISOString(),
      };

      await putTripInDexie(updated);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('trips').update(payload).eq('id', id).select().single();
          if (error) {
            console.warn('Supabase update failed, enqueuing...', error);
            await engine.enqueue('trips', id, 'update', { id, ...payload });
          } else if (data) {
            await putTripInDexie({ ...updated, ...data, updated_at: new Date().toISOString() });
          }
        } catch (err) {
          console.warn('Network issue on update, enqueuing...', err);
          await engine.enqueue('trips', id, 'update', { id, ...payload });
        }
      } else {
        await engine.enqueue('trips', id, 'update', { id, ...payload });
      }

      engine.destroy();
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_trips', userId] });
    },
  });
}

export function useOfflineDeleteTrip(userId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id) => {
      await removeTripFromDexie(id);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { error } = await supabase.from('trips').delete().eq('id', id);
          if (error) {
            console.warn('Supabase delete failed, enqueuing...', error);
            await engine.enqueue('trips', id, 'delete');
          }
        } catch (err) {
          console.warn('Network issue on delete, enqueuing...', err);
          await engine.enqueue('trips', id, 'delete');
        }
      } else {
        await engine.enqueue('trips', id, 'delete');
      }

      engine.destroy();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_trips', userId] });
    },
  });
}

// --- EXPENSES HOOKS ---

export function useOfflineExpenses(tripId) {
  return useQuery({
    queryKey: ['offline_expenses', tripId],
    queryFn: async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return getTripExpensesFromDexie(tripId);
      }
      try {
        const { data, error } = await supabase
          .from('trip_expenses')
          .select('*')
          .eq('trip_id', tripId)
          .order('date', { ascending: false });

        if (error) throw error;
        if (data) {
          await Promise.all(data.map(exp => putTripExpenseInDexie(exp)));
        }
        return data || [];
      } catch (err) {
        console.warn('Failed to load expenses online, falling back to Dexie:', err);
        return getTripExpensesFromDexie(tripId);
      }
    },
    enabled: !!tripId,
  });
}

export function useOfflineCreateExpense(userId, tripId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload) => {
      const id = generateUUID();
      const expense = {
        id,
        trip_id: tripId,
        user_id: userId,
        description: payload.description,
        amount: payload.amount,
        currency: payload.currency,
        date: payload.date,
        paid_by: payload.paid_by,
        category_id: payload.category_id || null,
        receipt_url: payload.receipt_url || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await putTripExpenseInDexie(expense);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('trip_expenses').insert([{ ...payload, id, trip_id: tripId, user_id: userId }]).select().single();
          if (error) {
            console.warn('Supabase insert failed, enqueuing...', error);
            await engine.enqueue('trip_expenses', id, 'insert', expense);
          } else if (data) {
            await putTripExpenseInDexie({ ...expense, ...data, updated_at: new Date().toISOString() });
          }
        } catch (err) {
          console.warn('Network issue on insert, enqueuing...', err);
          await engine.enqueue('trip_expenses', id, 'insert', expense);
        }
      } else {
        await engine.enqueue('trip_expenses', id, 'insert', expense);
      }

      engine.destroy();
      return expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_expenses', tripId] });
    },
  });
}

export function useOfflineUpdateExpense(userId, tripId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const existing = await db.trip_expenses.get(id);
      const updated = {
        ...existing,
        ...payload,
        updated_at: new Date().toISOString(),
      };

      await putTripExpenseInDexie(updated);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('trip_expenses').update(payload).eq('id', id).select().single();
          if (error) {
            console.warn('Supabase update failed, enqueuing...', error);
            await engine.enqueue('trip_expenses', id, 'update', { id, ...payload });
          } else if (data) {
            await putTripExpenseInDexie({ ...updated, ...data, updated_at: new Date().toISOString() });
          }
        } catch (err) {
          console.warn('Network issue on update, enqueuing...', err);
          await engine.enqueue('trip_expenses', id, 'update', { id, ...payload });
        }
      } else {
        await engine.enqueue('trip_expenses', id, 'update', { id, ...payload });
      }

      engine.destroy();
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_expenses', tripId] });
    },
  });
}

export function useOfflineDeleteExpense(userId, tripId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id) => {
      await removeTripExpenseFromDexie(id);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { error } = await supabase.from('trip_expenses').delete().eq('id', id);
          if (error) {
            console.warn('Supabase delete failed, enqueuing...', error);
            await engine.enqueue('trip_expenses', id, 'delete');
          }
        } catch (err) {
          console.warn('Network issue on delete, enqueuing...', err);
          await engine.enqueue('trip_expenses', id, 'delete');
        }
      } else {
        await engine.enqueue('trip_expenses', id, 'delete');
      }

      engine.destroy();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_expenses', tripId] });
    },
  });
}

// --- ITINERARY HOOKS ---

export function useOfflineItinerary(tripId) {
  return useQuery({
    queryKey: ['offline_itinerary', tripId],
    queryFn: async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return getTripItineraryFromDexie(tripId);
      }
      try {
        const { data, error } = await supabase
          .from('trip_itinerary')
          .select('*')
          .eq('trip_id', tripId)
          .order('day', { ascending: true })
          .order('time', { ascending: true });

        if (error) throw error;
        if (data) {
          await Promise.all(data.map(item => putTripItineraryInDexie(item)));
        }
        return data || [];
      } catch (err) {
        console.warn('Failed to load itinerary online, falling back to Dexie:', err);
        return getTripItineraryFromDexie(tripId);
      }
    },
    enabled: !!tripId,
  });
}

export function useOfflineCreateItineraryItem(userId, tripId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload) => {
      const id = generateUUID();
      const item = {
        id,
        trip_id: tripId,
        day: payload.day,
        time: payload.time || '',
        activity: payload.activity,
        location: payload.location || '',
        lat: payload.lat || null,
        lng: payload.lng || null,
        notes: payload.notes || '',
        km_multiplier: payload.km_multiplier || 0,
        transportation: payload.transportation || 'drive',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await putTripItineraryInDexie(item);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('trip_itinerary').insert([{ ...payload, id, trip_id: tripId }]).select().single();
          if (error) {
            console.warn('Supabase insert failed, enqueuing...', error);
            await engine.enqueue('trip_itinerary', id, 'insert', item);
          } else if (data) {
            await putTripItineraryInDexie({ ...item, ...data, updated_at: new Date().toISOString() });
          }
        } catch (err) {
          console.warn('Network issue on insert, enqueuing...', err);
          await engine.enqueue('trip_itinerary', id, 'insert', item);
        }
      } else {
        await engine.enqueue('trip_itinerary', id, 'insert', item);
      }

      engine.destroy();
      return item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_itinerary', tripId] });
    },
  });
}

export function useOfflineUpdateItineraryItem(userId, tripId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const existing = await db.trip_itinerary.get(id);
      const updated = {
        ...existing,
        ...payload,
        updated_at: new Date().toISOString(),
      };

      await putTripItineraryInDexie(updated);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('trip_itinerary').update(payload).eq('id', id).select().single();
          if (error) {
            console.warn('Supabase update failed, enqueuing...', error);
            await engine.enqueue('trip_itinerary', id, 'update', { id, ...payload });
          } else if (data) {
            await putTripItineraryInDexie({ ...updated, ...data, updated_at: new Date().toISOString() });
          }
        } catch (err) {
          console.warn('Network issue on update, enqueuing...', err);
          await engine.enqueue('trip_itinerary', id, 'update', { id, ...payload });
        }
      } else {
        await engine.enqueue('trip_itinerary', id, 'update', { id, ...payload });
      }

      engine.destroy();
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_itinerary', tripId] });
    },
  });
}

export function useOfflineDeleteItineraryItem(userId, tripId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id) => {
      await removeTripItineraryFromDexie(id);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { error } = await supabase.from('trip_itinerary').delete().eq('id', id);
          if (error) {
            console.warn('Supabase delete failed, enqueuing...', error);
            await engine.enqueue('trip_itinerary', id, 'delete');
          }
        } catch (err) {
          console.warn('Network issue on delete, enqueuing...', err);
          await engine.enqueue('trip_itinerary', id, 'delete');
        }
      } else {
        await engine.enqueue('trip_itinerary', id, 'delete');
      }

      engine.destroy();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_itinerary', tripId] });
    },
  });
}

// --- CATEGORIES HOOKS ---

export function useOfflineCategories(userId) {
  return useQuery({
    queryKey: ['offline_trip_categories', userId],
    queryFn: async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return getTripCategoriesFromDexie(userId);
      }
      try {
        const { data, error } = await supabase
          .from('trip_categories')
          .select('*')
          .eq('user_id', userId)
          .order('name', { ascending: true });

        if (error) throw error;
        if (data) {
          await Promise.all(data.map(cat => putTripCategoryInDexie(cat)));
        }
        return data || [];
      } catch (err) {
        console.warn('Failed to load categories online, falling back to Dexie:', err);
        return getTripCategoriesFromDexie(userId);
      }
    },
    enabled: !!userId,
  });
}

export function useOfflineCreateCategory(userId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name) => {
      const id = generateUUID();
      const category = {
        id,
        user_id: userId,
        name,
      };

      await putTripCategoryInDexie(category);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('trip_categories').insert([{ id, user_id: userId, name }]).select().single();
          if (error) {
            console.warn('Supabase insert failed, enqueuing...', error);
            await engine.enqueue('trip_categories', id, 'insert', category);
          } else if (data) {
            await putTripCategoryInDexie(data);
          }
        } catch (err) {
          console.warn('Network issue on insert, enqueuing...', err);
          await engine.enqueue('trip_categories', id, 'insert', category);
        }
      } else {
        await engine.enqueue('trip_categories', id, 'insert', category);
      }

      engine.destroy();
      return category;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_trip_categories', userId] });
    },
  });
}

export function useOfflineUpdateCategory(userId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }) => {
      const category = { id, user_id: userId, name };
      await putTripCategoryInDexie(category);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('trip_categories').update({ name }).eq('id', id).select().single();
          if (error) {
            console.warn('Supabase update failed, enqueuing...', error);
            await engine.enqueue('trip_categories', id, 'update', category);
          } else if (data) {
            await putTripCategoryInDexie(data);
          }
        } catch (err) {
          console.warn('Network issue on update, enqueuing...', err);
          await engine.enqueue('trip_categories', id, 'update', category);
        }
      } else {
        await engine.enqueue('trip_categories', id, 'update', category);
      }

      engine.destroy();
      return category;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_trip_categories', userId] });
    },
  });
}

export function useOfflineDeleteCategory(userId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id) => {
      await removeTripCategoryFromDexie(id);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { error } = await supabase.from('trip_categories').delete().eq('id', id);
          if (error) {
            console.warn('Supabase delete failed, enqueuing...', error);
            await engine.enqueue('trip_categories', id, 'delete');
          }
        } catch (err) {
          console.warn('Network issue on delete, enqueuing...', err);
          await engine.enqueue('trip_categories', id, 'delete');
        }
      } else {
        await engine.enqueue('trip_categories', id, 'delete');
      }

      engine.destroy();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_trip_categories', userId] });
    },
  });
}

// --- CHECKLIST HOOKS ---

export function useOfflineChecklists(tripId) {
  return useQuery({
    queryKey: ['offline_checklists', tripId],
    queryFn: async () => {
      const getLocalChecklistsWithItems = async () => {
        const lists = await getTripChecklistsFromDexie(tripId);
        const enriched = [];
        for (const list of lists) {
          const items = await getTripChecklistItemsFromDexie(list.id);
          enriched.push({
            ...list,
            items: items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
          });
        }
        return enriched;
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return getLocalChecklistsWithItems();
      }
      try {
        const { data, error } = await supabase
          .from('trip_checklists')
          .select(`
            *,
            items:trip_checklist_items(*)
          `)
          .eq('trip_id', tripId);

        if (error) throw error;
        if (data) {
          await Promise.all(data.map(async (c) => {
            await putTripChecklistInDexie(c);
            if (c.items) {
              await Promise.all(c.items.map(item => putTripChecklistItemInDexie(item)));
            }
          }));
        }
        return (data || []).map(c => ({
          ...c,
          items: (c.items || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        }));
      } catch (err) {
        console.warn('Failed to load checklists online, falling back to Dexie:', err);
        return getLocalChecklistsWithItems();
      }
    },
    enabled: !!tripId,
  });
}

export function useOfflineCreateChecklist(userId, tripId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload) => {
      const id = generateUUID();
      const checklist = {
        id,
        trip_id: tripId,
        title: payload.title,
        description: payload.description || '',
        is_template: payload.is_template || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await putTripChecklistInDexie(checklist);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('trip_checklists').insert([{ ...payload, id, trip_id: tripId }]).select().single();
          if (error) {
            console.warn('Supabase insert failed, enqueuing...', error);
            await engine.enqueue('trip_checklists', id, 'insert', checklist);
          } else if (data) {
            await putTripChecklistInDexie({ ...checklist, ...data, updated_at: new Date().toISOString() });
          }
        } catch (err) {
          console.warn('Network issue on insert, enqueuing...', err);
          await engine.enqueue('trip_checklists', id, 'insert', checklist);
        }
      } else {
        await engine.enqueue('trip_checklists', id, 'insert', checklist);
      }

      engine.destroy();
      return checklist;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_checklists', tripId] });
    },
  });
}

export function useOfflineUpdateChecklist(userId, tripId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const existing = await db.trip_checklists.get(id);
      const updated = {
        ...existing,
        ...payload,
        updated_at: new Date().toISOString(),
      };

      await putTripChecklistInDexie(updated);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('trip_checklists').update(payload).eq('id', id).select().single();
          if (error) {
            console.warn('Supabase update failed, enqueuing...', error);
            await engine.enqueue('trip_checklists', id, 'update', { id, ...payload });
          } else if (data) {
            await putTripChecklistInDexie({ ...updated, ...data, updated_at: new Date().toISOString() });
          }
        } catch (err) {
          console.warn('Network issue on update, enqueuing...', err);
          await engine.enqueue('trip_checklists', id, 'update', { id, ...payload });
        }
      } else {
        await engine.enqueue('trip_checklists', id, 'update', { id, ...payload });
      }

      engine.destroy();
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_checklists', tripId] });
    },
  });
}

export function useOfflineDeleteChecklist(userId, tripId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id) => {
      await removeTripChecklistFromDexie(id);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { error } = await supabase.from('trip_checklists').delete().eq('id', id);
          if (error) {
            console.warn('Supabase delete failed, enqueuing...', error);
            await engine.enqueue('trip_checklists', id, 'delete');
          }
        } catch (err) {
          console.warn('Network issue on delete, enqueuing...', err);
          await engine.enqueue('trip_checklists', id, 'delete');
        }
      } else {
        await engine.enqueue('trip_checklists', id, 'delete');
      }

      engine.destroy();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_checklists', tripId] });
    },
  });
}

// --- CHECKLIST ITEMS HOOKS ---

export function useOfflineChecklistItems(checklistId) {
  return useQuery({
    queryKey: ['offline_checklist_items', checklistId],
    queryFn: async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return getTripChecklistItemsFromDexie(checklistId);
      }
      try {
        const { data, error } = await supabase
          .from('trip_checklist_items')
          .select('*')
          .eq('checklist_id', checklistId);

        if (error) throw error;
        if (data) {
          await Promise.all(data.map(item => putTripChecklistItemInDexie(item)));
        }
        return data || [];
      } catch (err) {
        console.warn('Failed to load checklist items online, falling back to Dexie:', err);
        return getTripChecklistItemsFromDexie(checklistId);
      }
    },
    enabled: !!checklistId,
  });
}

export function useOfflineCreateChecklistItem(userId, tripId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload) => {
      const id = generateUUID();
      const item = {
        id,
        checklist_id: payload.checklist_id,
        task: payload.task,
        completed: payload.completed || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await putTripChecklistItemInDexie(item);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('trip_checklist_items').insert([{ ...payload, id }]).select().single();
          if (error) {
            console.warn('Supabase insert failed, enqueuing...', error);
            await engine.enqueue('trip_checklist_items', id, 'insert', item);
          } else if (data) {
            await putTripChecklistItemInDexie({ ...item, ...data, updated_at: new Date().toISOString() });
          }
        } catch (err) {
          console.warn('Network issue on insert, enqueuing...', err);
          await engine.enqueue('trip_checklist_items', id, 'insert', item);
        }
      } else {
        await engine.enqueue('trip_checklist_items', id, 'insert', item);
      }

      engine.destroy();
      return item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_checklists', tripId] });
    },
  });
}

export function useOfflineUpdateChecklistItem(userId, tripId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const existing = await db.trip_checklist_items.get(id);
      const updated = {
        ...existing,
        ...payload,
        updated_at: new Date().toISOString(),
      };

      await putTripChecklistItemInDexie(updated);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('trip_checklist_items').update(payload).eq('id', id).select().single();
          if (error) {
            console.warn('Supabase update failed, enqueuing...', error);
            await engine.enqueue('trip_checklist_items', id, 'update', { id, ...payload });
          } else if (data) {
            await putTripChecklistItemInDexie({ ...updated, ...data, updated_at: new Date().toISOString() });
          }
        } catch (err) {
          console.warn('Network issue on update, enqueuing...', err);
          await engine.enqueue('trip_checklist_items', id, 'update', { id, ...payload });
        }
      } else {
        await engine.enqueue('trip_checklist_items', id, 'update', { id, ...payload });
      }

      engine.destroy();
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_checklists', tripId] });
    },
  });
}

export function useOfflineDeleteChecklistItem(userId, tripId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id) => {
      await removeTripChecklistItemFromDexie(id);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { error } = await supabase.from('trip_checklist_items').delete().eq('id', id);
          if (error) {
            console.warn('Supabase delete failed, enqueuing...', error);
            await engine.enqueue('trip_checklist_items', id, 'delete');
          }
        } catch (err) {
          console.warn('Network issue on delete, enqueuing...', err);
          await engine.enqueue('trip_checklist_items', id, 'delete');
        }
      } else {
        await engine.enqueue('trip_checklist_items', id, 'delete');
      }

      engine.destroy();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_checklists', tripId] });
    },
  });
}

// --- SHARES HOOKS ---

export function useOfflineShares(tripId) {
  return useQuery({
    queryKey: ['offline_shares', tripId],
    queryFn: async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return getTripSharesFromDexie(tripId);
      }
      try {
        const { data, error } = await supabase
          .from('trip_shares')
          .select('*')
          .eq('trip_id', tripId);

        if (error) throw error;
        if (data) {
          await Promise.all(data.map(share => putTripShareInDexie(share)));
        }
        return data || [];
      } catch (err) {
        console.warn('Failed to load shares online, falling back to Dexie:', err);
        return getTripSharesFromDexie(tripId);
      }
    },
    enabled: !!tripId,
  });
}

export function useOfflineCreateShare(userId, tripId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload) => {
      const id = generateUUID();
      const share = {
        id,
        trip_id: tripId,
        shared_with_email: payload.shared_with_email,
        access_level: payload.access_level || 'read',
      };

      await putTripShareInDexie(share);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('trip_shares').insert([{ ...payload, id, trip_id: tripId }]).select().single();
          if (error) {
            console.warn('Supabase insert failed, enqueuing...', error);
            await engine.enqueue('trip_shares', id, 'insert', share);
          } else if (data) {
            await putTripShareInDexie(data);
          }
        } catch (err) {
          console.warn('Network issue on insert, enqueuing...', err);
          await engine.enqueue('trip_shares', id, 'insert', share);
        }
      } else {
        await engine.enqueue('trip_shares', id, 'insert', share);
      }

      engine.destroy();
      return share;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_shares', tripId] });
    },
  });
}

export function useOfflineDeleteShare(userId, tripId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id) => {
      await removeTripShareFromDexie(id);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { error } = await supabase.from('trip_shares').delete().eq('id', id);
          if (error) {
            console.warn('Supabase delete failed, enqueuing...', error);
            await engine.enqueue('trip_shares', id, 'delete');
          }
        } catch (err) {
          console.warn('Network issue on delete, enqueuing...', err);
          await engine.enqueue('trip_shares', id, 'delete');
        }
      } else {
        await engine.enqueue('trip_shares', id, 'delete');
      }

      engine.destroy();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_shares', tripId] });
    },
  });
}
