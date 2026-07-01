import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/**
 * Hook to query finance transactions with customizable filters.
 */
export function useFinances({ userId, type, month, year, isGeneral }) {
  return useQuery({
    queryKey: ['finances', { userId, type, month, year, isGeneral }],
    queryFn: async () => {
      if (!userId) return [];
      let query = supabase.from('finances').select('*').eq('user_id', userId);

      if (type) {
        query = query.eq('type', type);
      }

      if (isGeneral) {
        const startOfYear = `${year}-01-01`;
        const endOfYear = `${year}-12-31`;
        query = query.gte('payment_date', startOfYear).lte('payment_date', endOfYear);
      } else if (month !== undefined && month !== null) {
        const monthStr = String(month + 1).padStart(2, '0');
        const lastDayDate = new Date(year, month + 1, 0).getDate();
        const start = `${year}-${monthStr}-01`;
        const end = `${year}-${monthStr}-${String(lastDayDate).padStart(2, '0')}`;
        query = query.gte('payment_date', start).lte('payment_date', end);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}

/**
 * Hook to query finance categories.
 */
export function useFinanceCategories() {
  return useQuery({
    queryKey: ['finance_categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('finance_categories').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Hook to query finance responsibles.
 */
export function useFinanceResponsibles() {
  return useQuery({
    queryKey: ['finance_responsibles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('finance_responsibles').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Hook to query notification settings.
 */
export function useNotificationSettings() {
  return useQuery({
    queryKey: ['notification_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('notification_settings').select('*').maybeSingle();
      if (error) throw error;
      return data || null;
    },
  });
}

function matchesFilters(transaction, filters) {
  if (filters.userId && transaction.user_id !== filters.userId) {
    return false;
  }
  
  if (filters.type && transaction.type !== filters.type) {
    return false;
  }

  if (transaction.payment_date) {
    const [yearStr, monthStr] = transaction.payment_date.split('-');
    const txYear = parseInt(yearStr, 10);
    const txMonth = parseInt(monthStr, 10) - 1;

    if (filters.isGeneral) {
      if (filters.year && txYear !== filters.year) {
        return false;
      }
    } else {
      if (filters.year && txYear !== filters.year) {
        return false;
      }
      if (filters.month !== undefined && filters.month !== null && txMonth !== filters.month) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Mutation to create a new transaction.
 */
export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newTransaction) => {
      const { data, error } = await supabase.from('finances').insert([newTransaction]).select();
      if (error) throw error;
      return data[0];
    },
    onMutate: async (newTransaction) => {
      await queryClient.cancelQueries({ queryKey: ['finances'] });
      const previousQueries = queryClient.getQueriesData({ queryKey: ['finances'] });

      const optimisticId = 'optimistic-' + Date.now();
      const optimisticTx = {
        id: optimisticId,
        created_at: new Date().toISOString(),
        ...newTransaction,
      };

      const queries = queryClient.getQueriesData({ queryKey: ['finances'] });
      queries.forEach(([queryKey, oldData]) => {
        if (!oldData || !Array.isArray(oldData)) return;
        const filters = queryKey[1] || {};
        if (matchesFilters(optimisticTx, filters)) {
          queryClient.setQueryData(queryKey, [...oldData, optimisticTx]);
        }
      });

      return { previousQueries, optimisticId };
    },
    onSuccess: (savedTx, variables, context) => {
      const queries = queryClient.getQueriesData({ queryKey: ['finances'] });
      queries.forEach(([queryKey, oldData]) => {
        if (!oldData || !Array.isArray(oldData)) return;
        const updatedData = oldData.map(tx => 
          tx.id === context.optimisticId ? savedTx : tx
        );
        queryClient.setQueryData(queryKey, updatedData);
      });
    },
    onError: (err, newTransaction, context) => {
      if (context?.previousQueries) {
        context.previousQueries.forEach(([queryKey, value]) => {
          queryClient.setQueryData(queryKey, value);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['finances'] });
    },
  });
}

/**
 * Mutation to update an existing transaction.
 */
export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updatedFields }) => {
      const { data, error } = await supabase.from('finances').update(updatedFields).eq('id', id).select();
      if (error) throw error;
      return data[0];
    },
    onMutate: async (updatedTransaction) => {
      await queryClient.cancelQueries({ queryKey: ['finances'] });
      const previousQueries = queryClient.getQueriesData({ queryKey: ['finances'] });

      const queries = queryClient.getQueriesData({ queryKey: ['finances'] });
      queries.forEach(([queryKey, oldData]) => {
        if (!oldData || !Array.isArray(oldData)) return;
        const filters = queryKey[1] || {};
        
        const existingTx = oldData.find(tx => tx.id === updatedTransaction.id);
        const exists = !!existingTx;
        const mergedTx = existingTx ? { ...existingTx, ...updatedTransaction } : updatedTransaction;
        const matches = matchesFilters(mergedTx, filters);

        let newData;
        if (matches) {
          if (exists) {
            newData = oldData.map(tx => tx.id === updatedTransaction.id ? mergedTx : tx);
          } else {
            newData = [...oldData, mergedTx];
          }
        } else {
          if (exists) {
            newData = oldData.filter(tx => tx.id !== updatedTransaction.id);
          } else {
            newData = oldData;
          }
        }
        
        queryClient.setQueryData(queryKey, newData);
      });

      return { previousQueries };
    },
    onSuccess: (savedTx) => {
      const queries = queryClient.getQueriesData({ queryKey: ['finances'] });
      queries.forEach(([queryKey, oldData]) => {
        if (!oldData || !Array.isArray(oldData)) return;
        const filters = queryKey[1] || {};
        
        const exists = oldData.some(tx => tx.id === savedTx.id);
        const matches = matchesFilters(savedTx, filters);

        let newData;
        if (matches) {
          if (exists) {
            newData = oldData.map(tx => tx.id === savedTx.id ? savedTx : tx);
          } else {
            newData = [...oldData, savedTx];
          }
        } else {
          if (exists) {
            newData = oldData.filter(tx => tx.id !== savedTx.id);
          } else {
            newData = oldData;
          }
        }
        
        queryClient.setQueryData(queryKey, newData);
      });
    },
    onError: (err, updatedTransaction, context) => {
      if (context?.previousQueries) {
        context.previousQueries.forEach(([queryKey, value]) => {
          queryClient.setQueryData(queryKey, value);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['finances'] });
    },
  });
}

/**
 * Mutation to delete a transaction.
 */
export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('finances').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['finances'] });
      const previousQueries = queryClient.getQueriesData({ queryKey: ['finances'] });

      queryClient.setQueriesData({ queryKey: ['finances'] }, (old) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((tx) => tx.id !== id);
      });

      return { previousQueries };
    },
    onError: (err, id, context) => {
      if (context?.previousQueries) {
        context.previousQueries.forEach(([queryKey, value]) => {
          queryClient.setQueryData(queryKey, value);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['finances'] });
    },
  });
}

/**
 * Mutation to mark a transaction as paid.
 */
export function useMarkAsPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { data, error } = await supabase.from('finances').update({ status: 'PAGO' }).eq('id', id).select();
      if (error) throw error;
      return data[0];
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['finances'] });
      const previousQueries = queryClient.getQueriesData({ queryKey: ['finances'] });

      queryClient.setQueriesData({ queryKey: ['finances'] }, (old) => {
        if (!old || !Array.isArray(old)) return old;
        return old.map((tx) => (tx.id === id ? { ...tx, status: 'PAGO' } : tx));
      });

      return { previousQueries };
    },
    onError: (err, id, context) => {
      if (context?.previousQueries) {
        context.previousQueries.forEach(([queryKey, value]) => {
          queryClient.setQueryData(queryKey, value);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['finances'] });
    },
  });
}

