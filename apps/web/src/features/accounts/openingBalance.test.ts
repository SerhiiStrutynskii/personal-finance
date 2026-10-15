import { describe, expect, it } from 'vitest';
import { parseActualBalance, parseOpeningBalance } from './openingBalance.ts';

describe('parseOpeningBalance', () => {
  it('порожнє поле — нульовий залишок', () => {
    expect(parseOpeningBalance('', 'UAH')).toBe(0);
    expect(parseOpeningBalance('   ', 'UAH')).toBe(0);
  });

  it('розбирає суму в копійках, зокрема з пробілами й комою', () => {
    expect(parseOpeningBalance('1 234,50', 'UAH')).toBe(123_450);
    expect(parseOpeningBalance('0', 'UAH')).toBe(0);
    expect(parseOpeningBalance('15', 'JPY')).toBe(15);
  });

  it("від'ємна чи некоректна сума — помилка", () => {
    expect(parseOpeningBalance('-100', 'UAH')).toBe('Сума не може бути відʼємною');
    expect(parseOpeningBalance('abc', 'UAH')).toBe('Некоректна сума, приклад: 1234,50');
    expect(parseOpeningBalance('1,234', 'UAH')).toBe('Некоректна сума, приклад: 1234,50');
  });
});

describe('parseActualBalance', () => {
  it("розбирає суму в копійках, зокрема нуль і від'ємну", () => {
    expect(parseActualBalance('1 234,50', 'UAH')).toBe(123_450);
    expect(parseActualBalance('0', 'UAH')).toBe(0);
    expect(parseActualBalance('-250,5', 'UAH')).toBe(-25_050);
    expect(parseActualBalance('-15', 'JPY')).toBe(-15);
  });

  it('порожня чи некоректна сума — помилка', () => {
    expect(parseActualBalance('  ', 'UAH')).toBe('Вкажіть суму');
    expect(parseActualBalance('abc', 'UAH')).toBe('Некоректна сума, приклад: 1234,50');
    expect(parseActualBalance('1,234', 'UAH')).toBe('Некоректна сума, приклад: 1234,50');
    expect(parseActualBalance('99999999999999999', 'UAH')).toBe('Сума завелика');
  });
});
