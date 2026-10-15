import type { Category, CategoryKind, CreateCategoryInput, UpdateCategoryInput } from '@hf/shared';
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

/** Перейменування чи перенесення категорії. Назви категорій є в бюджеті й аналітиці. */
export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      api.patch<Category>(`/api/categories/${id}`, input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: KEY }),
        queryClient.invalidateQueries({ queryKey: ['budget'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/categories/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
