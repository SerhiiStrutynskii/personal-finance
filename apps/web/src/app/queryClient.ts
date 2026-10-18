import { MutationCache, QueryClient } from '@tanstack/react-query';
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
 */
export function createQueryClient(): QueryClient {
  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
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
