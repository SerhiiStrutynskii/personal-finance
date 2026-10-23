import { MutationCache, QueryClient, type Query } from '@tanstack/react-query';
import { ApiError } from '../shared/api/client.ts';

/**
 * Кеш даних сервера на весь застосунок.
 *
 * Дані вважаються свіжими 5 хвилин, тож перехід між сторінками бере їх із кешу без запитів.
 * Актуальність тримає одне правило: будь-яка успішна мутація робить застарілими всі запити.
 * Дані тісно пов'язані (транзакція змінює баланси, бюджет, борги, цілі, аналітику й головну),
 * тому окремий список залежностей для кожної мутації рано чи пізно щось пропустив би.
 * Одразу перечитуються лише запити відкритої сторінки, решта — коли сторінку відкриють.
 * Запити з `staleTime: 'static'` (сесія, налаштування входу) правило не зачіпає.
 *
 * Дані домогосподарства змінюють і інші учасники, а мутацій чужих пристроїв цей кеш не бачить.
 * Тому при поверненні у вкладку чи застосунок (і після відновлення мережі) запити відкритої
 * сторінки, старші за `REFETCH_ON_RETURN_AFTER_MS`, перечитуються, навіть якщо ще «свіжі».
 */
export const REFETCH_ON_RETURN_AFTER_MS = 30_000;

/** Чи перечитувати запит при поверненні на сторінку: лише якщо дані старші за поріг. */
export const refetchOnReturn = (query: Query): 'always' | false =>
  query.isStaleByTime(REFETCH_ON_RETURN_AFTER_MS) ? 'always' : false;

export function createQueryClient(): QueryClient {
  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: refetchOnReturn,
        refetchOnReconnect: refetchOnReturn,
        // Відповідь API з помилкою повторювати немає сенсу; повторюємо лише збої мережі.
        retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 2,
      },
    },
    mutationCache: new MutationCache({
      // Повертаємо проміс: мутація лишається pending, доки відкрита сторінка не перечитає дані.
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  });
  return queryClient;
}
