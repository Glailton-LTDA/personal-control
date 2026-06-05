-- Script de correção específico para músicas de Zezé Di Camargo e Luciano
-- 1. Corrige registros onde o artista e título foram invertidos (partituras/PDFs).
-- 2. Define o estilo/gênero de todas as músicas deles como 'Sertanejo'.

-- ID do Gênero 'Sertanejo' = '74433cb6-21e7-44fc-8e9d-cc9c3e739fab'

-- A. Inverter os campos Title/Artist nos 18 registros que foram identificados como trocados
UPDATE music_songs
SET 
  title = artist,
  artist = CASE 
    WHEN title ILIKE '%Julio%Iglesias%' THEN 'Julio Iglesias e Zezé Di Camargo & Luciano'
    ELSE 'Zezé Di Camargo e Luciano'
  END,
  genre_id = '74433cb6-21e7-44fc-8e9d-cc9c3e739fab'::uuid
WHERE title ILIKE '%Zezé%' AND title ILIKE '%Camargo%'
  AND artist <> 'Desconhecido'
  AND title NOT ILIKE '%part.%'
  AND title NOT ILIKE '%participação%'
  AND title NOT ILIKE '%participacao%'
  AND title NOT ILIKE '%feat%';

-- B. Corrigir o único registro onde o artista é 'Desconhecido' e o nome do artista está contido no título
UPDATE music_songs
SET 
  artist = 'Zezé Di Camargo e Luciano',
  title = 'You Needed Me (Pra Sempre Em Mim)',
  genre_id = '74433cb6-21e7-44fc-8e9d-cc9c3e739fab'::uuid
WHERE id = 'abf0644a-9a5e-4cdc-9351-6814720be933';

-- C. Definir o gênero Sertanejo para todos os registros que já possuem o nome correto do artista
UPDATE music_songs
SET 
  genre_id = '74433cb6-21e7-44fc-8e9d-cc9c3e739fab'::uuid
WHERE artist ILIKE '%Zezé%' AND artist ILIKE '%Camargo%';
