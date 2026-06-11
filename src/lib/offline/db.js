import Dexie from 'dexie';

// Nome novo para abandonar o banco corrompido pela tentativa de upgrade v3
const DB_NAME = 'PersonalControlOffline_v4';
const DB_VERSION = 2;

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

db.open().catch(async (err) => {
  if (/UpgradeError/i.test(err.message) || err.name === 'DatabaseClosedError') {
    console.warn('Dexie upgrade failed, deleting database and reloading', err);
    await db.delete();
    window.location.reload();
  }
});

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

export function clearMusicCache() {
  return Promise.all([
    db.music_songs.clear(),
    db.music_setlists.clear(),
    db.music_setlist_songs.clear(),
    db.music_genres.clear(),
    db.music_chords.clear(),
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
