import { describe, expect, it } from 'vitest';
import { monthPeriod } from '../../dates.ts';
import {
  calculateBudget,
  getCategoryStatus,
  getPlanState,
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
        tx({ type: 'income', amountMinor: 5000, categoryId: null }),
      ],
      october,
      'UAH',
    );

    expect(facts.spending).toEqual([{ categoryId: 'food', categoryName: 'Продукти', spent: 300 }]);
    expect(facts.receivedIncome).toBe(5000);
  });

  it('витрата підкатегорії зберігає посилання на групу', () => {
    const facts = summarizeTransactions(
      [tx({ categoryId: 'water', categoryName: 'Вода', categoryParentId: 'utilities' })],
      october,
      'UAH',
    );
    expect(facts.spending).toEqual([
      { categoryId: 'water', categoryName: 'Вода', parentId: 'utilities', spent: 100 },
    ]);
  });

  it('платіж по позиці — витрата своєї категорії; службова зміна балансу не враховується', () => {
    const facts = summarizeTransactions(
      [
        tx({ type: 'debt_payment', amountMinor: 700, categoryId: 'debts', categoryName: 'Борги' }),
        tx({ type: 'balance_adjustment', amountMinor: -5000, categoryId: null }),
        tx({ type: 'balance_adjustment', amountMinor: 5000, categoryId: null }),
      ],
      october,
      'UAH',
    );

    expect(facts.spending).toEqual([{ categoryId: 'debts', categoryName: 'Борги', spent: 700 }]);
    expect(facts.receivedIncome).toBe(0);
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

  it('групує витрати за категоріями, окремо рахує витрати без категорії, сумує доходи', () => {
    const facts = summarizeTransactions(
      [
        tx({ amountMinor: 100 }),
        tx({ amountMinor: 50 }),
        tx({ amountMinor: 70, categoryId: 'fuel', categoryName: 'Пальне' }),
        tx({ amountMinor: 5, categoryId: null, categoryName: null }),
        tx({ type: 'income', amountMinor: 1000, categoryId: null }),
        tx({ type: 'income', amountMinor: 2000, categoryId: 'salary' }),
      ],
      october,
      'UAH',
    );

    expect(facts.spending).toEqual([
      { categoryId: 'food', categoryName: 'Продукти', spent: 150 },
      { categoryId: 'fuel', categoryName: 'Пальне', spent: 70 },
      { categoryId: null, categoryName: 'Без категорії', spent: 5 },
    ]);
    expect(facts.receivedIncome).toBe(3000);
  });

  it('не змішує валюти: враховує лише валюту бюджету', () => {
    const facts = summarizeTransactions(
      [
        tx({ amountMinor: 100 }),
        tx({ amountMinor: 999, currency: 'USD' }),
        tx({ type: 'income', amountMinor: 888, currency: 'USD' }),
      ],
      october,
      'UAH',
    );
    expect(facts.spending[0]!.spent).toBe(100);
    expect(facts.receivedIncome).toBe(0);
  });
});

