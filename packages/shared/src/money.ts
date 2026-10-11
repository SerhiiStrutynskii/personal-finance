import { z } from 'zod';

// Суми завжди зберігаються цілим числом мінімальних одиниць валюти (копійки для UAH).

export const DEFAULT_CURRENCY = 'UAH';

const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Очікується код валюти ISO 4217')
  .refine((code) => SUPPORTED_CURRENCIES.has(code), 'Невідома валюта');

export const amountMinorSchema = z.number().int().refine(Number.isSafeInteger, 'Сума завелика');

export const positiveAmountMinorSchema = amountMinorSchema.positive();

export const moneySchema = z.object({
  amountMinor: amountMinorSchema,
  currency: currencySchema,
});

export type Money = z.infer<typeof moneySchema>;

export class CurrencyMismatchError extends Error {
  constructor(left: string, right: string) {
    super(`Не можна поєднувати суми у різних валютах без конвертації: ${left} і ${right}`);
    this.name = 'CurrencyMismatchError';
  }
}

export class MoneyRangeError extends Error {
  constructor() {
    super('Сума виходить за межі безпечного цілого числа');
    this.name = 'MoneyRangeError';
  }
}

export class MoneyParseError extends Error {
  constructor(input: string) {
    super(`Некоректна сума: "${input}"`);
    this.name = 'MoneyParseError';
  }
}

function assertSafe(amountMinor: number): number {
  if (!Number.isSafeInteger(amountMinor)) throw new MoneyRangeError();
  return amountMinor;
}

/** Кількість знаків після коми у валюті: 2 для UAH, 0 для JPY, 3 для KWD. */
export function minorUnitDigits(currency: string): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

export function money(amountMinor: number, currency: string = DEFAULT_CURRENCY): Money {
  return { amountMinor: assertSafe(amountMinor), currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

/** Сума списку в одній валюті; порожній список дає нуль у вказаній валюті. */
export function sumMoney(items: readonly Money[], currency: string = DEFAULT_CURRENCY): Money {
  return items.reduce((total, item) => addMoney(total, item), money(0, currency));
}

/**
 * Розбирає десятковий рядок ("1 234,50", "-12.5") у мінімальні одиниці без float-арифметики.
 * Зайві знаки після коми не округлюються, а вважаються помилкою.
 */
export function parseMoney(input: string, currency: string = DEFAULT_CURRENCY): Money {
  const digits = minorUnitDigits(currency);
  const normalized = input.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new MoneyParseError(input);

  const [, sign, whole = '', fraction = ''] = match;
  if (fraction.length > digits) throw new MoneyParseError(input);

  const minor = BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0') || '0');
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new MoneyRangeError();

  const amountMinor = Number(minor);
  return money(sign && amountMinor !== 0 ? -amountMinor : amountMinor, currency);
}

/** Точний десятковий рядок без локалі: 123450 UAH -> "1234.50". */
export function toDecimalString({ amountMinor, currency }: Money): string {
  const digits = minorUnitDigits(currency);
  const abs = BigInt(Math.abs(assertSafe(amountMinor)))
    .toString()
    .padStart(digits + 1, '0');
  const whole = digits === 0 ? abs : abs.slice(0, -digits);
  const fraction = digits === 0 ? '' : `.${abs.slice(-digits)}`;
  return `${amountMinor < 0 ? '-' : ''}${whole}${fraction}`;
}

export function formatMoney(value: Money, locale: string = 'uk-UA'): string {
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: value.currency });
  // Рядковий аргумент форматується точно, без проміжного float.
  return formatter.format(toDecimalString(value) as `${number}`);
}
