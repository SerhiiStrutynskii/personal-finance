import type {
  Goal,
  GoalContributionInput,
  GoalsList,
  PayoffPlanView,
  UpdateGoalInput,
  createGoalSchema,
} from '@hf/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { api } from '../../shared/api/index.ts';
import { TRANSACTIONS_KEY } from '../transactions/api.ts';

const GOALS_KEY = ['goals'];

/** Тіло запиту на створення цілі — до значень за замовчуванням, які підставляє схема. */
export type CreateGoalBody = z.input<typeof createGoalSchema>;
export type PayoffStrategy = PayoffPlanView['strategy'];

export function useGoals() {
  return useQuery({
    queryKey: [...GOALS_KEY, 'list'],
    queryFn: () => api.get<GoalsList>('/api/goals'),
  });
}

export function useGoal(id: string) {
  return useQuery({
    queryKey: [...GOALS_KEY, 'detail', id],
    queryFn: () => api.get<Goal>(`/api/goals/${id}`),
  });
}

/** План погашення для додаткового платежу й стратегії; нічого не зберігає. */
export function usePayoffPlan(id: string, extra: number, strategy: PayoffStrategy) {
  return useQuery({
    queryKey: [...GOALS_KEY, 'plan', id, extra, strategy],
    queryFn: () => api.get<PayoffPlanView>(`/api/goals/${id}/payoff-plan`, { extra, strategy }),
    placeholderData: keepPreviousData,
  });
}

/** Зміна цілей оновлює цілі, а поповнення — ще й баланси рахунків, перекази та аналітику. */
function useGoalMutation<TInput, TResult>(request: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () =>
      Promise.all(
        [GOALS_KEY, ['accounts'], ['analytics'], TRANSACTIONS_KEY].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export const useSaveGoal = () =>
  useGoalMutation(
    (
      request: { id: string; input: UpdateGoalInput } | { id?: undefined; input: CreateGoalBody },
    ) =>
      request.id
        ? api.patch<Goal>(`/api/goals/${request.id}`, request.input)
        : api.post<Goal>('/api/goals', request.input),
  );

export const useArchiveGoal = () =>
  useGoalMutation((id: string) => api.post<Goal>(`/api/goals/${id}/archive`, {}));

export const useDeleteGoal = () => useGoalMutation((id: string) => api.delete(`/api/goals/${id}`));

export const useContribute = () =>
  useGoalMutation(({ id, input }: { id: string; input: GoalContributionInput }) =>
    api.post<Goal>(`/api/goals/${id}/contributions`, input),
  );
