import { describe, expect, it } from 'vitest';
import { monthPeriod } from '../../dates.ts';
import {
  calculateBudget,
  getCategoryStatus,
  getUsage,
  summarizeTransactions,
  type BudgetTransaction,
} from '../calculations.ts';

const KYIV = 'Europe/Kyiv';
const october = monthPeriod(2026, 10, KYIV);
const periodEnd = october.end;
const during = new Date('2026-10-15T12:00:00Z');
const after = new Date('2026-11-05T12:00:00Z');

describe('getCategoryStatus', () => {
  it('spent < planned, період триває → neutral', () => {
    expect(getCategoryStatus(1000, 400, during, periodEnd)).toBe('neutral');
  });

  it('spent < planned, період завершився → surplus', () => {
    expect(getCategoryStatus(1000, 400, after, periodEnd)).toBe('surplus');
    expect(getCategoryStatus(1000, 999, after, periodEnd)).toBe('surplus');
    expect(getCategoryStatus(1000, 0, after, periodEnd)).toBe('surplus');
  });

  it('spent == planned → neutral, і під час періоду, і після нього', () => {
    expect(getCategoryStatus(1000, 1000, during, periodEnd)).toBe('neutral');
    expect(getCategoryStatus(1000, 1000, after, periodEnd)).toBe('neutral');
  });

  it('spent > planned на 1 копійку → over, і під час періоду, і після нього', () => {
    expect(getCategoryStatus(1000, 1001, during, periodEnd)).toBe('over');
    expect(getCategoryStatus(1000, 1001, after, periodEnd)).toBe('over');
  });

  it('planned = 0: з витратами → over, без витрат → neutral', () => {
    expect(getCategoryStatus(0, 1, during, periodEnd)).toBe('over');
    expect(getCategoryStatus(0, 1, after, periodEnd)).toBe('over');
    expect(getCategoryStatus(0, 0, during, periodEnd)).toBe('neutral');
    expect(getCategoryStatus(0, 0, after, periodEnd)).toBe('neutral');
  });

  it('now рівно = periodEnd → період завершено; на мілісекунду раніше — ще ні', () => {
    expect(getCategoryStatus(1000, 400, periodEnd, periodEnd)).toBe('surplus');
    expect(getCategoryStatus(1000, 400, new Date(periodEnd.getTime() - 1), periodEnd)).toBe(
      'neutral',
    );
  });
});

describe('getUsage', () => {
  it('рахує частку ліміту', () => {
    expect(getUsage(1200000, 1350000)).toBe(1.125);
    expect(getUsage(1000, 0)).toBe(0);
    expect(getUsage(1000, 1000)).toBe(1);
  });

  it('без ліміту: 0 без витрат і null (нескінченність) із витратами', () => {
    expect(getUsage(0, 0)).toBe(0);
    expect(getUsage(0, 1)).toBeNull();
  });
});

describe('summarizeTransactions', () => {
  const tx = (override: Partial<BudgetTransaction>): BudgetTransaction => ({
    type: 'expense',
    amountMinor: 100,
    currency: 'UAH',
    occurredAt: during,
    categoryId: 'food',
    categoryName: 'Продукти',
    ...override,
  });

  it('перекази не впливають ні на витрати, ні на доходи', () => {
    const facts = summarizeTransactions(
      [
        tx({ amountMinor: 300 }),
        tx({ type: 'transfer', amountMinor: 999999, categoryId: null }),
        tx({ type: 'income', amountMinor: 5000, categoryId: null, incomeLineId: 'salary' }),
      ],
      october,
      'UAH',
    );

    expect(facts.spending).toEqual([{ categoryId: 'food', categoryName: 'Продукти', spent: 300 }]);
    expect(facts.income).toEqual([{ incomeLineId: 'salary', received: 5000 }]);
  });

  it('період — півінтервал у часовому поясі домогосподарства', () => {
    const facts = summarizeTransactions(
      [
        // 23:59:59 30 вересня за Києвом — ще вересень
        tx({ amountMinor: 1, occurredAt: new Date(october.start.getTime() - 1000) }),
        // 00:00 1 жовтня — уже жовтень
        tx({ amountMinor: 10, occurredAt: october.start }),
        // 23:30 31 жовтня за Києвом (21:30 UTC, зимовий час) — ще жовтень
        tx({ amountMinor: 100, occurredAt: new Date('2026-10-31T21:30:00Z') }),
        // 00:00 1 листопада — уже листопад
        tx({ amountMinor: 1000, occurredAt: october.end }),
      ],
      october,
      'UAH',
    );

    expect(facts.spending).toEqual([{ categoryId: 'food', categoryName: 'Продукти', spent: 110 }]);
  });

  it('групує за категоріями й статтями, окремо рахує записи без них', () => {
    const facts = summarizeTransactions(
      [
        tx({ amountMinor: 100 }),
        tx({ amountMinor: 50 }),
        tx({ amountMinor: 70, categoryId: 'fuel', categoryName: 'Пальне' }),
        tx({ amountMinor: 5, categoryId: null, categoryName: null }),
        tx({ type: 'income', amountMinor: 1000, categoryId: null, incomeLineId: 'salary' }),
        tx({ type: 'income', amountMinor: 2000, categoryId: null, incomeLineId: 'salary' }),
        tx({ type: 'income', amountMinor: 300, categoryId: null }),
      ],
      october,
      'UAH',
    );

    expect(facts.spending).toEqual([
      { categoryId: 'food', categoryName: 'Продукти', spent: 150 },
      { categoryId: 'fuel', categoryName: 'Пальне', spent: 70 },
      { categoryId: null, categoryName: 'Без категорії', spent: 5 },
    ]);
    expect(facts.income).toEqual([
      { incomeLineId: 'salary', received: 3000 },
      { incomeLineId: null, received: 300 },
    ]);
  });

  it('не змішує валюти: враховує лише валюту бюджету', () => {
    const facts = summarizeTransactions(
      [tx({ amountMinor: 100 }), tx({ amountMinor: 999, currency: 'USD' })],
      october,
      'UAH',
    );
    expect(facts.spending[0]!.spent).toBe(100);
  });
});

