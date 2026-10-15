import { sql } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';

const { app, db, createActor, setNow } = setupTestApp();

// «Зараз» — 12 жовтня 2026, 13:00 за Києвом.
const NOW = '2026-10-12T10:00:00Z';
const TODAY = '2026-10-12';
beforeEach(() => setNow(NOW));

const dashboardOf = async (actor: Actor) => (await actor.get('/api/dashboard')).body;

async function setup() {
  const actor = await createActor();
  const account = async (name: string, override: object = {}) =>
    (await actor.post('/api/accounts', { name, type: 'card', ...override })).body as { id: string };
  const category = async (name: string) =>
    (await actor.post('/api/categories', { name, kind: 'expense' })).body as { id: string };
  const card = await account('Картка');
  const post = (body: object) => actor.post('/api/transactions', { accountId: card.id, ...body });
  return {
    actor,
    account,
    category,
    card,
    expense: (amountMinor: number, occurredAt: string, override: object = {}) =>
      post({ type: 'expense', amountMinor, occurredAt, ...override }),
    income: (amountMinor: number, occurredAt: string, override: object = {}) =>
      post({ type: 'income', amountMinor, occurredAt, ...override }),
  };
}

const loanInput = (override: object = {}) => ({
  name: 'Позика',
  type: 'bank_loan',
  initialAmount: 600_000,
  startDate: '2026-09-01',
  maturityDate: '2030-01-01',
  interestRate: 0,
  ratePeriod: 'year',
  monthlyPayment: 100_000,
  paymentDay: 20,
  ...override,
});

const cardDebtInput = (override: object = {}) => ({
  name: 'Кредитка',
  type: 'credit_card',
  initialAmount: 300_000,
  startDate: '2026-09-01',
  interestRate: 36,
  ratePeriod: 'year',
  monthlyPayment: 50_000,
  paymentDay: 25,
  creditLimit: 5_000_000,
  ...override,
});

describe('головна: новий користувач', () => {
  it('порожнє зведення з кроками', async () => {
    const actor = await createActor();
    expect(await dashboardOf(actor)).toEqual({
      month: '2026-10',
      today: TODAY,
      currency: 'UAH',
      setup: { hasAccounts: false, hasTransactions: false, hasBudget: false },
      money: { netWorth: 0, accountsTotal: 0, debtTotal: 0, accounts: [] },
      monthSummary: {
        income: 0,
        expenses: 0,
        net: 0,
        plannedExpenseTotal: null,
        projected: 0,
        daysElapsed: 12,
        daysInMonth: 31,
      },
      plan: { plannedIncome: 0, plannedExpenses: null, balance: null, state: null },
      debtPayments: { required: 0, paid: 0, remaining: 0 },
      attention: [],
      upcoming: [],
      goals: [],
      recent: [],
    });
  });

  it('кроки відмічаються в міру налаштування', async () => {
    const { actor, expense } = await setup();
    expect((await dashboardOf(actor)).setup).toEqual({
      hasAccounts: true,
      hasTransactions: false,
      hasBudget: false,
    });
    await expense(100, '2026-10-05T10:00:00Z');
    await actor.post('/api/budgets', { month: '2026-10' });
    expect((await dashboardOf(actor)).setup).toEqual({
      hasAccounts: true,
      hasTransactions: true,
      hasBudget: true,
    });
  });
});

