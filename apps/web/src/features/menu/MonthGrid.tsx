import { formatMoney, type MenuDay } from '@hf/shared';
import { cn } from '../../shared/lib/utils.ts';
import { WEEKDAY_LABELS, dayTitle, monthGrid } from './calendar.ts';
import { IncompletePriceBadge } from './IncompletePriceBadge.tsx';

interface Props {
  month: string;
  days: readonly MenuDay[];
  currency: string;
  today: string;
  selected: string;
  onSelect: (date: string) => void;
}

/**
 * Сітка місяця з понеділка. У клітинці з записами — вартість дня (від планшета) або крапка
 * (на телефоні) і позначка неповної ціни.
 */
export function MonthGrid({ month, days, currency, today, selected, onSelect }: Props) {
  const byDate = new Map(days.map((day) => [day.date, day]));

  return (
    <div role="group" aria-label="Дні місяця" className="w-full text-sm">
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} aria-hidden>
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {monthGrid(month)
          .flat()
          .map((date, index) => {
            if (!date) return <div key={`empty-${index}`} aria-hidden />;
            const day = byDate.get(date);
            const isSelected = date === selected;
            const money = day && formatMoney({ amountMinor: day.cost, currency });
            const label = [
              dayTitle(date),
              money,
              day && !day.isPriceComplete ? 'ціна неповна' : undefined,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <button
                key={date}
                type="button"
                data-testid="menu-day"
                data-date={date}
                aria-label={label}
                aria-pressed={isSelected}
                aria-current={date === today ? 'date' : undefined}
                onClick={() => onSelect(date)}
                className={cn(
                  'flex min-h-11 min-w-0 flex-col items-center justify-start gap-0.5 rounded-md border px-0.5 py-1 transition-colors hover:bg-muted md:min-h-16',
                  date === today && 'border-primary font-semibold text-primary',
                  isSelected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                <span className="leading-none">{Number(date.slice(8))}</span>
                {day && (
                  <span className="flex max-w-full flex-wrap items-center justify-center gap-0.5">
                    {/* На телефоні замість суми — крапка. */}
                    <span
                      aria-hidden
                      data-testid="menu-day-dot"
                      className="size-1.5 rounded-full bg-current md:hidden"
                    />
                    <span
                      data-testid="menu-day-cost"
                      className="hidden max-w-full text-[11px] leading-tight font-normal break-words tabular-nums md:block"
                    >
                      {money}
                    </span>
                    {!day.isPriceComplete && <IncompletePriceBadge compact hint="Ціна неповна" />}
                  </span>
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}
