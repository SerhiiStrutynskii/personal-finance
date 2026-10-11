import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';

const { app, createActor, setNow, insertTransaction } = setupTestApp();
const MISSING_ID = '11111111-1111-4111-8111-111111111111';

// Жовтень 2026 за Києвом: [30.09 21:00 UTC, 31.10 22:00 UTC). Тести прив'язані до фіксованих
// місяців у минулому або майбутньому, тому не залежать від дати запуску.
const PAST = '2020-03';
const FUTURE = '2099-10';

async function createFixtures(actor: Actor) {
  const account = async (name: string, currency = 'UAH') =>
    (await actor.post('/api/accounts', { name, type: 'card', currency })).body;
  const category = async (name: string, kind = 'expense') =>
    (await actor.post('/api/categories', { name, kind })).body;
  return {
    card: await account('Картка'),
    cash: await account('Готівка'),
    usd: await account('Долари', 'USD'),
    food: await category('Продукти'),
    transport: await category('Транспорт'),
    gifts: await category('Подарунки'),
    salaryCategory: await category('Зарплата', 'income'),
  };
}

type Fixtures = Awaited<ReturnType<typeof createFixtures>>;

const createBudget = async (actor: Actor, month: string, copyFrom?: string) =>
  actor.post('/api/budgets', { month, ...(copyFrom && { copyFrom }) });

interface ExpenseOverride {
  accountId?: string;
  categoryId?: string;
  amountMinor?: number;
  currency?: string;
  occurredAt?: string;
}

/**
 * Видаток за довільну дату. Через API видаток можна внести лише в поточному місяці,
 * тому дані для інших місяців вставляються напряму.
 */
const expense = (actor: Actor, f: Fixtures, override: ExpenseOverride) =>
  insertTransaction(actor, {
    type: 'expense',
    accountId: override.accountId ?? f.card.id,
    categoryId: override.categoryId ?? null,
    amountMinor: override.amountMinor ?? 100,
    currency: override.currency ?? 'UAH',
    occurredAt: new Date(override.occurredAt ?? '2099-10-15T10:00:00Z'),
  });

const income = (actor: Actor, f: Fixtures, override: object) =>
  actor.post('/api/transactions', {
    type: 'income',
    accountId: f.card.id,
    amountMinor: 100,
    occurredAt: '2099-10-15T10:00:00Z',
    ...override,
  });

describe('створення й читання бюджету', () => {
  it('створює порожній бюджет на місяць у часовому поясі домогосподарства', async () => {
    const actor = await createActor();
    const res = await createBudget(actor, '2026-10');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      month: '2026-10',
      status: 'active',
      currency: 'UAH',
      periodStart: '2026-09-30T21:00:00.000Z',
      periodEnd: '2026-10-31T22:00:00.000Z',
      expenseLines: [],
      unplannedExpenses: [],
      summary: {
        plannedIncomeTotal: 0,
        receivedIncomeTotal: 0,
        plannedExpenseTotal: 0,
        spentTotal: 0,
        plannedBalance: 0,
        actualBalance: 0,
      },
    });
    expect(res.body).not.toHaveProperty('householdId');

    const fetched = await actor.get('/api/budgets?month=2026-10');
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(res.body);
  });

  it('404, якщо бюджету на місяць немає', async () => {
    const actor = await createActor();
    await createBudget(actor, '2026-10');
    expect((await actor.get('/api/budgets?month=2026-11')).status).toBe(404);
  });

  it('409 на дубль бюджету на той самий місяць', async () => {
    const actor = await createActor();
    expect((await createBudget(actor, FUTURE)).status).toBe(201);

    const duplicate = await createBudget(actor, FUTURE);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
  });

  it('різні домогосподарства можуть мати бюджет на той самий місяць', async () => {
    const first = await createActor();
    const second = await createActor();
    expect((await createBudget(first, FUTURE)).status).toBe(201);
    expect((await createBudget(second, FUTURE)).status).toBe(201);
  });

  it.each([
    ['місяць поза діапазоном', { month: '2026-13' }],
    ['дата замість місяця', { month: '2026-10-01' }],
    ['без місяця', {}],
    ['некоректний copyFrom', { month: '2026-10', copyFrom: 'вересень' }],
  ])('400: %s', async (_name, body) => {
    const actor = await createActor();
    expect((await actor.post('/api/budgets', body)).status).toBe(400);
  });

  it('400 на некоректний місяць у запиті', async () => {
    const actor = await createActor();
    expect((await actor.get('/api/budgets?month=2026-1')).status).toBe(400);
    expect((await actor.get('/api/budgets')).status).toBe(400);
  });

  it('401 без токена', async () => {
    expect((await request(app).get('/api/budgets?month=2026-10')).status).toBe(401);
    expect((await request(app).post('/api/budgets').send({ month: '2026-10' })).status).toBe(401);
  });
});

