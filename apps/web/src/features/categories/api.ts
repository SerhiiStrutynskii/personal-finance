import type { Category, CategoryKind, CreateCategoryInput, UpdateCategoryInput } from '@hf/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';

const KEY = ['categories'];

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  expense: 'Витрати',
  income: 'Прибутки',
};
export const CATEGORY_KINDS = Object.keys(CATEGORY_KIND_LABELS) as CategoryKind[];

export function useCategories() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<{ items: Category[] }>('/api/categories')).items,
  });
}

export function useCreateCategory() {
  return useMutation({
    mutationFn: (input: CreateCategoryInput) => api.post<Category>('/api/categories', input),
  });
}

/** Перейменування чи перенесення категорії. */
export function useUpdateCategory() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      api.patch<Category>(`/api/categories/${id}`, input),
  });
}

export function useDeleteCategory() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/categories/${id}`),
  });
}
