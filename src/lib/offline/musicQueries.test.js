import { describe, it, expect } from 'vitest';
import {
  MUSIC_SONG_LIST_COLUMNS,
  mergeSongCache,
  isSongComplete,
} from './musicQueries';

describe('musicQueries — consultas estreitas de music_songs', () => {
  it('a listagem não pede o texto da cifra', () => {
    const columns = MUSIC_SONG_LIST_COLUMNS.split(',');
    expect(columns).not.toContain('content');
    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'user_id',
        'title',
        'artist',
        'type',
        'genre_id',
        'storage_type',
        'file_path',
        'music_link',
        'is_favorite',
        'updated_at',
      ])
    );
  });

  it('mergeSongCache preserva o conteúdo já baixado', () => {
    const cached = { id: 's1', title: 'Antiga', content: 'C G Am F' };
    const incoming = { id: 's1', title: 'Nova', artist: 'Artista' };

    expect(mergeSongCache(cached, incoming)).toEqual({
      id: 's1',
      title: 'Nova',
      artist: 'Artista',
      content: 'C G Am F',
    });
  });

  it('mergeSongCache devolve a linha recebida quando não há cache', () => {
    const incoming = { id: 's1', title: 'Nova' };
    expect(mergeSongCache(undefined, incoming)).toBe(incoming);
  });

  it('isSongComplete distingue cifra baixada, cifra só com metadados e partitura', () => {
    expect(isSongComplete({ type: 'cifra', content: 'C G' })).toBe(true);
    expect(isSongComplete({ type: 'cifra' })).toBe(false);
    expect(isSongComplete({ type: 'partitura' })).toBe(true);
    expect(isSongComplete(null)).toBe(false);
  });
});
