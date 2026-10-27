import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/**
 * Opções da integração do lançamento com outros módulos.
 *
 * As consultas só rodam quando o bloco está ligado (`enabled`) — abrir a
 * tela de lançamento não baixa viagens nem vínculos à toa. Em edição, o
 * vínculo existente é carregado para pré-preencher o painel; uma falha
 * (tabela ainda sem a migration, por exemplo) não quebra a tela.
 */
export function useMFLinkTrips(user, enabled = false) {
  return useQuery({
    queryKey: ['mf-link-trips', user?.id],
    enabled: !!user?.id && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('id,title,start_date,end_date,currencies')
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Contas de investimento para o bloco de integração. Só baixa quando o
 * usuário liga o bloco; a tela filtra pela moeda da conta do lançamento.
 */
export function useMFLinkInvestments(user, enabled = false) {
  return useQuery({
    queryKey: ['mf-link-investments', user?.id],
    enabled: !!user?.id && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('investment_accounts')
        .select('id,name,currency,institution:investment_institutions(name)')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMFTxLink(user, txId) {
  return useQuery({
    queryKey: ['mf-tx-link', txId],
    enabled: !!user?.id && !!txId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mf_tx_links')
        .select('*')
        .eq('transaction_id', txId)
        .maybeSingle();
      if (error) {
        if (import.meta.env.DEV) console.warn('[MF] vínculo indisponível', error);
        return null;
      }
      return data ?? null;
    },
  });
}
