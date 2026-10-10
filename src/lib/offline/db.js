import Dexie from 'dexie';

// Nome novo para abandonar o banco corrompido pela tentativa de upgrade v3
const DB_NAME = 'PersonalControlOffline_v4';
const DB_VERSION = 4;

export const db = new Dexie(DB_NAME);

db.version(1).stores({
  music_songs: 'id, user_id, title, artist, type, genre_id, is_favorite, updated_at',
  music_setlists: 'id, user_id, updated_at',
  music_setlist_songs: 'id, setlist_id, song_id',
  music_genres: 'id, name',
  sync_queue: '++id, table_name, action, created_at',
});

db.version(2).stores({
  music_songs: 'id, user_id, title, artist, type, genre_id, is_favorite, updated_at',
  music_setlists: 'id, user_id, updated_at',
  music_setlist_songs: 'id, setlist_id, song_id',
  music_genres: 'id, name',
  music_chords: 'id, chord_name',
  sync_queue: '++id, table_name, action, created_at',
});

db.version(3).stores({
  music_songs: 'id, user_id, title, artist, type, genre_id, is_favorite, updated_at',
  music_setlists: 'id, user_id, updated_at',
  music_setlist_songs: 'id, setlist_id, song_id',
  music_genres: 'id, name',
  music_chords: 'id, chord_name',
  sync_queue: '++id, table_name, action, created_at, attempts',
});

db.version(4).stores({
  music_songs: 'id, user_id, title, artist, type, genre_id, is_favorite, updated_at',
  music_setlists: 'id, user_id, updated_at',
  music_setlist_songs: 'id, setlist_id, song_id',
  music_genres: 'id, name',
  music_chords: 'id, chord_name',
  sync_queue: '++id, table_name, action, created_at, attempts',
  
  trips: 'id, user_id, start_date, updated_at',
  trip_expenses: 'id, trip_id, user_id, category_id, date, updated_at',
  trip_itinerary: 'id, trip_id, day, time, updated_at',
  trip_checklists: 'id, trip_id, updated_at',
  trip_checklist_items: 'id, checklist_id, updated_at',
  trip_categories: 'id, user_id, name',
  trip_shares: 'id, trip_id, shared_with_email',
});

// Fase 9 (2026-10-04): Minhas Finanças offline (Dexie + SyncEngine)
db.version(5).stores({
  music_songs: 'id, user_id, title, artist, type, genre_id, is_favorite, updated_at',
  music_setlists: 'id, user_id, updated_at',
  music_setlist_songs: 'id, setlist_id, song_id',
  music_genres: 'id, name',
  music_chords: 'id, chord_name',
  sync_queue: '++id, table_name, action, created_at, attempts',

  trips: 'id, user_id, start_date, updated_at',
  trip_expenses: 'id, trip_id, user_id, category_id, date, updated_at',
  trip_itinerary: 'id, trip_id, day, time, updated_at',
  trip_checklists: 'id, trip_id, updated_at',
  trip_checklist_items: 'id, checklist_id, updated_at',
  trip_categories: 'id, user_id, name',
  trip_shares: 'id, trip_id, shared_with_email',

  // Tabelas mf_* (cache local + fila offline). A junção mf_transaction_tags
  // não tem coluna id: usa PK composto [transaction_id+tag_id].
  mf_accounts: 'id, user_id, profile_id, sort_order',
  mf_account_types: 'id, user_id, name',
  mf_transactions: 'id, user_id, account_id, payment_date, parent_transaction_id',
  mf_transaction_tags: '[transaction_id+tag_id], user_id, transaction_id, tag_id',
  mf_categories: 'id, user_id, name, parent_id',
  mf_tags: 'id, user_id, name',
  mf_responsibles: 'id, user_id, name',
  mf_budgets: 'id, user_id, account_id, period_start',
  mf_goals: 'id, user_id, account_id',
  mf_goal_contributions: 'id, user_id, goal_id',
  mf_saved_reports: 'id, user_id',
  mf_profiles: 'id, user_id, sort_order',
  mf_restore_points: 'id, user_id, created_at',
});

