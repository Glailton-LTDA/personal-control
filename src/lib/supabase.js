import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Converte uma URL pública ou um caminho de arquivo em uma URL assinada temporária.
 * Útil para acessar arquivos em buckets privados de forma segura.
 */
export const getSignedUrl = async (bucket, pathOrUrl, expiresIn = 3600) => {
  if (!pathOrUrl) return null;

  let path = pathOrUrl;
  
  // Se for uma URL completa do Supabase, extrai apenas o caminho relativo ao bucket
  if (pathOrUrl.includes('/storage/v1/object/public/')) {
    const parts = pathOrUrl.split(`/storage/v1/object/public/${bucket}/`);
    if (parts.length > 1) {
      path = parts[1];
    }
  } else if (pathOrUrl.includes('/storage/v1/object/authenticated/')) {
    const parts = pathOrUrl.split(`/storage/v1/object/authenticated/${bucket}/`);
    if (parts.length > 1) {
      path = parts[1];
    }
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error('Erro ao gerar URL assinada:', error);
    return pathOrUrl; // Fallback para a original se falhar
  }

  return data.signedUrl;
};
