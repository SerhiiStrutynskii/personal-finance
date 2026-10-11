import { createApiClient } from './client.ts';
import { REFRESH_TOKEN_KEY, createTokenStore } from './tokenStore.ts';

export { ApiError, NetworkError } from './client.ts';

export const tokenStore = createTokenStore(window.localStorage);

window.addEventListener('storage', (event) => {
  if (event.key === REFRESH_TOKEN_KEY || event.key === null) tokenStore.syncFromStorage();
});

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  tokenStore,
  // Web Locks серіалізує оновлення токена між вкладками, що ділять один refresh-токен.
  ...('locks' in navigator && {
    lock: <T>(run: () => Promise<T>) => navigator.locks.request('hf.refresh', run) as Promise<T>,
  }),
});

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Сталася помилка. Спробуйте ще раз';
}