describe('статті', () => {
  it('додає, змінює і видаляє ліміти витрат', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const { body: budget } = await createBudget(actor, FUTURE);
    const base = `/api/budgets/${budget.id}/expense-lines`;

    const added = await actor.post(base, { categoryId: f.food.id, plannedAmount: 1200000 });
    expect(added.status).toBe(201);
    expect(added.body.expenseLines).toEqual([
      expect.objectContaining({
        categoryId: f.food.id,
        categoryName: 'Продукти',
        planned: 1200000,
        spent: 0,
        remaining: 1200000,
        usage: 0,
        status: 'neutral',
      }),
    ]);

    const lineId = added.body.expenseLines[0].id;
    const updated = await actor.patch(`${base}/${lineId}`, { plannedAmount: 900000 });
    expect(updated.body.expenseLines[0].planned).toBe(900000);

    expect((await actor.delete(`${base}/${lineId}`)).body.expenseLines).toEqual([]);
    expect((await actor.delete(`${base}/${lineId}`)).status).toBe(404);
  });

  it('відхиляє некоректні ліміти', async () => {
    const actor = await createActor();
    const stranger = await createActor();
    const f = await createFixtures(actor);
    const foreign = await createFixtures(stranger);
    const { body: budget } = await createBudget(actor, FUTURE);
    const expenseLines = `/api/budgets/${budget.id}/expense-lines`;

    const responses = await Promise.all([
      actor.post(expenseLines, { categoryId: 'abc', plannedAmount: 100 }),
      actor.post(expenseLines, { categoryId: f.food.id, plannedAmount: -5 }),
      actor.post(expenseLines, { categoryId: f.food.id, plannedAmount: 100.5 }),
      actor.post(expenseLines, { categoryId: f.food.id, plannedAmount: '100' }),
      actor.post(expenseLines, { categoryId: f.food.id }),
      // категорія доходів, чужа категорія, неіснуюча категорія
      actor.post(expenseLines, { categoryId: f.salaryCategory.id, plannedAmount: 100 }),
      actor.post(expenseLines, { categoryId: foreign.food.id, plannedAmount: 100 }),
      actor.post(expenseLines, { categoryId: MISSING_ID, plannedAmount: 100 }),
    ]);
    expect(responses.map((res) => res.status)).toEqual(Array(8).fill(400));

    await actor.post(expenseLines, { categoryId: f.food.id, plannedAmount: 100 });
    const duplicate = await actor.post(expenseLines, { categoryId: f.food.id, plannedAmount: 200 });
    expect(duplicate.status).toBe(409);

    expect((await actor.patch(`${expenseLines}/${MISSING_ID}`, { plannedAmount: 1 })).status).toBe(
      404,
    );
    expect((await actor.patch(`${expenseLines}/${MISSING_ID}`, {})).status).toBe(400);
  });

  it('статей доходу в бюджеті більше немає', async () => {
    const actor = await createActor();
    const { body: budget } = await createBudget(actor, FUTURE);
    const res = await actor.post(`/api/budgets/${budget.id}/income-lines`, {
      name: 'Зарплата',
      plannedAmount: 1,
    });
    expect(res.status).toBe(404);
    expect(budget).not.toHaveProperty('incomeLines');
    expect(budget).not.toHaveProperty('otherIncome');
  });

  it('не дає видалити категорію, на яку задано ліміт', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const { body: budget } = await createBudget(actor, FUTURE);
    await actor.post(`/api/budgets/${budget.id}/expense-lines`, {
      categoryId: f.food.id,
      plannedAmount: 100,
    });

    expect((await actor.delete(`/api/categories/${f.food.id}`)).status).toBe(409);
    expect((await actor.delete(`/api/categories/${f.gifts.id}`)).status).toBe(204);
  });
});

