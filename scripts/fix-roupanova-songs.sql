-- Script de correção específico para músicas do Roupa Nova
-- Define o estilo/gênero de todas as músicas deles como 'Pop'.

-- ID do Gênero 'Pop' = '3bbf05ce-9247-4ac3-a39f-96a5d3444069'

UPDATE music_songs
SET 
  genre_id = '3bbf05ce-9247-4ac3-a39f-96a5d3444069'::uuid
WHERE artist ILIKE '%Roupa Nova%';
