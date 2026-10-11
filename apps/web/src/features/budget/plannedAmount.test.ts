import { describe, expect, it } from 'vitest';
import { parsePlannedAmount, plannedAmountText } from './plannedAmount.ts';

describe('parsePlannedAmount', () => {
  it.each([
    ['12000', 1200000],
    ['12 000,50', 1200050],
    ['0', 0],
    ['0,00', 0],
    ['0,01', 1],
  ])('%j -> %i', (text, expected) => {
    expect(parsePlannedAmount(text, 'UAH')).toBe(expected);
  });

  it.each([
    ['', 'Вкажіть суму'],
    ['  ', 'Вкажіть суму'],
    ['-5', 'Сума не може бути відʼємною'],
    ['abc', 'Некоректна сума, приклад: 1234,50'],
    ['1,234', 'Некоректна сума, приклад: 1234,50'],
    ['99999999999999999', 'Сума завелика'],
  ])('%j -> «%s»', (text, message) => {
    expect(parsePlannedAmount(text, 'UAH')).toBe(message);
  });
});

describe('plannedAmountText', () => {
  it('обернене до parsePlannedAmount', () => {
    for (const amount of [0, 1, 1200000, 1200050]) {
      expect(parsePlannedAmount(plannedAmountText(amount, 'UAH'), 'UAH')).toBe(amount);
    }
    expect(plannedAmountText(1200050, 'UAH')).toBe('12000,50');
  });
});
