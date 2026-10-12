import type { AnalyticsMonth, AnalyticsTrend, TrendLength } from '@hf/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';

const ANALYTICS_KEY = ['analytics'];

export function useMonthAnalytics(month: string) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, 'month', month],
    queryFn: () => api.get<AnalyticsMonth>('/api/analytics/month', { month }),
    placeholderData: keepPreviousData,
  });
}

export function useTrendAnalytics(month: string, months: TrendLength) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, 'trend', month, months],
    queryFn: () => api.get<AnalyticsTrend>('/api/analytics/trend', { month, months }),
    placeholderData: keepPreviousData,
  });
}