describe('головна: гроші зараз', () => {
  it('чисті активи = рахунки в гривні − позики; кредитка не віднімається двічі', async () => {
    const { actor, account, income } = await setup();
    await income(2_000_000, '2026-10-01T10:00:00Z');
    const usd = await account('Долари', { currency: 'USD' });
    await actor.post('/api/transactions', {
      type: 'income',
      accountId: usd.id,
      currency: 'USD',
      amountMinor: 50_000,
      occurredAt: '2026-10-02T10:00:00Z',
    });
    await actor.post('/api/debts', loanInput());
    await actor.post('/api/debts', cardDebtInput());

    const { money } = await dashboardOf(actor);
    // рахунки в гривні: 2 000 000 картка − 300 000 борг кредитки
    expect(money).toMatchObject({
      accountsTotal: 1_700_000,
      debtTotal: 900_000,
      netWorth: 1_100_000,
    });
    expect(
      money.accounts.map((item: { name: string; balance: number }) => [item.name, item.balance]),
    ).toEqual([
      ['Картка', 2_000_000],
      ['Долари', 50_000],
      ['Кредитка', -300_000],
    ]);
    expect(money.accounts[0]).toEqual({
      id: expect.any(String),
      name: 'Картка',
      type: 'card',
      currency: 'UAH',
      balance: 2_000_000,
    });
  });

  it('архівний рахунок не в списку, але його гроші рахуються', async () => {
    const { actor, card, income } = await setup();
    await income(70_000, '2026-10-01T10:00:00Z');
    await db.execute(sql`UPDATE accounts SET is_archived = true WHERE id = ${card.id}`);
    const { money } = await dashboardOf(actor);
    expect(money).toMatchObject({ accountsTotal: 70_000, netWorth: 70_000, accounts: [] });
  });

  it('збігається з чистими активами аналітики', async () => {
    const { actor, card, income, expense } = await setup();
    await income(900_000, '2026-09-05T10:00:00Z');
    await expense(120_000, '2026-10-03T10:00:00Z');
    const { body: loan } = await actor.post('/api/debts', loanInput());
    await actor.post(`/api/debts/${loan.id}/payments`, {
      accountId: card.id,
      amount: 100_000,
      date: TODAY,
    });

    const { money } = await dashboardOf(actor);
    const { body: trend } = await actor.get('/api/analytics/trend');
    expect(money.netWorth).toBe(trend.points.at(-1).netWorth);
  });
});

describe('головна: цей місяць', () => {
  it('прибуток, витрати й різниця збігаються з прибутками та аналітикою; без бюджету лімітів немає', async () => {
    const { actor, income, expense } = await setup();
    await income(600_000, '2026-10-02T10:00:00Z');
    await expense(120_000, '2026-10-05T10:00:00Z');
    // вересень у місяць не входить
    await income(999_000, '2026-09-10T10:00:00Z');
    await expense(50_000, '2026-09-11T10:00:00Z');

    const { monthSummary } = await dashboardOf(actor);
    expect(monthSummary).toEqual({
      income: 600_000,
      expenses: 120_000,
      net: 480_000,
      plannedExpenseTotal: null,
      // 120 000 за 12 днів із 31
      projected: 310_000,
      daysElapsed: 12,
      daysInMonth: 31,
    });
    const { body: incomes } = await actor.get('/api/incomes?month=2026-10');
    const { body: analytics } = await actor.get('/api/analytics/month');
    expect(monthSummary.income).toBe(incomes.summary.receivedTotal);
    expect(monthSummary.expenses).toBe(analytics.totalSpent);
  });

  it('з бюджетом є сума лімітів', async () => {
    const { actor, category } = await setup();
    const food = await category('Продукти');
    const { body: budget } = await actor.post('/api/budgets', { month: '2026-10' });
    await actor.post(`/api/budgets/${budget.id}/expense-lines`, {
      categoryId: food.id,
      plannedAmount: 500_000,
    });
    expect((await dashboardOf(actor)).monthSummary.plannedExpenseTotal).toBe(500_000);
  });
});

