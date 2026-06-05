-- Script de correção em lote para artistas de Samba / Pagode
-- Define o estilo/gênero de todos os artistas especificados como 'Samba / Pagode'.

-- ID do Gênero 'Samba / Pagode' = '3842240b-d557-482d-9a28-647158c6174f'

UPDATE music_songs
SET 
  genre_id = '3842240b-d557-482d-9a28-647158c6174f'::uuid
WHERE artist ILIKE '%Zeca Pagodinho%'
   OR artist ILIKE '%Alcione%'
   OR artist ILIKE '%João Nogueira%'
   OR artist ILIKE '%Diogo Nogueira%'
   OR artist ILIKE '%Jorge Aragão%'
   OR artist ILIKE '%Noel Rosa%'
   OR artist ILIKE '%Cartola%'
   OR artist ILIKE '%Beth Carvalho%'
   OR artist ILIKE '%Clara Nunes%'
   OR artist ILIKE '%Paulinho da Viola%'
   OR artist ILIKE '%Martinho da Vila%'
   OR artist ILIKE '%Ivone Lara%'
   OR artist ILIKE '%Nelson Sargento%'
   OR artist ILIKE '%Jovelina%'
   OR artist ILIKE '%Bezerra da Silva%'
   OR artist ILIKE '%Arlindo Cruz%'
   OR artist ILIKE '%Adoniran Barbosa%'
   OR artist ILIKE '%Dorival Caymmi%'
   OR artist ILIKE '%Fundo de Quintal%';
