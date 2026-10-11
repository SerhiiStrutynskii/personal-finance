import type { AuthTokens } from '@hf/shared';

const REFRESH_TOKEN_KEY = 'hf.refreshToken';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Access-токен живе лише в пам'яті вкладки, refresh-токен — у сховищі браузера,
 * щоб сесія переживала перезавантаження сторінки.
 */
export function createTokenStore(storage: KeyValueStorage) {
  let accessToken: string | undefined;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  function getRefreshToken(): string | undefined {
    try {
      return storage.getItem(REFRESH_TOKEN_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  }

  return {
    getAccessToken: () => accessToken,
    getRefreshToken,
    hasSession: () => getRefreshToken() !== undefined,

    setTokens(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): void {
      accessToken = tokens.accessToken;
      try {
        storage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      } catch {
        // Сховище недоступне (наприклад, приватний режим): сесія діятиме до перезавантаження.
      }
      notify();
    },

    clear(): void {
      accessToken = undefined;
      try {
        storage.removeItem(REFRESH_TOKEN_KEY);
      } catch {
        // нічого прибирати
      }
      notify();
    },

    /** Викликається, коли сховище змінила інша вкладка (вхід або вихід). */
    syncFromStorage(): void {
      if (!getRefreshToken()) accessToken = undefined;
      notify();
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type TokenStore = ReturnType<typeof createTokenStore>;
export { REFRESH_TOKEN_KEY };