describe('розрахунки', () => {
  async function plannedBudget(actor: Actor, f: Fixtures, month = FUTURE) {
    const { body: budget } = await createBudget(actor, month);
    await actor.post(`/api/budgets/${budget.id}/expense-lines`, {
      categoryId: f.food.id,
      plannedAmount: 1200000,
    });
    const { body } = await actor.post(`/api/budgets/${budget.id}/expense-lines`, {
      categoryId: f.transport.id,
      plannedAmount: 300000,
    });
    return body as { id: string; expenseLines: { id: string; categoryId: string }[] };
  }

  const salarySource = (actor: Actor, f: Fixtures, override: object = {}) =>
    actor.post('/api/income-sources', {
      name: 'Зарплата',
      accountId: f.card.id,
      plannedAmount: 5000000,
      frequency: 'monthly',
      dayOfMonth: 5,
      startDate: '2020-01-01',
      ...override,
    });

  it('рахує витрати, перевищення, незаплановані витрати й підсумки', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    await plannedBudget(actor, f, PAST);
    const at = { occurredAt: '2020-03-10T10:00:00Z' };

    await expense(actor, f, { ...at, categoryId: f.food.id, amountMinor: 1000000 });
    await expense(actor, f, { ...at, categoryId: f.food.id, amountMinor: 350000 });
    await expense(actor, f, { ...at, categoryId: f.transport.id, amountMinor: 120000 });
    await expense(actor, f, { ...at, categoryId: f.gifts.id, amountMinor: 80000 });
    await expense(actor, f, { ...at, amountMinor: 5000 });

    const { body } = await actor.get(`/api/budgets?month=${PAST}`);

    expect(body.expenseLines).toEqual([
      expect.objectContaining({
        categoryName: 'Продукти',
        planned: 1200000,
        spent: 1350000,
        remaining: -150000,
        usage: 1.125,
        status: 'over',
      }),
      expect.objectContaining({
        categoryName: 'Транспорт',
        spent: 120000,
        remaining: 180000,
        usage: 0.4,
        status: 'surplus',
      }),
    ]);
    expect(body.unplannedExpenses).toEqual(
      expect.arrayContaining([
        { categoryId: f.gifts.id, categoryName: 'Подарунки', spent: 80000, status: 'over' },
        { categoryId: null, categoryName: 'Без категорії', spent: 5000, status: 'over' },
      ]),
    );
    expect(body.unplannedExpenses).toHaveLength(2);
    expect(body.summary).toEqual({
      plannedIncomeTotal: 0,
      receivedIncomeTotal: 0,
      plannedExpenseTotal: 1500000,
      spentTotal: 1555000,
      plannedBalance: -1500000,
      actualBalance: -1555000,
    });
  });

  it('запланований і фактичний дохід місяця беруться з доходів', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    await plannedBudget(actor, f, PAST);
    await salarySource(actor, f);
    await salarySource(actor, f, { name: 'Аванс', plannedAmount: 1000000, dayOfMonth: 20 });

    const incomes = (await actor.get(`/api/incomes?month=${PAST}`)).body;
    const salary = incomes.occurrences.find((item: { name: string }) => item.name === 'Зарплата');
    await actor.post(`/api/income-occurrences/${salary.id}/receive`, {
      amount: 4500000,
      date: '2020-03-05',
    });
    await actor.post('/api/incomes/one-time', {
      name: 'Продаж велосипеда',
      amount: 750000,
      date: '2020-03-09',
      accountId: f.card.id,
    });
    await expense(actor, f, {
      categoryId: f.food.id,
      amountMinor: 250000,
      occurredAt: '2020-03-10T10:00:00Z',
    });

    const { body } = await actor.get(`/api/budgets?month=${PAST}`);
    expect(body.summary).toEqual({
      // зарплата 50 000 + аванс 10 000
      plannedIncomeTotal: 6000000,
      // отримана зарплата 45 000 + разовий дохід 7 500
      receivedIncomeTotal: 5250000,
      plannedExpenseTotal: 1500000,
      spentTotal: 250000,
      plannedBalance: 4500000,
      actualBalance: 5000000,
    });

    // пропущене надходження зменшує запланований дохід бюджету
    const advance = incomes.occurrences.find((item: { name: string }) => item.name === 'Аванс');
    await actor.patch(`/api/income-occurrences/${advance.id}`, { status: 'skipped' });
    const after = (await actor.get(`/api/budgets?month=${PAST}`)).body;
    expect(after.summary).toMatchObject({ plannedIncomeTotal: 5000000, plannedBalance: 3500000 });
  });

  it('перевищення на 1 копійку — over; рівно ліміт — neutral', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    await plannedBudget(actor, f);

    await expense(actor, f, { categoryId: f.food.id, amountMinor: 1200000 });
    await expense(actor, f, { categoryId: f.transport.id, amountMinor: 300001 });

    const { body } = await actor.get(`/api/budgets?month=${FUTURE}`);
    expect(body.expenseLines.map((line: { status: string }) => line.status)).toEqual([
      'neutral',
      'over',
    ]);
  });

  it('перевищений ліміт не блокує нові витрати в цій категорії', async () => {
    setNow('2099-10-20T10:00:00Z');
    const actor = await createActor();
    const f = await createFixtures(actor);
    await plannedBudget(actor, f);
    const viaApi = (amountMinor: number) =>
      actor.post('/api/transactions', {
        type: 'expense',
        accountId: f.card.id,
        categoryId: f.food.id,
        amountMinor,
        occurredAt: '2099-10-15T10:00:00Z',
      });

    expect((await viaApi(1200001)).status).toBe(201);
    const overLimit = (await actor.get(`/api/budgets?month=${FUTURE}`)).body.expenseLines[0];
    expect(overLimit.status).toBe('over');

    expect((await viaApi(500000)).status).toBe(201);

    const { body } = await actor.get(`/api/budgets?month=${FUTURE}`);
    expect(body.expenseLines[0]).toMatchObject({
      spent: 1700001,
      remaining: -500001,
      status: 'over',
    });
  });

  it('після завершення періоду залишок дає surplus, рівно ліміт — neutral, перевищення — over', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const budget = await plannedBudget(actor, f, PAST);
    await actor.post(`/api/budgets/${budget.id}/expense-lines`, {
      categoryId: f.gifts.id,
      plannedAmount: 50000,
    });
    const at = '2020-03-10T10:00:00Z';

    await expense(actor, f, { categoryId: f.food.id, amountMinor: 400000, occurredAt: at });
    await expense(actor, f, { categoryId: f.transport.id, amountMinor: 300000, occurredAt: at });
    await expense(actor, f, { categoryId: f.gifts.id, amountMinor: 50001, occurredAt: at });

    const { body } = await actor.get(`/api/budgets?month=${PAST}`);
    expect(body.expenseLines.map((line: { status: string }) => line.status)).toEqual([
      'surplus',
      'neutral',
      'over',
    ]);
  });

  it('ліміт 0 із витратами — over і usage = null', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const { body: budget } = await createBudget(actor, FUTURE);
    await actor.post(`/api/budgets/${budget.id}/expense-lines`, {
      categoryId: f.food.id,
      plannedAmount: 0,
    });
    await expense(actor, f, { categoryId: f.food.id, amountMinor: 1 });

    const { body } = await actor.get(`/api/budgets?month=${FUTURE}`);
    expect(body.expenseLines[0]).toMatchObject({ spent: 1, usage: null, status: 'over' });
    expect(body.unplannedExpenses).toEqual([]);
  });

  it('транзакція 31-го о 23:30 за Києвом потрапляє в цей місяць, а не в наступний', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    await createBudget(actor, '2026-10');
    await createBudget(actor, '2026-11');
    await createBudget(actor, '2026-09');

    // 31.10 23:30 за Києвом = 21:30 UTC (зимовий час); 1.11 00:00 = 22:00 UTC
    await expense(actor, f, { amountMinor: 700, occurredAt: '2026-10-31T23:30:00+02:00' });
    await expense(actor, f, { amountMinor: 30, occurredAt: '2026-10-31T22:00:00Z' });
    // 1.10 00:00 за Києвом = 30.09 21:00 UTC (літній час); секундою раніше — ще вересень
    await expense(actor, f, { amountMinor: 5, occurredAt: '2026-09-30T21:00:00Z' });
    await expense(actor, f, { amountMinor: 1, occurredAt: '2026-09-30T20:59:59Z' });

    const spent = async (month: string) =>
      (await actor.get(`/api/budgets?month=${month}`)).body.summary.spentTotal;
    expect(await spent('2026-09')).toBe(1);
    expect(await spent('2026-10')).toBe(705);
    expect(await spent('2026-11')).toBe(30);
  });

  it('перекази й транзакції в іншій валюті не враховуються', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    await plannedBudget(actor, f);

    await actor.post('/api/transactions', {
      type: 'transfer',
      accountId: f.card.id,
      toAccountId: f.cash.id,
      amountMinor: 999999,
      occurredAt: '2099-10-15T10:00:00Z',
    });
    await expense(actor, f, { accountId: f.usd.id, currency: 'USD', amountMinor: 777 });
    await income(actor, f, { accountId: f.usd.id, currency: 'USD', amountMinor: 888 });
    await expense(actor, f, { categoryId: f.food.id, amountMinor: 250 });

    const { body } = await actor.get(`/api/budgets?month=${FUTURE}`);
    expect(body.summary).toMatchObject({ spentTotal: 250, receivedIncomeTotal: 0 });
    expect(body.unplannedExpenses).toEqual([]);
  });
});