describe('головна: план місяця й платежі по боргах', () => {
  const salary = (actor: Actor, accountId: string, plannedAmount: number) =>
    actor.post('/api/income-sources', {
      name: 'Зарплата',
      accountId,
      plannedAmount,
      frequency: 'monthly',
      dayOfMonth: 5,
      startDate: '2026-01-01',
    });

  it('без бюджету є лише очікувані прибутки', async () => {
    const { actor, card } = await setup();
    await salary(actor, card.id, 4_000_000);
    expect((await dashboardOf(actor)).plan).toEqual({
      plannedIncome: 4_000_000,
      plannedExpenses: null,
      balance: null,
      state: null,
    });
  });

  it('бюджет сходиться, поки ліміти не більші за очікувані прибутки; збігається з бюджетом', async () => {
    const { actor, card, category } = await setup();
    await salary(actor, card.id, 4_000_000);
    const food = await category('Продукти');
    const { body: budget } = await actor.post('/api/budgets', { month: '2026-10' });
    const { body: withLine } = await actor.post(`/api/budgets/${budget.id}/expense-lines`, {
      categoryId: food.id,
      plannedAmount: 4_000_000,
    });
    expect((await dashboardOf(actor)).plan).toEqual({
      plannedIncome: 4_000_000,
      plannedExpenses: 4_000_000,
      balance: 0,
      state: 'balanced',
    });

    const lineId = withLine.expenseLines[0].id;
    await actor.patch(`/api/budgets/${budget.id}/expense-lines/${lineId}`, {
      plannedAmount: 4_000_001,
    });
    const { plan } = await dashboardOf(actor);
    expect(plan).toEqual({
      plannedIncome: 4_000_000,
      plannedExpenses: 4_000_001,
      balance: -1,
      state: 'deficit',
    });
    const { summary } = (await actor.get('/api/budgets?month=2026-10')).body;
    expect(summary).toMatchObject({
      plannedIncomeTotal: plan.plannedIncome,
      plannedExpenseTotal: plan.plannedExpenses,
      plannedBalance: plan.balance,
      planState: plan.state,
    });
  });

  it('обов’язкові платежі: позики й кредитки, без боргів із пізнішим першим платежем', async () => {
    const { actor, card, income } = await setup();
    await income(2_000_000, '2026-10-01T10:00:00Z');
    const { body: loan } = await actor.post('/api/debts', loanInput());
    await actor.post('/api/debts', cardDebtInput());
    await actor.post(
      '/api/debts',
      loanInput({ name: 'Відкладена', monthlyPayment: 70_000, firstPaymentMonth: '2026-11' }),
    );
    // 100 000 позика + 50 000 мінімальний платіж кредитки
    expect((await dashboardOf(actor)).debtPayments).toEqual({
      required: 150_000,
      paid: 0,
      remaining: 150_000,
    });

    await actor.post(`/api/debts/${loan.id}/payments`, {
      accountId: card.id,
      amount: 40_000,
      date: TODAY,
    });
    const { debtPayments } = await dashboardOf(actor);
    expect(debtPayments).toEqual({ required: 150_000, paid: 40_000, remaining: 110_000 });
    const { body: debts } = await actor.get('/api/debts');
    expect(debtPayments.remaining).toBe(debts.summary.dueThisMonth);
  });
});

