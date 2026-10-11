import { describe, expect, it } from 'vitest';
import {
  CurrencyMismatchError,
  MoneyParseError,
  MoneyRangeError,
  addMoney,
  currencySchema,
  formatMoney,
  minorUnitDigits,
  money,
  moneySchema,
  parseMoney,
  subtractMoney,
  sumMoney,
  toDecimalString,
} from '../money.ts';

describe('parseMoney', () => {
  it.each([
    ['120', 12000],
    ['120.5', 12050],
    ['120,50', 12050],
    ['0.01', 1],
    ['1 234,56', 123456],
    ['-12.30', -1230],
    ['0', 0],
    ['-0.00', 0],
  ])('розбирає %s у %i копійок', (input, expected) => {
    expect(parseMoney(input)).toEqual({ amountMinor: expected, currency: 'UAH' });
  });

  it('не втрачає точність там, де float помиляється', () => {
    expect(parseMoney('0.1').amountMinor + parseMoney('0.2').amountMinor).toBe(30);
    expect(parseMoney('1.15').amountMinor).toBe(115);
    expect(parseMoney('8.95').amountMinor).toBe(895);
  });

  it.each(['', 'abc', '12.345', '1.2.3', '12.', '.5', '1e3', '--1', '12 грн'])(
    'відхиляє %j',
    (input) => {
      expect(() => parseMoney(input)).toThrow(MoneyParseError);
    },
  );

  it('враховує кількість знаків валюти', () => {
    expect(parseMoney('500', 'JPY').amountMinor).toBe(500);
    expect(() => parseMoney('500.5', 'JPY')).toThrow(MoneyParseError);
    expect(parseMoney('1.234', 'KWD').amountMinor).toBe(1234);
  });

  it('відхиляє суми поза безпечним діапазоном', () => {
    expect(() => parseMoney('90071992547409.92')).toThrow(MoneyRangeError);
    expect(parseMoney('90071992547409.91').amountMinor).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('арифметика', () => {
  it('додає і віднімає в одній валюті', () => {
    expect(addMoney(money(150), money(250))).toEqual(money(400));
    expect(subtractMoney(money(150), money(250))).toEqual(money(-100));
  });

  it('не поєднує різні валюти', () => {
    expect(() => addMoney(money(100, 'UAH'), money(100, 'USD'))).toThrow(CurrencyMismatchError);
    expect(() => subtractMoney(money(100, 'UAH'), money(100, 'EUR'))).toThrow(
      CurrencyMismatchError,
    );
    expect(() => sumMoney([money(1, 'UAH'), money(1, 'USD')])).toThrow(CurrencyMismatchError);
  });

  it('сумує список, порожній список дає нуль', () => {
    expect(sumMoney([money(1), money(2), money(3)])).toEqual(money(6));
    expect(sumMoney([])).toEqual(money(0, 'UAH'));
    expect(sumMoney([], 'USD')).toEqual(money(0, 'USD'));
  });

  it('відхиляє переповнення і нецілі значення', () => {
    expect(() => addMoney(money(Number.MAX_SAFE_INTEGER), money(1))).toThrow(MoneyRangeError);
    expect(() => money(10.5)).toThrow(MoneyRangeError);
    expect(() => money(Number.NaN)).toThrow(MoneyRangeError);
  });
});

describe('форматування', () => {
  it.each([
    [123450, '1234.50'],
    [5, '0.05'],
    [0, '0.00'],
    [-5, '-0.05'],
    [-123450, '-1234.50'],
    [Number.MAX_SAFE_INTEGER, '90071992547409.91'],
  ])('toDecimalString(%i) = %s', (amountMinor, expected) => {
    expect(toDecimalString(money(amountMinor))).toBe(expected);
  });

  it('обернене до parseMoney', () => {
    for (const amountMinor of [0, 1, 99, 100, 101, 123456789, -1, -100]) {
      expect(parseMoney(toDecimalString(money(amountMinor))).amountMinor).toBe(amountMinor);
    }
  });

  it('враховує валюти без копійок', () => {
    expect(toDecimalString(money(500, 'JPY'))).toBe('500');
    expect(minorUnitDigits('JPY')).toBe(0);
    expect(minorUnitDigits('UAH')).toBe(2);
  });

  it('форматує з локаллю', () => {
    expect(formatMoney(money(123450), 'en-US')).toBe('UAH 1,234.50');
    expect(formatMoney(money(123450, 'USD'), 'en-US')).toBe('$1,234.50');
  });
});

describe('схеми', () => {
  it('приймає тільки коди ISO 4217', () => {
    expect(currencySchema.safeParse('UAH').success).toBe(true);
    expect(currencySchema.safeParse('uah').success).toBe(false);
    expect(currencySchema.safeParse('ZZZ').success).toBe(false);
    expect(currencySchema.safeParse('UA').success).toBe(false);
  });

  it('відхиляє дробові суми', () => {
    expect(moneySchema.safeParse({ amountMinor: 100, currency: 'UAH' }).success).toBe(true);
    expect(moneySchema.safeParse({ amountMinor: 100.5, currency: 'UAH' }).success).toBe(false);
    expect(moneySchema.safeParse({ amountMinor: 2 ** 60, currency: 'UAH' }).success).toBe(false);
    expect(moneySchema.safeParse({ amountMinor: '100', currency: 'UAH' }).success).toBe(false);
  });
});
