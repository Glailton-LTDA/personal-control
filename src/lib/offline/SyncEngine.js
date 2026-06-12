import { supabase } from '../supabase';
import { db } from './db';

export class MusicSyncProvider {
  constructor(userId) {
    this.userId = userId;
  }

  async pull(syncEngine) {
    const results = {};

    // 1. Sincronização incremental e paginada de music_songs para evitar timeouts e payloads gigantescos (68k+ músicas)
    const songs = await db.music_songs
      .where('user_id')
      .equals(this.userId)
      .toArray();

    let lastUpdatedAt = null;
    if (songs.length > 0) {
      let maxTime = 0;
      for (const s of songs) {
        const t = s.updated_at ? new Date(s.updated_at).getTime() : 0;
        if (t > maxTime) {
          maxTime = t;
          lastUpdatedAt = s.updated_at;
        }
      }
    }

    let offset = 0;
    const limit = 1000;
    let hasMore = true;
    const allPulledSongs = [];

    while (hasMore) {
      let query = supabase
        .from('music_songs')
        .select('*')
        .eq('user_id', this.userId)
        .order('updated_at', { ascending: true })
        .range(offset, offset + limit - 1);

      if (lastUpdatedAt) {
        query = query.gt('updated_at', lastUpdatedAt);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        await syncEngine.saveBatch('music_songs', data);
        allPulledSongs.push(...data);
        offset += limit;
        if (data.length < limit) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }
    results.music_songs = allPulledSongs;

    // 2. Outras tabelas do módulo de música (dados compactos)
    results.music_setlists = await syncEngine.pull(
      'music_setlists',
      supabase.from('music_setlists').select('*').eq('user_id', this.userId)
    );
    results.music_genres = await syncEngine.pull(
      'music_genres',
      supabase.from('music_genres').select('*')
    );
    results.music_setlist_songs = await syncEngine.pull(
      'music_setlist_songs',
      supabase.from('music_setlist_songs').select('*'),
      (item) => ({ ...item, id: `${item.setlist_id}_${item.song_id}` })
    );
    results.music_chords = await syncEngine.pull(
      'music_chords',
      supabase.from('music_chords').select('*, music_instruments(name), music_chord_variations(*)')
    );
    return results;
  }
}

export class TripsSyncProvider {
  constructor(userId) {
    this.userId = userId;
  }

  async pull(syncEngine) {
    const results = {};
    results.trips = await syncEngine.pull(
      'trips',
      supabase.from('trips').select('*').order('start_date', { ascending: false })
    );
    results.trip_expenses = await syncEngine.pull(
      'trip_expenses',
      supabase.from('trip_expenses').select('*')
    );
    results.trip_itinerary = await syncEngine.pull(
      'trip_itinerary',
      supabase.from('trip_itinerary').select('*')
    );
    results.trip_checklists = await syncEngine.pull(
      'trip_checklists',
      supabase.from('trip_checklists').select('*')
    );
    results.trip_checklist_items = await syncEngine.pull(
      'trip_checklist_items',
      supabase.from('trip_checklist_items').select('*')
    );
    results.trip_categories = await syncEngine.pull(
      'trip_categories',
      supabase.from('trip_categories').select('*')
    );
    results.trip_shares = await syncEngine.pull(
      'trip_shares',
      supabase.from('trip_shares').select('*')
    );
    return results;
  }
}

export class SyncEngine {
  constructor(userId) {
    this.userId = userId;
    this.providers = [];
    this.onStatusChange = null;
    this._pullTimer = null;
    this._isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this._boundOnline = this._handleOnline.bind(this);
    this._boundOffline = this._handleOffline.bind(this);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this._boundOnline);
      window.addEventListener('offline', this._boundOffline);
    }

