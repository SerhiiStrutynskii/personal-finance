import { localDateKey, localMonthKey } from '@hf/shared';

/**
 * Дата за замовчуванням для нового запису з екрана бюджету: сьогодні, якщо переглядається
 * поточний місяць, інакше перше число цього місяця — щоб запис потрапив саме в нього.
 */
export function defaultEntryDate(month: string, now: Date, timeZone: string): string {
  return localMonthKey(now, timeZone) === month ? localDateKey(now, timeZone) : `${month}-01`;
}