/**
 * Mutation to copy transactions from the previous month.
 */
export function useCopyMonthTransactions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ prevMonth, prevYear, selectedMonth, selectedYear }) => {
      const lastDayDate = new Date(prevYear, prevMonth + 1, 0).getDate();
      const start = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
      const end = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(lastDayDate).padStart(2, '0')}`;

      const { data: previousData, error: fetchError } = await supabase
        .from('finances')
        .select('*')
        .gte('payment_date', start)
        .lte('payment_date', end);

      if (fetchError) throw fetchError;
      if (!previousData || previousData.length === 0) {
        throw new Error('Nenhuma transação encontrada no mês anterior.');
      }

      const newEntries = previousData.map(item => {
        const { id: _id, created_at: _created_at, email_sent: _email_sent, payment_date, ...rest } = item;
        const originalDate = new Date(payment_date);
        const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        const newDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(Math.min(originalDate.getDate(), lastDayOfMonth)).padStart(2, '0')}`;
        return { ...rest, payment_date: newDate, status: 'PENDENTE' };
      });

      const { error: insertError } = await supabase.from('finances').insert(newEntries);
      if (insertError) throw insertError;
      return newEntries.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finances'] });
    },
  });
}

/**
 * Mutation to create a category.
 */
export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (category) => {
      const { data, error } = await supabase.from('finance_categories').insert([category]).select();
      if (error) throw error;
      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance_categories'] });
    },
  });
}

/**
 * Mutation to delete a category.
 */
export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('finance_categories').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance_categories'] });
    },
  });
}

/**
 * Mutation to create a responsible.
 */
export function useCreateResponsible() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (responsible) => {
      const { data, error } = await supabase.from('finance_responsibles').insert([responsible]).select();
      if (error) throw error;
      return data[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance_responsibles'] });
    },
  });
}

/**
 * Mutation to delete a responsible.
 */
export function useDeleteResponsible() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('finance_responsibles').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance_responsibles'] });
    },
  });
}

/**
 * Mutation to set a responsible as main/default.
 */
export function useSetMainResponsible() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error: error1 } = await supabase.from('finance_responsibles').update({ is_main: false }).neq('id', id);
      if (error1) throw error1;
      const { error: error2 } = await supabase.from('finance_responsibles').update({ is_main: true }).eq('id', id);
      if (error2) throw error2;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance_responsibles'] });
    },
  });
}