    if (userId) {
      this.registerProvider(new MusicSyncProvider(userId));
      this.registerProvider(new TripsSyncProvider(userId));
    }
  }

  registerProvider(provider) {
    this.providers.push(provider);
  }

  get isOnline() {
    return this._isOnline;
  }

  _handleOnline() {
    this._isOnline = true;
    this._notify();
  }

  _handleOffline() {
    this._isOnline = false;
    this._notify();
  }

  _notify() {
    if (this.onStatusChange) this.onStatusChange(this._isOnline);
  }

  subscribe(callback) {
    this.onStatusChange = callback;
    return () => { this.onStatusChange = null; };
  }

  async pull(table, query, mapper = null) {
    const { data, error } = await query;
    if (error) throw error;
    const items = data || [];
    const tableDb = db[table];
    if (!tableDb) throw new Error(`Unknown table: ${table}`);
    await db.transaction('rw', tableDb, async () => {
      for (const raw of items) {
        const item = mapper ? mapper(raw) : raw;
        await tableDb.put({ ...item, updated_at: item.updated_at || item.created_at || new Date().toISOString() });
      }
    });
    return items;
  }

  async saveBatch(table, items, mapper = null) {
    const tableDb = db[table];
    if (!tableDb) throw new Error(`Unknown table: ${table}`);
    await db.transaction('rw', tableDb, async () => {
      for (const raw of items) {
        const item = mapper ? mapper(raw) : raw;
        await tableDb.put({ ...item, updated_at: item.updated_at || item.created_at || new Date().toISOString() });
      }
    });
  }

  async pullAll() {
    if (!this._isOnline || !this.userId) return {};
    const results = {};
    for (const provider of this.providers) {
      try {
        const res = await provider.pull(this);
        Object.assign(results, res);
      } catch (err) {
        console.error(`SyncEngine: failed to pull from provider ${provider.constructor.name}`, err);
      }
    }
    return results;
  }

  async drainQueue() {
    if (!this._isOnline) return;
    const queue = await db.sync_queue.toArray();
    const activeQueue = queue.filter(entry => (entry.attempts || 0) < 5);
    if (activeQueue.length === 0) return;
    for (const entry of activeQueue) {
      try {
        await this._processQueueEntry(entry);
        await db.sync_queue.delete(entry.id);
      } catch (err) {
        console.error(`SyncEngine: failed to process queue entry ${entry.id}`, err);
        const currentAttempts = entry.attempts || 0;
        await db.sync_queue.update(entry.id, { attempts: currentAttempts + 1 });
      }
    }
  }

  async _processQueueEntry(entry) {
    const { table_name, record_id, action, payload } = entry;
    switch (action) {
      case 'insert':
      case 'update': {
        const { error } = await supabase.from(table_name).upsert(payload).select();
        if (error) throw error;
        break;
      }
      case 'delete': {
        const { error } = await supabase.from(table_name).delete().eq('id', record_id);
        if (error) throw error;
        break;
      }
      default:
        break;
    }
  }

  async enqueue(tableName, recordId, action, payload = null) {
    await db.sync_queue.add({
      table_name: tableName,
      record_id: recordId,
      action,
      payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
      created_at: new Date().toISOString(),
      attempts: 0,
    });
  }

  async sync() {
    if (!this._isOnline) return { pulled: 0, pushed: 0 };
    const queueSize = await db.sync_queue.count();
    await this.drainQueue();
    const pulled = await this.pullAll();
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('database-synced', { detail: { pulled } }));
    }
    
    return { pushed: queueSize, pulled: Object.values(pulled || {}).reduce((a, b) => a + (b?.length || 0), 0) };
  }

  startPeriodicSync(intervalMs = 300000) {
    this.stopPeriodicSync();
    this._pullTimer = setInterval(() => this.sync(), intervalMs);
  }

  stopPeriodicSync() {
    if (this._pullTimer) {
      clearInterval(this._pullTimer);
      this._pullTimer = null;
    }
  }

  destroy() {
    this.stopPeriodicSync();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this._boundOnline);
      window.removeEventListener('offline', this._boundOffline);
    }
    this.onStatusChange = null;
  }
}
