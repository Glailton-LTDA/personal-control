-- Script de atualização em lote massivo de gêneros musicais (2026-06-04)
-- Executa a classificação e a inversão de metadados de múltiplos artistas.

-- 1. SERTANEJO (ID: 74433cb6-21e7-44fc-8e9d-cc9c3e739fab)
UPDATE music_songs
SET genre_id = '74433cb6-21e7-44fc-8e9d-cc9c3e739fab'::uuid
WHERE artist ILIKE '%Gian%Giovani%'
   OR artist ILIKE '%Gusttavo Lima%'
   OR artist ILIKE '%L%o Santana%'
   OR artist ILIKE '%Maiara%Maraisa%'
   OR artist ILIKE '%Bruno%Marrone%'
   OR artist ILIKE '%Luan Santana%'
   OR artist ILIKE '%Henrique%Juliano%'
   OR artist ILIKE '%Victor%Leo%' OR artist ILIKE '%Victor%L%o%'
   OR artist ILIKE '%Simone%Simaria%'
   OR artist ILIKE '%C%sar Menotti%Fabiano%'
   OR artist ILIKE '%Jorge%Mateus%'
   OR artist ILIKE '%Leandro%Leonardo%'
   OR artist = 'Leonardo'
   OR artist ILIKE '%Gustavo Mioto%';

UPDATE music_songs
SET 
  artist = CASE 
    WHEN title ILIKE '%Gian%Giovani%' THEN 'Gian e Giovani'
    WHEN title ILIKE '%Gusttavo Lima%' THEN 'Gusttavo Lima'
    WHEN title ILIKE '%L%o Santana%' THEN 'Léo Santana'
    WHEN title ILIKE '%Maiara%Maraisa%' THEN 'Maiara e Maraisa'
    WHEN title ILIKE '%Bruno%Marrone%' THEN 'Bruno e Marrone'
    WHEN title ILIKE '%Luan Santana%' THEN 'Luan Santana'
    WHEN title ILIKE '%Henrique%Juliano%' THEN 'Henrique e Juliano'
    WHEN title ILIKE '%Victor%Leo%' OR title ILIKE '%Victor%L%o%' THEN 'Victor e Leo'
    WHEN title ILIKE '%Simone%Simaria%' THEN 'Simone e Simaria'
    WHEN title ILIKE '%C%sar Menotti%Fabiano%' THEN 'César Menotti e Fabiano'
    WHEN title ILIKE '%Jorge%Mateus%' THEN 'Jorge e Mateus'
    WHEN title ILIKE '%Leandro%Leonardo%' THEN 'Leandro & Leonardo'
    WHEN title = 'Leonardo' THEN 'Leonardo'
    WHEN title ILIKE '%Gustavo Mioto%' THEN 'Gustavo Mioto'
  END,
  title = artist,
  genre_id = '74433cb6-21e7-44fc-8e9d-cc9c3e739fab'::uuid
WHERE (title ILIKE '%Gian%Giovani%' OR title ILIKE '%Gusttavo Lima%' OR title ILIKE '%L%o Santana%' OR title ILIKE '%Maiara%Maraisa%' OR title ILIKE '%Bruno%Marrone%' OR title ILIKE '%Luan Santana%' OR title ILIKE '%Henrique%Juliano%' OR title ILIKE '%Victor%Leo%' OR title ILIKE '%Victor%L%o%' OR title ILIKE '%Simone%Simaria%' OR title ILIKE '%C%sar Menotti%Fabiano%' OR title ILIKE '%Jorge%Mateus%' OR title ILIKE '%Leandro%Leonardo%' OR title = 'Leonardo' OR title ILIKE '%Gustavo Mioto%')
  AND artist NOT ILIKE '%Gian%Giovani%' AND artist NOT ILIKE '%Gusttavo%Lima%' AND artist NOT ILIKE '%L%o Santana%' AND artist NOT ILIKE '%Maiara%Maraisa%' AND artist NOT ILIKE '%Bruno%Marrone%' AND artist NOT ILIKE '%Luan%Santana%' AND artist NOT ILIKE '%Henrique%Juliano%' AND artist NOT ILIKE '%Victor%Leo%' AND artist NOT ILIKE '%Victor%L%o%' AND artist NOT ILIKE '%Simone%Simaria%' AND artist NOT ILIKE '%C%sar%Menotti%' AND artist NOT ILIKE '%Jorge%Mateus%' AND artist NOT ILIKE '%Leandro%Leonardo%' AND artist <> 'Leonardo' AND artist NOT ILIKE '%Gustavo%Mioto%';

