import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';

const { app, createActor, setNow, insertTransaction } = setupTestApp();

// «Зараз» — 12 жовтня 2026, 13:00 за Києвом. Жовтень за Києвом: [30.09 21:00 UTC, 31.10 22:00 UTC).
const NOW = '2026-10-12T10:00:00Z';
const TODAY = '2026-10-12';
beforeEach(() => setNow(NOW));

async function setup() {
  const actor = await createActor();
  const account = async (name: string, currency = 'UAH') =>
    (await actor.post('/api/accounts', { name, type: 'card', currency })).body as { id: string };
  const category = async (name: string) =>
    (await actor.post('/api/categories', { name, kind: 'expense' })).body as { id: string };
  const fixtures = {
    actor,
    card: await account('Картка'),
    cash: await account('Готівка'),
    usd: await account('Долари', 'USD'),
    food: await category('Продукти'),
    fun: await category('Розваги'),
  };
  const post = (body: object) =>
    actor.post('/api/transactions', { accountId: fixtures.card.id, ...body });
  return {
    ...fixtures,
    expense: (amountMinor: number, occurredAt: string, categoryId: string | null = null) =>
      post({ type: 'expense', amountMinor, occurredAt, categoryId }),
    income: (amountMinor: number, occurredAt: string) =>
      post({ type: 'income', amountMinor, occurredAt }),
  };
}

const monthOf = async (actor: Actor, query = '') =>
  (await actor.get(`/api/analytics/month${query}`)).body;
const trendOf = async (actor: Actor, query = '') =>
  (await actor.get(`/api/analytics/trend${query}`)).body;

const loanInput = (override: object = {}) => ({
  name: 'Позика',
  type: 'bank_loan',
  initialAmount: 1_000_000,
  startDate: '2026-09-10',
  maturityDate: '2028-01-01',
  interestRate: 0,
  ratePeriod: 'year',
  monthlyPayment: 100_000,
  paymentDay: 20,
  ...override,
});

const cardInput = (override: object = {}) => ({
  name: 'Кредитка',
  type: 'credit_card',
  initialAmount: 0,
  startDate: '2026-09-01',
  interestRate: 36,
  ratePeriod: 'year',
  monthlyPayment: 50_000,
  paymentDay: 25,
  creditLimit: 5_000_000,
  ...override,
});