// Grupos de contas hierárquicos (Fase das novas features) + índices.
db.version(6).stores({
  music_songs: 'id, user_id, title, artist, type, genre_id, is_favorite, updated_at',
  music_setlists: 'id, user_id, updated_at',
  music_setlist_songs: 'id, setlist_id, song_id',
  music_genres: 'id, name',
  music_chords: 'id, chord_name',
  sync_queue: '++id, table_name, action, created_at, attempts',

  trips: 'id, user_id, start_date, updated_at',
  trip_expenses: 'id, trip_id, user_id, category_id, date, updated_at',
  trip_itinerary: 'id, trip_id, day, time, updated_at',
  trip_checklists: 'id, trip_id, updated_at',
  trip_checklist_items: 'id, checklist_id, updated_at',
  trip_categories: 'id, user_id, name',
  trip_shares: 'id, trip_id, shared_with_email',

  // Tabelas mf_* (cache local + fila offline). A junção mf_transaction_tags
  // não tem coluna id: usa PK composto [transaction_id+tag_id].
  mf_account_groups: 'id, user_id, parent_id, sort_order',
  mf_accounts: 'id, user_id, profile_id, sort_order, group_id',
  mf_account_types: 'id, user_id, name',
  mf_transactions: 'id, user_id, account_id, payment_date, parent_transaction_id',
  mf_transaction_tags: '[transaction_id+tag_id], user_id, transaction_id, tag_id',
  mf_categories: 'id, user_id, name, parent_id',
  mf_tags: 'id, user_id, name',
  mf_responsibles: 'id, user_id, name',
  mf_budgets: 'id, user_id, account_id, period_start',
  mf_goals: 'id, user_id, account_id',
  mf_goal_contributions: 'id, user_id, goal_id',
  mf_saved_reports: 'id, user_id',
  mf_profiles: 'id, user_id, sort_order',
  mf_restore_points: 'id, user_id, created_at',
});

/**
 * Tabelas do Minhas Finanças replicadas no Dexie (cache de leitura).
 * mf_import_* ficam de fora (exigem conexão) e mf_restore_points não é
 * baixado em bloco (payload grande; só cacheia leituras).
 */
export const MF_OFFLINE_TABLES = [
  'mf_account_groups',
  'mf_accounts',
  'mf_account_types',
  'mf_transactions',
  'mf_transaction_tags',
  'mf_categories',
  'mf_tags',
  'mf_responsibles',
  'mf_budgets',
  'mf_goals',
  'mf_goal_contributions',
  'mf_saved_reports',
  'mf_profiles',
  'mf_restore_points',
];

/** Subconjunto baixado em bloco pelo MfSyncProvider (payloads leves). */
export const MF_SYNC_TABLES = MF_OFFLINE_TABLES.filter(
  (table) => table !== 'mf_restore_points'
);

db.open().catch(async (err) => {
  if (/UpgradeError/i.test(err.message) || err.name === 'DatabaseClosedError') {
    console.warn('Dexie upgrade failed, deleting database and reloading', err);
    if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function' && !(typeof globalThis.process !== 'undefined' && globalThis.process.env?.VITEST)) {
      await db.delete();
      window.location.reload();
    }
  }
});

// Helpers - Music
export function getMusicSongs(userId) {
  return db.music_songs.where('user_id').equals(userId).toArray();
}

export function getMusicSong(id) {
  return db.music_songs.get(id);
}

export function putMusicSong(song) {
  return db.music_songs.put({
    ...song,
    updated_at: song.updated_at || new Date().toISOString(),
  });
}

export function removeMusicSong(id) {
  return db.music_songs.delete(id);
}

export function getMusicSetlists(userId) {
  return db.music_setlists.where('user_id').equals(userId).toArray();
}

export function putMusicSetlist(setlist) {
  return db.music_setlists.put({
    ...setlist,
    updated_at: setlist.updated_at || new Date().toISOString(),
  });
}

export function removeMusicSetlist(id) {
  return db.music_setlists.delete(id);
}

export function getMusicSetlistSongs(setlistId) {
  return db.music_setlist_songs.where('setlist_id').equals(setlistId).toArray();
}

export function putMusicSetlistSong(relation) {
  return db.music_setlist_songs.put({
    id: `${relation.setlist_id}_${relation.song_id}`,
    ...relation,
  });
}

export function removeMusicSetlistSong(setlistId, songId) {
  return db.music_setlist_songs
    .where({ setlist_id: setlistId, song_id: songId })
    .delete();
}

export function getAllMusicGenres() {
  return db.music_genres.toArray();
}

export function putMusicGenre(genre) {
  return db.music_genres.put(genre);
}

export function getAllMusicChords() {
  return db.music_chords.toArray();
}

export function putMusicChord(chord) {
  return db.music_chords.put(chord);
}

// Helpers - Trips
export async function getTripsFromDexie() {
  const trips = await db.trips.toArray();
  // Sort by start_date DESC
  return trips.sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
}

export function getTripFromDexie(id) {
  return db.trips.get(id);
}

export function putTripInDexie(trip) {
  return db.trips.put({
    ...trip,
    updated_at: trip.updated_at || new Date().toISOString(),
  });
}

export function removeTripFromDexie(id) {
  return db.trips.delete(id);
}