-- 2. ROCK (ID: 7761bce2-d151-4a0a-b16d-52ca5b4fcd64)
UPDATE music_songs
SET genre_id = '7761bce2-d151-4a0a-b16d-52ca5b4fcd64'::uuid
WHERE artist ILIKE '%Coldplay%'
   OR artist ILIKE '%Legi%o Urbana%'
   OR artist ILIKE '%Biquini%Cavadao%' OR artist ILIKE '%Biqu%ni%Cavad%o%'
   OR artist ILIKE '%Green Day%'
   OR artist ILIKE '%Pearl Jam%'
   OR artist ILIKE '%Engenheiros%Hawaii%' OR artist ILIKE '%Engenheiros%Hava%'
   OR artist ILIKE '%The Cure%'
   OR artist ILIKE '%U2%'
   OR artist ILIKE '%Guns%Roses%' OR artist ILIKE '%Guns%n%Roses%' OR artist ILIKE '%Guns and Roses%'
   OR artist ILIKE '%Ira!%' OR artist = 'Ira' OR artist = 'ira'
   OR artist ILIKE '%Catedral%'
   OR artist ILIKE '%Kings%Leon%'
   OR artist ILIKE '%Raul Seixas%'
   OR artist ILIKE '%Supercombo%'
   OR artist ILIKE '%Iron Maiden%' OR artist ILIKE '%Iron maiden%'
   OR artist ILIKE '%Raimundos%'
   OR artist ILIKE '%Fairchild-Cochrane%'
   OR artist ILIKE '%Pitty%'
   OR artist ILIKE '%Electric Light Orchestra%' OR artist ILIKE '%E.L.O%'
   OR artist ILIKE '%Capital Inicial%'
   OR artist ILIKE '%King Crimson%'
   OR artist ILIKE '%Charlie Brown%'
   OR artist ILIKE '%Trooper%';

UPDATE music_songs
SET 
  artist = CASE 
    WHEN title ILIKE '%Coldplay%' THEN 'Coldplay'
    WHEN title ILIKE '%Legi%o Urbana%' THEN 'Legião Urbana'
    WHEN title ILIKE '%Biquini%Cavadao%' OR title ILIKE '%Biqu%ni%Cavad%o%' THEN 'Biquíni Cavadão'
    WHEN title ILIKE '%Green Day%' THEN 'Green Day'
    WHEN title ILIKE '%Pearl Jam%' THEN 'Pearl Jam'
    WHEN title ILIKE '%Engenheiros%Hawaii%' OR title ILIKE '%Engenheiros%Hava%' THEN 'Engenheiros do Hawaii'
    WHEN title ILIKE '%The Cure%' THEN 'The Cure'
    WHEN title ILIKE '%U2%' THEN 'U2'
    WHEN title ILIKE '%Guns%Roses%' OR title ILIKE '%Guns%n%Roses%' OR title ILIKE '%Guns and Roses%' THEN 'Guns N'' Roses'
    WHEN title ILIKE '%Ira!%' OR title = 'Ira' OR title = 'ira' THEN 'Ira!'
    WHEN title ILIKE '%Catedral%' THEN 'Catedral'
    WHEN title ILIKE '%Kings%Leon%' THEN 'Kings Of Leon'
    WHEN title ILIKE '%Raul Seixas%' THEN 'Raul Seixas'
    WHEN title ILIKE '%Supercombo%' THEN 'Supercombo'
    WHEN title ILIKE '%Iron Maiden%' OR title ILIKE '%Iron maiden%' THEN 'Iron Maiden'
    WHEN title ILIKE '%Raimundos%' THEN 'Raimundos'
    WHEN title ILIKE '%Fairchild-Cochrane%' THEN 'Fairchild-Cochrane'
    WHEN title ILIKE '%Pitty%' THEN 'Pitty'
    WHEN title ILIKE '%Electric Light Orchestra%' OR title ILIKE '%E.L.O%' THEN 'Electric Light Orchestra'
    WHEN title ILIKE '%Capital Inicial%' THEN 'Capital Inicial'
    WHEN title ILIKE '%King Crimson%' THEN 'King Crimson'
    WHEN title ILIKE '%Charlie Brown%' THEN 'Charlie Brown Jr.'
    WHEN title ILIKE '%Trooper%' THEN 'Trooper'
  END,
  title = artist,
  genre_id = '7761bce2-d151-4a0a-b16d-52ca5b4fcd64'::uuid
