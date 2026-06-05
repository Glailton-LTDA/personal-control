-- Otimização do Módulo de Finanças: Índice composto para filtros por usuário e data
CREATE INDEX IF NOT EXISTS idx_finances_user_id_payment_date 
ON public.finances (user_id, payment_date);

-- Otimização das Políticas de Compartilhamento de Carros: Índice composto para buscas de permissão/RLS
CREATE INDEX IF NOT EXISTS idx_car_shares_car_id_shared_with_email 
ON public.car_shares (car_id, shared_with_email);

-- Otimização das Políticas de Compartilhamento de Viagens: Índice composto para buscas de permissão/RLS
CREATE INDEX IF NOT EXISTS idx_trip_shares_trip_id_shared_with_email 
ON public.trip_shares (trip_id, shared_with_email);

-- Otimização das Políticas de Listas Personalizadas: Índice composto para buscas de permissão/RLS
CREATE INDEX IF NOT EXISTS idx_custom_list_shares_list_id_shared_with_email 
ON public.custom_list_shares (list_id, shared_with_email);