describe('копіювання з попереднього місяця', () => {
  it('переносить ліміти, але не транзакції', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const { body: september } = await createBudget(actor, '2099-09');
    await actor.post(`/api/budgets/${september.id}/expense-lines`, {
      categoryId: f.food.id,
      plannedAmount: 1200000,
    });
    const { body: source } = await actor.post(`/api/budgets/${september.id}/expense-lines`, {
      categoryId: f.transport.id,
      plannedAmount: 300000,
    });
    await expense(actor, f, {
      categoryId: f.food.id,
      amountMinor: 999,
      occurredAt: '2099-09-10T10:00:00Z',
    });

    const res = await createBudget(actor, '2099-10', '2099-09');

    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(september.id);
    expect(res.body.expenseLines).toEqual([
      expect.objectContaining({ categoryName: 'Продукти', planned: 1200000, spent: 0 }),
      expect.objectContaining({ categoryName: 'Транспорт', planned: 300000, spent: 0 }),
    ]);
    // нові ліміти — окремі записи, а не посилання на вересневі
    expect(res.body.expenseLines[0].id).not.toBe(source.expenseLines[0].id);
    expect(res.body.summary.spentTotal).toBe(0);

    const original = await actor.get('/api/budgets?month=2099-09');
    expect(original.body.summary.spentTotal).toBe(999);
  });

  it('404, якщо місяця-джерела немає, і бюджет не створюється', async () => {
    const actor = await createActor();
    expect((await createBudget(actor, '2099-10', '2099-09')).status).toBe(404);
    expect((await actor.get('/api/budgets?month=2099-10')).status).toBe(404);
  });

  it('не копіює з бюджету чужого домогосподарства', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    await createBudget(owner, '2099-09');

    expect((await createBudget(stranger, '2099-10', '2099-09')).status).toBe(404);
  });
});