WHERE (title ILIKE '%Coldplay%' OR title ILIKE '%Legi%o Urbana%' OR title ILIKE '%Biquini%Cavadao%' OR title ILIKE '%Biqu%ni%Cavad%o%' OR title ILIKE '%Green Day%' OR title ILIKE '%Pearl Jam%' OR title ILIKE '%Engenheiros%Hawaii%' OR title ILIKE '%Engenheiros%Hava%' OR title ILIKE '%The Cure%' OR title ILIKE '%U2%' OR title ILIKE '%Guns%Roses%' OR title ILIKE '%Guns%n%Roses%' OR title ILIKE '%Guns and Roses%' OR title ILIKE '%Ira!%' OR title = 'Ira' OR title = 'ira' OR title ILIKE '%Catedral%' OR title ILIKE '%Kings%Leon%' OR title ILIKE '%Raul Seixas%' OR title ILIKE '%Supercombo%' OR title ILIKE '%Iron Maiden%' OR title ILIKE '%Iron maiden%' OR title ILIKE '%Raimundos%' OR title ILIKE '%Fairchild-Cochrane%' OR title ILIKE '%Pitty%' OR title ILIKE '%Electric Light Orchestra%' OR title ILIKE '%E.L.O%' OR title ILIKE '%Capital Inicial%' OR title ILIKE '%King Crimson%' OR title ILIKE '%Charlie Brown%' OR title ILIKE '%Trooper%')
  AND artist NOT ILIKE '%Coldplay%' AND artist NOT ILIKE '%Legi%o Urbana%' AND artist NOT ILIKE '%Biquini%Cavadao%' AND artist NOT ILIKE '%Biqu%ni%Cavad%o%' AND artist NOT ILIKE '%Green Day%' AND artist NOT ILIKE '%Pearl Jam%' AND artist NOT ILIKE '%Engenheiros%Hawaii%' AND artist NOT ILIKE '%Engenheiros%Hava%' AND artist NOT ILIKE '%The Cure%' AND artist NOT ILIKE '%U2%' AND artist NOT ILIKE '%Guns%Roses%' AND artist NOT ILIKE '%Guns%n%Roses%' AND artist NOT ILIKE '%Guns and Roses%' AND artist NOT ILIKE '%Ira!%' AND artist <> 'Ira' AND artist <> 'ira' AND artist NOT ILIKE '%Catedral%' AND artist NOT ILIKE '%Kings%Leon%' AND artist NOT ILIKE '%Raul Seixas%' AND artist NOT ILIKE '%Supercombo%' AND artist NOT ILIKE '%Iron Maiden%' AND artist NOT ILIKE '%Iron maiden%' AND artist NOT ILIKE '%Raimundos%' AND artist NOT ILIKE '%Fairchild-Cochrane%' AND artist NOT ILIKE '%Pitty%' AND artist NOT ILIKE '%Electric Light Orchestra%' AND artist NOT ILIKE '%E.L.O%' AND artist NOT ILIKE '%Capital Inicial%' AND artist NOT ILIKE '%King Crimson%' AND artist NOT ILIKE '%Charlie Brown%' AND artist NOT ILIKE '%Trooper%';

-- 3. RELIGIOSA (ID: 91231a89-9544-4457-a9df-213d77df72a8)
UPDATE music_songs
SET genre_id = '91231a89-9544-4457-a9df-213d77df72a8'::uuid
WHERE artist ILIKE '%Corinhos Evang%' OR artist ILIKE '%Corinhos%'
   OR artist ILIKE '%Aline Barros%'
   OR artist ILIKE '%Fernandinho%'
   OR artist ILIKE '%Renascer Praise%'
   OR artist ILIKE '%Voz da Verdade%'
   OR artist ILIKE '%Diante do Trono%'
   OR artist ILIKE '%Gabriela Rocha%'
   OR artist ILIKE '%Alessandro Vilas%'
   OR artist ILIKE '%Minist%rio Apascentar%' OR artist ILIKE '%Apascentar de Louvor%'
   OR artist ILIKE '%Asaph Borba%'
   OR artist ILIKE '%Trazendo a Arca%'
   OR artist ILIKE '%Comunidade Católica Shalom%'
   OR artist ILIKE '%Comunidade Católica Colo de Deus%';

UPDATE music_songs
SET 
  artist = CASE 
    WHEN title ILIKE '%Corinhos Evang%' OR title ILIKE '%Corinhos%' THEN 'Corinhos Evangélicos'
    WHEN title ILIKE '%Aline Barros%' THEN 'Aline Barros'
    WHEN title ILIKE '%Fernandinho%' THEN 'Fernandinho'
    WHEN title ILIKE '%Renascer Praise%' THEN 'Renascer Praise'
    WHEN title ILIKE '%Voz da Verdade%' THEN 'Voz da Verdade'
    WHEN title ILIKE '%Diante do Trono%' THEN 'Diante do Trono'
    WHEN title ILIKE '%Gabriela Rocha%' THEN 'Gabriela Rocha'
    WHEN title ILIKE '%Alessandro Vilas%' THEN 'Alessandro Vilas Boas'
    WHEN title ILIKE '%Minist%rio Apascentar%' OR title ILIKE '%Apascentar de Louvor%' THEN 'Ministério Apascentar de Louvor'
    WHEN title ILIKE '%Asaph Borba%' THEN 'Asaph Borba'
    WHEN title ILIKE '%Trazendo a Arca%' THEN 'Trazendo a Arca'
    WHEN title ILIKE '%Comunidade Católica Shalom%' THEN 'Comunidade Católica Shalom'
    WHEN title ILIKE '%Comunidade Católica Colo de Deus%' THEN 'Comunidade Católica Colo de Deus'
  END,
  title = artist,
  genre_id = '91231a89-9544-4457-a9df-213d77df72a8'::uuid
