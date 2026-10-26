import type {
  CreateDishInput,
  CreateMenuShoppingListInput,
  CreateMenuEntryInput,
  Dish,
  DishSummary,
  MealType,
  MenuEntry,
  MenuPeriod,
  MenuShopping,
  ShoppingList,
  UpdateDishInput,
  UpdateMenuEntryInput,
} from '@hf/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/index.ts';

// Після будь-якої мутації кеш перечитується цілком (див. app/queryClient.ts), тож ціна порції
// оновлюється й після зміни ціни продукту в довіднику чи позначки «куплено».

const MEAL_TYPES_KEY = ['meal-types'];
const DISHES_KEY = ['dishes'];

/** Прийоми їжі в порядку position. */
export function useMealTypes() {
  return useQuery({
    queryKey: MEAL_TYPES_KEY,
    queryFn: async () => (await api.get<{ items: MealType[] }>('/api/meal-types')).items,
  });
}

/** Створює прийом їжі або перейменовує наявний, якщо передано id. */
export function useSaveMealType() {
  return useMutation({
    mutationFn: ({
      id,
      name,
      afterId,
    }: {
      id?: string | undefined;
      name: string;
      /** Лише для нового: стати одразу після цього прийому; без нього — у кінець. */
      afterId?: string | undefined;
    }) =>
      id
        ? api.patch<MealType>(`/api/meal-types/${id}`, { name })
        : api.post<MealType>('/api/meal-types', afterId ? { name, afterId } : { name }),
  });
}

export function useDeleteMealType() {
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/meal-types/${id}`) });
}

/** Новий порядок: усі id прийомів їжі. */
export function useReorderMealTypes() {
  return useMutation({
    mutationFn: (ids: string[]) => api.put<{ items: MealType[] }>('/api/meal-types/order', { ids }),
  });
}

/** Страви за алфавітом, з ціною порції. */
export function useDishes() {
  return useQuery({
    queryKey: DISHES_KEY,
    queryFn: async () => (await api.get<{ items: DishSummary[] }>('/api/dishes')).items,
  });
}

/** Страва зі складом; запит іде лише для відкритого діалогу. */
export function useDish(id: string | undefined) {
  return useQuery({
    queryKey: [...DISHES_KEY, id],
    queryFn: () => api.get<Dish>(`/api/dishes/${id}`),
    enabled: id !== undefined,
  });
}

/** Створює страву або змінює наявну, якщо передано id; склад замінюється цілком. */
export function useSaveDish() {
  return useMutation({
    mutationFn: (
      request: { id: string; input: UpdateDishInput } | { id?: undefined; input: CreateDishInput },
    ) =>
      request.id
        ? api.patch<Dish>(`/api/dishes/${request.id}`, request.input)
        : api.post<Dish>('/api/dishes', request.input),
  });
}

export function useDeleteDish() {
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/dishes/${id}`) });
}

/** Меню за період [from, to): записи, підсумки днів і всього періоду. */
export function useMenuPeriod(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['menu', from, to],
    queryFn: () => api.get<MenuPeriod>(`/api/menu?${new URLSearchParams({ from, to }).toString()}`),
    enabled,
  });
}

/** Додає страву в прийом їжі дня; повторне додавання збільшує порції наявного запису. */
export function useAddMenuEntry() {
  return useMutation({
    mutationFn: (input: CreateMenuEntryInput) => api.post<MenuEntry>('/api/menu/entries', input),
  });
}

export function useUpdateMenuEntry() {
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateMenuEntryInput) =>
      api.patch<MenuEntry>(`/api/menu/entries/${id}`, input),
  });
}

export function useDeleteMenuEntry() {
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/menu/entries/${id}`) });
}

/** Продукти для меню періоду [from, to) і бюджет на них за поточними цінами. */
export function useMenuShopping(from: string, to: string) {
  return useQuery({
    queryKey: ['menu', 'shopping', from, to],
    queryFn: () =>
      api.get<MenuShopping>(`/api/menu/shopping?${new URLSearchParams({ from, to }).toString()}`),
  });
}

/** Звичайний список покупок із продуктів меню періоду. */
export function useCreateShoppingListFromMenu() {
  return useMutation({
    mutationFn: (input: CreateMenuShoppingListInput) =>
      api.post<ShoppingList>('/api/menu/shopping-list', input),
  });
}
