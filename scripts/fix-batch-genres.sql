-- Script de atualização em lote de gêneros musicais (2026-06-04)
-- Executa a classificação de múltiplos artistas conforme especificações do usuário.

-- 1. MPB (Caetano Veloso, Gilberto Gil, Lulu Santos)
-- ID MPB: 58800e99-34fc-47da-a571-e262b4495526
UPDATE music_songs
SET genre_id = '58800e99-34fc-47da-a571-e262b4495526'::uuid
WHERE artist ILIKE '%Caetano Veloso%'
   OR artist ILIKE '%Gilberto Gil%'
   OR artist ILIKE '%Lulu Santos%';

-- 2. Rock (Capital Inicial, Elvis Presley, Oasis, The Rolling Stones, Cássia Eller, John Lennon, Bon Jovi, CPM 22)
-- ID Rock: 7761bce2-d151-4a0a-b16d-52ca5b4fcd64
UPDATE music_songs
SET genre_id = '7761bce2-d151-4a0a-b16d-52ca5b4fcd64'::uuid
WHERE artist ILIKE '%Capital Inicial%'
   OR artist ILIKE '%Elvis Presley%'
   OR artist ILIKE '%Oasis%'
   OR artist ILIKE '%Rolling Stones%'
   OR artist ILIKE '%Cássia Eller%' OR artist ILIKE '%Cassia Eller%'
   OR artist ILIKE '%John Lennon%'
   OR artist ILIKE '%Bon Jovi%'
   OR artist ILIKE '%CPM 22%';

-- 3. Religiosa (Harpa Cristã, Católicas, Vencedores Por Cristo, Bola de Neve, e migrar Gospel para Religiosa)
-- ID Religiosa: 91231a89-9544-4457-a9df-213d77df72a8
-- ID Gospel: 1b550f05-722b-4fcd-bf7d-ef1d0e5175cc
UPDATE music_songs
SET genre_id = '91231a89-9544-4457-a9df-213d77df72a8'::uuid
WHERE artist ILIKE '%Harpa Cristã%' OR artist ILIKE '%Harpa Crista%'
   OR artist ILIKE 'Católicas' OR artist ILIKE 'Catolicas'
   OR artist ILIKE '%Vencedores Por Cristo%'
   OR artist ILIKE '%Bola de Neve%'
   OR genre_id = '1b550f05-722b-4fcd-bf7d-ef1d0e5175cc'::uuid;

-- 4. Samba/Pagode (Dilsinho, Os Travessos, Sorriso Maroto, Art Popular)
-- ID Samba/Pagode: 3842240b-d557-482d-9a28-647158c6174f
UPDATE music_songs
SET genre_id = '3842240b-d557-482d-9a28-647158c6174f'::uuid
WHERE artist ILIKE '%Dilsinho%'
   OR artist ILIKE '%Os Travessos%'
   OR artist ILIKE '%Sorriso Maroto%'
   OR artist ILIKE '%Art Popular%';

-- 5. Sertanejo (Fernando e Sorocaba)
-- ID Sertanejo: 74433cb6-21e7-44fc-8e9d-cc9c3e739fab
UPDATE music_songs
SET genre_id = '74433cb6-21e7-44fc-8e9d-cc9c3e739fab'::uuid
WHERE artist ILIKE '%Fernando%' AND artist ILIKE '%Sorocaba%';

-- 6. Metal (Gamma Ray, Kiss)
-- ID Metal: 181f3bf3-2016-41df-aa92-5eb4fca12088
UPDATE music_songs
SET genre_id = '181f3bf3-2016-41df-aa92-5eb4fca12088'::uuid
WHERE artist ILIKE 'Gamma Ray'
   OR artist ILIKE 'Kiss';

-- 7. Reggae (Magic!)
-- ID Reggae: d5c63f11-9010-4057-baaa-d0dc12f30eb9
UPDATE music_songs
SET genre_id = 'd5c63f11-9010-4057-baaa-d0dc12f30eb9'::uuid
WHERE artist ILIKE 'Magic!' OR artist ILIKE 'Magic';
