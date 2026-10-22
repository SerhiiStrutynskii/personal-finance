import type {
  AddShoppingListItemInput,
  CreateProductInput,
  CreateShoppingListInput,
  Product,
  ProductPriceHistory,
  ShoppingAnalytics,
  ShoppingList,
  ShoppingListSummary,
  UpdateProductInput,
  UpdateShoppingListItemInput,
} from '@hf/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';

/** Довідник продуктів; archived — разом з архівними. */
export function useProducts(archived = false) {
  return useQuery({
    queryKey: ['products', { archived }],
    queryFn: async () =>
      (await api.get<{ items: Product[] }>('/api/products', archived ? { archived: 'true' } : {}))
        .items,
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

// --- Списки покупок ---

const LISTS_KEY = ['shopping-lists'];

export function useShoppingLists() {
  return useQuery({
    queryKey: LISTS_KEY,
    queryFn: async () =>
      (await api.get<{ items: ShoppingListSummary[] }>('/api/shopping-lists')).items,
  });
}

export function useShoppingList(id: string) {
  return useQuery({
    queryKey: [...LISTS_KEY, id],
    queryFn: () => api.get<ShoppingList>(`/api/shopping-lists/${id}`),
  });
}

/** Створює список або перейменовує наявний, якщо передано id. */
export function useSaveShoppingList() {
  return useMutation({
    mutationFn: ({ id, input }: { id?: string | undefined; input: CreateShoppingListInput }) =>
      id
        ? api.patch<ShoppingList>(`/api/shopping-lists/${id}`, input)
        : api.post<ShoppingList>('/api/shopping-lists', input),
  });
}

export function useDeleteShoppingList() {
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/shopping-lists/${id}`) });
}

export function useAddShoppingListItem(listId: string) {
  return useMutation({
    mutationFn: (input: AddShoppingListItemInput) =>
      api.post<ShoppingList>(`/api/shopping-lists/${listId}/items`, input),
  });
}

export function useUpdateShoppingListItem(listId: string) {
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: UpdateShoppingListItemInput }) =>
      api.patch<ShoppingList>(`/api/shopping-lists/${listId}/items/${itemId}`, input),
  });
}

export function useDeleteShoppingListItem(listId: string) {
  return useMutation({
    mutationFn: (itemId: string) =>
      api.delete<ShoppingList>(`/api/shopping-lists/${listId}/items/${itemId}`),
  });
}

// --- Аналітика покупок ---

/** Історія фактичних цін продукту; запит іде лише для відкритого діалогу. */
export function useProductPrices(productId: string | undefined) {
  return useQuery({
    queryKey: ['products', productId, 'prices'],
    queryFn: () => api.get<ProductPriceHistory>(`/api/products/${productId}/prices`),
    enabled: productId !== undefined,
  });
}

export function useShoppingAnalytics(month: string) {
  return useQuery({
    queryKey: ['analytics', 'shopping', month],
    queryFn: () => api.get<ShoppingAnalytics>('/api/shopping/analytics', { month }),
    placeholderData: keepPreviousData,
  });
}
