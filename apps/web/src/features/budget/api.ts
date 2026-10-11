import type {
  BudgetStatus,
  BudgetView,
  CreateBudgetInput,
  CreateExpenseLineInput,
  CreateIncomeLineInput,
  UpdateIncomeLineInput,
} from '@hf/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../shared/api/index.ts';
import { TRANSACTIONS_KEY } from '../transactions/api.ts';

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

/** Кожна зміна бюджету повертає його цілком, тож кеш оновлюється без повторного запиту. */
function useBudgetMutation<TInput>(request: (input: TInput) => Promise<BudgetView>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (budget) => queryClient.setQueryData(budgetKey(budget.month), budget),
  });
}

export const useCreateBudget = () =>
  useBudgetMutation((input: CreateBudgetInput) => api.post<BudgetView>('/api/budgets', input));

export const useSetBudgetStatus = (budgetId: string) =>
  useBudgetMutation((status: BudgetStatus) =>
    api.patch<BudgetView>(`/api/budgets/${budgetId}`, { status }),
  );

export const useSaveIncomeLine = (budgetId: string) =>
  useBudgetMutation(
    ({ lineId, input }: { lineId?: string | undefined; input: CreateIncomeLineInput }) =>
      lineId
        ? api.patch<BudgetView>(
            `/api/budgets/${budgetId}/income-lines/${lineId}`,
            input satisfies UpdateIncomeLineInput,
          )
        : api.post<BudgetView>(`/api/budgets/${budgetId}/income-lines`, input),
  );

export function useDeleteIncomeLine(budgetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) =>
      api.delete<BudgetView>(`/api/budgets/${budgetId}/income-lines/${lineId}`),
    onSuccess: (budget) => {
      queryClient.setQueryData(budgetKey(budget.month), budget);
      // Доходи видаленої статті втратили прив'язку — списки транзакцій застаріли.
      return queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY });
    },
  });
}

export const useSaveExpenseLine = (budgetId: string) =>
  useBudgetMutation(
    ({ lineId, input }: { lineId?: string | undefined; input: CreateExpenseLineInput }) =>
      lineId
        ? api.patch<BudgetView>(`/api/budgets/${budgetId}/expense-lines/${lineId}`, {
            plannedAmount: input.plannedAmount,
          })
        : api.post<BudgetView>(`/api/budgets/${budgetId}/expense-lines`, input),
  );

export const useDeleteExpenseLine = (budgetId: string) =>
  useBudgetMutation((lineId: string) =>
    api.delete<BudgetView>(`/api/budgets/${budgetId}/expense-lines/${lineId}`),
  );
