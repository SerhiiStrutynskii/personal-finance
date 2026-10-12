import { localDateKey } from '../dates.ts';

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
  /** Поточний момент, включно: видаток не може бути в майбутньому. */
  end: Date;
  /** Та сама межа календарною датою YYYY-MM-DD — для поля вибору дати. */
  maxDate: string;
}

/**
 * Дати, на які можна створити чи перенести видаток: будь-яка до цієї миті, зокрема в минулих
 * місяцях. Одна функція для бекенду (перевірка) і фронтенду (обмеження вибору дати).
 */
export function getAllowedExpenseDateRange(now: Date, timeZone: string): AllowedExpenseDateRange {
  return { end: now, maxDate: localDateKey(now, timeZone) };
}

/** Чи не лежить момент видатку в майбутньому. */
export function isExpenseDateAllowed(occurredAt: Date, now: Date): boolean {
  return occurredAt.getTime() <= now.getTime();
}