WHERE (title ILIKE '%Corinhos Evang%' OR title ILIKE '%Corinhos%' OR title ILIKE '%Aline Barros%' OR title ILIKE '%Fernandinho%' OR title ILIKE '%Renascer Praise%' OR title ILIKE '%Voz da Verdade%' OR title ILIKE '%Diante do Trono%' OR title ILIKE '%Gabriela Rocha%' OR title ILIKE '%Alessandro Vilas%' OR title ILIKE '%Minist%rio Apascentar%' OR title ILIKE '%Apascentar de Louvor%' OR title ILIKE '%Asaph Borba%' OR title ILIKE '%Trazendo a Arca%' OR title ILIKE '%Comunidade Católica Shalom%' OR title ILIKE '%Comunidade Católica Colo de Deus%')
  AND artist NOT ILIKE '%Corinhos Evang%' AND artist NOT ILIKE '%Corinhos%' AND artist NOT ILIKE '%Aline Barros%' AND artist NOT ILIKE '%Fernandinho%' AND artist NOT ILIKE '%Renascer Praise%' AND artist NOT ILIKE '%Voz da Verdade%' AND artist NOT ILIKE '%Diante do Trono%' AND artist NOT ILIKE '%Gabriela Rocha%' AND artist NOT ILIKE '%Alessandro Vilas%' AND artist NOT ILIKE '%Minist%rio Apascentar%' AND artist NOT ILIKE '%Apascentar de Louvor%' AND artist NOT ILIKE '%Asaph Borba%' AND artist NOT ILIKE '%Trazendo a Arca%' AND artist NOT ILIKE '%Comunidade Católica Shalom%' AND artist NOT ILIKE '%Comunidade Católica Colo de Deus%';

-- 4. FORRÓ (ID: 22af4b37-bb03-44cd-8ff2-94bef3ea1e86)
UPDATE music_songs
SET genre_id = '22af4b37-bb03-44cd-8ff2-94bef3ea1e86'::uuid
WHERE artist ILIKE '%Cavaleiros%Forr%'
   OR artist ILIKE '%Falamansa%'
   OR artist ILIKE '%Calcinha Preta%'
   OR artist ILIKE '%Lim%o com mel%'
   OR artist ILIKE '%gabriel diniz%'
   OR artist ILIKE '%mano walter%'
   OR artist ILIKE '%wesley safad%'
   OR artist ILIKE '%Luiz Gonzaga%'
   OR artist ILIKE '%Gatinha Manhosa%';

UPDATE music_songs
SET 
  artist = CASE 
    WHEN title ILIKE '%Cavaleiros%Forr%' THEN 'Cavaleiros do Forró'
    WHEN title ILIKE '%Falamansa%' THEN 'Falamansa'
    WHEN title ILIKE '%Calcinha Preta%' THEN 'Calcinha Preta'
    WHEN title ILIKE '%Lim%o com mel%' THEN 'Limão com Mel'
    WHEN title ILIKE '%gabriel diniz%' THEN 'Gabriel Diniz'
    WHEN title ILIKE '%mano walter%' THEN 'Mano Walter'
    WHEN title ILIKE '%wesley safad%' THEN 'Wesley Safadão'
    WHEN title ILIKE '%Luiz Gonzaga%' THEN 'Luiz Gonzaga'
    WHEN title ILIKE '%Gatinha Manhosa%' THEN 'Gatinha Manhosa'
  END,
  title = artist,
  genre_id = '22af4b37-bb03-44cd-8ff2-94bef3ea1e86'::uuid
WHERE (title ILIKE '%Cavaleiros%Forr%' OR title ILIKE '%Falamansa%' OR title ILIKE '%Calcinha Preta%' OR title ILIKE '%Lim%o com mel%' OR title ILIKE '%gabriel diniz%' OR title ILIKE '%mano walter%' OR title ILIKE '%wesley safad%' OR title ILIKE '%Luiz Gonzaga%' OR title ILIKE '%Gatinha Manhosa%')
  AND artist NOT ILIKE '%Cavaleiros%Forr%' AND artist NOT ILIKE '%Falamansa%' AND artist NOT ILIKE '%Calcinha Preta%' AND artist NOT ILIKE '%Lim%o com mel%' AND artist NOT ILIKE '%gabriel diniz%' AND artist NOT ILIKE '%mano walter%' AND artist NOT ILIKE '%wesley safad%' AND artist NOT ILIKE '%Luiz Gonzaga%' AND artist NOT ILIKE '%Gatinha Manhosa%';

