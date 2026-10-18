import type {
  Account,
  AccountBalanceAdjustmentInput,
  CreateAccountInput,
  PlainAccountType,
} from '@hf/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';

const KEY = ['accounts'];

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
  return useMutation({
    mutationFn: (input: CreateAccountInput) => api.post<Account>('/api/accounts', input),
  });
}

export function useAdjustAccountBalance() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AccountBalanceAdjustmentInput }) =>
      api.post<Account>(`/api/accounts/${id}/balance`, input),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/accounts/${id}`),
  });
}