describe('статус бюджету', () => {
  it('закритий бюджет доступний лише для читання, але транзакції перераховуються', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const { body: budget } = await createBudget(actor, FUTURE);
    const { body: withLines } = await actor.post(`/api/budgets/${budget.id}/expense-lines`, {
      categoryId: f.food.id,
      plannedAmount: 1000,
    });
    const expenseLine = withLines.expenseLines[0].id;

    const closed = await actor.patch(`/api/budgets/${budget.id}`, { status: 'closed' });
    expect(closed.body.status).toBe('closed');

    const base = `/api/budgets/${budget.id}`;
    const attempts = await Promise.all([
      actor.post(`${base}/expense-lines`, { categoryId: f.transport.id, plannedAmount: 1 }),
      actor.patch(`${base}/expense-lines/${expenseLine}`, { plannedAmount: 1 }),
      actor.delete(`${base}/expense-lines/${expenseLine}`),
    ]);
    expect(attempts.map((res) => res.status)).toEqual([409, 409, 409]);

    // транзакції заднім числом дозволені, розрахунки оновлюються
    await expense(actor, f, { categoryId: f.food.id, amountMinor: 1500 });
    await income(actor, f, { amountMinor: 700 });
    const { body } = await actor.get(`/api/budgets?month=${FUTURE}`);
    expect(body.expenseLines[0]).toMatchObject({ planned: 1000, spent: 1500, status: 'over' });
    expect(body.summary.receivedIncomeTotal).toBe(700);
  });

  it('закритий бюджет можна відкрити знову', async () => {
    const actor = await createActor();
    const { body: budget } = await createBudget(actor, FUTURE);
    await actor.patch(`/api/budgets/${budget.id}`, { status: 'closed' });

    expect((await actor.patch(`/api/budgets/${budget.id}`, { status: 'draft' })).body.status).toBe(
      'draft',
    );
    const f = await createFixtures(actor);
    const added = await actor.post(`/api/budgets/${budget.id}/expense-lines`, {
      categoryId: f.food.id,
      plannedAmount: 1,
    });
    expect(added.status).toBe(201);
  });

  it('відхиляє невідомий статус', async () => {
    const actor = await createActor();
    const { body: budget } = await createBudget(actor, FUTURE);
    expect((await actor.patch(`/api/budgets/${budget.id}`, { status: 'archived' })).status).toBe(
      400,
    );
    expect((await actor.patch(`/api/budgets/${budget.id}`, {})).status).toBe(400);
  });
});