describe('головна: потребує уваги й найближчі події', () => {
  it('прострочений платіж і платіж скоро', async () => {
    const { actor } = await setup();
    const { body: late } = await actor.post(
      '/api/debts',
      loanInput({ name: 'Прострочена', paymentDay: 5 }),
    );
    const { body: soon } = await actor.post(
      '/api/debts',
      loanInput({ name: 'Скоро', paymentDay: 14 }),
    );
    const { body: later } = await actor.post(
      '/api/debts',
      loanInput({ name: 'Пізніше', paymentDay: 28 }),
    );

    const { attention, upcoming } = await dashboardOf(actor);
    expect(attention).toEqual([
      {
        kind: 'debt_overdue',
        id: late.id,
        name: 'Прострочена',
        amount: 100_000,
        date: '2026-10-05',
      },
      { kind: 'debt_due_soon', id: soon.id, name: 'Скоро', amount: 100_000, date: '2026-10-14' },
    ]);
    // прострочене в найближчі події не входить
    expect(upcoming).toEqual([
      { kind: 'debt_payment', id: soon.id, name: 'Скоро', amount: 100_000, date: '2026-10-14' },
      { kind: 'debt_payment', id: later.id, name: 'Пізніше', amount: 100_000, date: '2026-10-28' },
    ]);
  });

  it('сплачений платіж зникає з обох списків, частковий — із залишком', async () => {
    const { actor, card } = await setup();
    const { body: loan } = await actor.post('/api/debts', loanInput({ paymentDay: 14 }));
    const pay = (amount: number) =>
      actor.post(`/api/debts/${loan.id}/payments`, { accountId: card.id, amount, date: TODAY });

    await pay(30_000);
    const partial = await dashboardOf(actor);
    expect(partial.attention).toEqual([]);
    expect(partial.upcoming).toEqual([
      { kind: 'debt_payment', id: loan.id, name: 'Позика', amount: 70_000, date: '2026-10-14' },
    ]);

    await pay(70_000);
    const paid = await dashboardOf(actor);
    expect(paid.attention).toEqual([]);
    expect(paid.upcoming).toEqual([]);
  });

  it('прибуток, що не надійшов, і очікуване надходження', async () => {
    const { actor, card } = await setup();
    const source = (name: string, dayOfMonth: number) =>
      actor.post('/api/income-sources', {
        name,
        accountId: card.id,
        plannedAmount: 1_500_000,
        frequency: 'monthly',
        dayOfMonth,
        startDate: '2026-01-01',
      });
    await source('Зарплата', 5);
    await source('Аванс', 20);

    const { attention, upcoming } = await dashboardOf(actor);
    expect(attention).toEqual([
      expect.objectContaining({
        kind: 'income_overdue',
        name: 'Зарплата',
        amount: 1_500_000,
        date: '2026-10-05',
      }),
    ]);
    expect(upcoming).toEqual([
      expect.objectContaining({
        kind: 'income',
        name: 'Аванс',
        amount: 1_500_000,
        date: '2026-10-20',
      }),
    ]);
  });

  it('перевищений ліміт і незаплановані витрати', async () => {
    const { actor, category, expense } = await setup();
    const food = await category('Продукти');
    const { body: budget } = await actor.post('/api/budgets', { month: '2026-10' });
    await actor.post(`/api/budgets/${budget.id}/expense-lines`, {
      categoryId: food.id,
      plannedAmount: 100_000,
    });
    await expense(130_000, '2026-10-05T10:00:00Z', { categoryId: food.id });
    await expense(7_000, '2026-10-06T10:00:00Z');

    expect((await dashboardOf(actor)).attention).toEqual([
      { kind: 'budget_over', id: food.id, name: 'Продукти', amount: 30_000, date: null },
      { kind: 'budget_over', id: null, name: 'Без категорії', amount: 7_000, date: null },
    ]);
  });

  it('цілі: відстає й строк минув; архівна не турбує', async () => {
    const { actor, account } = await setup();
    const deposit = await account('Депозит', { type: 'deposit' });
    const jar = await account('Скарбничка', { type: 'cash' });
    const old = await account('Стара', { type: 'cash' });
    const goal = (name: string, accountId: string, targetDate: string) =>
      actor.post('/api/goals', {
        kind: 'savings',
        name,
        accountId,
        targetAmount: 1_000_000,
        targetDate,
      });

    setNow('2026-08-01T10:00:00Z');
    const { body: overdue } = await goal('Відпустка', deposit.id, '2026-09-30');
    const { body: archived } = await goal('Забута', old.id, '2026-09-30');
    setNow(NOW);
    const { body: behind } = await goal('Подушка', jar.id, '2027-02-28');
    await actor.post(`/api/goals/${archived.id}/archive`, {});

    const body = await dashboardOf(actor);
    expect(body.attention).toEqual([
      { kind: 'goal_overdue', id: overdue.id, name: 'Відпустка', amount: null, date: '2026-09-30' },
      // 1 000 000 за 4 місяці
      { kind: 'goal_behind', id: behind.id, name: 'Подушка', amount: 250_000, date: '2027-02-28' },
    ]);
    expect(body.goals.map((item: { name: string }) => item.name)).toEqual(['Відпустка', 'Подушка']);
  });

  it('на головній не більше трьох цілей', async () => {
    const { actor, account } = await setup();
    for (const name of ['А', 'Б', 'В', 'Г']) {
      const jar = await account(`Рахунок ${name}`, { type: 'cash' });
      await actor.post('/api/goals', {
        kind: 'savings',
        name,
        accountId: jar.id,
        targetAmount: 1_000,
      });
    }
    const { goals } = await dashboardOf(actor);
    expect(goals.map((item: { name: string }) => item.name)).toEqual(['А', 'Б', 'В']);
    expect(goals[0]).toMatchObject({ kind: 'savings', progress: 0, state: 'no_deadline' });
  });
});

