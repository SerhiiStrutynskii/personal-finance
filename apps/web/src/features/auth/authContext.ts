import type { CurrentUser, LoginInput, RegisterInput } from '@hf/shared';
import { createContext, useContext } from 'react';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';

export interface AuthState {
  status: AuthStatus;
  current: CurrentUser | undefined;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): void;
  retry(): void;
  /** Перечитує користувача й домогосподарство: після виходу з нього чи перейменування. */
  reloadCurrentUser(): Promise<void>;
}

export const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth можна викликати лише всередині AuthProvider');
  return auth;
}

/** Поточний користувач на сторінках, що доступні лише після входу. */
export function useCurrentUser(): CurrentUser {
  const { current } = useAuth();
  if (!current) throw new Error('useCurrentUser потребує виконаного входу');
  return current;
}

/**
 * Рахунки, категорії, бюджет, борги й цілі змінює лише власник домогосподарства; учасник їх
 * бачить. Сервер перевіряє те саме, тут — лише щоб не показувати недоступні дії.
 */
export function useIsOwner(): boolean {
  return useCurrentUser().household.role === 'owner';
}
