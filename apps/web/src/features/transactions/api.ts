import type { ListTransactionsQuery, Transaction, TransactionInput } from '@hf/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';

const LIST_KEY = ['transactions'];
const ITEM_KEY = ['transaction'];

export interface TransactionPage {
  items: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

export function useTransactions(query: Partial<ListTransactionsQuery>) {
  return useQuery({
    queryKey: [...LIST_KEY, query],
    queryFn: () => api.get<TransactionPage>('/api/transactions', query),
    placeholderData: keepPreviousData,
  });
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: [...ITEM_KEY, id],
    queryFn: () => api.get<Transaction>(`/api/transactions/${id}`),
    enabled: id !== undefined,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: LIST_KEY }),
      queryClient.invalidateQueries({ queryKey: ITEM_KEY }),
    ]);
}

/** Створює транзакцію або повністю замінює наявну, якщо передано id. */
export function useSaveTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string | undefined; input: TransactionInput }) =>
      id
        ? api.put<Transaction>(`/api/transactions/${id}`, input)
        : api.post<Transaction>('/api/transactions', input),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/transactions/${id}`),
    onSuccess: invalidate,
  });
}
