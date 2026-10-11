import { describe, expect, it } from 'vitest';
import { budgetPeriod, monthSchema, shiftMonth } from '../month.ts';

describe('monthSchema', () => {
  it.each(['2026-10', '2026-01', '2026-12'])('приймає %s', (value) => {
    expect(monthSchema.safeParse(value).success).toBe(true);
  });

  it.each(['2026-13', '2026-00', '2026-1', '26-10', '2026/10', '2026-10-01', ''])(
    'відхиляє %j',
    (value) => {
      expect(monthSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('budgetPeriod', () => {
  it('повертає межі місяця в часовому поясі домогосподарства', () => {
    const period = budgetPeriod('2026-10', 'Europe/Kyiv');
    // 1 жовтня ще літній час (UTC+3), 1 листопада вже зимовий (UTC+2)
    expect(period.start.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-10-31T22:00:00.000Z');
  });

  it('сусідні місяці стикуються', () => {
    expect(budgetPeriod('2026-12', 'Europe/Kyiv').end).toEqual(
      budgetPeriod('2027-01', 'Europe/Kyiv').start,
    );
  });
});

describe('shiftMonth', () => {
  it.each([
    ['2026-10', -1, '2026-09'],
    ['2026-10', 1, '2026-11'],
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
    ['2026-03', -14, '2025-01'],
    ['2026-03', 0, '2026-03'],
  ])('shiftMonth(%s, %i) = %s', (month, delta, expected) => {
    expect(shiftMonth(month, delta)).toBe(expected);
  });
});