describe('аналітика місяця: витрати за категоріями', () => {
  it('підкатегорії згортаються в групу з розбивкою', async () => {
    const { actor, expense } = await setup();
    const category = async (name: string, parentId: string | null = null) =>
      (await actor.post('/api/categories', { name, kind: 'expense', parentId })).body as {
        id: string;
      };
    const utilities = await category('Комунальні');
    const water = await category('Вода', utilities.id);
    await expense(30_000, '2026-10-05T10:00:00Z', water.id);
    await expense(10_000, '2026-10-06T10:00:00Z', utilities.id);

    const { categories } = await monthOf(actor);
    expect(categories).toEqual([
      expect.objectContaining({
        categoryId: utilities.id,
        categoryName: 'Комунальні',
        spent: 40_000,
        subcategories: [
          expect.objectContaining({ categoryId: water.id, categoryName: 'Вода', spent: 30_000 }),
          expect.objectContaining({
            categoryId: utilities.id,
            categoryName: 'Без підкатегорії',
            spent: 10_000,
          }),
        ],
      }),
    ]);
  });

  it('порожній місяць', async () => {
    const { actor } = await setup();
    expect(await monthOf(actor)).toEqual({
      month: '2026-10',
      currency: 'UAH',
      today: TODAY,
      isCurrentMonth: true,
      totalSpent: 0,
      previousTotalSpent: 0,
      change: 0,
      categories: [],
      budget: null,
      forecast: {
        daysElapsed: 12,
        daysInMonth: 31,
        spent: 0,
        projected: 0,
        plannedExpenseTotal: null,
        categories: [],
      },
    });
  });

  it('суми, частки й зміна відносно попереднього місяця', async () => {
    const { actor, food, fun, expense } = await setup();
    await expense(30_000, '2026-10-05T10:00:00Z', food.id);
    await expense(10_000, '2026-10-06T10:00:00Z', fun.id);
    await expense(60_000, '2026-10-07T10:00:00Z');
    await expense(25_000, '2026-09-15T10:00:00Z', food.id);
    await expense(8_000, '2026-09-16T10:00:00Z');

    const body = await monthOf(actor, '?month=2026-10');
    expect(body).toMatchObject({ totalSpent: 100_000, previousTotalSpent: 33_000, change: 67_000 });
    expect(body.categories).toEqual([
      {
        categoryId: null,
        categoryName: 'Без категорії',
        spent: 60_000,
        share: 0.6,
        previousSpent: 8_000,
        change: 52_000,
      },
      {
        categoryId: food.id,
        categoryName: 'Продукти',
        spent: 30_000,
        share: 0.3,
        previousSpent: 25_000,
        change: 5_000,
      },
      {
        categoryId: fun.id,
        categoryName: 'Розваги',
        spent: 10_000,
        share: 0.1,
        previousSpent: 0,
        change: 10_000,
      },
    ]);
  });

  it('категорія з витратами лише в попередньому місяці лишається в списку', async () => {
    const { actor, fun, expense } = await setup();
    await expense(8_000, '2026-09-16T10:00:00Z', fun.id);
    const body = await monthOf(actor);
    expect(body.categories).toEqual([
      {
        categoryId: fun.id,
        categoryName: 'Розваги',
        spent: 0,
        share: 0,
        previousSpent: 8_000,
        change: -8_000,
      },
    ]);
    expect(body.change).toBe(-8_000);
  });

  it('перекази, прибутки, службові зміни балансу й інша валюта у витрати не входять', async () => {
    const { actor, card, cash, usd, food, expense, income } = await setup();
    await expense(1_000, '2026-10-05T10:00:00Z', food.id);
    await income(500_000, '2026-10-01T10:00:00Z');
    await actor.post('/api/transactions', {
      type: 'transfer',
      accountId: card.id,
      toAccountId: cash.id,
      amountMinor: 70_000,
      occurredAt: '2026-10-05T10:00:00Z',
    });
    await actor.post('/api/transactions', {
      type: 'expense',
      accountId: usd.id,
      currency: 'USD',
      amountMinor: 9_999,
      occurredAt: '2026-10-05T10:00:00Z',
    });
    await insertTransaction(actor, {
      type: 'balance_adjustment',
      accountId: card.id,
      amountMinor: -40_000,
      currency: 'UAH',
      occurredAt: new Date('2026-10-05T10:00:00Z'),
    });

    const body = await monthOf(actor);
    expect(body.totalSpent).toBe(1_000);
    expect(body.categories).toHaveLength(1);
  });

  it('платіж по позиці — витрата «Погашення боргів»; погашення кредитки — ні', async () => {
    const { actor, card } = await setup();
    const { body: loan } = await actor.post('/api/debts', loanInput());
    const { body: credit } = await actor.post('/api/debts', cardInput());
    await actor.post(`/api/debts/${loan.id}/payments`, {
      accountId: card.id,
      amount: 100_000,
      date: TODAY,
    });
    await actor.post('/api/transactions', {
      type: 'expense',
      accountId: credit.accountId,
      amountMinor: 20_000,
      occurredAt: '2026-10-05T10:00:00Z',
    });
    await actor.post(`/api/debts/${credit.id}/card-payments`, {
      fromAccountId: card.id,
      amount: 20_000,
      date: TODAY,
    });

    const body = await monthOf(actor);
    expect(body.totalSpent).toBe(120_000);
    expect(
      body.categories.map((row: { categoryName: string; spent: number }) => [
        row.categoryName,
        row.spent,
      ]),
    ).toEqual([
      ['Погашення боргів', 100_000],
      ['Без категорії', 20_000],
    ]);
  });

  it('межа місяця рахується в часовому поясі домогосподарства', async () => {
    const { actor, expense } = await setup();
    setNow('2026-11-05T10:00:00Z');
    // 31.10 23:30 за Києвом = 21:30 UTC; 1.11 00:00 = 22:00 UTC
    await expense(700, '2026-10-31T21:30:00Z');
    await expense(900, '2026-10-31T22:00:00Z');
    // 30.09 23:59:59 за Києвом — ще вересень
    await expense(50, '2026-09-30T20:59:59Z');

    expect((await monthOf(actor, '?month=2026-10')).totalSpent).toBe(700);
    const november = await monthOf(actor, '?month=2026-11');
    expect(november).toMatchObject({ totalSpent: 900, previousTotalSpent: 700 });
    expect((await monthOf(actor, '?month=2026-09')).totalSpent).toBe(50);
  });

  it('чужі витрати в аналітику не потрапляють', async () => {
    const { actor, expense } = await setup();
    const stranger = await setup();
    await stranger.expense(99_000, '2026-10-05T10:00:00Z', stranger.food.id);
    await expense(1_000, '2026-10-05T10:00:00Z');
    expect(await monthOf(actor)).toMatchObject({ totalSpent: 1_000 });
    expect((await monthOf(actor)).categories).toHaveLength(1);
  });

  it('майбутній і некоректний місяць — 400; без токена — 401', async () => {
    const { actor } = await setup();
    expect((await actor.get('/api/analytics/month?month=2026-11')).status).toBe(400);
    expect((await actor.get('/api/analytics/month?month=2026-13')).status).toBe(400);
    expect((await actor.get('/api/analytics/trend?month=2027-01')).status).toBe(400);
    expect((await request(app).get('/api/analytics/month')).status).toBe(401);
    expect((await request(app).get('/api/analytics/trend')).status).toBe(401);
  });
});

