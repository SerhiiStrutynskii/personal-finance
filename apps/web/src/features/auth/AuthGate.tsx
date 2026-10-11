import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button, ErrorText, Muted } from '../../shared/ui/controls.tsx';
import { useAuth } from './authContext.ts';

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="flex h-screen flex-col items-center justify-center gap-3">{children}</div>;
}

/** Пускає далі лише після входу; інакше веде на сторінку входу. */
export function RequireAuth() {
  const { status, retry } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <FullScreen>
        <Muted>Завантаження…</Muted>
      </FullScreen>
    );
  }
  if (status === 'error') {
    return (
      <FullScreen>
        <ErrorText>Не вдалося звʼязатися із сервером</ErrorText>
        <Button onClick={retry}>Спробувати ще раз</Button>
      </FullScreen>
    );
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Сторінки входу й реєстрації: користувача із сесією повертає в застосунок. */
export function AnonymousOnly() {
  const { status } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (status === 'anonymous') return <Outlet />;
  return <Navigate to={from} replace />;
}
