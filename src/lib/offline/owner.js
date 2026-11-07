import { supabase } from '../supabase';

let identity;
export const setOfflineIdentity = (userId) => { identity = userId || null; };
export async function offlineIdentity() {
  if (identity !== undefined) return identity;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session?.user?.id || null;
}
export async function requireOfflineIdentity() {
  const userId = await offlineIdentity();
  if (!userId) throw new Error('offline_auth_required');
  return userId;
}
export const queueOwner = (entry) => entry.owner_id || (entry.table_name?.startsWith('mf_') ? entry.payload?.user_id : null) || null;
