import { localDateKey, localMonthKey } from '@hf/shared';

const formatter = new Intl.DateTimeFormat('uk-UA', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** «2026-10» -> «Жовтень 2026». */
export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const text = formatter
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)))
    .replace(/\s*р\.$/, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Дата за замовчуванням для нового запису з екрана бюджету: сьогодні, якщо переглядається
 * поточний місяць, інакше перше число цього місяця — щоб запис потрапив саме в нього.
 */
export function defaultEntryDate(month: string, now: Date, timeZone: string): string {
  return localMonthKey(now, timeZone) === month ? localDateKey(now, timeZone) : `${month}-01`;
}
