import { Link } from 'react-router-dom';
import { useCurrentUser } from '../features/auth/authContext.ts';
import { Muted, PageHeader } from '../shared/ui/controls.tsx';

export function DashboardPage() {
  const { user, household } = useCurrentUser();
  return (
    <div>
      <PageHeader title={`Вітаємо, ${user.name}`} />
      <Muted>
        Домогосподарство: {household.name}. Зведення зʼявиться тут пізніше, а поки можна вести{' '}
        <Link className="underline" to="/expenses">
          витрати
        </Link>{' '}
        та{' '}
        <Link className="underline" to="/incomes">
          доходи
        </Link>
        .
      </Muted>
    </div>
  );
}

export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <Muted>Цей розділ ще не реалізовано.</Muted>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div>
      <PageHeader title="Сторінку не знайдено" />
      <Link className="text-sm underline" to="/">
        На головну
      </Link>
    </div>
  );
}
