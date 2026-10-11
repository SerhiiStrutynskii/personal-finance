import { localDateKey, localMonthKey } from '../dates.ts';
import { budgetPeriod } from './month.ts';

/** Стан періоду бюджету відносно поточного моменту; у базі не зберігається. */
export type PeriodState = 'past' | 'current' | 'future';

/**
 * past — період завершився (кінець виключний, тому рівно в periodEnd він уже минулий);
 * current — зараз у межах періоду; future — період ще не почався.
 */
export function getPeriodState(periodStart: Date, periodEnd: Date, now: Date): PeriodState {
  if (now.getTime() >= periodEnd.getTime()) return 'past';
  if (now.getTime() < periodStart.getTime()) return 'future';
  return 'current';
}

export interface AllowedExpenseDateRange {
  /** Початок поточного місяця в часовому поясі домогосподарства, включно. */
  start: Date;
  /** Поточний момент, включно: видаток не може бути в майбутньому. */
  end: Date;
  /** Ті самі межі календарними датами YYYY-MM-DD — для поля вибору дати. */
  minDate: string;
  maxDate: string;
}

/**
 * Дати, на які можна створити чи перенести видаток: від початку поточного місяця до цієї миті.
 * Одна функція для бекенду (перевірка) і фронтенду (обмеження вибору дати).
 */
export function getAllowedExpenseDateRange(now: Date, timeZone: string): AllowedExpenseDateRange {
  const month = localMonthKey(now, timeZone);
  return {
    start: budgetPeriod(month, timeZone).start,
    end: now,
    minDate: `${month}-01`,
    maxDate: localDateKey(now, timeZone),
  };
}

/** Чи належить момент видатку до поточного періоду і не лежить у майбутньому. */
export function isExpenseDateAllowed(occurredAt: Date, now: Date, timeZone: string): boolean {
  const { start, end } = getAllowedExpenseDateRange(now, timeZone);
  return occurredAt.getTime() >= start.getTime() && occurredAt.getTime() <= end.getTime();
}
