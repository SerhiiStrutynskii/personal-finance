import { MoneyParseError, MoneyRangeError, parseMoney } from '@hf/shared';
import { parsePlannedAmount } from '../budget/plannedAmount.ts';

/**
 * Початковий залишок із поля форми в мінімальних одиницях валюти. Порожнє поле — нуль;
 * повертає текст помилки, якщо значення некоректне.
 */
export function parseOpeningBalance(text: string, currency: string): number | string {
  return text.trim() === '' ? 0 : parsePlannedAmount(text, currency);
}

/**
 * Фактичний баланс рахунку з поля форми коригування в мінімальних одиницях валюти; може бути
 * від'ємним. Повертає текст помилки, якщо значення некоректне.
 */
export function parseActualBalance(text: string, currency: string): number | string {
  if (text.trim() === '') return 'Вкажіть суму';
  try {
    return parseMoney(text.trim(), currency).amountMinor;
  } catch (error) {
    if (error instanceof MoneyRangeError) return 'Сума завелика';
    if (error instanceof MoneyParseError) return 'Некоректна сума, приклад: 1234,50';
    throw error;
  }
}
