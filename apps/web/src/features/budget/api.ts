import type { BudgetView, CreateBudgetInput, CreateExpenseLineInput } from '@hf/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../../shared/api/index.ts';

const budgetKey = (month: string) => ['budget', month];

/** Бюджет місяця з розрахунками; null, якщо бюджет на цей місяць ще не створено. */
export function useBudget(month: string) {
  return useQuery({
    queryKey: budgetKey(month),
    queryFn: async (): Promise<BudgetView | null> => {
      try {
        return await api.get<BudgetView>('/api/budgets', { month });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
}

export const useCreateBudget = () =>
  useMutation({
    mutationFn: (input: CreateBudgetInput) => api.post<BudgetView>('/api/budgets', input),
  });

export const useSaveExpenseLine = (budgetId: string) =>
  useMutation({
    mutationFn: ({
      lineId,
      input,
    }: {
      lineId?: string | undefined;
      input: CreateExpenseLineInput;
    }) =>
      lineId
        ? api.patch<BudgetView>(`/api/budgets/${budgetId}/expense-lines/${lineId}`, {
            plannedAmount: input.plannedAmount,
          })
        : api.post<BudgetView>(`/api/budgets/${budgetId}/expense-lines`, input),
  });

export const useDeleteExpenseLine = (budgetId: string) =>
  useMutation({
    mutationFn: (lineId: string) =>
      api.delete<BudgetView>(`/api/budgets/${budgetId}/expense-lines/${lineId}`),
  });
