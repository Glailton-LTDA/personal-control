-- Script de correção de metadados das cifras na tabela music_songs
-- Corrige registros onde o artista ou título foram importados incorretamente a partir de nomes de arquivos slugificados.
-- Utiliza a primeira linha do conteúdo (content) como fonte primária de verdade caso siga o padrão 'Artista - Título'.

WITH updated_songs AS (
  SELECT 
    id,
    artist as old_artist,
    title as old_title,
    TRIM(BOTH E'\ufeff' FROM TRIM(split_part(split_part(content, E'\n', 1), E'\r', 1))) as first_line
  FROM music_songs
  WHERE type = 'cifra' AND content IS NOT NULL
),
parsed_songs AS (
  SELECT
    id,
    old_artist,
    old_title,
    first_line,
    TRIM(split_part(first_line, ' - ', 1)) as new_artist,
    TRIM(substring(first_line from position(' - ' in first_line) + 3)) as new_title
  FROM updated_songs
  WHERE first_line LIKE '% - %'
    AND first_line NOT LIKE '[%'
    AND first_line NOT LIKE '(%'
    AND first_line NOT LIKE '#%'
    AND first_line NOT LIKE '-%'
    AND first_line NOT LIKE '*%'
    AND first_line NOT ILIKE 'Intro%'
    AND first_line NOT ILIKE 'Introdu%'
    AND first_line NOT ILIKE 'Tom:%'
    AND first_line NOT ILIKE 'Arquivo%'
    AND first_line NOT ILIKE 'De:%'
)
UPDATE music_songs AS m
SET 
  artist = p.new_artist,
  title = p.new_title
FROM parsed_songs AS p
WHERE m.id = p.id
  AND (m.artist <> p.new_artist OR m.title <> p.new_title)
  AND (
    m.artist = 'Desconhecido'
    OR (m.title LIKE '%-%' AND m.title NOT LIKE '% %')
    OR LOWER(m.artist) IN ('a', 'o', 'os', 'as', 'um', 'uma', 'nao', 'me', 'meu', 'minha', 'te', 'se', 'de', 'do', 'da', 'em', 'no', 'na', 'nos', 'nas', 'eu', 'voce', 'ele', 'ela', 'nós', 'vós', 'eles', 'elas', 'que', 'com', 'para', 'por', 'como', 'mais', 'tudo', 'quem', 'vem', 'quero', 'sem', 'vou', 'vai', 'e', 'so', 'pra')
  );
