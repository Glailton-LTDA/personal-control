-- Script de correção específico para músicas de Roberto Carlos e/ou Erasmo Carlos
-- 1. Define o estilo/gênero de todas as músicas deles como 'MPB'.
-- 2. Corrige registros onde o artista e título foram invertidos (título continha o nome do autor e artista continha o nome da música).

-- ID do Gênero 'MPB' = '58800e99-34fc-47da-a571-e262b4495526'

-- A. Definir o gênero MPB para todos os registros que já possuem o nome correto do artista
UPDATE music_songs
SET 
  genre_id = '58800e99-34fc-47da-a571-e262b4495526'::uuid
WHERE artist ILIKE '%Roberto Carlos%' OR artist ILIKE '%Erasmo Carlos%';

-- B. Inverter os campos Title/Artist nos registros trocados e normalizar as grafias do autor
UPDATE music_songs
SET 
  artist = CASE 
    WHEN title ILIKE '%Erasmo%' OR title ILIKE '%Erasmos%' OR title ILIKE '%Erano%' THEN 'Roberto Carlos e Erasmo Carlos'
    ELSE 'Roberto Carlos'
  END,
  title = artist,
  genre_id = '58800e99-34fc-47da-a571-e262b4495526'::uuid
WHERE title ILIKE '%Roberto Carlos%' 
   OR title ILIKE '%Erasmo Carlos%'
   OR title ILIKE '%Erasmos Carlos%'
   OR title ILIKE '%Erano Carlos%'
   OR title ILIKE '%Roberto E Erasmo%';
