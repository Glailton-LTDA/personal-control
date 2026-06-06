-- Migration: Fix RLS policies for custom lists and shares, and add shared_by_email column
-- Target: public.custom_lists, public.custom_list_shares, public.custom_list_items

-- 1. Add shared_by_email column to custom_list_shares to display owner email in UI instead of UUID
ALTER TABLE public.custom_list_shares ADD COLUMN IF NOT EXISTS shared_by_email text;

-- Populate existing rows
UPDATE public.custom_list_shares s
SET shared_by_email = u.email
FROM auth.users u
WHERE s.shared_by = u.id;

-- 2. Fix custom_list_shares INSERT policy
DROP POLICY IF EXISTS "Users can create shares for their own lists" ON public.custom_list_shares;
CREATE POLICY "Users can create shares for their own lists" ON public.custom_list_shares
  FOR INSERT
  WITH CHECK (
    (auth.uid() = shared_by) AND 
    (list_id IN (SELECT id FROM public.custom_lists WHERE user_id = auth.uid()))
  );

-- 3. Fix custom_list_items SELECT policy (allows owners to view items created by shared users)
DROP POLICY IF EXISTS "Users can view their own or shared list items" ON public.custom_list_items;
CREATE POLICY "Users can view their own or shared list items" ON public.custom_list_items
  FOR SELECT
  USING (
    (auth.uid() = user_id) OR 
    (list_id IN (SELECT id FROM public.custom_lists WHERE user_id = auth.uid())) OR 
    (list_id IN (SELECT list_id FROM public.custom_list_shares WHERE shared_with_email = auth.jwt() ->> 'email'))
  );

-- 4. Fix custom_list_items INSERT policy (prevents inserting items into other users' private lists)
DROP POLICY IF EXISTS "Users can insert items in their own or shared lists with WRITE " ON public.custom_list_items;
DROP POLICY IF EXISTS "Users can insert items in their own or shared lists with WRITE" ON public.custom_list_items;
CREATE POLICY "Users can insert items in their own or shared lists with WRITE" ON public.custom_list_items
  FOR INSERT
  WITH CHECK (
    (auth.uid() = user_id) AND (
      (list_id IN (SELECT id FROM public.custom_lists WHERE user_id = auth.uid())) OR 
      (list_id IN (SELECT list_id FROM public.custom_list_shares WHERE shared_with_email = auth.jwt() ->> 'email' AND permission = 'WRITE'))
    )
  );

-- 5. Fix custom_list_items UPDATE policy
DROP POLICY IF EXISTS "Users can update items in their own or shared lists with WRITE " ON public.custom_list_items;
DROP POLICY IF EXISTS "Users can update items in their own or shared lists with WRITE" ON public.custom_list_items;
CREATE POLICY "Users can update items in their own or shared lists with WRITE" ON public.custom_list_items
  FOR UPDATE
  USING (
    (auth.uid() = user_id) OR 
    (list_id IN (SELECT id FROM public.custom_lists WHERE user_id = auth.uid())) OR 
    (list_id IN (SELECT list_id FROM public.custom_list_shares WHERE shared_with_email = auth.jwt() ->> 'email' AND permission = 'WRITE'))
  );

-- 6. Fix custom_list_items DELETE policy
DROP POLICY IF EXISTS "Users can delete items in their own or shared lists with WRITE " ON public.custom_list_items;
DROP POLICY IF EXISTS "Users can delete items in their own or shared lists with WRITE" ON public.custom_list_items;
CREATE POLICY "Users can delete items in their own or shared lists with WRITE" ON public.custom_list_items
  FOR DELETE
  USING (
    (auth.uid() = user_id) OR 
    (list_id IN (SELECT id FROM public.custom_lists WHERE user_id = auth.uid())) OR 
    (list_id IN (SELECT list_id FROM public.custom_list_shares WHERE shared_with_email = auth.jwt() ->> 'email' AND permission = 'WRITE'))
  );