export async function getTripExpensesFromDexie(tripId) {
  const expenses = await db.trip_expenses.where('trip_id').equals(tripId).toArray();
  // Sort by date DESC
  return expenses.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function putTripExpenseInDexie(expense) {
  return db.trip_expenses.put({
    ...expense,
    updated_at: expense.updated_at || new Date().toISOString(),
  });
}

export function removeTripExpenseFromDexie(id) {
  return db.trip_expenses.delete(id);
}

export async function getTripItineraryFromDexie(tripId) {
  const itinerary = await db.trip_itinerary.where('trip_id').equals(tripId).toArray();
  // Sort by day ASC, then time ASC
  return itinerary.sort((a, b) => {
    if (a.day !== b.day) return (a.day || 0) - (b.day || 0);
    return (a.time || '').localeCompare(b.time || '');
  });
}

export function putTripItineraryInDexie(item) {
  return db.trip_itinerary.put({
    ...item,
    updated_at: item.updated_at || new Date().toISOString(),
  });
}

export function removeTripItineraryFromDexie(id) {
  return db.trip_itinerary.delete(id);
}

export function getTripChecklistsFromDexie(tripId) {
  return db.trip_checklists.where('trip_id').equals(tripId).toArray();
}

export function putTripChecklistInDexie(checklist) {
  return db.trip_checklists.put({
    ...checklist,
    updated_at: checklist.updated_at || new Date().toISOString(),
  });
}

export function removeTripChecklistFromDexie(id) {
  return db.trip_checklists.delete(id);
}

export function getTripChecklistItemsFromDexie(checklistId) {
  return db.trip_checklist_items.where('checklist_id').equals(checklistId).toArray();
}

export function putTripChecklistItemInDexie(item) {
  return db.trip_checklist_items.put({
    ...item,
    updated_at: item.updated_at || new Date().toISOString(),
  });
}

export function removeTripChecklistItemFromDexie(id) {
  return db.trip_checklist_items.delete(id);
}

export function getTripCategoriesFromDexie(userId) {
  return db.trip_categories.where('user_id').equals(userId).toArray();
}

export function putTripCategoryInDexie(category) {
  return db.trip_categories.put(category);
}

export function removeTripCategoryFromDexie(id) {
  return db.trip_categories.delete(id);
}

export function getTripSharesFromDexie(tripId) {
  return db.trip_shares.where('trip_id').equals(tripId).toArray();
}

export function putTripShareInDexie(share) {
  return db.trip_shares.put(share);
}

export function removeTripShareFromDexie(id) {
  return db.trip_shares.delete(id);
}

// Helpers - Cache management
export function clearMusicCache() {
  return Promise.all([
    db.music_songs.clear(),
    db.music_setlists.clear(),
    db.music_setlist_songs.clear(),
    db.music_genres.clear(),
    db.music_chords.clear(),
  ]);
}

export function clearTripsCache() {
  return Promise.all([
    db.trips.clear(),
    db.trip_expenses.clear(),
    db.trip_itinerary.clear(),
    db.trip_checklists.clear(),
    db.trip_checklist_items.clear(),
    db.trip_categories.clear(),
    db.trip_shares.clear(),
  ]);
}

export function clearSyncQueue() {
  return db.sync_queue.clear();
}

export function generateUUID() {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function fetchSongsFromDexie(userId, filters = {}) {
  const collection = db.music_songs.where('user_id').equals(userId);
  let songs = await collection.toArray();

  if (filters.search) {
    const s = filters.search.trim().toLowerCase();
    songs = songs.filter(song =>
      (song.title && song.title.toLowerCase().includes(s)) ||
      (song.artist && song.artist.toLowerCase().includes(s))
    );
  }
  if (filters.type && filters.type !== 'all') {
    songs = songs.filter(song => song.type === filters.type);
  }
  if (filters.artist) {
    songs = songs.filter(song => song.artist === filters.artist);
  }
  if (filters.genre_id && filters.genre_id !== 'all') {
    songs = songs.filter(song => song.genre_id === filters.genre_id);
  }

  // Ordenação idêntica ao Supabase: is_favorite DESC, title ASC
  songs.sort((a, b) => {
    const favA = a.is_favorite ? 1 : 0;
    const favB = b.is_favorite ? 1 : 0;
    if (favB !== favA) return favB - favA;
    return (a.title || '').localeCompare(b.title || '');
  });

  const totalCount = songs.length;

  if (filters.page !== undefined && filters.pageSize) {
    const from = filters.page * filters.pageSize;
    songs = songs.slice(from, from + filters.pageSize);
  }

  return { data: songs, totalCount };
}
