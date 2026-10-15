import type {
  IncomeSource,
  IncomeSourceInput,
  IncomesView,
  OneTimeIncomeInput,
  ReceiveOccurrenceInput,
  Transaction,
  UpdateOccurrenceInput,
} from '@hf/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';
import { TRANSACTIONS_KEY } from '../transactions/api.ts';

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

/** Будь-яка зміна прибутків оновлює прибутки місяця, джерела, бюджет і списки транзакцій. */
function useIncomeMutation<TInput, TResult>(request: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () =>
      Promise.all(
        [
          INCOMES_KEY,
          SOURCES_KEY,
          ['budget'],
          ['accounts'],
          ['debts'],
          ['analytics'],
          ['goals'],
          TRANSACTIONS_KEY,
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });
}

export const useSaveSource = () =>
  useIncomeMutation(({ id, input }: { id?: string | undefined; input: IncomeSourceInput }) =>
    id
      ? api.patch<IncomeSource>(`/api/income-sources/${id}`, input)
      : api.post<IncomeSource>('/api/income-sources', input),
  );

export const useDeactivateSource = () =>
  useIncomeMutation((id: string) =>
    api.post<IncomeSource>(`/api/income-sources/${id}/deactivate`, {}),
  );

export const useDeleteSource = () =>
  useIncomeMutation((id: string) => api.delete(`/api/income-sources/${id}`));

export const useUpdateOccurrence = () =>
  useIncomeMutation(({ id, patch }: { id: string; patch: UpdateOccurrenceInput }) =>
    api.patch(`/api/income-occurrences/${id}`, patch),
  );

export const useReceiveOccurrence = () =>
  useIncomeMutation(({ id, input }: { id: string; input: ReceiveOccurrenceInput }) =>
    api.post<Transaction>(`/api/income-occurrences/${id}/receive`, input),
  );

export const useCreateOneTimeIncome = () =>
  useIncomeMutation((input: OneTimeIncomeInput) =>
    api.post<Transaction>('/api/incomes/one-time', input),
  );
