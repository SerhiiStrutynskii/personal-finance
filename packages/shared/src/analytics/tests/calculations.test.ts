import { describe, expect, it } from 'vitest';
import {
  breakdownByCategory,
  buildTrend,
  debtLoad,
  forecastSpending,
  monthProgress,
  monthsEndingAt,
  savingsRate,
  type LoanHistory,
} from '../calculations.ts';

const row = (
  categoryId: string | null,
  spent: number,
  categoryName = categoryId ?? 'Без категорії',
) => ({
  categoryId,
  categoryName,
  spent,
});

describe('breakdownByCategory', () => {
  it('частки, зміна й сортування за сумою', () => {
    const result = breakdownByCategory(
      [row('food', 300), row('fun', 100), row(null, 600)],
      [row('food', 250), row(null, 700)],
    );
    expect(result).toEqual({
      totalSpent: 1000,
      previousTotalSpent: 950,
      change: 50,
      categories: [
        {
          categoryId: null,
          categoryName: 'Без категорії',
          spent: 600,
          share: 0.6,
          previousSpent: 700,
          change: -100,
        },
        {
          categoryId: 'food',
          categoryName: 'food',
          spent: 300,
          share: 0.3,
          previousSpent: 250,
          change: 50,
        },
        {
          categoryId: 'fun',
          categoryName: 'fun',
          spent: 100,
          share: 0.1,
          previousSpent: 0,
          change: 100,
        },
      ],
    });
  });

  it('категорія лише в попередньому місяці лишається в списку з нулем', () => {
    const result = breakdownByCategory([row('food', 300)], [row('gifts', 80)]);
    expect(result.categories).toEqual([
      {
        categoryId: 'food',
        categoryName: 'food',
        spent: 300,
        share: 1,
        previousSpent: 0,
        change: 300,
      },
      {
        categoryId: 'gifts',
        categoryName: 'gifts',
        spent: 0,
        share: 0,
        previousSpent: 80,
        change: -80,
      },
    ]);
    expect(result.change).toBe(220);
  });

  it('порожній місяць: частки нульові, ділення на нуль немає', () => {
    expect(breakdownByCategory([], [])).toEqual({
      totalSpent: 0,
      previousTotalSpent: 0,
      change: 0,
      categories: [],
    });
    const onlyPrevious = breakdownByCategory([], [row('food', 500)]);
    expect(onlyPrevious.categories[0]).toMatchObject({ spent: 0, share: 0, change: -500 });
  });

  it('частки в сумі дають 1', () => {
    const { categories } = breakdownByCategory([row('a', 1), row('b', 1), row('c', 1)], []);
    expect(categories.reduce((sum, item) => sum + item.share, 0)).toBeCloseTo(1, 10);
  });
});

describe('savingsRate і debtLoad', () => {
  it('норма заощаджень', () => {
    expect(savingsRate(6_000_000, 5_100_000)).toBe(0.15);
    expect(savingsRate(1000, 1000)).toBe(0);
  });

  it('витрати більші за дохід — від’ємна норма', () => {
    expect(savingsRate(1000, 1500)).toBe(-0.5);
  });

  it('без доходу норми немає', () => {
    expect(savingsRate(0, 0)).toBeNull();
    expect(savingsRate(0, 500)).toBeNull();
    expect(debtLoad(500, 0)).toBeNull();
  });

  it('боргове навантаження', () => {
    expect(debtLoad(390_000, 6_000_000)).toBe(0.065);
    expect(debtLoad(0, 1000)).toBe(0);
  });
});

describe('monthsEndingAt', () => {
  it('останні місяці від найдавнішого, через межу року', () => {
    expect(monthsEndingAt('2026-02', 6)).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(monthsEndingAt('2026-10', 1)).toEqual(['2026-10']);
    expect(monthsEndingAt('2026-10', 12)).toHaveLength(12);
  });
});

describe('monthProgress', () => {
  it('поточний місяць: дні до сьогодні включно', () => {
    expect(monthProgress('2026-10', '2026-10-12')).toEqual({ daysElapsed: 12, daysInMonth: 31 });
    expect(monthProgress('2026-10', '2026-10-01')).toEqual({ daysElapsed: 1, daysInMonth: 31 });
    expect(monthProgress('2026-10', '2026-10-31')).toEqual({ daysElapsed: 31, daysInMonth: 31 });
  });

  it('минулий місяць минув повністю, майбутній ще не почався', () => {
    expect(monthProgress('2026-09', '2026-10-12')).toEqual({ daysElapsed: 30, daysInMonth: 30 });
    expect(monthProgress('2026-11', '2026-10-12')).toEqual({ daysElapsed: 0, daysInMonth: 30 });
  });

  it('лютий у звичайному й високосному році', () => {
    expect(monthProgress('2026-02', '2026-02-10').daysInMonth).toBe(28);
    expect(monthProgress('2028-02', '2028-02-10').daysInMonth).toBe(29);
  });
});

