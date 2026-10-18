import type {
  CardPaymentInput,
  createDebtSchema,
  Debt,
  DebtAdjustmentInput,
  DebtChargeInput,
  DebtDetails,
  DebtPaymentInput,
  DebtsOverview,
  PaymentPreview,
  UpdateDebtInput,
} from '@hf/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { api } from '../../shared/api/index.ts';

const DEBTS_KEY = ['debts'];

/** Тіло запиту на створення боргу — до значень за замовчуванням, які підставляє схема. */
export type CreateDebtBody = z.input<typeof createDebtSchema>;

export function useDebts() {
  return useQuery({
    queryKey: [...DEBTS_KEY, 'overview'],
    queryFn: () => api.get<DebtsOverview>('/api/debts'),
  });
}

export function useDebt(id: string) {
  return useQuery({
    queryKey: [...DEBTS_KEY, 'detail', id],
    queryFn: () => api.get<DebtDetails>(`/api/debts/${id}`),
  });
}

/** Розбивка й прогноз для суми платежу; null — запит не робиться. */
export function usePaymentPreview(id: string, amount: number | null) {
  return useQuery({
    queryKey: [...DEBTS_KEY, 'preview', id, amount],
    queryFn: () =>
      api.get<PaymentPreview>(`/api/debts/${id}/payment-preview`, { amount: amount ?? 0 }),
    enabled: amount !== null,
    placeholderData: keepPreviousData,
  });
}

export const useSaveDebt = () =>
  useMutation({
    mutationFn: (
      request: { id: string; input: UpdateDebtInput } | { id?: undefined; input: CreateDebtBody },
    ) =>
      request.id
        ? api.patch<Debt>(`/api/debts/${request.id}`, request.input)
        : api.post<Debt>('/api/debts', request.input),
  });

export const useCloseDebt = () =>
  useMutation({ mutationFn: (id: string) => api.post<Debt>(`/api/debts/${id}/close`, {}) });

export const useDeleteDebt = () =>
  useMutation({ mutationFn: (id: string) => api.delete(`/api/debts/${id}`) });

export const usePayDebt = () =>
  useMutation({
    mutationFn: ({ id, input }: { id: string; input: DebtPaymentInput }) =>
      api.post<DebtDetails>(`/api/debts/${id}/payments`, input),
  });

export const useChargeDebt = () =>
  useMutation({
    mutationFn: ({ id, input }: { id: string; input: DebtChargeInput }) =>
      api.post<DebtDetails>(`/api/debts/${id}/charges`, input),
  });

export const usePayCard = () =>
  useMutation({
    mutationFn: ({ id, input }: { id: string; input: CardPaymentInput }) =>
      api.post<DebtDetails>(`/api/debts/${id}/card-payments`, input),
  });

export const useChargeCardFee = () =>
  useMutation({
    mutationFn: ({ id, input }: { id: string; input: DebtChargeInput }) =>
      api.post<DebtDetails>(`/api/debts/${id}/card-fees`, input),
  });

export const useAdjustDebt = () =>
  useMutation({
    mutationFn: ({ id, input }: { id: string; input: DebtAdjustmentInput }) =>
      api.post<DebtDetails>(`/api/debts/${id}/adjustments`, input),
  });

export const useDeleteDebtEntry = () =>
  useMutation({
    mutationFn: ({ id, entryId }: { id: string; entryId: string }) =>
      api.delete(`/api/debts/${id}/entries/${entryId}`),
  });
