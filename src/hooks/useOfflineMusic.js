import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  getAllMusicGenres,
  getMusicSetlists,
  getMusicSetlistSongs,
  getAllMusicChords,
  putMusicSetlistSong,
  removeMusicSetlistSong,
} from '../lib/offline/db';

export function useOfflineGenres() {
  return useQuery({
    queryKey: ['offline_genres'],
    queryFn: getAllMusicGenres,
    staleTime: 5 * 60 * 1000,
  });
}

export function useOfflineSetlists(userId) {
  return useQuery({
    queryKey: ['offline_setlists', userId],
    queryFn: () => getMusicSetlists(userId),
    enabled: !!userId,
  });
}

export function useOfflineSetlistSongs(setlistId) {
  return useQuery({
    queryKey: ['offline_setlist_songs', setlistId],
    queryFn: () => getMusicSetlistSongs(setlistId),
    enabled: !!setlistId,
  });
}

export function useOfflineAllSetlistSongs(userId) {
  return useQuery({
    queryKey: ['offline_all_setlist_songs', userId],
    queryFn: async () => {
      const setlists = await getMusicSetlists(userId);
      const all = [];
      for (const sl of setlists) {
        const rels = await getMusicSetlistSongs(sl.id);
        all.push(...rels);
      }
      return all;
    },
    enabled: !!userId,
  });
}

export function useOfflineChords() {
  return useQuery({
    queryKey: ['offline_chords'],
    queryFn: getAllMusicChords,
    staleTime: 5 * 60 * 1000,
  });
}

export function useOfflineUniqueArtists(userId, searchQuery = '') {
  const { data: artists = [] } = useQuery({
    queryKey: ['offline_unique_artists', userId, searchQuery],
    queryFn: async () => {
      if (!userId) return [];

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const dbModule = await import('../lib/offline/db');
        const songs = await dbModule.getMusicSongs(userId);
        return getUniqueArtistsLocally(songs, searchQuery);
      }

      try {
        let query = supabase
          .from('music_songs')
          .select('artist')
          .eq('user_id', userId);

        if (searchQuery) {
          query = query.ilike('artist', `%${searchQuery.trim()}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const artistSet = new Set();
        for (const s of data || []) {
          if (s.artist && s.artist.trim()) {
            artistSet.add(s.artist);
          }
        }
        return [...artistSet].sort((a, b) => a.localeCompare(b));
      } catch (err) {
        console.warn('Fallback to local Dexie for unique artists:', err);
        const dbModule = await import('../lib/offline/db');
        const songs = await dbModule.getMusicSongs(userId);
        return getUniqueArtistsLocally(songs, searchQuery);
      }
    },
    enabled: !!userId,
  });

  return artists;
}

function getUniqueArtistsLocally(songs, searchQuery) {
  const artistSet = new Set();
  for (const s of songs) {
    if (s.artist && s.artist.trim()) {
      const q = searchQuery.trim().toLowerCase();
      if (!q || s.artist.toLowerCase().includes(q)) {
        artistSet.add(s.artist);
      }
    }
  }
  return [...artistSet].sort((a, b) => a.localeCompare(b));
}

export function useOfflineArtistsByLetter(userId, letter) {
  const { data: artists = [] } = useQuery({
    queryKey: ['offline_artists_by_letter', userId, letter],
    queryFn: async () => {
      if (!letter || !userId) return [];

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const dbModule = await import('../lib/offline/db');
        const songs = await dbModule.getMusicSongs(userId);
        return getArtistsFromSongsLocally(songs, letter);
      }

      try {
        let query = supabase
          .from('music_songs')
          .select('artist')
          .eq('user_id', userId);

        if (letter === '#') {
          query = query.or('artist.ilike.0%,artist.ilike.1%,artist.ilike.2%,artist.ilike.3%,artist.ilike.4%,artist.ilike.5%,artist.ilike.6%,artist.ilike.7%,artist.ilike.8%,artist.ilike.9%');
        } else {
          query = query.ilike('artist', `${letter}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const counts = {};
        for (const s of data || []) {
          if (!s.artist || !s.artist.trim()) continue;
          if (letter === '#') {
            if (/^[a-zA-Z]/.test(s.artist)) continue;
          }
          counts[s.artist] = (counts[s.artist] || 0) + 1;
        }

        return Object.entries(counts)
          .map(([artist, song_count]) => ({ artist, song_count }))
          .sort((a, b) => a.artist.localeCompare(b.artist));
      } catch (err) {
        console.warn('Fallback to local Dexie for artists by letter:', err);
        const dbModule = await import('../lib/offline/db');
        const songs = await dbModule.getMusicSongs(userId);
        return getArtistsFromSongsLocally(songs, letter);
      }
    },
    enabled: !!userId && !!letter,
  });

  return artists;
}

function getArtistsFromSongsLocally(songs, letter) {
  const counts = {};
  for (const s of songs) {
    if (!s.artist || !s.artist.trim()) continue;
    let match;
    if (letter === '#') {
      match = !/^[a-zA-Z]/.test(s.artist);
    } else {
      match = s.artist.toLowerCase().startsWith(letter.toLowerCase());
    }
    if (match) {
      counts[s.artist] = (counts[s.artist] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([artist, song_count]) => ({ artist, song_count }))
    .sort((a, b) => a.artist.localeCompare(b.artist));
}

export function useSaveSetlistSong() {
  const queryClient = useQueryClient();

  return async (setlistId, songId, orderIndex) => {
    const relation = { setlist_id: setlistId, song_id: songId, order_index: orderIndex };
    await putMusicSetlistSong(relation);
    queryClient.invalidateQueries({ queryKey: ['offline_setlist_songs'] });
    queryClient.invalidateQueries({ queryKey: ['offline_all_setlist_songs'] });
    return relation;
  };
}

export function useRemoveSetlistSong() {
  const queryClient = useQueryClient();

  return async (setlistId, songId) => {
    await removeMusicSetlistSong(setlistId, songId);
    queryClient.invalidateQueries({ queryKey: ['offline_setlist_songs'] });
    queryClient.invalidateQueries({ queryKey: ['offline_all_setlist_songs'] });
  };
}
