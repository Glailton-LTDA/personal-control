import { supabase } from '../supabase';
import { db } from './db';

export class SyncEngine {
  constructor(userId) {
    this.userId = userId;
    this.onStatusChange = null;
    this._pullTimer = null;
    this._isOnline = navigator.onLine;
    this._boundOnline = this._handleOnline.bind(this);
    this._boundOffline = this._handleOffline.bind(this);
    window.addEventListener('online', this._boundOnline);
    window.addEventListener('offline', this._boundOffline);
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

  async pullAll() {
    if (!this._isOnline || !this.userId) return;
    const results = {};
    results.music_setlists = await this.pull(
      'music_setlists',
      supabase.from('music_setlists').select('*').eq('user_id', this.userId)
    );
    results.music_genres = await this.pull(
      'music_genres',
      supabase.from('music_genres').select('*')
    );
    results.music_setlist_songs = await this.pull(
      'music_setlist_songs',
      supabase.from('music_setlist_songs').select('*'),
      (item) => ({ ...item, id: `${item.setlist_id}_${item.song_id}` })
    );
    results.music_chords = await this.pull(
      'music_chords',
      supabase.from('music_chords').select('*')
    );
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
    return { pushed: queueSize, pulled: Object.values(pulled || {}).reduce((a, b) => a + (b?.length || 0), 0) };
  }

  startPeriodicSync(intervalMs = 30000) {
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
    window.removeEventListener('online', this._boundOnline);
    window.removeEventListener('offline', this._boundOffline);
    this.onStatusChange = null;
  }
}
