import { formatMoney, type Goal } from '@hf/shared';
import { Check, Circle, CircleAlert, CircleDashed, TrendingUp } from 'lucide-react';
import { formatDateString } from '../../shared/ui/format.ts';

/** Стан цілі словами й іконкою: колір ніколи не є єдиною ознакою. */
export function GoalStateLabel({ goal }: { goal: Goal }) {
  const base = 'inline-flex items-center gap-1 font-medium';
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: goal.currency });

  switch (goal.state) {
    case 'achieved':
      return (
        <span className={`${base} text-status-surplus`}>
          <Check className="size-4" aria-hidden />
          Ціль досягнуто
        </span>
      );
    case 'on_track':
      return (
        <span className={`${base} text-status-surplus`}>
          <TrendingUp className="size-4" aria-hidden />
          Встигаєте до {goal.targetDate && formatDateString(goal.targetDate)}
        </span>
      );
    case 'behind':
      return (
        <span className={`${base} text-status-partial`}>
          <CircleDashed className="size-4" aria-hidden />
          {goal.requiredMonthly === null
            ? 'Відстаєте: до дати не встигнути'
            : `Відстаєте: потрібно ${money(goal.requiredMonthly)} на місяць`}
        </span>
      );
    case 'overdue':
      return (
        <span className={`${base} text-status-over`}>
          <CircleAlert className="size-4" aria-hidden />
          Строк минув {goal.targetDate && formatDateString(goal.targetDate)}
        </span>
      );
    case 'no_deadline':
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Circle className="size-4" aria-hidden />
          Без дати
        </span>
      );
  }
}
