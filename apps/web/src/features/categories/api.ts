import type { Category, CategoryKind, CreateCategoryInput } from '@hf/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';

const KEY = ['categories'];

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  expense: 'Витрати',
  income: 'Доходи',
};
export const CATEGORY_KINDS = Object.keys(CATEGORY_KIND_LABELS) as CategoryKind[];

export function useCategories() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<{ items: Category[] }>('/api/categories')).items,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) => api.post<Category>('/api/categories', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/categories/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
