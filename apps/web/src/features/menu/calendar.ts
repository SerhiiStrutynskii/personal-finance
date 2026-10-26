import {
  MAX_SERVINGS,
  addDays,
  isValidDateString,
  isoWeekday,
  shiftMonth,
  type MealType,
  type MenuEntry,
} from '@hf/shared';
import { quantityLabel } from '../shopping/shoppingForm.ts';

// Чисті функції календаря меню. Дати — рядки YYYY-MM-DD без часового поясу; «сьогодні»
// визначає сторінка в часовому поясі користувача.

export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const;

/** Тижні місяця з понеділка; дні сусідніх місяців — null. */
export function monthGrid(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const cells: (string | null)[] = Array.from({ length: isoWeekday(first) - 1 }, () => null);
  for (let day = first; day.startsWith(month); day = addDays(day, 1)) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Місяць як період [from, to) для GET /api/menu. */
export function monthRange(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${shiftMonth(month, 1)}-01` };
}

/** Один день як період [from, to). */
export function dayRange(date: string): { from: string; to: string } {
  return { from: date, to: addDays(date, 1) };
}

/** Вибраний день: дата з адреси, якщо вона валідна, інакше сьогодні. */
export function selectedDate(param: string | null, today: string): string {
  return param && isValidDateString(param) ? param : today;
}

/** День, що вибирається після перемикання місяця: сьогодні в поточному місяці, інакше перше число. */
export function dateForMonth(month: string, today: string): string {
  return today.startsWith(`${month}-`) ? today : `${month}-01`;
}

export interface MealGroup {
  mealType: MealType;
  entries: MenuEntry[];
}

/** Прийоми їжі в порядку position, у кожному — його записи в переданому порядку. */
export function groupDay(
  entries: readonly MenuEntry[],
  mealTypes: readonly MealType[],
): MealGroup[] {
  return [...mealTypes]
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((mealType) => ({
      mealType,
      entries: entries.filter((entry) => entry.mealTypeId === mealType.id),
    }));
}

/** Форма слова для числа: one — 1, 21; few — 2–4, 22; many — 5–20, 11–14. */
export function pluralForm(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «1 порція», «2 порції», «5 порцій», «11 порцій», «21 порція». */
export function servingsLabel(count: number): string {
  return `${count} ${pluralForm(count, 'порція', 'порції', 'порцій')}`;
}

/** «1 запис з неповною ціною», «2 записи…», «5 записів…» — страви й продукти разом. */
export function incompleteEntriesLabel(count: number): string {
  return `${count} ${pluralForm(count, 'запис', 'записи', 'записів')} з неповною ціною`;
}

/** Скільки запису: «2 порції» для страви, «0,5 л» для продукту. */
export function entryAmountLabel(entry: MenuEntry): string {
  return entry.kind === 'dish' ? servingsLabel(entry.servings) : quantityLabel(entry);
}

/** Рядок запису для друку: «Омлет — 2 порції», «Молоко — 0,5 л». */
export function entryPrintLabel(entry: MenuEntry): string {
  return `${entry.name} — ${entryAmountLabel(entry)}`;
}

/** Порції з поля форми: ціле 1–99, інакше текст помилки. */
export function parseServingsField(text: string): number | string {
  const trimmed = text.trim();
  const value = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  if (!Number.isInteger(value) || value < 1 || value > MAX_SERVINGS) {
    return `Вкажіть ціле число порцій від 1 до ${MAX_SERVINGS}`;
  }
  return value;
}

const dayFormatter = new Intl.DateTimeFormat('uk-UA', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const dayWithYearFormatter = new Intl.DateTimeFormat('uk-UA', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const toUtcDate = (date: string) => new Date(`${date}T00:00:00Z`);

/** «понеділок, 26 жовтня». */
export function dayTitle(date: string): string {
  return dayFormatter.format(toUtcDate(date));
}

/** «понеділок, 26 жовтня 2026». */
export function dayTitleWithYear(date: string): string {
  return dayWithYearFormatter.format(toUtcDate(date)).replace(/\s*р\.$/, '');
}