describe('аналітика місяця: перевитрати й прогноз', () => {
  async function withBudget() {
    const context = await setup();
    const { actor, food, fun } = context;
    const { body: budget } = await actor.post('/api/budgets', { month: '2026-10' });
    const limit = (categoryId: string, plannedAmount: number) =>
      actor.post(`/api/budgets/${budget.id}/expense-lines`, { categoryId, plannedAmount });
    await limit(food.id, 100_000);
    await limit(fun.id, 50_000);
    return context;
  }

  it('без бюджету перевитрат немає, прогноз — лише для всіх витрат', async () => {
    const { actor, expense } = await setup();
    await expense(12_000, '2026-10-05T10:00:00Z');
    const body = await monthOf(actor);
    expect(body.budget).toBeNull();
    // 12 000 за 12 днів із 31
    expect(body.forecast).toEqual({
      daysElapsed: 12,
      daysInMonth: 31,
      spent: 12_000,
      projected: 31_000,
      plannedExpenseTotal: null,
      categories: [],
    });
  });

  it('перевитрати збігаються з рядками over і незапланованими витратами бюджету', async () => {
    const { actor, food, fun, expense } = await withBudget();
    await expense(130_000, '2026-10-05T10:00:00Z', food.id);
    await expense(50_000, '2026-10-06T10:00:00Z', fun.id);
    await expense(7_000, '2026-10-07T10:00:00Z');

    const body = await monthOf(actor);
    expect(body.budget.overspent).toEqual([
      {
        categoryId: food.id,
        categoryName: 'Продукти',
        planned: 100_000,
        spent: 130_000,
        overBy: 30_000,
      },
      { categoryId: null, categoryName: 'Без категорії', planned: 0, spent: 7_000, overBy: 7_000 },
    ]);

    const { body: budget } = await actor.get('/api/budgets?month=2026-10');
    const over = [
      ...budget.expenseLines.filter((line: { status: string }) => line.status === 'over'),
      ...budget.unplannedExpenses,
    ];
    expect(body.budget.overspent).toHaveLength(over.length);
  });

  it('бюджет без перевитрат — порожній список', async () => {
    const { actor, food, expense } = await withBudget();
    await expense(100_000, '2026-10-05T10:00:00Z', food.id);
    expect((await monthOf(actor)).budget).toEqual({ overspent: [] });
  });

  it('прогноз по категоріях із лімітом і сума лімітів', async () => {
    const { actor, food, fun, expense } = await withBudget();
    await expense(60_000, '2026-10-05T10:00:00Z', food.id);
    await expense(12_000, '2026-10-06T10:00:00Z', fun.id);

    const { forecast } = await monthOf(actor);
    expect(forecast).toMatchObject({
      spent: 72_000,
      projected: 186_000,
      plannedExpenseTotal: 150_000,
    });
    expect(forecast.categories).toEqual([
      // 60 000 · 31 / 12 = 155 000
      {
        categoryId: food.id,
        categoryName: 'Продукти',
        planned: 100_000,
        spent: 60_000,
        projected: 155_000,
        projectedOverBy: 55_000,
      },
      {
        categoryId: fun.id,
        categoryName: 'Розваги',
        planned: 50_000,
        spent: 12_000,
        projected: 31_000,
        projectedOverBy: 0,
      },
    ]);
  });

  it('для минулого місяця прогнозу немає, перевитрати є', async () => {
    const { actor, food, expense } = await withBudget();
    await expense(130_000, '2026-10-05T10:00:00Z', food.id);
    setNow('2026-11-03T10:00:00Z');

    const body = await monthOf(actor, '?month=2026-10');
    expect(body).toMatchObject({ isCurrentMonth: false, forecast: null });
    expect(body.budget.overspent).toHaveLength(1);
  });

  it('останній день місяця: прогноз дорівнює факту', async () => {
    const { actor, expense } = await setup();
    await expense(31_000, '2026-10-05T10:00:00Z');
    setNow('2026-10-31T10:00:00Z');
    expect((await monthOf(actor)).forecast).toMatchObject({
      daysElapsed: 31,
      spent: 31_000,
      projected: 31_000,
    });
  });
});

