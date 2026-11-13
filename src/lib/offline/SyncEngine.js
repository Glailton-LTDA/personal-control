import { supabase } from '../supabase';
import { db, MF_SYNC_TABLES } from './db';
import { MUSIC_SONG_LIST_COLUMNS } from './musicQueries';
import { offlineIdentity, queueOwner } from './owner';
import { mfSelectAll } from './mfOffline';
import { recoverTripQueue, serializeTripRow } from './tripsPayload';
import { MF_ATOMIC_QUEUE, sendMfAtomicOperation } from './mfAtomic';

export class MusicSyncProvider {
  constructor(userId) {
    this.userId = userId;
  }

  async pull(syncEngine) {
    const results = {};

    // 1. Sincronização incremental e paginada de music_songs para evitar timeouts e payloads gigantescos (68k+ músicas)
    // Só precisamos do maior `updated_at` local. Ler a tabela inteira aqui
    // custava segundos quando o cache tinha milhares de cifras (o `content`
    // de cada uma era materializado à toa, atrasando a listagem).
    const newestSong = await db.music_songs.orderBy('updated_at').last();
    const lastUpdatedAt =
      newestSong?.user_id === this.userId && newestSong.updated_at
        ? newestSong.updated_at
        : null;

    let offset = 0;
    const limit = 1000;
    let hasMore = true;
    const allPulledSongs = [];

    while (hasMore) {
      let query = supabase
        .from('music_songs')
        .select(MUSIC_SONG_LIST_COLUMNS)
        .eq('user_id', this.userId)
        .order('updated_at', { ascending: true })
        .range(offset, offset + limit - 1);

      if (lastUpdatedAt) {
        query = query.gt('updated_at', lastUpdatedAt);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        // Metadados apenas: `merge` mantém no Dexie o `content` das músicas
        // que já foram abertas/editadas neste aparelho.
        await syncEngine.saveBatch('music_songs', data, null, { merge: true });
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

    // 2. Outras tabelas do módulo de música (dados compactos). São
    // independentes: buscar em paralelo evita empilhar ~1s de requisições
    // sequenciais a cada abertura do módulo.
    const [setlists, genres, setlistSongs, chords] = await Promise.all([
      syncEngine.pull(
        'music_setlists',
        supabase.from('music_setlists').select('*').eq('user_id', this.userId)
      ),
      syncEngine.pull(
        'music_genres',
        supabase.from('music_genres').select('*')
      ),
      syncEngine.pull(
        'music_setlist_songs',
        supabase.from('music_setlist_songs').select('*'),
        (item) => ({ ...item, id: `${item.setlist_id}_${item.song_id}` })
      ),
      syncEngine.pull(
        'music_chords',
        supabase.from('music_chords').select('*, music_instruments(name), music_chord_variations(*)')
      ),
    ]);
    results.music_setlists = setlists;
    results.music_genres = genres;
    results.music_setlist_songs = setlistSongs;
    results.music_chords = chords;
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

/**
 * Minhas Finanças (Fase 9): baixa todas as tabelas mf_* em bloco.
 * Como os dados do módulo são pequenos, faz substituição completa
 * (clear + put) para descartar linhas apagadas em outros dispositivos.
 */
export class MfSyncProvider {
  constructor(userId) {
    this.userId = userId;
  }

  async pull() {
    const results = {};
    for (const table of MF_SYNC_TABLES) {
      if (await offlineIdentity() !== this.userId) return results;
      const { data, error } = await mfSelectAll(table, () => {
        const query = supabase.from(table).select('*').eq('user_id', this.userId);
        return table === 'mf_transaction_tags'
          ? query.order('transaction_id').order('tag_id')
          : query.order('id');
      }, { cache: false });
      if (error) throw error;
      const rows = data || [];
      const tableDb = db[table];
      if (!tableDb) continue;
      // Sem apagar mudanças ainda na fila (nem o cache de outras contas).
      const pending = await db.sync_queue.toArray();
      if (pending.some((entry) => (entry.table_name === table || entry.table_name === MF_ATOMIC_QUEUE) && queueOwner(entry) === this.userId)) continue;
      if (await offlineIdentity() !== this.userId) return results;
      await db.transaction('rw', tableDb, async () => {
        await tableDb.where('user_id').equals(this.userId).delete();
        for (const row of rows) {
          await tableDb.put({
            ...row,
            updated_at: row.updated_at || row.created_at || new Date().toISOString(),
          });
        }
      });
      results[table] = rows;
    }
    return results;
  }
}

export class SyncEngine {
  /**
   * `options.providers` = quais providers registrar: 'music' | 'trips' |
   * 'mf' (padrão: todos). Cada módulo registra só o que é dele — antes,
   * abrir o Minhas Finanças baixava também as 38 mil músicas (143 MB na
   * tabela) e o vice-versa. `label` identifica o engine no evento
   * `database-synced` (cada módulo só invalida as queries quando o pull
   * foi dele).
   */
  constructor(userId, options = {}) {
    this.userId = userId;
    this.destroyed = false;
    this.providers = [];
    this.onStatusChange = null;
    this._pullTimer = null;
    this.label = options.label ?? 'app';
    this._isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this._boundOnline = this._handleOnline.bind(this);
    this._boundOffline = this._handleOffline.bind(this);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this._boundOnline);
      window.addEventListener('offline', this._boundOffline);
    }

    if (userId) {
      const wanted = options.providers ?? ['music', 'trips', 'mf'];
      if (wanted.includes('music')) this.registerProvider(new MusicSyncProvider(userId));
      if (wanted.includes('trips')) this.registerProvider(new TripsSyncProvider(userId));
      if (wanted.includes('mf')) this.registerProvider(new MfSyncProvider(userId));
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

  async saveBatch(table, items, mapper = null, { merge = false } = {}) {
    const tableDb = db[table];
    if (!tableDb) throw new Error(`Unknown table: ${table}`);
    const mapped = items.map((raw) => (mapper ? mapper(raw) : raw));
    await db.transaction('rw', tableDb, async () => {
      // `merge` preserva campos que já existem no cache e não vieram no lote
      // (ex.: o texto da cifra, baixado só quando a música é aberta).
      const cached = merge
        ? await tableDb.bulkGet(mapped.map((item) => item.id))
        : [];
      for (let index = 0; index < mapped.length; index += 1) {
        const base = merge && cached[index]
          ? { ...cached[index], ...mapped[index] }
          : mapped[index];
        await tableDb.put({
          ...base,
          updated_at: base.updated_at || base.created_at || new Date().toISOString(),
        });
      }
    });
    return items;
  }

  async pullAll() {
    if (!this._isOnline || !this.userId || this.destroyed || await offlineIdentity() !== this.userId) return {};
    const results = {};
    for (const provider of this.providers) {
      if (this.destroyed || await offlineIdentity() !== this.userId) break;
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
    if (!this._isOnline || !this.userId || this.destroyed || await offlineIdentity() !== this.userId) return 0;
    await recoverTripQueue(this.userId);
    const queue = await db.sync_queue.toArray();
    // Entradas legadas sem dono permanecem intactas, em quarentena.
    const activeQueue = queue.filter((entry) => queueOwner(entry) === this.userId && (entry.attempts || 0) < 5);
    let pushed = 0;
    for (const entry of activeQueue) {
      if (this.destroyed || await offlineIdentity() !== this.userId) break;
      if (entry.table_name?.startsWith('mf_') && entry.payload?.user_id && entry.payload.user_id !== this.userId) continue;
      try {
        await this._processQueueEntry(entry);
        await db.sync_queue.delete(entry.id);
        pushed += 1;
      } catch (err) {
        console.error(`SyncEngine: failed to process queue entry ${entry.id}`, err);
        const currentAttempts = entry.attempts || 0;
        await db.sync_queue.update(entry.id, { attempts: currentAttempts + 1 });
      }
    }
    return pushed;
  }

  async _processQueueEntry(entry) {
    const { table_name, record_id, action, payload } = entry;
    switch (action) {
      case 'rpc': {
        if (table_name !== MF_ATOMIC_QUEUE || queueOwner(entry) !== this.userId) throw new Error('offline_owner_mismatch');
        await sendMfAtomicOperation(payload.rpc, payload.args, this.userId);
        break;
      }
      case 'insert':
      case 'update': {
        if (
          table_name === 'music_setlist_songs' ||
          table_name === 'mf_transaction_tags'
        ) {
          // Tabelas sem PK `id` (e sem `updated_at` na junção de tags):
          // upsert só com as colunas reais.
          const { id: _id, updated_at: _ua, ...cleanPayload } = payload || {};
          const { error } = await supabase.from(table_name).upsert(cleanPayload);
          if (error) throw error;
        } else if (
          table_name === 'trip_checklists' ||
          table_name === 'trip_itinerary'
        ) {
          const row = serializeTripRow(table_name, payload, entry.owner_id);
          const { error } = await supabase.from(table_name).upsert(row).select();
          if (error) throw error;
        } else {
          const { error } = await supabase.from(table_name).upsert(payload).select();
          if (error) throw error;
        }
        break;
      }
      case 'delete': {
        if (table_name === 'music_setlist_songs') {
          const [setlistId, songId] = record_id.split('_');
          const { error } = await supabase
            .from(table_name)
            .delete()
            .eq('setlist_id', setlistId)
            .eq('song_id', songId);
          if (error) throw error;
        } else if (table_name === 'mf_transaction_tags') {
          // PK composto: record_id é o id da transação → apaga os vínculos dela.
          const { error } = await supabase
            .from(table_name)
            .delete()
            .eq('transaction_id', record_id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from(table_name).delete().eq('id', record_id);
          if (error) throw error;
        }
        break;
      }
      default:
        break;
    }
  }

  async enqueue(tableName, recordId, action, payload = null) {
    if (!this.userId || (tableName.startsWith('mf_') && payload?.user_id && payload.user_id !== this.userId)) throw new Error('offline_owner_mismatch');
    await db.sync_queue.add({
      owner_id: this.userId,
      table_name: tableName,
      record_id: recordId,
      action,
      payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
      created_at: new Date().toISOString(),
      attempts: 0,
    });
  }

  async sync({ pull = true } = {}) {
    if (!this._isOnline) return { pulled: 0, pushed: 0 };
    const pushed = await this.drainQueue();
    const pulled = pull ? await this.pullAll() : {};
    
    if (pull && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('database-synced', { detail: { pulled, source: this.label } })
      );
    }
    
    return { pushed, pulled: Object.values(pulled || {}).reduce((a, b) => a + (b?.length || 0), 0) };
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
    this.destroyed = true;
    this.stopPeriodicSync();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this._boundOnline);
      window.removeEventListener('offline', this._boundOffline);
    }
    this.onStatusChange = null;
  }
}
