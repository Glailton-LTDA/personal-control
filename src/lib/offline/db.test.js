import { describe, it, expect, beforeEach } from 'vitest';
import { db, getMusicSongs, getMusicSong, putMusicSong, removeMusicSong, clearSyncQueue } from './db';

beforeEach(async () => {
  await db.music_songs.clear();
  await db.music_setlists.clear();
  await db.music_setlist_songs.clear();
  await db.music_genres.clear();
  await clearSyncQueue();
});

describe('Dexie offline DB', () => {
  it('starts empty', async () => {
    const songs = await getMusicSongs('user1');
    expect(songs).toHaveLength(0);
  });

  it('stores and retrieves a song', async () => {
    const song = { id: '1', user_id: 'user1', title: 'Test Song', artist: 'Test Artist', type: 'cifra' };
    await putMusicSong(song);
    const result = await getMusicSong('1');
    expect(result.title).toBe('Test Song');
    expect(result.artist).toBe('Test Artist');
  });

  it('filters songs by user_id', async () => {
    await putMusicSong({ id: '1', user_id: 'user1', title: 'Song A' });
    await putMusicSong({ id: '2', user_id: 'user2', title: 'Song B' });
    await putMusicSong({ id: '3', user_id: 'user1', title: 'Song C' });
    const user1Songs = await getMusicSongs('user1');
    expect(user1Songs).toHaveLength(2);
    expect(user1Songs.map(s => s.id)).toEqual(['1', '3']);
  });

  it('updates an existing song', async () => {
    await putMusicSong({ id: '1', user_id: 'user1', title: 'Original' });
    await putMusicSong({ id: '1', user_id: 'user1', title: 'Updated' });
    const result = await getMusicSong('1');
    expect(result.title).toBe('Updated');
  });

  it('removes a song', async () => {
    await putMusicSong({ id: '1', user_id: 'user1', title: 'Test' });
    await removeMusicSong('1');
    const result = await getMusicSong('1');
    expect(result).toBeUndefined();
  });

  it('sets updated_at when not provided', async () => {
    const song = { id: '1', user_id: 'user1', title: 'Test' };
    await putMusicSong(song);
    const result = await getMusicSong('1');
    expect(result.updated_at).toBeDefined();
    expect(() => new Date(result.updated_at)).not.toThrow();
  });

  it('stores setlists per user', async () => {
    await db.music_setlists.put({ id: 's1', user_id: 'user1', name: 'Rock' });
    await db.music_setlists.put({ id: 's2', user_id: 'user1', name: 'MPB' });
    await db.music_setlists.put({ id: 's3', user_id: 'user2', name: 'Jazz' });
    const result = await db.music_setlists.where('user_id').equals('user1').toArray();
    expect(result).toHaveLength(2);
  });

  it('queues sync entries', async () => {
    const id = await db.sync_queue.add({ table_name: 'music_songs', action: 'insert', created_at: new Date().toISOString() });
    const queue = await db.sync_queue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(id);
  });
});