-- 5. SAMBA/PAGODE (ID: 3842240b-d557-482d-9a28-647158c6174f)
UPDATE music_songs
SET genre_id = '3842240b-d557-482d-9a28-647158c6174f'::uuid
WHERE artist ILIKE '%Thiaguinho%'
   OR artist ILIKE '%Pixote%'
   OR artist ILIKE '%Jackson do Pandeiro%'
   OR artist ILIKE '%Bom Gosto%'
   OR artist ILIKE '%Jorge Ben%'
   OR artist ILIKE '%Exaltasamba%'
   OR artist ILIKE '%Bokaloka%';

UPDATE music_songs
SET 
  artist = CASE 
    WHEN title ILIKE '%Thiaguinho%' THEN 'Thiaguinho'
    WHEN title ILIKE '%Pixote%' THEN 'Grupo Pixote'
    WHEN title ILIKE '%Jackson do Pandeiro%' THEN 'Jackson do Pandeiro'
    WHEN title ILIKE '%Bom Gosto%' THEN 'Grupo Bom Gosto'
    WHEN title ILIKE '%Jorge Ben%' THEN 'Jorge Ben Jor'
    WHEN title ILIKE '%Exaltasamba%' THEN 'Exaltasamba'
    WHEN title ILIKE '%Bokaloka%' THEN 'Bokaloka'
  END,
  title = artist,
  genre_id = '3842240b-d557-482d-9a28-647158c6174f'::uuid
WHERE (title ILIKE '%Thiaguinho%' OR title ILIKE '%Pixote%' OR title ILIKE '%Jackson do Pandeiro%' OR title ILIKE '%Bom Gosto%' OR title ILIKE '%Jorge Ben%' OR title ILIKE '%Exaltasamba%' OR title ILIKE '%Bokaloka%')
  AND artist NOT ILIKE '%Thiaguinho%' AND artist NOT ILIKE '%Pixote%' AND artist NOT ILIKE '%Jackson do Pandeiro%' AND artist NOT ILIKE '%Bom Gosto%' AND artist NOT ILIKE '%Jorge Ben%' AND artist NOT ILIKE '%Exaltasamba%' AND artist NOT ILIKE '%Bokaloka%';

-- 6. AXÉ (ID: ff09aee7-7683-4f3c-8364-7bbdbe6831d5)
UPDATE music_songs
SET genre_id = 'ff09aee7-7683-4f3c-8364-7bbdbe6831d5'::uuid
WHERE artist ILIKE '%Chicabana%'
   OR artist ILIKE '%Chiclete com banana%' OR artist ILIKE '%Chiclete Com Banana%'
   OR artist ILIKE '%babado novo%' OR artist ILIKE '%Babado Novo%'
   OR artist ILIKE '%Ivete sangalo%' OR artist ILIKE '%Ivete Sangalo%';

UPDATE music_songs
SET 
  artist = CASE 
    WHEN title ILIKE '%Chicabana%' THEN 'Chicabana'
    WHEN title ILIKE '%Chiclete com banana%' OR title ILIKE '%Chiclete Com Banana%' THEN 'Chiclete com Banana'
    WHEN title ILIKE '%babado novo%' OR title ILIKE '%Babado Novo%' THEN 'Babado Novo'
    WHEN title ILIKE '%Ivete sangalo%' OR title ILIKE '%Ivete Sangalo%' THEN 'Ivete Sangalo'
  END,
  title = artist,
  genre_id = 'ff09aee7-7683-4f3c-8364-7bbdbe6831d5'::uuid
WHERE (title ILIKE '%Chicabana%' OR title ILIKE '%Chiclete com banana%' OR title ILIKE '%Chiclete Com Banana%' OR title ILIKE '%babado novo%' OR title ILIKE '%Babado Novo%' OR title ILIKE '%Ivete sangalo%' OR title ILIKE '%Ivete Sangalo%')
  AND artist NOT ILIKE '%Chicabana%' AND artist NOT ILIKE '%Chiclete com banana%' AND artist NOT ILIKE '%Chiclete Com Banana%' AND artist NOT ILIKE '%babado novo%' AND artist NOT ILIKE '%Babado Novo%' AND artist NOT ILIKE '%Ivete sangalo%' AND artist NOT ILIKE '%Ivete Sangalo%';

-- 7. PUNK (ID: 803b7c27-60be-428b-add9-6b2089b0d5af)
UPDATE music_songs
SET genre_id = '803b7c27-60be-428b-add9-6b2089b0d5af'::uuid
WHERE artist ILIKE '%Bad Religion%'
   OR artist ILIKE '%Tom Robinson%'
   OR artist ILIKE '%Goldfinger%'
   OR artist ILIKE '%Paramore%';

