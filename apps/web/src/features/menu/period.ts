import { addDays, isoWeekday, shiftMonth } from '@hf/shared';
import { monthLabel } from '../../shared/ui/format.ts';
import { dayRange, dayTitleWithYear, monthRange, pluralForm } from './calendar.ts';

// Період сторінки «Покупки за меню»: день, тиждень (пн–нд) або календарний місяць, у який входить
// дата з адреси. Дати — рядки YYYY-MM-DD без часового поясу.

export type MenuPeriodKind = 'day' | 'week' | 'month';

export const PERIOD_KINDS: readonly { kind: MenuPeriodKind; label: string }[] = [
  { kind: 'day', label: 'День' },
  { kind: 'week', label: 'Тиждень' },
  { kind: 'month', label: 'Місяць' },
];

/** Вид періоду з адреси; невідомий чи відсутній — тиждень. */
export function parsePeriodKind(param: string | null | undefined): MenuPeriodKind {
  return param === 'day' || param === 'month' ? param : 'week';
}

/** Тиждень пн–нд, у який входить дата, як період [from, to). */
export function weekRange(date: string): { from: string; to: string } {
  const from = addDays(date, 1 - isoWeekday(date));
  return { from, to: addDays(from, 7) };
}

/** Період [from, to) виду kind, у який входить дата. */
export function periodRange(kind: MenuPeriodKind, date: string): { from: string; to: string } {
  if (kind === 'day') return dayRange(date);
  if (kind === 'week') return weekRange(date);
  return monthRange(date.slice(0, 7));
}

/** Початок попереднього (step = −1) чи наступного (step = 1) періоду. */
export function shiftPeriod(kind: MenuPeriodKind, date: string, step: -1 | 1): string {
  if (kind === 'day') return addDays(date, step);
  if (kind === 'week') return addDays(weekRange(date).from, 7 * step);
  return `${shiftMonth(date.slice(0, 7), step)}-01`;
}

const dayMonthFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const dayMonth = (date: string) => dayMonthFormatter.format(new Date(`${date}T00:00:00Z`));

/**
 * Підпис періоду: «понеділок, 26 жовтня 2026», «26 жовтня – 1 листопада 2026» (рік у кожній даті,
 * якщо роки різні) або «жовтень 2026».
 */
export function periodLabel(kind: MenuPeriodKind, date: string): string {
  if (kind === 'day') return dayTitleWithYear(date);
  if (kind === 'month') {
    const label = monthLabel(date.slice(0, 7));
    return label.charAt(0).toLowerCase() + label.slice(1);
  }
  const { from, to } = weekRange(date);
  const last = addDays(to, -1);
  const fromYear = from.slice(0, 4);
  const lastYear = last.slice(0, 4);
  return fromYear === lastYear
    ? `${dayMonth(from)} – ${dayMonth(last)} ${lastYear}`
    : `${dayMonth(from)} ${fromYear} – ${dayMonth(last)} ${lastYear}`;
}

/** «Без ціни: 1 продукт — пораховано як 0», «2 продукти», «5 продуктів». */
export function unpricedProductsText(count: number): string {
  const word = pluralForm(count, 'продукт', 'продукти', 'продуктів');
  return `Без ціни: ${count} ${word} — пораховано як 0`;
}
