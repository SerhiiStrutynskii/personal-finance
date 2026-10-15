import type { ListTransactionsQuery, Transaction, TransactionInput } from '@hf/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/** Оновлює все, що залежить від транзакцій; потрібне й іншим фічам, що створюють транзакції. */
export function useInvalidateTransactionData() {
  const queryClient = useQueryClient();
  // Транзакції змінюють і суми бюджету та доходів місяця, баланси рахунків і борги по картках.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY }),
      queryClient.invalidateQueries({ queryKey: ['budget'] }),
      queryClient.invalidateQueries({ queryKey: ['incomes'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['debts'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['goals'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
}

/** Створює транзакцію або повністю замінює наявну, якщо передано id. */
export function useSaveTransaction() {
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string | undefined; input: TransactionInput }) =>
      id
        ? api.put<Transaction>(`/api/transactions/${id}`, input)
        : api.post<Transaction>('/api/transactions', input),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/transactions/${id}`),
    onSuccess: invalidate,
  });
}