UPDATE music_songs
SET 
  artist = CASE 
    WHEN title ILIKE '%Bad Religion%' THEN 'Bad Religion'
    WHEN title ILIKE '%Tom Robinson%' THEN 'Tom Robinson'
    WHEN title ILIKE '%Goldfinger%' THEN 'Goldfinger'
    WHEN title ILIKE '%Paramore%' THEN 'Paramore'
  END,
  title = artist,
  genre_id = '803b7c27-60be-428b-add9-6b2089b0d5af'::uuid
WHERE (title ILIKE '%Bad Religion%' OR title ILIKE '%Tom Robinson%' OR title ILIKE '%Goldfinger%' OR title ILIKE '%Paramore%')
  AND artist NOT ILIKE '%Bad Religion%' AND artist NOT ILIKE '%Tom Robinson%' AND artist NOT ILIKE '%Goldfinger%' AND artist NOT ILIKE '%Paramore%';

-- 8. POP (ID: 3bbf05ce-9247-4ac3-a39f-96a5d3444069)
UPDATE music_songs
SET genre_id = '3bbf05ce-9247-4ac3-a39f-96a5d3444069'::uuid
WHERE artist ILIKE '%Backstreet%'
   OR artist ILIKE '%Lucas Dcan%'
   OR artist ILIKE '%KLB%'
   OR artist ILIKE '%Avril%'
   OR artist ILIKE '%Goo Goo%';

UPDATE music_songs
SET 
  artist = CASE 
    WHEN title ILIKE '%Backstreet%' THEN 'Backstreet Boys'
    WHEN title ILIKE '%Lucas Dcan%' THEN 'Lucas Dcan'
    WHEN title ILIKE '%KLB%' THEN 'KLB'
    WHEN title ILIKE '%Avril%' THEN 'Avril Lavigne'
    WHEN title ILIKE '%Goo Goo%' THEN 'Goo Goo Dolls'
  END,
  title = artist,
  genre_id = '3bbf05ce-9247-4ac3-a39f-96a5d3444069'::uuid
WHERE (title ILIKE '%Backstreet%' OR title ILIKE '%Lucas Dcan%' OR title ILIKE '%KLB%' OR title ILIKE '%Avril%' OR title ILIKE '%Goo Goo%')
  AND artist NOT ILIKE '%Backstreet%' AND artist NOT ILIKE '%Lucas Dcan%' AND artist NOT ILIKE '%KLB%' AND artist NOT ILIKE '%Avril%' AND artist NOT ILIKE '%Goo Goo%';

-- 9. REGGAE (ID: d5c63f11-9010-4057-baaa-d0dc12f30eb9)
UPDATE music_songs
SET genre_id = 'd5c63f11-9010-4057-baaa-d0dc12f30eb9'::uuid
WHERE artist ILIKE '%Manu Chao%'
   OR artist ILIKE '%Sticky Fingers%'
   OR artist ILIKE '%Vibra%'
   OR artist ILIKE '%Natiruts%'
   OR artist ILIKE '%Ponto De%' OR artist ILIKE '%Ponto de%'
   OR artist ILIKE '%The Police%'
   OR artist ILIKE '%Dazaranha%'
   OR artist ILIKE '%Tribo de Jah%' OR artist ILIKE '%Tribo De Jah%';

UPDATE music_songs
SET 
  artist = CASE 
    WHEN title ILIKE '%Manu Chao%' THEN 'Manu Chao'
    WHEN title ILIKE '%Sticky Fingers%' THEN 'Sticky Fingers'
    WHEN title ILIKE '%Vibra%' THEN 'Vibrações Rasta'
    WHEN title ILIKE '%Natiruts%' THEN 'Natiruts'
    WHEN title ILIKE '%Ponto De%' OR title ILIKE '%Ponto de%' THEN 'Ponto De Equilíbrio'
    WHEN title ILIKE '%The Police%' THEN 'The Police'
    WHEN title ILIKE '%Dazaranha%' THEN 'Dazaranha'
    WHEN title ILIKE '%Tribo de Jah%' OR title ILIKE '%Tribo De Jah%' THEN 'Tribo de Jah'
  END,
  title = artist,
  genre_id = 'd5c63f11-9010-4057-baaa-d0dc12f30eb9'::uuid
WHERE (title ILIKE '%Manu Chao%' OR title ILIKE '%Sticky Fingers%' OR title ILIKE '%Vibra%' OR title ILIKE '%Natiruts%' OR title ILIKE '%Ponto De%' OR title ILIKE '%Ponto de%' OR title ILIKE '%The Police%' OR title ILIKE '%Dazaranha%' OR title ILIKE '%Tribo de Jah%' OR title ILIKE '%Tribo De Jah%')
  AND artist NOT ILIKE '%Manu Chao%' AND artist NOT ILIKE '%Sticky Fingers%' AND artist NOT ILIKE '%Vibra%' AND artist NOT ILIKE '%Natiruts%' AND artist NOT ILIKE '%Ponto De%' AND artist NOT ILIKE '%Ponto de%' AND artist NOT ILIKE '%The Police%' AND artist NOT ILIKE '%Dazaranha%' AND artist NOT ILIKE '%Tribo de Jah%' AND artist NOT ILIKE '%Tribo De Jah%';

