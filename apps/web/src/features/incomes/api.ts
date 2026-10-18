import type {
  IncomeSource,
  IncomeSourceInput,
  IncomesView,
  OneTimeIncomeInput,
  ReceiveOccurrenceInput,
  Transaction,
  UpdateOccurrenceInput,
} from '@hf/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';

const INCOMES_KEY = ['incomes'];
const SOURCES_KEY = ['income-sources'];

export function useIncomes(month: string) {
  return useQuery({
    queryKey: [...INCOMES_KEY, month],
    queryFn: () => api.get<IncomesView>('/api/incomes', { month }),
  });
}

export function useIncomeSources() {
  return useQuery({
    queryKey: SOURCES_KEY,
    queryFn: async () => (await api.get<{ items: IncomeSource[] }>('/api/income-sources')).items,
  });
}

export const useSaveSource = () =>
  useMutation({
    mutationFn: ({ id, input }: { id?: string | undefined; input: IncomeSourceInput }) =>
      id
        ? api.patch<IncomeSource>(`/api/income-sources/${id}`, input)
        : api.post<IncomeSource>('/api/income-sources', input),
  });

export const useDeactivateSource = () =>
  useMutation({
    mutationFn: (id: string) => api.post<IncomeSource>(`/api/income-sources/${id}/deactivate`, {}),
  });

export const useDeleteSource = () =>
  useMutation({ mutationFn: (id: string) => api.delete(`/api/income-sources/${id}`) });

export const useUpdateOccurrence = () =>
  useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateOccurrenceInput }) =>
      api.patch(`/api/income-occurrences/${id}`, patch),
  });

export const useReceiveOccurrence = () =>
  useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReceiveOccurrenceInput }) =>
      api.post<Transaction>(`/api/income-occurrences/${id}/receive`, input),
  });

export const useCreateOneTimeIncome = () =>
  useMutation({
    mutationFn: (input: OneTimeIncomeInput) =>
      api.post<Transaction>('/api/incomes/one-time', input),
  });
