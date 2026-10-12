import { shiftMonth } from '@hf/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button.tsx';
import { monthLabel } from './format.ts';

/** Перемикач календарного місяця: ← Жовтень 2026 →. Далі за `max` перейти не можна. */
export function MonthSwitcher({
  month,
  onChange,
  max,
}: {
  month: string;
  onChange: (month: string) => void;
  max?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Попередній місяць"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft />
      </Button>
      <span className="min-w-36 text-center font-medium" data-testid="current-month">
        {monthLabel(month)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Наступний місяць"
        disabled={max !== undefined && month >= max}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