-- 10. MPB (ID: 58800e99-34fc-47da-a571-e262b4495526)
UPDATE music_songs
SET genre_id = '58800e99-34fc-47da-a571-e262b4495526'::uuid
WHERE artist ILIKE '%14 Bis%'
   OR artist ILIKE '%Toquinho%'
   OR artist ILIKE '%Ana Carolina%'
   OR artist ILIKE '%Quando Te Vi%'
   OR artist ILIKE '%Fábio Jr.%' OR artist ILIKE '%Fabio Jr.%'
   OR artist ILIKE '%Tom Zé%' OR artist ILIKE '%Tom Ze%'
   OR artist ILIKE '%Novos Baianos%'
   OR artist ILIKE '%Frejat%'
   OR artist ILIKE '%Cazuza%'
   OR artist ILIKE '%Ney Matogrosso%'
   OR artist ILIKE '%Caetano Veloso%'
   OR artist ILIKE '%Gilberto Gil%'
   OR artist ILIKE '%Chico Buarque%';

UPDATE music_songs
SET 
  artist = CASE 
    WHEN title ILIKE '%14 Bis%' THEN '14 Bis'
    WHEN title ILIKE '%Toquinho%' THEN 'Toquinho'
    WHEN title ILIKE '%Ana Carolina%' THEN 'Ana Carolina'
    WHEN title ILIKE '%Quando Te Vi%' THEN 'Quando Te Vi'
    WHEN title ILIKE '%Fábio Jr.%' OR title ILIKE '%Fabio Jr.%' THEN 'Fábio Jr.'
    WHEN title ILIKE '%Tom Zé%' OR title ILIKE '%Tom Ze%' THEN 'Tom Zé'
    WHEN title ILIKE '%Novos Baianos%' THEN 'Novos Baianos'
    WHEN title ILIKE '%Frejat%' THEN 'Frejat'
    WHEN title ILIKE '%Cazuza%' THEN 'Cazuza'
    WHEN title ILIKE '%Ney Matogrosso%' OR title ILIKE '%Ney Mator%' THEN 'Ney Matogrosso'
    WHEN title ILIKE '%Caetano Veloso%' OR title = 'Caetano Veloso - Part. Cifrada' THEN 'Caetano Veloso'
    WHEN title ILIKE '%Gilberto Gil%' OR title ILIKE '%Milton Nascimento E Gilberto Gil%' THEN 'Gilberto Gil'
    WHEN title ILIKE '%Chico Buarque%' THEN 'Chico Buarque'
  END,
  title = artist,
  genre_id = '58800e99-34fc-47da-a571-e262b4495526'::uuid
WHERE (title ILIKE '%14 Bis%' OR title ILIKE '%Toquinho%' OR title ILIKE '%Ana Carolina%' OR title ILIKE '%Quando Te Vi%' OR title ILIKE '%Fábio Jr.%' OR title ILIKE '%Fabio Jr.%' OR title ILIKE '%Tom Zé%' OR title ILIKE '%Tom Ze%' OR title ILIKE '%Novos Baianos%' OR title ILIKE '%Frejat%' OR title ILIKE '%Cazuza%' OR title ILIKE '%Ney Matogrosso%' OR title ILIKE '%Ney Mator%' OR title ILIKE '%Caetano Veloso%' OR title = 'Caetano Veloso - Part. Cifrada' OR title ILIKE '%Gilberto Gil%' OR title ILIKE '%Milton Nascimento E Gilberto Gil%' OR title ILIKE '%Chico Buarque%')
  AND artist NOT ILIKE '%14 Bis%' AND artist NOT ILIKE '%Toquinho%' AND artist NOT ILIKE '%Ana Carolina%' AND artist NOT ILIKE '%Quando Te Vi%' AND artist NOT ILIKE '%Fábio Jr.%' AND artist NOT ILIKE '%Fabio Jr.%' AND artist NOT ILIKE '%Tom Zé%' AND artist NOT ILIKE '%Tom Ze%' AND artist NOT ILIKE '%Novos Baianos%' AND artist NOT ILIKE '%Frejat%' AND artist NOT ILIKE '%Cazuza%' AND artist NOT ILIKE '%Ney Matogrosso%' AND artist NOT ILIKE '%Ney Mator%' AND artist NOT ILIKE '%Caetano Veloso%' AND artist NOT ILIKE '%Gilberto Gil%' AND artist NOT ILIKE '%Chico Buarque%';

