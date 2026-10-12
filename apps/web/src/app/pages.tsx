import { Link } from 'react-router-dom';
import { PageHeader } from '../shared/ui/controls.tsx';

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
