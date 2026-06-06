-- Migration: Create dedicated tables for Markdown Notes and Notebooks
-- Target: public.markdown_notebooks, public.markdown_notes, public.markdown_notebook_shares

-- 1. Create Notebooks table
CREATE TABLE IF NOT EXISTS public.markdown_notebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Create Notes table
CREATE TABLE IF NOT EXISTS public.markdown_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid REFERENCES public.markdown_notebooks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text DEFAULT '' NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 3. Create Notebook Shares table
CREATE TABLE IF NOT EXISTS public.markdown_notebook_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid REFERENCES public.markdown_notebooks(id) ON DELETE CASCADE,
  shared_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_by_email text NOT NULL,
  shared_with_email text NOT NULL,
  permission text DEFAULT 'WRITE' NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT unique_notebook_share UNIQUE (notebook_id, shared_with_email)
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.markdown_notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markdown_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markdown_notebook_shares ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for markdown_notebooks
DROP POLICY IF EXISTS "Users can view their own or shared notebooks" ON public.markdown_notebooks;
CREATE POLICY "Users can view their own or shared notebooks" ON public.markdown_notebooks
  FOR SELECT
  USING (
    (auth.uid() = user_id) OR 
    (id IN (SELECT notebook_id FROM public.markdown_notebook_shares WHERE shared_with_email = auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS "Users can insert their own notebooks" ON public.markdown_notebooks;
CREATE POLICY "Users can insert their own notebooks" ON public.markdown_notebooks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own or shared notebooks with WRITE" ON public.markdown_notebooks;
CREATE POLICY "Users can update their own or shared notebooks with WRITE" ON public.markdown_notebooks
  FOR UPDATE
  USING (
    (auth.uid() = user_id) OR 
    (id IN (SELECT notebook_id FROM public.markdown_notebook_shares WHERE shared_with_email = auth.jwt() ->> 'email' AND permission = 'WRITE'))
  );

DROP POLICY IF EXISTS "Users can delete their own notebooks" ON public.markdown_notebooks;
CREATE POLICY "Users can delete their own notebooks" ON public.markdown_notebooks
  FOR DELETE
  USING (auth.uid() = user_id);


-- 6. RLS Policies for markdown_notes
DROP POLICY IF EXISTS "Users can view notes in their own or shared notebooks" ON public.markdown_notes;
CREATE POLICY "Users can view notes in their own or shared notebooks" ON public.markdown_notes
  FOR SELECT
  USING (
    (user_id = auth.uid()) OR
    (notebook_id IN (SELECT id FROM public.markdown_notebooks WHERE user_id = auth.uid())) OR
    (notebook_id IN (SELECT notebook_id FROM public.markdown_notebook_shares WHERE shared_with_email = auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS "Users can insert notes in their own or shared notebooks with WRITE" ON public.markdown_notes;
CREATE POLICY "Users can insert notes in their own or shared notebooks with WRITE" ON public.markdown_notes
  FOR INSERT
  WITH CHECK (
    (auth.uid() = user_id) AND (
      (notebook_id IN (SELECT id FROM public.markdown_notebooks WHERE user_id = auth.uid())) OR
      (notebook_id IN (SELECT notebook_id FROM public.markdown_notebook_shares WHERE shared_with_email = auth.jwt() ->> 'email' AND permission = 'WRITE'))
    )
  );

DROP POLICY IF EXISTS "Users can update notes in their own or shared notebooks with WRITE" ON public.markdown_notes;
CREATE POLICY "Users can update notes in their own or shared notebooks with WRITE" ON public.markdown_notes
  FOR UPDATE
  USING (
    (user_id = auth.uid()) OR
    (notebook_id IN (SELECT id FROM public.markdown_notebooks WHERE user_id = auth.uid())) OR
    (notebook_id IN (SELECT notebook_id FROM public.markdown_notebook_shares WHERE shared_with_email = auth.jwt() ->> 'email' AND permission = 'WRITE'))
  );

DROP POLICY IF EXISTS "Users can delete notes in their own or shared notebooks with WRITE" ON public.markdown_notes;
CREATE POLICY "Users can delete notes in their own or shared notebooks with WRITE" ON public.markdown_notes
  FOR DELETE
  USING (
    (user_id = auth.uid()) OR
    (notebook_id IN (SELECT id FROM public.markdown_notebooks WHERE user_id = auth.uid())) OR
    (notebook_id IN (SELECT notebook_id FROM public.markdown_notebook_shares WHERE shared_with_email = auth.jwt() ->> 'email' AND permission = 'WRITE'))
  );


-- 7. RLS Policies for markdown_notebook_shares
DROP POLICY IF EXISTS "Users can view notebook shares" ON public.markdown_notebook_shares;
CREATE POLICY "Users can view notebook shares" ON public.markdown_notebook_shares
  FOR SELECT
  USING (
    (shared_by = auth.uid()) OR 
    (shared_with_email = auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "Notebook owners can create shares" ON public.markdown_notebook_shares;
CREATE POLICY "Notebook owners can create shares" ON public.markdown_notebook_shares
  FOR INSERT
  WITH CHECK (
    (shared_by = auth.uid()) AND
    (notebook_id IN (SELECT id FROM public.markdown_notebooks WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Notebook owners or receivers can delete shares" ON public.markdown_notebook_shares;
CREATE POLICY "Notebook owners or receivers can delete shares" ON public.markdown_notebook_shares
  FOR DELETE
  USING (
    (shared_by = auth.uid()) OR 
    (shared_with_email = auth.jwt() ->> 'email')
  );


-- 8. DATA MIGRATION: Move old data from custom_lists / custom_list_items to new tables
-- Insert notebooks
INSERT INTO public.markdown_notebooks (id, user_id, name, created_at)
SELECT 
  id, 
  user_id, 
  CASE WHEN name = 'Listas' THEN 'Minhas Notas' ELSE name END, 
  created_at
FROM public.custom_lists
WHERE description = '__markdown_notes__'
ON CONFLICT (id) DO NOTHING;

-- Insert notebook shares
INSERT INTO public.markdown_notebook_shares (id, notebook_id, shared_by, shared_by_email, shared_with_email, permission, created_at)
SELECT 
  s.id, 
  s.list_id, 
  s.shared_by, 
  COALESCE(s.shared_by_email, u.email, 'unknown@example.com'), 
  s.shared_with_email, 
  s.permission, 
  s.created_at
FROM public.custom_list_shares s
JOIN public.custom_lists l ON s.list_id = l.id
LEFT JOIN auth.users u ON s.shared_by = u.id
WHERE l.description = '__markdown_notes__'
ON CONFLICT (id) DO NOTHING;

-- Insert notes (parse JSON title and content from content column)
INSERT INTO public.markdown_notes (id, notebook_id, user_id, title, content, created_at, updated_at)
SELECT 
  id, 
  list_id, 
  user_id, 
  COALESCE(content::json->>'title', 'Sem título'), 
  COALESCE(content::json->>'content', ''), 
  created_at, 
  COALESCE(updated_at, created_at)
FROM public.custom_list_items
WHERE list_id IN (SELECT id FROM public.custom_lists WHERE description = '__markdown_notes__')
ON CONFLICT (id) DO NOTHING;