-- 11. POP ROCK (ID: 75f760ca-1a99-4bd1-9012-7d52f21c8e7f)
UPDATE music_songs
SET genre_id = '75f760ca-1a99-4bd1-9012-7d52f21c8e7f'::uuid
WHERE artist ILIKE '%Bryan Adams%'
   OR artist ILIKE '%Pato Fu%'
   OR artist ILIKE '%Pretenders%'
   OR artist ILIKE '%Rita Lee%'
   OR artist ILIKE '%Paralamas%'
   OR artist ILIKE '%Kid Abelha%'
   OR artist ILIKE '%Gessinger%'
   OR artist ILIKE '%Mr. Gyn%' OR artist ILIKE '%Mr Gyn%';

UPDATE music_songs
SET 
  artist = CASE 
    WHEN title ILIKE '%Bryan Adams%' THEN 'Bryan Adams'
    WHEN title ILIKE '%Pato Fu%' THEN 'Pato Fu'
    WHEN title ILIKE '%Pretenders%' THEN 'The Pretenders'
    WHEN title ILIKE '%Rita Lee%' THEN 'Rita Lee'
    WHEN title ILIKE '%Paralamas%' THEN 'Os Paralamas do Sucesso'
    WHEN title ILIKE '%Kid Abelha%' THEN 'Kid Abelha'
    WHEN title ILIKE '%Gessinger%' THEN 'Humberto Gessinger'
    WHEN title ILIKE '%Mr. Gyn%' OR title ILIKE '%Mr Gyn%' THEN 'Mr. Gyn'
  END,
  title = artist,
  genre_id = '75f760ca-1a99-4bd1-9012-7d52f21c8e7f'::uuid
WHERE (title ILIKE '%Bryan Adams%' OR title ILIKE '%Pato Fu%' OR title ILIKE '%Pretenders%' OR title ILIKE '%Rita Lee%' OR title ILIKE '%Paralamas%' OR title ILIKE '%Kid Abelha%' OR title ILIKE '%Gessinger%' OR title ILIKE '%Mr. Gyn%' OR title ILIKE '%Mr Gyn%')
  AND artist NOT ILIKE '%Bryan Adams%' AND artist NOT ILIKE '%Pato Fu%' AND artist NOT ILIKE '%Pretenders%' AND artist NOT ILIKE '%Rita Lee%' AND artist NOT ILIKE '%Paralamas%' AND artist NOT ILIKE '%Kid Abelha%' AND artist NOT ILIKE '%Gessinger%' AND artist NOT ILIKE '%Mr. Gyn%' AND artist NOT ILIKE '%Mr Gyn%';

-- 12. METAL (ID: 181f3bf3-2016-41df-aa92-5eb4fca12088)
UPDATE music_songs
SET genre_id = '181f3bf3-2016-41df-aa92-5eb4fca12088'::uuid
WHERE artist ILIKE '%Metallica%'
   OR artist ILIKE '%Acid Drinkers%';

UPDATE music_songs
SET 
  artist = CASE 
    WHEN title ILIKE '%Metallica%' THEN 'Metallica'
    WHEN title ILIKE '%Acid Drinkers%' THEN 'Acid Drinkers'
  END,
  title = artist,
  genre_id = '181f3bf3-2016-41df-aa92-5eb4fca12088'::uuid
WHERE (title ILIKE '%Metallica%' OR title ILIKE '%Acid Drinkers%')
  AND artist NOT ILIKE '%Metallica%' AND artist NOT ILIKE '%Acid Drinkers%';

-- 13. EMO (ID: 30d1559c-ab62-460f-85fe-887964ae628a)
UPDATE music_songs
SET genre_id = '30d1559c-ab62-460f-85fe-887964ae628a'::uuid
WHERE artist ILIKE '%Fresno%'
   OR artist ILIKE '%Joy Division%';

UPDATE music_songs
SET 
  artist = CASE 
    WHEN title ILIKE '%Fresno%' THEN 'Fresno'
    WHEN title ILIKE '%Joy Division%' THEN 'Joy Division'
  END,
  title = artist,
  genre_id = '30d1559c-ab62-460f-85fe-887964ae628a'::uuid
WHERE (title ILIKE '%Fresno%' OR title ILIKE '%Joy Division%')
  AND artist NOT ILIKE '%Fresno%' AND artist NOT ILIKE '%Joy Division%';

-- 14. BREGA (ID: 1b17ee6f-388c-4b01-973f-3195555ee90a)
UPDATE music_songs
SET genre_id = '1b17ee6f-388c-4b01-973f-3195555ee90a'::uuid
WHERE artist ILIKE '%Amado Batista%';

UPDATE music_songs
SET 
  artist = 'Amado Batista',
  title = artist,
  genre_id = '1b17ee6f-388c-4b01-973f-3195555ee90a'::uuid
WHERE title ILIKE '%Amado Batista%'
  AND artist NOT ILIKE '%Amado Batista%';
