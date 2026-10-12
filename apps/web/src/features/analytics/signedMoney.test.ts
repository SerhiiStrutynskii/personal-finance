import { describe, expect, it } from 'vitest';
import { percentText, shortMonthLabel } from '../../shared/ui/format.ts';
import { signedMoney } from './signedMoney.ts';

// formatMoney розділяє розряди нерозривним пробілом, тому перевіряється лише знак.
describe('signedMoney', () => {
  it('додатна сума з плюсом, від’ємна — з мінусом, нуль — без знака', () => {
    expect(signedMoney(150_000, 'UAH').startsWith('+')).toBe(true);
    expect(signedMoney(-30_000, 'UAH').startsWith('−')).toBe(true);
    expect(signedMoney(-30_000, 'UAH')).toContain('300,00');
    expect(signedMoney(0, 'UAH')).toMatch(/^0,00/);
  });
});

describe('percentText', () => {
  it('один знак після коми, зокрема для від’ємних', () => {
    expect(percentText(0.4245)).toBe('42,5%');
    expect(percentText(0.15)).toBe('15,0%');
    expect(percentText(-0.5)).toBe('-50,0%');
    expect(percentText(0)).toBe('0,0%');
    expect(percentText(1)).toBe('100,0%');
  });
});

describe('shortMonthLabel', () => {
  it('короткий місяць і дві цифри року', () => {
    expect(shortMonthLabel('2026-10')).toBe('жовт. 26');
    expect(shortMonthLabel('2025-01')).toBe('січ. 25');
  });
});
