import type { CreateProductInput, Product, UpdateProductInput } from '@hf/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<{ items: Product[] }>('/api/products')).items,
  });
}

/** Створює продукт або змінює наявний, якщо передано id. */
export function useSaveProduct() {
  return useMutation({
    mutationFn: (
      request:
        { id: string; input: UpdateProductInput } | { id?: undefined; input: CreateProductInput },
    ) =>
      request.id
        ? api.patch<Product>(`/api/products/${request.id}`, request.input)
        : api.post<Product>('/api/products', request.input),
  });
}

export function useDeleteProduct() {
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/products/${id}`) });
}
