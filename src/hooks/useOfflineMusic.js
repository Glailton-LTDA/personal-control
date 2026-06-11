import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
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
  const { data: songs = [] } = useQuery({
    queryKey: ['offline_songs', userId],
    queryFn: () => import('../lib/offline/db').then(m => m.getMusicSongs(userId)),
    enabled: !!userId,
  });

  return useMemo(() => {
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
  }, [songs, searchQuery]);
}

export function useOfflineArtistsByLetter(userId, letter) {
  const { data: songs = [] } = useQuery({
    queryKey: ['offline_songs', userId],
    queryFn: () => import('../lib/offline/db').then(m => m.getMusicSongs(userId)),
    enabled: !!userId,
  });

  return useMemo(() => {
    if (!letter || !userId) return [];
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
  }, [songs, letter, userId]);
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
