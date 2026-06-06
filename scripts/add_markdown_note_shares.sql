-- Migration: Add individual note sharing support
-- Target: public.markdown_note_shares, public.markdown_notes (RLS update)

-- 1. Create Note Shares table
CREATE TABLE IF NOT EXISTS public.markdown_note_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid REFERENCES public.markdown_notes(id) ON DELETE CASCADE,
  shared_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_by_email text NOT NULL,
  shared_with_email text NOT NULL,
  permission text DEFAULT 'WRITE' NOT NULL, -- 'READ' or 'WRITE'
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT unique_note_share UNIQUE (note_id, shared_with_email)
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.markdown_note_shares ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for markdown_note_shares
DROP POLICY IF EXISTS "Users can view note shares" ON public.markdown_note_shares;
CREATE POLICY "Users can view note shares" ON public.markdown_note_shares
  FOR SELECT
  USING (
    (shared_by = auth.uid()) OR 
    (shared_with_email = auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "Note owners can create shares" ON public.markdown_note_shares;
CREATE POLICY "Note owners can create shares" ON public.markdown_note_shares
  FOR INSERT
  WITH CHECK (
    (shared_by = auth.uid()) AND
    (note_id IN (SELECT id FROM public.markdown_notes WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Note owners or receivers can delete shares" ON public.markdown_note_shares;
CREATE POLICY "Notebook owners or receivers can delete shares" ON public.markdown_note_shares;
CREATE POLICY "Note owners or receivers can delete shares" ON public.markdown_note_shares
  FOR DELETE
  USING (
    (shared_by = auth.uid()) OR 
    (shared_with_email = auth.jwt() ->> 'email')
  );

-- 4. Update RLS Policies for markdown_notes (incorporate individual note shares check)
DROP POLICY IF EXISTS "Users can view notes in their own or shared notebooks" ON public.markdown_notes;
CREATE POLICY "Users can view notes in their own or shared notebooks" ON public.markdown_notes
  FOR SELECT
  USING (
    (user_id = auth.uid()) OR
    (notebook_id IN (SELECT id FROM public.markdown_notebooks WHERE user_id = auth.uid())) OR
    (notebook_id IN (SELECT notebook_id FROM public.markdown_notebook_shares WHERE shared_with_email = auth.jwt() ->> 'email')) OR
    (id IN (SELECT note_id FROM public.markdown_note_shares WHERE shared_with_email = auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS "Users can update notes in their own or shared notebooks with WRITE" ON public.markdown_notes;
CREATE POLICY "Users can update notes in their own or shared notebooks with WRITE" ON public.markdown_notes
  FOR UPDATE
  USING (
    (user_id = auth.uid()) OR
    (notebook_id IN (SELECT id FROM public.markdown_notebooks WHERE user_id = auth.uid())) OR
    (notebook_id IN (SELECT notebook_id FROM public.markdown_notebook_shares WHERE shared_with_email = auth.jwt() ->> 'email' AND permission = 'WRITE')) OR
    (id IN (SELECT note_id FROM public.markdown_note_shares WHERE shared_with_email = auth.jwt() ->> 'email' AND permission = 'WRITE'))
  );

DROP POLICY IF EXISTS "Users can delete notes in their own or shared notebooks with WRITE" ON public.markdown_notes;
CREATE POLICY "Users can delete notes in their own or shared notebooks with WRITE" ON public.markdown_notes
  FOR DELETE
  USING (
    (user_id = auth.uid()) OR
    (notebook_id IN (SELECT id FROM public.markdown_notebooks WHERE user_id = auth.uid())) OR
    (notebook_id IN (SELECT notebook_id FROM public.markdown_notebook_shares WHERE shared_with_email = auth.jwt() ->> 'email' AND permission = 'WRITE')) OR
    (id IN (SELECT note_id FROM public.markdown_note_shares WHERE shared_with_email = auth.jwt() ->> 'email' AND permission = 'WRITE'))
  );
