import { formatMoney } from '@hf/shared';
import { Ban, Check, Circle, CircleAlert, CircleDashed } from 'lucide-react';
import { formatDayMonth } from '../../shared/ui/format.ts';
import type { Occurrence } from './occurrenceStyles.ts';

/** Статус отримання словами й іконкою: колір ніколи не є єдиною ознакою. */
export function OccurrenceStatusLabel({
  occurrence,
  currency,
}: {
  occurrence: Occurrence;
  currency: string;
}) {
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  const base = 'inline-flex items-center gap-1 font-medium';

  switch (occurrence.status) {
    case 'received':
      return (
        <span className={`${base} text-status-surplus`}>
          <Check className="size-4" aria-hidden />
          Отримано
          {occurrence.diff !== undefined && occurrence.diff > 0 && ` (+${money(occurrence.diff)})`}
        </span>
      );
    case 'partial':
      return (
        <span className={`${base} text-status-partial`}>
          <CircleDashed className="size-4" aria-hidden />
          Отримано частково: {money(occurrence.actualAmount)} з {money(occurrence.plannedAmount)}
        </span>
      );
    case 'overdue':
      return (
        <span className={`${base} text-status-over`}>
          <CircleAlert className="size-4" aria-hidden />
          Не надійшло, очікувалось {formatDayMonth(occurrence.plannedDate)}
        </span>
      );
    case 'skipped':
      return (
        <span className={`${base} text-muted-foreground`}>
          <Ban className="size-4" aria-hidden />
          Не очікується
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Circle className="size-4" aria-hidden />
          Очікується {formatDayMonth(occurrence.plannedDate)}
        </span>
      );
  }
}
