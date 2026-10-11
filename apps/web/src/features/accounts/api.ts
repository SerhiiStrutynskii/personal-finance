import type { Account, CreateAccountInput } from '@hf/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';

const KEY = ['accounts'];

export const ACCOUNT_TYPE_LABELS: Record<Account['type'], string> = {
  card: 'Картка',
  cash: 'Готівка',
  deposit: 'Депозит',
};

export function useAccounts() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<{ items: Account[] }>('/api/accounts')).items,
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => api.post<Account>('/api/accounts', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/accounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
