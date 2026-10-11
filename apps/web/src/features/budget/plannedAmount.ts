import { MoneyParseError, MoneyRangeError, parseMoney, toDecimalString } from '@hf/shared';

/**
 * Розбирає заплановану суму з поля форми в мінімальні одиниці валюти.
 * Нуль дозволено; повертає текст помилки, якщо значення некоректне.
 */
export function parsePlannedAmount(text: string, currency: string): number | string {
  if (text.trim() === '') return 'Вкажіть суму';
  try {
    const { amountMinor } = parseMoney(text.trim(), currency);
    return amountMinor >= 0 ? amountMinor : 'Сума не може бути відʼємною';
  } catch (error) {
    if (error instanceof MoneyRangeError) return 'Сума завелика';
    if (error instanceof MoneyParseError) return 'Некоректна сума, приклад: 1234,50';
    throw error;
  }
}

/** Сума для поля форми: 1200000 копійок -> «12000,00». */
export function plannedAmountText(amountMinor: number, currency: string): string {
  return toDecimalString({ amountMinor, currency }).replace('.', ',');
}
