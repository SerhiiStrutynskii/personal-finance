import type { Dashboard } from '@hf/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';

export const DASHBOARD_KEY = ['dashboard'];

/** Зведення поточного місяця. */
export function useDashboard() {
  return useQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: () => api.get<Dashboard>('/api/dashboard'),
  });
}
