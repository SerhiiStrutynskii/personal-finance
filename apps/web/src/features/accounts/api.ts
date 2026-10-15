import type {
  Account,
  AccountBalanceAdjustmentInput,
  CreateAccountInput,
  PlainAccountType,
} from '@hf/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';
import { useInvalidateTransactionData } from '../transactions/api.ts';

export const ACCOUNTS_KEY = ['accounts'];
const KEY = ACCOUNTS_KEY;

export const ACCOUNT_TYPE_LABELS: Record<Account['type'], string> = {
  card: 'Картка',
  cash: 'Готівка',
  deposit: 'Депозит',
  credit_card: 'Кредитна картка',
};

/** Типи, які можна вибрати під час створення рахунку; кредитна картка створюється з боргом. */
export const PLAIN_ACCOUNT_TYPES: PlainAccountType[] = ['card', 'cash', 'deposit'];

/** Рахунки, які можна вибрати для нового запису: архівні нових транзакцій не приймають. */
export const activeAccounts = (accounts: readonly Account[] | undefined): Account[] =>
  (accounts ?? []).filter((account) => !account.isArchived);

export function useAccounts() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<{ items: Account[] }>('/api/accounts')).items,
  });
}

export function useCreateAccount() {
  // Початковий залишок — транзакція: змінюються капітал, цілі й головна, а не лише список рахунків.
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => api.post<Account>('/api/accounts', input),
    onSuccess: invalidate,
  });
}

export function useAdjustAccountBalance() {
  // Коригування — транзакція: як і початковий залишок, змінює капітал, цілі й головну.
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AccountBalanceAdjustmentInput }) =>
      api.post<Account>(`/api/accounts/${id}/balance`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/accounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