describe('calculateBudget', () => {
  const input = {
    incomeLines: [
      { id: 'salary', name: 'Зарплата', planned: 5000000 },
      { id: 'freelance', name: 'Фріланс', planned: 1000000 },
    ],
    expenseLines: [
      { id: 'l1', categoryId: 'food', categoryName: 'Продукти', planned: 1200000 },
      { id: 'l2', categoryId: 'transport', categoryName: 'Транспорт', planned: 300000 },
      { id: 'l3', categoryId: 'utilities', categoryName: 'Комунальні', planned: 400000 },
      { id: 'l4', categoryId: 'fun', categoryName: 'Розваги', planned: 0 },
    ],
    spending: [
      { categoryId: 'food', categoryName: 'Продукти', spent: 1350000 },
      { categoryId: 'transport', categoryName: 'Транспорт', spent: 120000 },
      { categoryId: 'utilities', categoryName: 'Комунальні', spent: 400000 },
      { categoryId: 'gifts', categoryName: 'Подарунки', spent: 80000 },
      { categoryId: null, categoryName: 'Без категорії', spent: 5000 },
    ],
    income: [
      { incomeLineId: 'salary', received: 4500000 },
      { incomeLineId: null, received: 20000 },
      { incomeLineId: 'line-of-another-budget', received: 30000 },
    ],
    periodEnd,
  };

  it('рахує рядки витрат під час періоду', () => {
    const { expenseLines } = calculateBudget({ ...input, now: during });

    expect(expenseLines).toEqual([
      expect.objectContaining({
        id: 'l1',
        planned: 1200000,
        spent: 1350000,
        remaining: -150000,
        usage: 1.125,
        status: 'over',
      }),
      expect.objectContaining({ id: 'l2', spent: 120000, remaining: 180000, status: 'neutral' }),
      expect.objectContaining({
        id: 'l3',
        spent: 400000,
        remaining: 0,
        usage: 1,
        status: 'neutral',
      }),
      expect.objectContaining({ id: 'l4', spent: 0, remaining: 0, usage: 0, status: 'neutral' }),
    ]);
  });

  it('після завершення періоду залишок стає surplus, решта статусів не змінюється', () => {
    const { expenseLines } = calculateBudget({ ...input, now: after });
    expect(expenseLines.map((line) => line.status)).toEqual([
      'over',
      'surplus',
      'neutral',
      'neutral',
    ]);
  });

  it('витрати без запланованої статті потрапляють у незаплановані зі статусом over', () => {
    const { unplannedExpenses } = calculateBudget({ ...input, now: during });
    expect(unplannedExpenses).toEqual([
      { categoryId: 'gifts', categoryName: 'Подарунки', spent: 80000, status: 'over' },
      { categoryId: null, categoryName: 'Без категорії', spent: 5000, status: 'over' },
    ]);
  });

  it('рахує доходи по статтях; доходи без статті цього бюджету — «інші»', () => {
    const result = calculateBudget({ ...input, now: during });

    expect(result.incomeLines).toEqual([
      { id: 'salary', name: 'Зарплата', planned: 5000000, received: 4500000, diff: -500000 },
      { id: 'freelance', name: 'Фріланс', planned: 1000000, received: 0, diff: -1000000 },
    ]);
    expect(result.otherIncome).toBe(50000);
  });

  it('рахує підсумки й баланси', () => {
    expect(calculateBudget({ ...input, now: during }).summary).toEqual({
      plannedIncomeTotal: 6000000,
      receivedIncomeTotal: 4550000,
      plannedExpenseTotal: 1900000,
      spentTotal: 1955000,
      plannedBalance: 4100000,
      actualBalance: 2595000,
    });
  });

  it('баланси можуть бути відʼємними', () => {
    const { summary } = calculateBudget({
      ...input,
      incomeLines: [{ id: 'salary', name: 'Зарплата', planned: 1000000 }],
      income: [{ incomeLineId: 'salary', received: 500000 }],
      now: during,
    });
    expect(summary.plannedBalance).toBe(-900000);
    expect(summary.actualBalance).toBe(-1455000);
  });

  it('порожній бюджет дає нулі', () => {
    const result = calculateBudget({
      incomeLines: [],
      expenseLines: [],
      spending: [],
      income: [],
      now: during,
      periodEnd,
    });
    expect(result).toEqual({
      summary: {
        plannedIncomeTotal: 0,
        receivedIncomeTotal: 0,
        plannedExpenseTotal: 0,
        spentTotal: 0,
        plannedBalance: 0,
        actualBalance: 0,
      },
      incomeLines: [],
      expenseLines: [],
      unplannedExpenses: [],
      otherIncome: 0,
    });
  });
});
