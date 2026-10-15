import { parsePlannedAmount } from '../budget/plannedAmount.ts';

/**
 * Початковий залишок із поля форми в мінімальних одиницях валюти. Порожнє поле — нуль;
 * повертає текст помилки, якщо значення некоректне.
 */
export function parseOpeningBalance(text: string, currency: string): number | string {
  return text.trim() === '' ? 0 : parsePlannedAmount(text, currency);
}
