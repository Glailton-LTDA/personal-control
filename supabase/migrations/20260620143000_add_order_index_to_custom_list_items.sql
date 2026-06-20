-- Adiciona a coluna order_index para suportar drag and drop
ALTER TABLE public.custom_list_items ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