describe('forecastSpending', () => {
  it('лінійна екстраполяція темпу', () => {
    // 3 180 000 за 12 днів із 31
    expect(forecastSpending(3_180_000, 12, 31)).toBe(8_215_000);
    expect(forecastSpending(1500, 15, 30)).toBe(3000);
  });

  it('перший день місяця: денна сума на всі дні', () => {
    expect(forecastSpending(1000, 1, 31)).toBe(31_000);
  });

  it('останній день місяця і минулий місяць: прогноз дорівнює факту', () => {
    expect(forecastSpending(4321, 31, 31)).toBe(4321);
    expect(forecastSpending(4321, 30, 30)).toBe(4321);
  });

  it('округлює до копійки, половину — вгору', () => {
    expect(forecastSpending(1, 3, 31)).toBe(10); // 10,33
    expect(forecastSpending(1, 2, 31)).toBe(16); // 15,5
    expect(forecastSpending(100, 7, 30)).toBe(429); // 428,57
  });

  it('без витрат і без минулих днів', () => {
    expect(forecastSpending(0, 5, 31)).toBe(0);
    expect(forecastSpending(700, 0, 31)).toBe(700);
  });
});

describe('buildTrend', () => {
  const months = ['2026-08', '2026-09', '2026-10'];
  const facts = (month: string, income: number, expenses: number, override: object = {}) => ({
    month,
    income,
    expenses,
    debtPayments: 0,
    accountsDelta: income - expenses,
    ...override,
  });

  it('дохід, витрати, різниця, норма й накопичені чисті активи', () => {
    const points = buildTrend({
      months,
      facts: [facts('2026-08', 1000, 600), facts('2026-10', 2000, 2500)],
      accountsBefore: 5000,
      loans: [],
    });
    expect(points).toEqual([
      {
        month: '2026-08',
        income: 1000,
        expenses: 600,
        net: 400,
        savingsRate: 0.4,
        netWorth: 5400,
        debtPayments: 0,
        debtLoad: 0,
      },
      // місяць без даних: нулі, чисті активи без змін
      {
        month: '2026-09',
        income: 0,
        expenses: 0,
        net: 0,
        savingsRate: null,
        netWorth: 5400,
        debtPayments: 0,
        debtLoad: null,
      },
      {
        month: '2026-10',
        income: 2000,
        expenses: 2500,
        net: -500,
        savingsRate: -0.25,
        netWorth: 4900,
        debtPayments: 0,
        debtLoad: 0,
      },
    ]);
  });

  it('боргове навантаження місяця', () => {
    const [point] = buildTrend({
      months: ['2026-10'],
      facts: [facts('2026-10', 6_000_000, 5_000_000, { debtPayments: 390_000 })],
      accountsBefore: 0,
      loans: [],
    });
    expect(point).toMatchObject({ debtPayments: 390_000, debtLoad: 0.065 });
  });

  const loan = (override: Partial<LoanHistory> = {}): LoanHistory => ({
    initialAmount: 1000,
    startDate: '2026-01-15',
    before: { charges: 0, principalPaid: 0, adjustments: 0 },
    monthly: [],
    ...override,
  });

  it('позики віднімаються за залишком на кінець кожного місяця', () => {
    const points = buildTrend({
      months,
      facts: [],
      accountsBefore: 5000,
      loans: [
        loan({
          before: { charges: 100, principalPaid: 300, adjustments: 0 },
          monthly: [
            { month: '2026-09', charges: 0, principalPaid: 200, adjustments: 0 },
            { month: '2026-10', charges: 50, principalPaid: 0, adjustments: -100 },
          ],
        }),
      ],
    });
    // залишок: 800 → 600 → 550
    expect(points.map((point) => point.netWorth)).toEqual([4200, 4400, 4450]);
  });

  it('позика до місяця свого початку не враховується', () => {
    const points = buildTrend({
      months,
      facts: [],
      accountsBefore: 5000,
      loans: [loan({ startDate: '2026-09-20' })],
    });
    expect(points.map((point) => point.netWorth)).toEqual([5000, 4000, 4000]);
  });

  it('залишок позики не менший за 0', () => {
    const points = buildTrend({
      months: ['2026-10'],
      facts: [],
      accountsBefore: 0,
      loans: [loan({ before: { charges: 0, principalPaid: 1500, adjustments: 0 } })],
    });
    expect(points[0]!.netWorth).toBe(0);
  });

  it('платіж по позиці, що весь іде в тіло, чистих активів не змінює', () => {
    const points = buildTrend({
      months: ['2026-09', '2026-10'],
      facts: [facts('2026-10', 0, 400, { debtPayments: 400 })],
      accountsBefore: 5000,
      loans: [
        loan({ monthly: [{ month: '2026-10', charges: 0, principalPaid: 400, adjustments: 0 }] }),
      ],
    });
    expect(points.map((point) => point.netWorth)).toEqual([4000, 4000]);
  });
});
