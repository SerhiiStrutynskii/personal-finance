export interface RateLimiterOptions {
  max: number;
  windowMs: number;
  now?: () => number;
}

/**
 * Лічильник невдалих спроб у пам'яті процесу. Достатній для одного екземпляра сервера;
 * для кількох екземплярів знадобиться спільне сховище.
 */
export function createRateLimiter({ max, windowMs, now = Date.now }: RateLimiterOptions) {
  const failures = new Map<string, { count: number; resetAt: number }>();

  function current(key: string) {
    const entry = failures.get(key);
    if (entry && entry.resetAt <= now()) {
      failures.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    isBlocked: (key: string): boolean => (current(key)?.count ?? 0) >= max,

    recordFailure(key: string): void {
      const entry = current(key);
      if (entry) {
        entry.count += 1;
        return;
      }
      // Прибираємо прострочені записи, щоб мапа не росла безмежно.
      for (const [otherKey, other] of failures) {
        if (other.resetAt <= now()) failures.delete(otherKey);
      }
      failures.set(key, { count: 1, resetAt: now() + windowMs });
    },

    reset: (key: string): void => void failures.delete(key),
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const createLoginLimiter = (now?: () => number) =>
  createRateLimiter({ max: LOGIN_MAX_FAILURES, windowMs: LOGIN_WINDOW_MS, ...(now && { now }) });

export const PASSWORD_CHANGE_MAX_FAILURES = 5;
export const PASSWORD_CHANGE_WINDOW_MS = 15 * 60 * 1000;

/** Невдалі спроби ввести поточний пароль під час зміни пароля; ключ — id користувача. */
export const createPasswordChangeLimiter = (now?: () => number) =>
  createRateLimiter({
    max: PASSWORD_CHANGE_MAX_FAILURES,
    windowMs: PASSWORD_CHANGE_WINDOW_MS,
    ...(now && { now }),
  });
