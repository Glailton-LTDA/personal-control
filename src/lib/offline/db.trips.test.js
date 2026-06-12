import { describe, it, expect, beforeEach } from 'vitest';
import {
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
  clearTripsCache,
} from './db';

beforeEach(async () => {
  await clearTripsCache();
});

describe('Dexie Trips Offline DB helpers', () => {
  const userId = 'user-123';
  const tripId = 'trip-456';

  describe('Trips CRUD', () => {
    it('should start with empty trips list', async () => {
      const trips = await getTripsFromDexie();
      expect(trips).toHaveLength(0);
    });

    it('should store and retrieve a trip', async () => {
      const trip = { id: tripId, user_id: userId, title: 'Euro Trip', start_date: '2026-07-01' };
      await putTripInDexie(trip);

      const retrieved = await getTripFromDexie(tripId);
      expect(retrieved).toBeDefined();
      expect(retrieved.title).toBe('Euro Trip');
      expect(retrieved.updated_at).toBeDefined();
    });

    it('should retrieve trips ordered by start_date DESC', async () => {
      await putTripInDexie({ id: 't1', user_id: userId, title: 'Trip 1', start_date: '2026-01-01' });
      await putTripInDexie({ id: 't2', user_id: userId, title: 'Trip 2', start_date: '2026-03-01' });
      await putTripInDexie({ id: 't3', user_id: userId, title: 'Trip 3', start_date: '2026-02-01' });

      const trips = await getTripsFromDexie();
      expect(trips).toHaveLength(3);
      expect(trips[0].id).toBe('t2'); // 2026-03-01
      expect(trips[1].id).toBe('t3'); // 2026-02-01
      expect(trips[2].id).toBe('t1'); // 2026-01-01
    });

    it('should remove a trip', async () => {
      await putTripInDexie({ id: tripId, user_id: userId, title: 'Euro Trip' });
      await removeTripFromDexie(tripId);

      const retrieved = await getTripFromDexie(tripId);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Trip Expenses CRUD', () => {
    it('should store, retrieve and sort expenses', async () => {
      await putTripExpenseInDexie({ id: 'e1', trip_id: tripId, user_id: userId, date: '2026-07-02', amount: 50 });
      await putTripExpenseInDexie({ id: 'e2', trip_id: tripId, user_id: userId, date: '2026-07-03', amount: 100 });
      await putTripExpenseInDexie({ id: 'e3', trip_id: tripId, user_id: userId, date: '2026-07-01', amount: 20 });

      const expenses = await getTripExpensesFromDexie(tripId);
      expect(expenses).toHaveLength(3);
      expect(expenses[0].id).toBe('e2'); // latest date first (DESC)
      expect(expenses[1].id).toBe('e1');
      expect(expenses[2].id).toBe('e3');
    });

    it('should delete an expense', async () => {
      await putTripExpenseInDexie({ id: 'e1', trip_id: tripId });
      await removeTripExpenseFromDexie('e1');

      const expenses = await getTripExpensesFromDexie(tripId);
      expect(expenses).toHaveLength(0);
    });
  });

  describe('Trip Itinerary CRUD', () => {
    it('should store, retrieve and sort itinerary items by day ASC, then time ASC', async () => {
      await putTripItineraryInDexie({ id: 'i1', trip_id: tripId, day: 2, time: '14:00', activity: 'Lunch' });
      await putTripItineraryInDexie({ id: 'i2', trip_id: tripId, day: 1, time: '09:00', activity: 'Arrival' });
      await putTripItineraryInDexie({ id: 'i3', trip_id: tripId, day: 1, time: '20:00', activity: 'Dinner' });

      const itinerary = await getTripItineraryFromDexie(tripId);
      expect(itinerary).toHaveLength(3);
      expect(itinerary[0].id).toBe('i2'); // day 1, 09:00
      expect(itinerary[1].id).toBe('i3'); // day 1, 20:00
      expect(itinerary[2].id).toBe('i1'); // day 2, 14:00
    });

    it('should delete an itinerary item', async () => {
      await putTripItineraryInDexie({ id: 'i1', trip_id: tripId });
      await removeTripItineraryFromDexie('i1');

      const itinerary = await getTripItineraryFromDexie(tripId);
      expect(itinerary).toHaveLength(0);
    });
  });

  describe('Trip Checklists and Items CRUD', () => {
    it('should handle checklists CRUD', async () => {
      await putTripChecklistInDexie({ id: 'c1', trip_id: tripId, title: 'Luggage' });
      
      const checklists = await getTripChecklistsFromDexie(tripId);
      expect(checklists).toHaveLength(1);
      expect(checklists[0].title).toBe('Luggage');

      await removeTripChecklistFromDexie('c1');
      const emptyChecklists = await getTripChecklistsFromDexie(tripId);
      expect(emptyChecklists).toHaveLength(0);
    });

    it('should handle checklist items CRUD', async () => {
      const checklistId = 'c1';
      await putTripChecklistItemInDexie({ id: 'item1', checklist_id: checklistId, task: 'Pack shirts', completed: false });

      const items = await getTripChecklistItemsFromDexie(checklistId);
      expect(items).toHaveLength(1);
      expect(items[0].task).toBe('Pack shirts');

      await removeTripChecklistItemFromDexie('item1');
      const emptyItems = await getTripChecklistItemsFromDexie(checklistId);
      expect(emptyItems).toHaveLength(0);
    });
  });

  describe('Trip Categories and Shares CRUD', () => {
    it('should handle categories CRUD', async () => {
      await putTripCategoryInDexie({ id: 'cat1', user_id: userId, name: 'Food' });

      const categories = await getTripCategoriesFromDexie(userId);
      expect(categories).toHaveLength(1);
      expect(categories[0].name).toBe('Food');

      await removeTripCategoryFromDexie('cat1');
      const emptyCats = await getTripCategoriesFromDexie(userId);
      expect(emptyCats).toHaveLength(0);
    });

    it('should handle shares CRUD', async () => {
      await putTripShareInDexie({ id: 'share1', trip_id: tripId, shared_with_email: 'friend@example.com' });

      const shares = await getTripSharesFromDexie(tripId);
      expect(shares).toHaveLength(1);
      expect(shares[0].shared_with_email).toBe('friend@example.com');

      await removeTripShareFromDexie('share1');
      const emptyShares = await getTripSharesFromDexie(tripId);
      expect(emptyShares).toHaveLength(0);
    });
  });
});
