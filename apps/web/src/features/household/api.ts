import type { CreatedInvite, Household, InvitePreview, UpdateHouseholdInput } from '@hf/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';

/**
 * Учасників додають і з інших пристроїв (реєстрація за посиланням), тож сторінка
 * перечитується щоразу, а не береться з кешу.
 */
export function useHousehold() {
  return useQuery({
    queryKey: ['household'],
    queryFn: () => api.get<Household>('/api/household'),
    staleTime: 0,
  });
}

export function useRenameHousehold() {
  return useMutation({
    mutationFn: (input: UpdateHouseholdInput) => api.patch<Household>('/api/household', input),
  });
}

export function useCreateInvite() {
  return useMutation({
    mutationFn: () => api.post<CreatedInvite>('/api/household/invites', {}),
  });
}

export function useRevokeInvite() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/household/invites/${id}`),
  });
}

export function useRemoveMember() {
  return useMutation({
    mutationFn: (userId: string) => api.delete(`/api/household/members/${userId}`),
  });
}

/** Передає роль власника учаснику; відповідь — домогосподарство вже з погляду учасника. */
export function useTransferOwnership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.post<Household>('/api/household/owner', { userId }),
    onSuccess: (household) => queryClient.setQueryData(['household'], household),
  });
}

export function useLeaveHousehold() {
  return useMutation({ mutationFn: () => api.post('/api/household/leave', {}) });
}

/** Відкриті дані запрошення для сторінки реєстрації; недійсне — помилка 404. */
export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ['invite', token],
    queryFn: () =>
      api.get<InvitePreview>(`/api/auth/invites/${encodeURIComponent(token)}`, undefined, {
        auth: false,
      }),
  });
}

/** Посилання, яке власник надсилає учаснику. */
export const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`;
