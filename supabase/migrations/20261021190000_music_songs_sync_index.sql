-- Índice para o sync incremental de música.
--
-- O pull do módulo Música filtra por user_id + updated_at e ordena por
-- updated_at (delta desde o último sync). Sem índice, o Postgres ordenava
-- as 38 mil linhas (143 MB na tabela) a cada página — a requisição
-- levava ~7 s e voltava 500 (timeout do gateway).
--
-- Com o índice: 6.965 ms → 2,7 ms, e o Sort some (o próprio índice já
-- entrega a ordem).
create index if not exists idx_music_songs_user_updated_at
  on public.music_songs (user_id, updated_at);
