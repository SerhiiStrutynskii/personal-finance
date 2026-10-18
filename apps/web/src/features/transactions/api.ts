import type { ListTransactionsQuery, Transaction, TransactionInput } from '@hf/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';

export const TRANSACTIONS_KEY = ['transactions'];

export interface TransactionPage {
  items: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

export function useTransactions(query: Partial<ListTransactionsQuery>) {
  return useQuery({
    queryKey: [...TRANSACTIONS_KEY, query],
    queryFn: () => api.get<TransactionPage>('/api/transactions', query),
    placeholderData: keepPreviousData,
  });
}

/** Створює транзакцію або повністю замінює наявну, якщо передано id. */
export function useSaveTransaction() {
  return useMutation({
    mutationFn: ({ id, input }: { id?: string | undefined; input: TransactionInput }) =>
      id
        ? api.put<Transaction>(`/api/transactions/${id}`, input)
        : api.post<Transaction>('/api/transactions', input),
  });
}

export function useDeleteTransaction() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/transactions/${id}`),
  });
}