describe('головна: останні операції', () => {
  it('найновіші першими, не більше п’яти, з назвами категорії й рахунку', async () => {
    const { actor, category, expense, income } = await setup();
    const food = await category('Продукти');
    for (let day = 1; day <= 6; day += 1) {
      await expense(day * 100, `2026-10-0${day}T10:00:00Z`, {
        categoryId: food.id,
        description: `Покупка ${day}`,
      });
    }
    await income(50_000, '2026-10-07T10:00:00Z', { description: 'Бонус' });

    const { recent } = await dashboardOf(actor);
    expect(recent.map((item: { description: string }) => item.description)).toEqual([
      'Бонус',
      'Покупка 6',
      'Покупка 5',
      'Покупка 4',
      'Покупка 3',
    ]);
    expect(recent[0]).toEqual({
      id: expect.any(String),
      type: 'income',
      description: 'Бонус',
      categoryName: null,
      accountName: 'Картка',
      amountMinor: 50_000,
      currency: 'UAH',
      occurredAt: '2026-10-07T10:00:00.000Z',
    });
    expect(recent[1]).toMatchObject({ type: 'expense', categoryName: 'Продукти' });
  });

  it('підкатегорія показується разом із групою', async () => {
    const { actor, expense } = await setup();
    const { body: utilities } = await actor.post('/api/categories', {
      name: 'Комунальні',
      kind: 'expense',
    });
    const { body: water } = await actor.post('/api/categories', {
      name: 'Вода',
      kind: 'expense',
      parentId: utilities.id,
    });
    await expense(500, '2026-10-02T10:00:00Z', { categoryId: water.id });

    const { recent } = await dashboardOf(actor);
    expect(recent[0]).toMatchObject({ categoryName: 'Комунальні › Вода' });
  });

  it('перекази й службові зміни балансу не показуються, платіж по боргу — так', async () => {
    const { actor, account, card, expense } = await setup();
    const cash = await account('Готівка', { type: 'cash' });
    await expense(500, '2026-10-02T10:00:00Z');
    await actor.post('/api/transactions', {
      type: 'transfer',
      accountId: card.id,
      toAccountId: cash.id,
      amountMinor: 10_000,
      occurredAt: '2026-10-03T10:00:00Z',
    });
    await actor.post('/api/debts', cardDebtInput());
    const { body: loan } = await actor.post('/api/debts', loanInput());
    await actor.post(`/api/debts/${loan.id}/payments`, {
      accountId: card.id,
      amount: 100_000,
      date: TODAY,
    });

    const { recent } = await dashboardOf(actor);
    expect(recent.map((item: { type: string }) => item.type)).toEqual(['debt_payment', 'expense']);
    expect(recent[0]).toMatchObject({ description: 'Позика', categoryName: 'Погашення боргів' });
  });
});

describe('головна: доступ', () => {
  it('чужі дані не потрапляють', async () => {
    const owner = await setup();
    const stranger = await setup();
    await stranger.income(900_000, '2026-10-02T10:00:00Z');
    await stranger.expense(100_000, '2026-10-03T10:00:00Z');
    await stranger.actor.post('/api/debts', loanInput({ paymentDay: 5 }));

    const body = await dashboardOf(owner.actor);
    expect(body.money).toMatchObject({ netWorth: 0, accountsTotal: 0, debtTotal: 0 });
    expect(body.monthSummary).toMatchObject({ income: 0, expenses: 0 });
    expect(body.attention).toEqual([]);
    expect(body.recent).toEqual([]);
    expect(body.money.accounts).toHaveLength(1);
  });

  it('без токена — 401', async () => {
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
  });
});
