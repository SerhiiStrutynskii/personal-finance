import type { MenuDayTemplate } from '@hf/shared';
import { pluralForm } from './calendar.ts';

// Логіка шаблонів меню дня без UI: підписи й перевірки для діалогів.

/** «1 позиція», «2 позиції», «5 позицій», «0 позицій». */
export function templateItemCountLabel(count: number): string {
  return `${count} ${pluralForm(count, 'позиція', 'позиції', 'позицій')}`;
}

/** Пункт вибору шаблону: назва й кількість позицій. */
export function templateOptionLabel(template: Pick<MenuDayTemplate, 'name' | 'itemCount'>) {
  return `${template.name} · ${templateItemCountLabel(template.itemCount)}`;
}

/**
 * Попередження про заміну меню дня; у порожньому дні — undefined (застосування без попередження).
 * «Меню дня буде замінено: 1 запис зникне», «…: 2 записи зникнуть», «…: 5 записів зникнуть».
 */
export function replaceWarning(entryCount: number): string | undefined {
  if (entryCount <= 0) return undefined;
  const noun = pluralForm(entryCount, 'запис', 'записи', 'записів');
  const verb = pluralForm(entryCount, 'зникне', 'зникнуть', 'зникнуть');
  return `Меню дня буде замінено: ${entryCount} ${noun} ${verb}`;
}

/** Назва шаблону після обрізання пробілів або помилка; межі — як у menuDayTemplateNameSchema. */
export function parseTemplateName(raw: string): { name: string } | { error: string } {
  const name = raw.trim();
  if (name === '' || name.length > 100) return { error: 'Вкажіть назву до 100 символів' };
  return { name };
}
