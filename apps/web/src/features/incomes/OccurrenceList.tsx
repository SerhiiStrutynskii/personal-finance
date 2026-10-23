import { formatMoney } from '@hf/shared';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '../../shared/ui/button.tsx';
import { Muted } from '../../shared/ui/controls.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu.tsx';
import { formatDateString } from '../../shared/ui/format.ts';
import { OccurrenceStatusLabel } from './OccurrenceStatusLabel.tsx';
import { OCCURRENCE_ROW_CLASS, type Occurrence } from './occurrenceStyles.ts';

interface Props {
  occurrences: readonly Occurrence[];
  currency: string;
  onReceive: (occurrence: Occurrence) => void;
  onEdit: (occurrence: Occurrence) => void;
  onToggleSkip: (occurrence: Occurrence) => void;
  onShowPayments: (occurrence: Occurrence) => void;
}

export function OccurrenceList({
  occurrences,
  currency,
  onReceive,
  onEdit,
  onToggleSkip,
  onShowPayments,
}: Props) {
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });

  if (occurrences.length === 0) {
    return <Muted>На цей місяць регулярних надходжень немає.</Muted>;
  }

  return (
    <ul className="space-y-2">
      {occurrences.map((occurrence) => {
        const skipped = occurrence.status === 'skipped';
        return (
          <li
            key={occurrence.id}
            data-testid="income-occurrence"
            data-status={occurrence.status}
            className={`rounded-lg border p-3 ${OCCURRENCE_ROW_CLASS[occurrence.status]}`}
          >
            <div className="font-medium break-words">{occurrence.name}</div>
            <div className="text-sm text-muted-foreground">
              <div>
                План: {formatDateString(occurrence.plannedDate)} ·{' '}
                <span className={`tabular-nums ${skipped ? 'line-through' : ''}`}>
                  {money(occurrence.plannedAmount)}
                </span>
              </div>
              {occurrence.actualDate && (
                <div>
                  Факт: {formatDateString(occurrence.actualDate)} ·{' '}
                  <span className="tabular-nums">{money(occurrence.actualAmount)}</span>
                </div>
              )}
            </div>
            {/* Статус і дії одним рядком: на телефоні кнопки не висять окремо. */}
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="min-w-0 text-sm">
                <OccurrenceStatusLabel occurrence={occurrence} currency={currency} />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {occurrence.status !== 'received' && (
                  <Button variant="outline" size="sm" onClick={() => onReceive(occurrence)}>
                    Отримано
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Дії з надходженням «${occurrence.name}»`}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {occurrence.status === 'received' && (
                      <DropdownMenuItem onSelect={() => onReceive(occurrence)}>
                        Додати ще платіж
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => onEdit(occurrence)}>
                      Змінити цього разу
                    </DropdownMenuItem>
                    {occurrence.actualAmount === 0 && (
                      <DropdownMenuItem onSelect={() => onToggleSkip(occurrence)}>
                        {skipped ? 'Повернути в очікувані' : 'Пропустити'}
                      </DropdownMenuItem>
                    )}
                    {occurrence.actualAmount > 0 && (
                      <DropdownMenuItem onSelect={() => onShowPayments(occurrence)}>
                        Платежі
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
