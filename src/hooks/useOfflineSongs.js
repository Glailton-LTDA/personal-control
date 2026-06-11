import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getMusicSong, putMusicSong, removeMusicSong, generateUUID, fetchSongsFromDexie, db } from '../lib/offline/db';
import { SyncEngine } from '../lib/offline/SyncEngine';

async function enrichSongsWithGenres(result) {
  try {
    const genres = await db.music_genres.toArray();
    const genreMap = new Map(genres.map(g => [g.id, g]));
    const enrichedData = result.data.map(song => ({
      ...song,
      music_genres: song.genre_id ? genreMap.get(song.genre_id) : null
    }));
    return { ...result, data: enrichedData };
  } catch (err) {
    console.error('Erro ao mapear gêneros locais:', err);
    return result;
  }
}

function createSyncEngine(userId) {
  const engine = new SyncEngine(userId);
  engine.startPeriodicSync();
  return engine;
}

export function useOfflineSongs(userId, filters = {}) {
  const syncRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    syncRef.current = createSyncEngine(userId);
    syncRef.current.sync().catch(() => {});
    return () => {
      if (syncRef.current) syncRef.current.destroy();
    };
  }, [userId]);

  useEffect(() => {
    const handleSync = () => {
      queryClient.invalidateQueries({ queryKey: ['offline_songs'] });
      queryClient.invalidateQueries({ queryKey: ['offline_genres'] });
      queryClient.invalidateQueries({ queryKey: ['offline_chords'] });
      queryClient.invalidateQueries({ queryKey: ['offline_artists_by_letter'] });
      queryClient.invalidateQueries({ queryKey: ['offline_unique_artists'] });
    };
    window.addEventListener('database-synced', handleSync);
    return () => {
      window.removeEventListener('database-synced', handleSync);
    };
  }, [queryClient]);

  const queryKey = ['offline_songs', userId, filters];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const localResult = await fetchSongsFromDexie(userId, filters);
        return enrichSongsWithGenres(localResult);
      }

      try {
        let query = supabase
          .from('music_songs')
          .select('*', { count: 'exact' })
          .eq('user_id', userId)
          .order('is_favorite', { ascending: false })
          .order('title', { ascending: true });

        if (filters.search) {
          const s = filters.search.trim();
          query = query.or(`title.ilike.%${s}%,artist.ilike.%${s}%`);
        }
        if (filters.type && filters.type !== 'all') {
          query = query.eq('type', filters.type);
        }
        if (filters.artist) {
          query = query.eq('artist', filters.artist);
        }
        if (filters.genre_id && filters.genre_id !== 'all') {
          query = query.eq('genre_id', filters.genre_id);
        }

        if (filters.page !== undefined && filters.pageSize) {
          const from = filters.page * filters.pageSize;
          query = query.range(from, from + filters.pageSize - 1);
        }

        const { data, error, count } = await query;
        if (error) throw error;

        if (data) {
          Promise.all(data.map(s => putMusicSong(s))).catch(e =>
            console.error('Erro ao salvar músicas no Dexie:', e)
          );
        }
        const result = { data: data || [], totalCount: count ?? 0 };
        return enrichSongsWithGenres(result);
      } catch (err) {
        console.warn('Erro ao carregar do Supabase, caindo para Dexie:', err);
        const localResult = await fetchSongsFromDexie(userId, filters);
        return enrichSongsWithGenres(localResult);
      }
    },
    enabled: !!userId,
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    songs: query.data?.data ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isOnline: syncRef.current?.isOnline ?? navigator.onLine,
  };
}

export function useOfflineSong(id) {
  return useQuery({
    queryKey: ['offline_song', id],
    queryFn: () => getMusicSong(id),
    enabled: !!id,
  });
}

export function useOfflineCreateSong(userId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload) => {
      const id = generateUUID();
      const song = {
        id,
        user_id: userId,
        title: payload.title,
        artist: payload.artist || null,
        type: payload.type || 'cifra',
        genre_id: payload.genre_id || null,
        content: payload.content || null,
        storage_type: payload.storage_type || null,
        file_path: payload.file_path || null,
        music_link: payload.music_link || null,
        is_favorite: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await putMusicSong(song);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('music_songs').insert({
            id,
            user_id: userId,
            title: payload.title,
            artist: payload.artist || null,
            type: payload.type || 'cifra',
            genre_id: payload.genre_id || null,
            content: payload.content || null,
            storage_type: payload.storage_type || null,
            file_path: payload.file_path || null,
            music_link: payload.music_link || null,
            updated_at: song.updated_at,
          }).select().single();
          if (error) {
            console.warn('Erro ao inserir online no Supabase, enfileirando:', error);
            await engine.enqueue('music_songs', id, 'insert', song);
          } else if (data) {
            await putMusicSong({ ...data, updated_at: new Date().toISOString() });
          }
        } catch (err) {
          console.warn('Falha de rede ao inserir no Supabase, enfileirando:', err);
          await engine.enqueue('music_songs', id, 'insert', song);
        }
      } else {
        await engine.enqueue('music_songs', id, 'insert', song);
      }

      engine.destroy();
      return song;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_songs', userId] });
    },
  });
}

export function useOfflineUpdateSong(userId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const existing = await getMusicSong(id);
      const updated = {
        ...existing,
        ...payload,
        updated_at: new Date().toISOString(),
      };
      await putMusicSong(updated);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { data, error } = await supabase.from('music_songs')
            .update({ ...payload, updated_at: updated.updated_at })
            .eq('id', id)
            .select()
            .single();
          if (error) {
            console.warn('Erro ao atualizar no Supabase, enfileirando update:', error);
            await engine.enqueue('music_songs', id, 'update', { id, ...payload });
          } else if (data) {
            await putMusicSong({ ...data, updated_at: new Date().toISOString() });
          }
        } catch (err) {
          console.warn('Falha de rede ao atualizar no Supabase, enfileirando update:', err);
          await engine.enqueue('music_songs', id, 'update', { id, ...payload });
        }
      } else {
        await engine.enqueue('music_songs', id, 'update', { id, ...payload });
      }

      engine.destroy();
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_songs', userId] });
    },
  });
}

export function useOfflineDeleteSong(userId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id) => {
      await removeMusicSong(id);

      const engine = new SyncEngine(userId);
      if (engine.isOnline) {
        try {
          const { error } = await supabase.from('music_songs').delete().eq('id', id);
          if (error) {
            console.warn('Erro ao deletar no Supabase, enfileirando delete:', error);
            await engine.enqueue('music_songs', id, 'delete');
          }
        } catch (err) {
          console.warn('Falha de rede ao deletar no Supabase, enfileirando delete:', err);
          await engine.enqueue('music_songs', id, 'delete');
        }
      } else {
        await engine.enqueue('music_songs', id, 'delete');
      }

      engine.destroy();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline_songs', userId] });
    },
  });
}
