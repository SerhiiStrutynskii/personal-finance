import type { IncomeSource } from '@hf/shared';
import { describe, expect, it } from 'vitest';
import {
  describeRule,
  initialSourceValues,
  ruleFromValues,
  toSourceInput,
  type SourceFormValues,
} from './sourceForm.ts';

const ACCOUNT = '00000000-0000-4000-8000-000000000001';
const defaults = { accountId: ACCOUNT, today: '2026-10-11' };

const values = (override: Partial<SourceFormValues> = {}): SourceFormValues => ({
  ...initialSourceValues(undefined, defaults),
  name: 'Зарплата',
  amount: '45000',
  ...override,
});

describe('initialSourceValues', () => {
  it('нове джерело: щомісяця сьогоднішнього числа, від сьогодні', () => {
    expect(initialSourceValues(undefined, defaults)).toMatchObject({
      accountId: ACCOUNT,
      frequency: 'monthly',
      dayOfMonth: '11',
      startDate: '2026-10-11',
      endDate: '',
      amount: '',
    });
  });

  it('редагування заповнює форму значеннями джерела', () => {
    const source: IncomeSource = {
      id: '00000000-0000-4000-8000-000000000009',
      name: 'Оренда',
      accountId: ACCOUNT,
      currency: 'UAH',
      plannedAmount: 1250050,
      frequency: 'every_n_months',
      dayOfMonth: 31,
      dayOfWeek: null,
      intervalMonths: 6,
      startDate: '2026-01-01',
      endDate: '2027-12-31',
      isActive: true,
    };
    const form = initialSourceValues(source, defaults);
    expect(form).toMatchObject({
      name: 'Оренда',
      amount: '12500,50',
      frequency: 'every_n_months',
      dayOfMonth: '31',
      intervalMonths: '6',
      endDate: '2027-12-31',
    });
    // без змін форма дає ті самі дані
    expect(toSourceInput(form, 'UAH')).toMatchObject({
      ok: true,
      input: { plannedAmount: 1250050, dayOfMonth: 31, intervalMonths: 6, dayOfWeek: null },
    });
  });
});

describe('toSourceInput', () => {
  it('monthly: передає день місяця, решту полів правила обнуляє', () => {
    expect(toSourceInput(values({ dayOfMonth: '5', dayOfWeek: '3' }), 'UAH')).toEqual({
      ok: true,
      input: {
        name: 'Зарплата',
        accountId: ACCOUNT,
        plannedAmount: 4500000,
        frequency: 'monthly',
        dayOfMonth: 5,
        dayOfWeek: null,
        intervalMonths: null,
        startDate: '2026-10-11',
        endDate: null,
      },
    });
  });

  it('weekly: передає день тижня й ігнорує день місяця', () => {
    const result = toSourceInput(
      values({ frequency: 'weekly', dayOfWeek: '5', dayOfMonth: 'abc' }),
      'UAH',
    );
    expect(result).toMatchObject({
      ok: true,
      input: { frequency: 'weekly', dayOfWeek: 5, dayOfMonth: null },
    });
  });

  it.each<[string, Partial<SourceFormValues>, keyof SourceFormValues]>([
    ['порожня назва', { name: ' ' }, 'name'],
    ['порожня сума', { amount: '' }, 'amount'],
    ['нульова сума', { amount: '0' }, 'amount'],
    ['некоректна сума', { amount: '12,345' }, 'amount'],
    ['день місяця 32', { dayOfMonth: '32' }, 'dayOfMonth'],
    ['день місяця не число', { dayOfMonth: 'пʼяте' }, 'dayOfMonth'],
    ['інтервал 0', { frequency: 'every_n_months', intervalMonths: '0' }, 'intervalMonths'],
    ['без рахунку', { accountId: '' }, 'accountId'],
    ['без дати початку', { startDate: '' }, 'startDate'],
    ['кінець раніше за початок', { endDate: '2026-01-01' }, 'endDate'],
  ])('помилка: %s', (_name, override, field) => {
    const result = toSourceInput(values(override), 'UAH');
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors)).toEqual([field]);
  });
});

describe('ruleFromValues', () => {
  it('повертає правило для коректних полів і undefined для незаповнених', () => {
    expect(ruleFromValues(values({ dayOfMonth: '5' }))).toMatchObject({
      frequency: 'monthly',
      dayOfMonth: 5,
      startDate: '2026-10-11',
      endDate: null,
    });
    expect(ruleFromValues(values({ dayOfMonth: '' }))).toBeUndefined();
    expect(ruleFromValues(values({ startDate: '' }))).toBeUndefined();
    expect(
      ruleFromValues(values({ frequency: 'every_n_months', intervalMonths: '' })),
    ).toBeUndefined();
    // для тижневої частоти день місяця не потрібен
    expect(ruleFromValues(values({ frequency: 'weekly', dayOfMonth: '' }))).toBeDefined();
  });
});

describe('describeRule', () => {
  it.each([
    [{ frequency: 'monthly', dayOfMonth: 5 }, 'Щомісяця 5-го'],
    [{ frequency: 'every_n_months', dayOfMonth: 15, intervalMonths: 3 }, 'Кожні 3 міс. 15-го'],
    [{ frequency: 'weekly', dayOfWeek: 5 }, 'Щотижня у пʼятницю'],
    [{ frequency: 'biweekly', dayOfWeek: 3 }, 'Раз на два тижні у середу'],
  ] as const)('%j -> %s', (rule, expected) => {
    expect(describeRule({ dayOfMonth: null, dayOfWeek: null, intervalMonths: null, ...rule })).toBe(
      expected,
    );
  });
});