describe('calculateBudget з підкатегоріями', () => {
  const base = { plannedIncome: 0, receivedIncome: 0, now: during, periodEnd };
  const spending = [
    { categoryId: 'utilities', categoryName: 'Комунальні', spent: 1000 },
    { categoryId: 'water', categoryName: 'Комунальні › Вода', parentId: 'utilities', spent: 300 },
    { categoryId: 'gas', categoryName: 'Комунальні › Газ', parentId: 'utilities', spent: 200 },
  ];

  it('ліміт групи рахує витрати самої групи й усіх її підкатегорій', () => {
    const result = calculateBudget({
      ...base,
      expenseLines: [
        { id: 'l1', categoryId: 'utilities', categoryName: 'Комунальні', planned: 1400 },
      ],
      spending,
    });
    expect(result.expenseLines[0]).toMatchObject({ spent: 1500, remaining: -100, status: 'over' });
    expect(result.unplannedExpenses).toEqual([]);
    expect(result.summary.spentTotal).toBe(1500);
  });

  it('рядок ліміту групи має розбивку за підкатегоріями з власними назвами', () => {
    const result = calculateBudget({
      ...base,
      expenseLines: [
        { id: 'l1', categoryId: 'utilities', categoryName: 'Комунальні', planned: 1400 },
      ],
      spending: spending.map((item) =>
        item.parentId ? { ...item, shortName: item.categoryName.split(' › ')[1] } : item,
      ),
    });
    expect(result.expenseLines[0]!.subcategories).toEqual([
      { categoryId: 'utilities', categoryName: 'Без підкатегорії', spent: 1000 },
      { categoryId: 'water', categoryName: 'Вода', spent: 300 },
      { categoryId: 'gas', categoryName: 'Газ', spent: 200 },
    ]);
  });

  it('розбивки немає, якщо підкатегорії групи нічого не витратили', () => {
    const result = calculateBudget({
      ...base,
      expenseLines: [
        { id: 'l1', categoryId: 'utilities', categoryName: 'Комунальні', planned: 1400 },
      ],
      spending: spending.filter((item) => !item.parentId),
    });
    expect(result.expenseLines[0]).not.toHaveProperty('subcategories');
  });

  it('ліміт на підкатегорію рахує лише її; решта групи без ліміту — незапланована', () => {
    const result = calculateBudget({
      ...base,
      expenseLines: [
        { id: 'l1', categoryId: 'water', categoryName: 'Комунальні › Вода', planned: 500 },
      ],
      spending,
    });
    expect(result.expenseLines[0]).toMatchObject({ spent: 300, remaining: 200, status: 'neutral' });
    expect(result.expenseLines[0]).not.toHaveProperty('subcategories');
    expect(result.unplannedExpenses.map((item) => item.categoryId)).toEqual(['utilities', 'gas']);
    expect(result.summary.spentTotal).toBe(1500);
  });

  it('витрата підкатегорії з власним лімітом не рахується вдруге в групі', () => {
    // Таке поєднання бекенд не допускає, але розрахунок і тоді не подвоює суму.
    const result = calculateBudget({
      ...base,
      expenseLines: [
        { id: 'l1', categoryId: 'utilities', categoryName: 'Комунальні', planned: 2000 },
        { id: 'l2', categoryId: 'water', categoryName: 'Комунальні › Вода', planned: 500 },
      ],
      spending,
    });
    expect(result.expenseLines.map((line) => line.spent)).toEqual([1200, 300]);
  });
});

describe('calculateBudget', () => {
  const input = {
    plannedIncome: 6000000,
    receivedIncome: 4550000,
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

  it('рахує підсумки й баланси; доходи беруться готовими з розрахунку доходів', () => {
    expect(calculateBudget({ ...input, now: during }).summary).toEqual({
      plannedIncomeTotal: 6000000,
      receivedIncomeTotal: 4550000,
      plannedExpenseTotal: 1900000,
      spentTotal: 1955000,
      plannedBalance: 4100000,
      actualBalance: 2595000,
      planState: 'balanced',
    });
  });

  it('баланси можуть бути відʼємними', () => {
    const { summary } = calculateBudget({
      ...input,
      plannedIncome: 1000000,
      receivedIncome: 500000,
      now: during,
    });
    expect(summary.plannedBalance).toBe(-900000);
    expect(summary.planState).toBe('deficit');
    expect(summary.actualBalance).toBe(-1455000);
  });

  it('порожній бюджет дає нулі', () => {
    const result = calculateBudget({
      plannedIncome: 0,
      receivedIncome: 0,
      expenseLines: [],
      spending: [],
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
        planState: 'balanced',
      },
      expenseLines: [],
      unplannedExpenses: [],
    });
  });
});

describe('getPlanState', () => {
  it('витрати менші за доходи — бюджет сходиться', () => {
    expect(getPlanState(1000, 999)).toBe('balanced');
  });

  it('витрати рівно дорівнюють доходам — ще сходиться', () => {
    expect(getPlanState(1000, 1000)).toBe('balanced');
    expect(getPlanState(0, 0)).toBe('balanced');
  });

  it('витрати більші на копійку — дефіцит', () => {
    expect(getPlanState(1000, 1001)).toBe('deficit');
    expect(getPlanState(0, 1)).toBe('deficit');
  });
});