describe('ізоляція домогосподарств', () => {
  it('чужий бюджет недоступний ні для читання, ні для зміни', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const ownerData = await createFixtures(owner);
    const strangerData = await createFixtures(stranger);
    const { body: budget } = await createBudget(owner, FUTURE);
    const { body: withExpense } = await owner.post(`/api/budgets/${budget.id}/expense-lines`, {
      categoryId: ownerData.food.id,
      plannedAmount: 1000,
    });
    const expenseLine = withExpense.expenseLines[0].id;
    const base = `/api/budgets/${budget.id}`;

    expect((await stranger.get(`/api/budgets?month=${FUTURE}`)).status).toBe(404);
    const attempts = await Promise.all([
      stranger.patch(base, { status: 'closed' }),
      stranger.post(`${base}/expense-lines`, {
        categoryId: strangerData.food.id,
        plannedAmount: 1,
      }),
      stranger.patch(`${base}/expense-lines/${expenseLine}`, { plannedAmount: 1 }),
      stranger.delete(`${base}/expense-lines/${expenseLine}`),
    ]);
    expect(attempts.map((res) => res.status)).toEqual([404, 404, 404, 404]);

    const untouched = await owner.get(`/api/budgets?month=${FUTURE}`);
    expect(untouched.body).toMatchObject({ status: 'active' });
    expect(untouched.body.expenseLines[0].planned).toBe(1000);
  });

  it('чужі транзакції не потрапляють у розрахунки', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const strangerData = await createFixtures(stranger);
    await createBudget(owner, FUTURE);
    await expense(stranger, strangerData, { amountMinor: 12345 });
    await income(stranger, strangerData, { amountMinor: 54321 });

    const { body } = await owner.get(`/api/budgets?month=${FUTURE}`);
    expect(body.summary).toMatchObject({ spentTotal: 0, receivedIncomeTotal: 0 });
  });

  it('ліміт одного бюджету не можна змінити через адресу іншого', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const { body: october } = await createBudget(actor, '2099-10');
    const { body: november } = await createBudget(actor, '2099-11');
    const { body } = await actor.post(`/api/budgets/${october.id}/expense-lines`, {
      categoryId: f.food.id,
      plannedAmount: 1,
    });

    const res = await actor.patch(
      `/api/budgets/${november.id}/expense-lines/${body.expenseLines[0].id}`,
      { plannedAmount: 2 },
    );
    expect(res.status).toBe(404);
  });
});
