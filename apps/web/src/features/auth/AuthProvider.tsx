import type { AuthSession, CurrentUser, LoginInput, RegisterInput } from '@hf/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { ApiError, api, tokenStore } from '../../shared/api/index.ts';
import { AuthContext, type AuthState } from './authContext.ts';

const ME_KEY = ['me'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const hasSession = useSyncExternalStore(tokenStore.subscribe, tokenStore.hasSession);

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: () => api.get<CurrentUser>('/api/auth/me'),
    enabled: hasSession,
    // Сесію не перечитує ні час, ні мутації; оновлюється лише явно.
    staleTime: 'static',
    retry: false,
  });

  // Сервер більше не визнає цього користувача (наприклад, він втратив домогосподарство).
  const rejected = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (rejected) tokenStore.clear();
  }, [rejected]);

  // Після виходу в кеші не має лишитися даних попереднього користувача. Чиститься лише при
  // завершенні сесії: на старті без сесії очищення скасувало б уже запущені відкриті запити
  // (налаштування входу, запрошення), і вони лишилися б у стані завантаження.
  const hadSession = useRef(hasSession);
  useEffect(() => {
    if (hadSession.current && !hasSession) queryClient.clear();
    hadSession.current = hasSession;
  }, [hasSession, queryClient]);

  const startSession = useCallback(
    ({ accessToken, refreshToken, user, household }: AuthSession) => {
      queryClient.setQueryData<CurrentUser>(ME_KEY, { user, household });
      tokenStore.setTokens({ accessToken, refreshToken });
    },
    [queryClient],
  );

  const value = useMemo<AuthState>(() => {
    const status = !hasSession
      ? 'anonymous'
      : me.data
        ? 'authenticated'
        : me.isError && !rejected
          ? 'error'
          : 'loading';

    return {
      status,
      current: hasSession ? me.data : undefined,
      async login(input: LoginInput) {
        startSession(await api.post<AuthSession>('/api/auth/login', input, { auth: false }));
      },
      async register(input: RegisterInput) {
        startSession(await api.post<AuthSession>('/api/auth/register', input, { auth: false }));
      },
      logout() {
        const refreshToken = tokenStore.getRefreshToken();
        tokenStore.clear();
        if (refreshToken) {
          // Локально сесію вже завершено; відкликання на сервері — найкраща спроба.
          api.post('/api/auth/logout', { refreshToken }, { auth: false }).catch(() => {});
        }
      },
      retry: () => void me.refetch(),
      async reloadCurrentUser() {
        await me.refetch();
      },
    };
  }, [hasSession, me, rejected, startSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
