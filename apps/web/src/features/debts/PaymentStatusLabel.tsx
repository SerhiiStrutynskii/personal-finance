import { daysBetween, formatMoney, type Debt } from '@hf/shared';
import { AlarmClock, Check, Circle, CircleAlert, CircleDashed, Minus } from 'lucide-react';
import { formatDayMonth } from '../../shared/ui/format.ts';

const daysText = (count: number) => `${count} дн.`;

/** Статус платежу місяця словами й іконкою: колір ніколи не є єдиною ознакою. */
export function PaymentStatusLabel({
  payment,
  today,
  currency,
}: {
  payment: Debt['month'];
  today: string;
  currency: string;
}) {
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  const base = 'inline-flex items-center gap-1 font-medium';

  switch (payment.status) {
    case 'paid':
      return (
        <span className={`${base} text-status-surplus`}>
          <Check className="size-4" aria-hidden />
          Сплачено
        </span>
      );
    case 'partial':
      return (
        <span className={`${base} text-status-partial`}>
          <CircleDashed className="size-4" aria-hidden />
          Сплачено {money(payment.paid)} з {money(payment.required)}
        </span>
      );
    case 'overdue':
      return (
        <span className={`${base} text-status-over`}>
          <CircleAlert className="size-4" aria-hidden />
          Прострочено на {daysText(daysBetween(payment.dueDate, today))}
        </span>
      );
    case 'due_soon': {
      const days = daysBetween(today, payment.dueDate);
      return (
        <span className={`${base} text-status-due-soon`}>
          <AlarmClock className="size-4" aria-hidden />
          {days === 0 ? 'Платіж сьогодні' : `Платіж через ${daysText(days)}`}
        </span>
      );
    }
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Circle className="size-4" aria-hidden />
          Платіж {formatDayMonth(payment.dueDate)}
        </span>
      );
    case 'none':
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Minus className="size-4" aria-hidden />
          Цього місяця платити нічого
        </span>
      );
  }
}
