/**
 * Colunas de `music_songs` para listagem e sincronização em bloco.
 *
 * `content` (o texto da cifra) fica de fora de propósito: no banco atual são
 * ~8,8 MB de cifras contra ~0,2 MB de metadados para as 4.812 músicas. Baixar
 * o texto só quando a música é aberta/editada (por id) evita repetir esse
 * volume a cada página da listagem, a cada sincronização e em cada aparelho.
 *
 * Quem precisa da música completa usa `MUSIC_SONG_FULL_COLUMNS` (ou `*`).
 */
export const MUSIC_SONG_LIST_COLUMNS = [
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
  'created_at',
  'updated_at',
].join(',');

/** Música completa, incluindo `content` — usada ao abrir/editar uma música. */
export const MUSIC_SONG_FULL_COLUMNS = '*';

/**
 * Mescla a linha vinda da listagem/sync com a cópia já cacheada, preservando
 * campos que a consulta estreita não trouxe (principalmente `content`).
 * Sem cache, devolve a linha como veio.
 */
export function mergeSongCache(cached, song) {
  if (!cached) return song;
  return { ...cached, ...song };
}

/**
 * Uma música já está completa no cache quando é uma partitura (o conteúdo é o
 * arquivo, não texto) ou quando a cifra tem `content` salvo.
 */
export function isSongComplete(song) {
  if (!song) return false;
  return song.type === 'partitura' || Boolean(song.content);
}
