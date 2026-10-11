import { formatMoney } from '@hf/shared';
import { Check, TriangleAlert } from 'lucide-react';
import type { CategoryStatus } from './statusStyles.ts';

interface Props {
  status: CategoryStatus;
  /** Ліміт мінус витрати; від'ємний, якщо ліміт перевищено. */
  remaining: number;
  currency: string;
}

/** Статус словами й іконкою: колір ніколи не є єдиною ознакою. */
export function CategoryStatusLabel({ status, remaining, currency }: Props) {
  const amount = formatMoney({ amountMinor: Math.abs(remaining), currency });

  if (status === 'over') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-status-over">
        <TriangleAlert className="size-4" aria-hidden />
        Перевищено на {amount}
      </span>
    );
  }
  if (status === 'surplus') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-status-surplus">
        <Check className="size-4" aria-hidden />
        Залишок {amount}
      </span>
    );
  }
  return <span className="text-muted-foreground">Залишок {amount}</span>;
}