describe('динаміка по місяцях', () => {
  it('рівно 6 або 12 точок, включно з місяцями без даних', async () => {
    const { actor } = await setup();
    const six = await trendOf(actor);
    expect(six).toMatchObject({ month: '2026-10', months: 6, currency: 'UAH' });
    expect(six.points.map((point: { month: string }) => point.month)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(six.points[0]).toEqual({
      month: '2026-05',
      income: 0,
      expenses: 0,
      net: 0,
      savingsRate: null,
      netWorth: 0,
      debtPayments: 0,
      debtLoad: null,
    });

    const twelve = await trendOf(actor, '?months=12&month=2026-02');
    expect(twelve.points).toHaveLength(12);
    expect(twelve.points[0].month).toBe('2025-03');
    expect(twelve.points.at(-1).month).toBe('2026-02');
  });

  it('довжина лише 6 або 12', async () => {
    const { actor } = await setup();
    for (const months of ['3', '0', '24', 'abc']) {
      expect((await actor.get(`/api/analytics/trend?months=${months}`)).status).toBe(400);
    }
  });

  it('прибуток, витрати, різниця й норма заощаджень', async () => {
    const { actor, expense, income } = await setup();
    await income(600_000, '2026-09-05T10:00:00Z');
    await expense(510_000, '2026-09-10T10:00:00Z');
    await income(100_000, '2026-10-02T10:00:00Z');
    await expense(150_000, '2026-10-03T10:00:00Z');

    const { points } = await trendOf(actor);
    expect(points.at(-2)).toMatchObject({
      month: '2026-09',
      income: 600_000,
      expenses: 510_000,
      net: 90_000,
      savingsRate: 0.15,
      netWorth: 90_000,
    });
    expect(points.at(-1)).toMatchObject({
      month: '2026-10',
      income: 100_000,
      expenses: 150_000,
      net: -50_000,
      savingsRate: -0.5,
      netWorth: 40_000,
    });
  });

  it('чисті активи враховують усе до початку динаміки й не змінюються від переказу', async () => {
    const { actor, card, cash, income } = await setup();
    await income(1_000_000, '2025-01-10T10:00:00Z');
    await actor.post('/api/transactions', {
      type: 'transfer',
      accountId: card.id,
      toAccountId: cash.id,
      amountMinor: 400_000,
      occurredAt: '2026-09-05T10:00:00Z',
    });

    const { points } = await trendOf(actor);
    expect(points.map((point: { netWorth: number }) => point.netWorth)).toEqual(
      Array(6).fill(1_000_000),
    );
    expect(points.at(-2)).toMatchObject({ income: 0, expenses: 0, debtPayments: 0 });
  });

  it('позика зменшує чисті активи з місяця початку; платіж у тіло їх не змінює', async () => {
    const { actor, card, income } = await setup();
    await income(2_000_000, '2026-08-05T10:00:00Z');
    const { body: loan } = await actor.post('/api/debts', loanInput());
    await actor.post(`/api/debts/${loan.id}/payments`, {
      accountId: card.id,
      amount: 100_000,
      date: TODAY,
    });

    const { points } = await trendOf(actor);
    const byMonth = Object.fromEntries(
      points.map((point: { month: string; netWorth: number }) => [point.month, point.netWorth]),
    );
    expect(byMonth['2026-08']).toBe(2_000_000);
    // з вересня: 2 000 000 − 1 000 000
    expect(byMonth['2026-09']).toBe(1_000_000);
    // жовтень: рахунок −100 000, борг −100 000
    expect(byMonth['2026-10']).toBe(1_000_000);
    expect(points.at(-1)).toMatchObject({ expenses: 100_000, debtPayments: 100_000 });
  });

  it('відсотки в платежі й нарахування зменшують чисті активи', async () => {
    const { actor, card, income } = await setup();
    await income(2_000_000, '2026-08-05T10:00:00Z');
    const { body: loan } = await actor.post('/api/debts', loanInput());
    await actor.post(`/api/debts/${loan.id}/payments`, {
      accountId: card.id,
      amount: 100_000,
      principalPart: 80_000,
      interestPart: 20_000,
      date: TODAY,
    });
    await actor.post(`/api/debts/${loan.id}/charges`, { amount: 5_000, date: TODAY });

    const { points } = await trendOf(actor);
    // рахунок 1 900 000; борг 1 000 000 − 80 000 + 5 000 = 925 000
    expect(points.at(-1).netWorth).toBe(975_000);
  });

  it('покупка з кредитки зменшує чисті активи, її погашення — ні', async () => {
    const { actor, card, income } = await setup();
    await income(500_000, '2026-09-05T10:00:00Z');
    const { body: credit } = await actor.post('/api/debts', cardInput({ initialAmount: 30_000 }));
    await actor.post('/api/transactions', {
      type: 'expense',
      accountId: credit.accountId,
      amountMinor: 20_000,
      occurredAt: '2026-10-05T10:00:00Z',
    });
    await actor.post(`/api/debts/${credit.id}/card-payments`, {
      fromAccountId: card.id,
      amount: 50_000,
      date: TODAY,
    });

    const { points } = await trendOf(actor);
    // вересень: 500 000 − 30 000 початкового боргу кредитки
    expect(points.at(-2).netWorth).toBe(470_000);
    expect(points.at(-1)).toMatchObject({
      netWorth: 450_000,
      expenses: 20_000,
      debtPayments: 50_000,
    });
  });

  it('боргове навантаження: платіж по позиці й переказ на кредитку від прибутку місяця', async () => {
    const { actor, card, cash, income } = await setup();
    await income(1_000_000, '2026-10-02T10:00:00Z');
    const { body: loan } = await actor.post('/api/debts', loanInput());
    const { body: credit } = await actor.post('/api/debts', cardInput({ initialAmount: 300_000 }));
    await actor.post(`/api/debts/${loan.id}/payments`, {
      accountId: card.id,
      amount: 100_000,
      date: TODAY,
    });
    await actor.post(`/api/debts/${credit.id}/card-payments`, {
      fromAccountId: card.id,
      amount: 50_000,
      date: TODAY,
    });
    // звичайний переказ між своїми рахунками — не платіж по боргу
    await actor.post('/api/transactions', {
      type: 'transfer',
      accountId: card.id,
      toAccountId: cash.id,
      amountMinor: 200_000,
      occurredAt: '2026-10-05T10:00:00Z',
    });

    const body = await trendOf(actor);
    expect(body.points.at(-1)).toMatchObject({ debtPayments: 150_000, debtLoad: 0.15 });
    // планове: 100 000 + 50 000 щомісячних платежів, запланованого прибутку немає
    expect(body.plannedDebtLoad).toEqual({
      monthlyPayments: 150_000,
      plannedIncome: 0,
      ratio: null,
    });
  });

  it('планове навантаження від запланованого прибутку місяця', async () => {
    const { actor, card } = await setup();
    await actor.post('/api/debts', loanInput());
    await actor.post('/api/income-sources', {
      name: 'Зарплата',
      accountId: card.id,
      plannedAmount: 2_000_000,
      frequency: 'monthly',
      dayOfMonth: 5,
      startDate: '2026-01-01',
    });
    expect((await trendOf(actor)).plannedDebtLoad).toEqual({
      monthlyPayments: 100_000,
      plannedIncome: 2_000_000,
      ratio: 0.05,
    });
  });

  it('чужі дані й інша валюта в динаміку не потрапляють', async () => {
    const { actor, usd, income } = await setup();
    const stranger = await setup();
    await stranger.income(900_000, '2026-10-02T10:00:00Z');
    await stranger.actor.post('/api/debts', loanInput());
    await actor.post('/api/transactions', {
      type: 'income',
      accountId: usd.id,
      currency: 'USD',
      amountMinor: 5_000,
      occurredAt: '2026-10-02T10:00:00Z',
    });
    await income(1_000, '2026-10-02T10:00:00Z');

    const body = await trendOf(actor);
    expect(body.points.at(-1)).toMatchObject({ income: 1_000, netWorth: 1_000 });
    expect(body.plannedDebtLoad.monthlyPayments).toBe(0);
  });

  it('місяць транзакції в динаміці — за часовим поясом домогосподарства', async () => {
    const { actor, income } = await setup();
    setNow('2026-11-05T10:00:00Z');
    await income(700, '2026-10-31T21:30:00Z'); // 23:30 31 жовтня за Києвом
    await income(900, '2026-10-31T22:00:00Z'); // 00:00 1 листопада

    const { points } = await trendOf(actor, '?month=2026-11');
    expect(points.at(-2)).toMatchObject({ month: '2026-10', income: 700, netWorth: 700 });
    expect(points.at(-1)).toMatchObject({ month: '2026-11', income: 900, netWorth: 1_600 });
  });
});
