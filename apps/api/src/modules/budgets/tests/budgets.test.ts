import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';

const { app, createActor, setNow, insertTransaction } = setupTestApp();
const MISSING_ID = '11111111-1111-4111-8111-111111111111';

// «Зараз» — 15 жовтня 2026, 15:00 за Києвом. Жовтень — поточний місяць:
// [30.09 21:00 UTC, 31.10 22:00 UTC); вересень минув, листопад ще попереду.
const NOW = '2026-10-15T12:00:00Z';
const PAST = '2026-09';
const CURRENT = '2026-10';
const FUTURE = '2026-11';
/** Момент у вересні, коли він ще був поточним місяцем. */
const DURING_PAST = '2026-09-20T12:00:00Z';

beforeEach(() => setNow(NOW));

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

const createBudget = (actor: Actor, month: string, copyFrom?: string) =>
  actor.post('/api/budgets', { month, ...(copyFrom && { copyFrom }) });

const getBudget = async (actor: Actor, month: string) =>
  (await actor.get(`/api/budgets?month=${month}`)).body;

const addLimit = (actor: Actor, budgetId: string, categoryId: string, plannedAmount: number) =>
  actor.post(`/api/budgets/${budgetId}/expense-lines`, { categoryId, plannedAmount });

/** Бюджет місяця, створений тоді, коли цей місяць ще був поточним. */
async function createPastBudget(actor: Actor) {
  setNow(DURING_PAST);
  const { body } = await createBudget(actor, PAST);
  setNow(NOW);
  return body as { id: string };
}

/** Видаток через API — так, як його створює застосунок; дата в межах поточного місяця. */
const spend = (actor: Actor, f: Fixtures, override: object = {}) =>
  actor.post('/api/transactions', {
    type: 'expense',
    accountId: f.card.id,
    amountMinor: 100,
    occurredAt: '2026-10-10T10:00:00Z',
    ...override,
  });

describe('створення й читання бюджету', () => {
  it('створює порожній бюджет поточного місяця в часовому поясі домогосподарства', async () => {
    const actor = await createActor();
    const res = await createBudget(actor, CURRENT);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      month: '2026-10',
      currency: 'UAH',
      periodState: 'current',
      canAddExpense: true,
      canEditLimits: true,
      periodStart: '2026-09-30T21:00:00.000Z',
      periodEnd: '2026-10-31T22:00:00.000Z',
      summary: {
        plannedIncomeTotal: 0,
        receivedIncomeTotal: 0,
        plannedExpenseTotal: 0,
        spentTotal: 0,
        plannedBalance: 0,
        actualBalance: 0,
        planState: 'balanced',
      },
      incomes: { occurrences: [], oneTimeTotal: 0 },
      expenseLines: [],
      unplannedExpenses: [],
    });

    const fetched = await actor.get(`/api/budgets?month=${CURRENT}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(res.body);
  });

  it('стан періоду й дозволи обчислюються відносно поточного моменту', async () => {
    const actor = await createActor();
    await createPastBudget(actor);
    await createBudget(actor, CURRENT);
    await createBudget(actor, FUTURE);

    expect(await getBudget(actor, PAST)).toMatchObject({
      periodState: 'past',
      canAddExpense: false,
      canEditLimits: false,
    });
    expect(await getBudget(actor, CURRENT)).toMatchObject({
      periodState: 'current',
      canAddExpense: true,
      canEditLimits: true,
    });
    expect(await getBudget(actor, FUTURE)).toMatchObject({
      periodState: 'future',
      canAddExpense: false,
      canEditLimits: true,
    });
  });

  it('межі періоду: 1-ше 00:00 за Києвом — поточний, 31-ше 23:59 — ще поточний, далі — минулий', async () => {
    const actor = await createActor();
    await createBudget(actor, CURRENT);
    const stateAt = async (now: string) => {
      setNow(now);
      return (await getBudget(actor, CURRENT)).periodState;
    };

    expect(await stateAt('2026-09-30T20:59:59Z')).toBe('future');
    expect(await stateAt('2026-09-30T21:00:00Z')).toBe('current');
    expect(await stateAt('2026-10-31T21:59:59Z')).toBe('current');
    expect(await stateAt('2026-10-31T22:00:00Z')).toBe('past');
  });

  it('створення бюджету для минулого місяця — 422', async () => {
    const actor = await createActor();

    const res = await createBudget(actor, PAST);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUDGET_PERIOD_CLOSED');
    expect((await createBudget(actor, '2020-03')).status).toBe(422);
    expect((await actor.get(`/api/budgets?month=${PAST}`)).status).toBe(404);

    expect((await createBudget(actor, CURRENT)).status).toBe(201);
    expect((await createBudget(actor, FUTURE)).status).toBe(201);
    expect((await createBudget(actor, '2099-10')).status).toBe(201);
  });

  it('404, якщо бюджету на місяць немає', async () => {
    const actor = await createActor();
    await createBudget(actor, CURRENT);
    expect((await actor.get(`/api/budgets?month=${FUTURE}`)).status).toBe(404);
  });

  it('409 на дубль бюджету на той самий місяць', async () => {
    const actor = await createActor();
    expect((await createBudget(actor, CURRENT)).status).toBe(201);

    const duplicate = await createBudget(actor, CURRENT);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
  });

  it('різні домогосподарства можуть мати бюджет на той самий місяць', async () => {
    const first = await createActor();
    const second = await createActor();
    expect((await createBudget(first, CURRENT)).status).toBe(201);
    expect((await createBudget(second, CURRENT)).status).toBe(201);
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

  it('статусу бюджету, статей доходу й ендпоінтів для них немає', async () => {
    const actor = await createActor();
    const { body: budget } = await createBudget(actor, CURRENT);

    expect(budget).not.toHaveProperty('status');
    expect(budget).not.toHaveProperty('incomeLines');
    expect((await actor.patch(`/api/budgets/${budget.id}`, { status: 'closed' })).status).toBe(404);
    const line = await actor.post(`/api/budgets/${budget.id}/income-lines`, {
      name: 'Зарплата',
      plannedAmount: 1,
    });
    expect(line.status).toBe(404);
  });

  it('401 без токена', async () => {
    expect((await request(app).get('/api/budgets?month=2026-10')).status).toBe(401);
    expect((await request(app).post('/api/budgets').send({ month: '2026-10' })).status).toBe(401);
  });
});

describe('ліміти', () => {
  it('додає, змінює і видаляє ліміти в поточному й майбутньому бюджеті', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);

    for (const month of [CURRENT, FUTURE]) {
      const { body: budget } = await createBudget(actor, month);
      const base = `/api/budgets/${budget.id}/expense-lines`;

      const added = await addLimit(actor, budget.id, f.food.id, 1200000);
      expect(added.status).toBe(201);
      expect(added.body.expenseLines).toEqual([
        {
          id: expect.any(String),
          categoryId: f.food.id,
          categoryName: 'Продукти',
          planned: 1200000,
          spent: 0,
          remaining: 1200000,
          usage: 0,
          status: 'neutral',
        },
      ]);

      const lineId = added.body.expenseLines[0].id;
      const updated = await actor.patch(`${base}/${lineId}`, { plannedAmount: 900000 });
      expect(updated.body.expenseLines[0].planned).toBe(900000);
      expect(updated.body.summary.plannedExpenseTotal).toBe(900000);

      expect((await actor.delete(`${base}/${lineId}`)).body.expenseLines).toEqual([]);
      expect((await actor.delete(`${base}/${lineId}`)).status).toBe(404);
    }
  });

  it('sortOrder змінює порядок рядків', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const { body: budget } = await createBudget(actor, CURRENT);
    await addLimit(actor, budget.id, f.food.id, 100);
    await addLimit(actor, budget.id, f.transport.id, 200);
    const { body } = await addLimit(actor, budget.id, f.gifts.id, 300);
    const names = (view: { expenseLines: { categoryName: string }[] }) =>
      view.expenseLines.map((line) => line.categoryName);
    expect(names(body)).toEqual(['Продукти', 'Транспорт', 'Подарунки']);

    const gifts = body.expenseLines[2];
    const moved = await actor.patch(`/api/budgets/${budget.id}/expense-lines/${gifts.id}`, {
      sortOrder: 0,
    });
    // рядки з однаковою позицією лишаються в стабільному порядку, тож перевіряємо лише перший
    expect(moved.body.expenseLines.map((line: { planned: number }) => line.planned)).toContain(300);
    await actor.patch(`/api/budgets/${budget.id}/expense-lines/${body.expenseLines[0].id}`, {
      sortOrder: 5,
    });
    expect(names(await getBudget(actor, CURRENT))).toEqual(['Подарунки', 'Транспорт', 'Продукти']);
    // сума ліміту при цьому не змінилася
    expect((await getBudget(actor, CURRENT)).expenseLines[0].planned).toBe(300);
  });

  it('зміна лімітів у минулому бюджеті — 409', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    setNow(DURING_PAST);
    const { body: budget } = await createBudget(actor, PAST);
    const { body: withLine } = await addLimit(actor, budget.id, f.food.id, 1000);
    setNow(NOW);
    const base = `/api/budgets/${budget.id}/expense-lines`;
    const lineId = withLine.expenseLines[0].id;

    const attempts = await Promise.all([
      addLimit(actor, budget.id, f.transport.id, 1),
      actor.patch(`${base}/${lineId}`, { plannedAmount: 1 }),
      actor.patch(`${base}/${lineId}`, { sortOrder: 3 }),
      actor.delete(`${base}/${lineId}`),
    ]);
    expect(attempts.map((res) => res.status)).toEqual([409, 409, 409, 409]);
    expect(attempts[0]!.body.error.code).toBe('CONFLICT');

    const untouched = await getBudget(actor, PAST);
    expect(untouched.expenseLines).toEqual([
      expect.objectContaining({ categoryName: 'Продукти', planned: 1000 }),
    ]);
  });

  it('відхиляє некоректні ліміти', async () => {
    const actor = await createActor();
    const stranger = await createActor();
    const f = await createFixtures(actor);
    const foreign = await createFixtures(stranger);
    const { body: budget } = await createBudget(actor, CURRENT);
    const base = `/api/budgets/${budget.id}/expense-lines`;

    const responses = await Promise.all([
      actor.post(base, { categoryId: 'abc', plannedAmount: 100 }),
      actor.post(base, { categoryId: f.food.id, plannedAmount: -5 }),
      actor.post(base, { categoryId: f.food.id, plannedAmount: 100.5 }),
      actor.post(base, { categoryId: f.food.id, plannedAmount: '100' }),
      actor.post(base, { categoryId: f.food.id }),
      // категорія доходів, чужа категорія, неіснуюча категорія
      actor.post(base, { categoryId: f.salaryCategory.id, plannedAmount: 100 }),
      actor.post(base, { categoryId: foreign.food.id, plannedAmount: 100 }),
      actor.post(base, { categoryId: MISSING_ID, plannedAmount: 100 }),
    ]);
    expect(responses.map((res) => res.status)).toEqual(Array(8).fill(400));

    const { body } = await addLimit(actor, budget.id, f.food.id, 100);
    expect((await addLimit(actor, budget.id, f.food.id, 200)).status).toBe(409);

    const lineId = body.expenseLines[0].id;
    const patches = await Promise.all([
      actor.patch(`${base}/${lineId}`, {}),
      actor.patch(`${base}/${lineId}`, { plannedAmount: -1 }),
      actor.patch(`${base}/${lineId}`, { sortOrder: -1 }),
      actor.patch(`${base}/${lineId}`, { sortOrder: 1.5 }),
    ]);
    expect(patches.map((res) => res.status)).toEqual([400, 400, 400, 400]);
    expect((await actor.patch(`${base}/${MISSING_ID}`, { plannedAmount: 1 })).status).toBe(404);
  });

  it('не дає видалити категорію, на яку задано ліміт', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const { body: budget } = await createBudget(actor, CURRENT);
    await addLimit(actor, budget.id, f.food.id, 100);

    expect((await actor.delete(`/api/categories/${f.food.id}`)).status).toBe(409);
    expect((await actor.delete(`/api/categories/${f.gifts.id}`)).status).toBe(204);
  });
});

describe('витрати в бюджеті', () => {
  async function plannedBudget(actor: Actor, f: Fixtures, month = CURRENT) {
    const { body: budget } = await createBudget(actor, month);
    await addLimit(actor, budget.id, f.food.id, 1200000);
    await addLimit(actor, budget.id, f.transport.id, 300000);
    return budget as { id: string };
  }

  it('видаток поточного місяця в категорії з лімітом зʼявляється в spent цієї категорії', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    await plannedBudget(actor, f);

    expect((await spend(actor, f, { categoryId: f.food.id, amountMinor: 250000 })).status).toBe(
      201,
    );
    expect((await spend(actor, f, { categoryId: f.food.id, amountMinor: 50000 })).status).toBe(201);

    const budget = await getBudget(actor, CURRENT);
    expect(budget.expenseLines).toEqual([
      expect.objectContaining({
        categoryName: 'Продукти',
        planned: 1200000,
        spent: 300000,
        remaining: 900000,
        usage: 0.25,
        status: 'neutral',
      }),
      expect.objectContaining({ categoryName: 'Транспорт', spent: 0, status: 'neutral' }),
    ]);
    expect(budget.unplannedExpenses).toEqual([]);
    expect(budget.summary).toMatchObject({ plannedExpenseTotal: 1500000, spentTotal: 300000 });
  });

  it('видаток у категорії без ліміту й без категорії зʼявляється в unplannedExpenses', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    await plannedBudget(actor, f);

    await spend(actor, f, { categoryId: f.gifts.id, amountMinor: 80000 });
    await spend(actor, f, { amountMinor: 5000 });

    const budget = await getBudget(actor, CURRENT);
    expect(budget.unplannedExpenses).toHaveLength(2);
    expect(budget.unplannedExpenses).toEqual(
      expect.arrayContaining([
        { categoryId: f.gifts.id, categoryName: 'Подарунки', spent: 80000, status: 'over' },
        { categoryId: null, categoryName: 'Без категорії', spent: 5000, status: 'over' },
      ]),
    );
    // незаплановані витрати входять у загальну суму
    expect(budget.summary.spentTotal).toBe(85000);
  });

  it('перевищення на 1 копійку — over; рівно ліміт — neutral; перевищення не блокує нові видатки', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    await plannedBudget(actor, f);

    await spend(actor, f, { categoryId: f.food.id, amountMinor: 1200000 });
    await spend(actor, f, { categoryId: f.transport.id, amountMinor: 300001 });
    let budget = await getBudget(actor, CURRENT);
    expect(budget.expenseLines.map((line: { status: string }) => line.status)).toEqual([
      'neutral',
      'over',
    ]);

    const more = await spend(actor, f, { categoryId: f.transport.id, amountMinor: 500000 });
    expect(more.status).toBe(201);
    budget = await getBudget(actor, CURRENT);
    expect(budget.expenseLines[1]).toMatchObject({
      spent: 800001,
      remaining: -500001,
      status: 'over',
    });
  });

  it('після завершення періоду: залишок — surplus, рівно ліміт — neutral, перевищення — over', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    setNow(DURING_PAST);
    const budget = await plannedBudget(actor, f, PAST);
    await addLimit(actor, budget.id, f.gifts.id, 50000);
    const at = { occurredAt: '2026-09-10T10:00:00Z' };
    await spend(actor, f, { ...at, categoryId: f.food.id, amountMinor: 400000 });
    await spend(actor, f, { ...at, categoryId: f.transport.id, amountMinor: 300000 });
    await spend(actor, f, { ...at, categoryId: f.gifts.id, amountMinor: 50001 });
    const statuses = async () =>
      (await getBudget(actor, PAST)).expenseLines.map((line: { status: string }) => line.status);

    // поки місяць триває, залишок ще не «зелений»
    expect(await statuses()).toEqual(['neutral', 'neutral', 'over']);
    setNow(NOW);
    expect(await statuses()).toEqual(['surplus', 'neutral', 'over']);
  });

  it('ліміт 0 із витратами — over і usage = null', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const { body: budget } = await createBudget(actor, CURRENT);
    await addLimit(actor, budget.id, f.food.id, 0);
    await spend(actor, f, { categoryId: f.food.id, amountMinor: 1 });

    const view = await getBudget(actor, CURRENT);
    expect(view.expenseLines[0]).toMatchObject({ spent: 1, usage: null, status: 'over' });
    expect(view.unplannedExpenses).toEqual([]);
  });

  it('видаток 31-го о 23:30 за Києвом рахується в цьому місяці, а не в наступному', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    await createPastBudget(actor);
    await createBudget(actor, CURRENT);
    await createBudget(actor, FUTURE);
    const insert = (occurredAt: string, amountMinor: number) =>
      insertTransaction(actor, {
        type: 'expense',
        accountId: f.card.id,
        amountMinor,
        currency: 'UAH',
        occurredAt: new Date(occurredAt),
      });

    // 31.10 23:30 за Києвом = 21:30 UTC (зимовий час); 1.11 00:00 = 22:00 UTC
    await insert('2026-10-31T21:30:00Z', 700);
    await insert('2026-10-31T22:00:00Z', 30);
    // 1.10 00:00 за Києвом = 30.09 21:00 UTC (літній час); секундою раніше — ще вересень
    await insert('2026-09-30T21:00:00Z', 5);
    await insert('2026-09-30T20:59:59Z', 1);

    const spent = async (month: string) => (await getBudget(actor, month)).summary.spentTotal;
    expect(await spent(PAST)).toBe(1);
    expect(await spent(CURRENT)).toBe(705);
    expect(await spent(FUTURE)).toBe(30);
  });

  it('перекази й транзакції в іншій валюті не враховуються', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    await plannedBudget(actor, f);
    const at = { occurredAt: '2026-10-10T10:00:00Z' };

    await actor.post('/api/transactions', {
      ...at,
      type: 'transfer',
      accountId: f.card.id,
      toAccountId: f.cash.id,
      amountMinor: 999999,
    });
    await spend(actor, f, { accountId: f.usd.id, currency: 'USD', amountMinor: 777 });
    await actor.post('/api/transactions', {
      ...at,
      type: 'income',
      accountId: f.usd.id,
      currency: 'USD',
      amountMinor: 888,
    });
    await spend(actor, f, { categoryId: f.food.id, amountMinor: 250 });

    const budget = await getBudget(actor, CURRENT);
    expect(budget.summary).toMatchObject({ spentTotal: 250, receivedIncomeTotal: 0 });
    expect(budget.unplannedExpenses).toEqual([]);
  });
});

describe('доходи в бюджеті', () => {
  it('збігаються з GET /incomes за той самий місяць', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const { body: budget } = await createBudget(actor, CURRENT);
    await addLimit(actor, budget.id, f.food.id, 1500000);
    const source = (name: string, plannedAmount: number, dayOfMonth: number) =>
      actor.post('/api/income-sources', {
        name,
        accountId: f.card.id,
        plannedAmount,
        frequency: 'monthly',
        dayOfMonth,
        startDate: '2026-01-01',
      });
    await source('Зарплата', 4500000, 5);
    await source('Аванс', 1500000, 20);
    await source('Оренда', 800000, 10);

    const before = (await actor.get(`/api/incomes?month=${CURRENT}`)).body;
    const occurrence = (name: string) =>
      before.occurrences.find((item: { name: string }) => item.name === name);
    await actor.post(`/api/income-occurrences/${occurrence('Зарплата').id}/receive`, {
      date: '2026-10-05',
    });
    await actor.post(`/api/income-occurrences/${occurrence('Оренда').id}/receive`, {
      amount: 300000,
      date: '2026-10-12',
    });
    await actor.post('/api/incomes/one-time', {
      name: 'Продаж велосипеда',
      amount: 750000,
      date: '2026-10-09',
      accountId: f.card.id,
    });
    await spend(actor, f, { categoryId: f.food.id, amountMinor: 250000 });

    const incomes = (await actor.get(`/api/incomes?month=${CURRENT}`)).body;
    const view = await getBudget(actor, CURRENT);

    expect(view.summary).toEqual({
      plannedIncomeTotal: incomes.summary.plannedTotal,
      receivedIncomeTotal: incomes.summary.receivedTotal,
      plannedExpenseTotal: 1500000,
      spentTotal: 250000,
      plannedBalance: incomes.summary.plannedTotal - 1500000,
      actualBalance: incomes.summary.receivedTotal - 250000,
      planState: 'balanced',
    });
    // конкретні числа: план 45 000 + 15 000 + 8 000, отримано 45 000 + 3 000 + 7 500
    expect(view.summary).toMatchObject({
      plannedIncomeTotal: 6800000,
      receivedIncomeTotal: 5550000,
    });

    expect(view.incomes).toEqual({
      occurrences: incomes.occurrences.map(
        (item: {
          name: string;
          plannedDate: string;
          plannedAmount: number;
          actualAmount: number;
          status: string;
        }) => ({
          name: item.name,
          plannedDate: item.plannedDate,
          plannedAmount: item.plannedAmount,
          actualAmount: item.actualAmount,
          status: item.status,
        }),
      ),
      oneTimeTotal: incomes.summary.oneTimeTotal,
    });
    expect(view.incomes.occurrences).toEqual([
      {
        name: 'Зарплата',
        plannedDate: '2026-10-05',
        plannedAmount: 4500000,
        actualAmount: 4500000,
        status: 'received',
      },
      {
        name: 'Оренда',
        plannedDate: '2026-10-10',
        plannedAmount: 800000,
        actualAmount: 300000,
        status: 'partial',
      },
      {
        name: 'Аванс',
        plannedDate: '2026-10-20',
        plannedAmount: 1500000,
        actualAmount: 0,
        status: 'pending',
      },
    ]);
    expect(view.incomes.oneTimeTotal).toBe(750000);
  });

  it('пропущене надходження зменшує запланований дохід бюджету', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    await createBudget(actor, CURRENT);
    await actor.post('/api/income-sources', {
      name: 'Аванс',
      accountId: f.card.id,
      plannedAmount: 1500000,
      frequency: 'monthly',
      dayOfMonth: 20,
      startDate: '2026-01-01',
    });
    expect((await getBudget(actor, CURRENT)).summary.plannedIncomeTotal).toBe(1500000);

    const [occurrence] = (await actor.get(`/api/incomes?month=${CURRENT}`)).body.occurrences;
    await actor.patch(`/api/income-occurrences/${occurrence.id}`, { status: 'skipped' });

    const view = await getBudget(actor, CURRENT);
    expect(view.summary.plannedIncomeTotal).toBe(0);
    expect(view.incomes.occurrences[0].status).toBe('skipped');
  });
});

describe('копіювання з попереднього місяця', () => {
  it('переносить лише ліміти: без видатків і доходів', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    setNow(DURING_PAST);
    const { body: september } = await createBudget(actor, PAST);
    await addLimit(actor, september.id, f.food.id, 1200000);
    const { body: source } = await addLimit(actor, september.id, f.transport.id, 300000);
    await spend(actor, f, {
      categoryId: f.food.id,
      amountMinor: 999,
      occurredAt: '2026-09-10T10:00:00Z',
    });
    await actor.post('/api/incomes/one-time', {
      name: 'Бонус',
      amount: 888,
      date: '2026-09-10',
      accountId: f.card.id,
    });
    setNow(NOW);

    // копіювати можна й з місяця, що вже минув
    const res = await createBudget(actor, CURRENT, PAST);

    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(september.id);
    expect(res.body.expenseLines).toEqual([
      expect.objectContaining({ categoryName: 'Продукти', planned: 1200000, spent: 0 }),
      expect.objectContaining({ categoryName: 'Транспорт', planned: 300000, spent: 0 }),
    ]);
    // нові ліміти — окремі записи, а не посилання на вересневі
    expect(res.body.expenseLines[0].id).not.toBe(source.expenseLines[0].id);
    expect(res.body.summary).toMatchObject({ spentTotal: 0, receivedIncomeTotal: 0 });
    expect(res.body.incomes).toEqual({ occurrences: [], oneTimeTotal: 0 });

    const original = await getBudget(actor, PAST);
    expect(original.summary).toMatchObject({ spentTotal: 999, receivedIncomeTotal: 888 });
    expect(original.expenseLines).toHaveLength(2);
  });

  it('404, якщо місяця-джерела немає, і бюджет не створюється', async () => {
    const actor = await createActor();
    expect((await createBudget(actor, CURRENT, PAST)).status).toBe(404);
    expect((await actor.get(`/api/budgets?month=${CURRENT}`)).status).toBe(404);
  });

  it('не копіює з бюджету чужого домогосподарства', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    await createPastBudget(owner);

    expect((await createBudget(stranger, CURRENT, PAST)).status).toBe(404);
  });
});

describe('ізоляція домогосподарств', () => {
  it('чужий бюджет недоступний ні для читання, ні для зміни', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const ownerData = await createFixtures(owner);
    const strangerData = await createFixtures(stranger);
    const { body: budget } = await createBudget(owner, CURRENT);
    const { body: withLine } = await addLimit(owner, budget.id, ownerData.food.id, 1000);
    const lineId = withLine.expenseLines[0].id;
    const base = `/api/budgets/${budget.id}/expense-lines`;

    expect((await stranger.get(`/api/budgets?month=${CURRENT}`)).status).toBe(404);
    const attempts = await Promise.all([
      addLimit(stranger, budget.id, strangerData.food.id, 1),
      stranger.patch(`${base}/${lineId}`, { plannedAmount: 1 }),
      stranger.delete(`${base}/${lineId}`),
    ]);
    expect(attempts.map((res) => res.status)).toEqual([404, 404, 404]);

    expect((await getBudget(owner, CURRENT)).expenseLines[0].planned).toBe(1000);
  });

  it('чужі транзакції й доходи не потрапляють у розрахунки', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const strangerData = await createFixtures(stranger);
    await createBudget(owner, CURRENT);
    await spend(stranger, strangerData, { amountMinor: 12345 });
    await stranger.post('/api/incomes/one-time', {
      name: 'Бонус',
      amount: 54321,
      date: '2026-10-10',
      accountId: strangerData.card.id,
    });

    const view = await getBudget(owner, CURRENT);
    expect(view.summary).toMatchObject({ spentTotal: 0, receivedIncomeTotal: 0 });
    expect(view.incomes).toEqual({ occurrences: [], oneTimeTotal: 0 });
  });

  it('ліміт одного бюджету не можна змінити через адресу іншого', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const { body: october } = await createBudget(actor, CURRENT);
    const { body: november } = await createBudget(actor, FUTURE);
    const { body } = await addLimit(actor, october.id, f.food.id, 1);

    const res = await actor.patch(
      `/api/budgets/${november.id}/expense-lines/${body.expenseLines[0].id}`,
      { plannedAmount: 2 },
    );
    expect(res.status).toBe(404);
  });
});

describe('ліміти й підкатегорії', () => {
  async function setup() {
    const actor = await createActor();
    const { body: card } = await actor.post('/api/accounts', { name: 'Картка', type: 'card' });
    const category = async (name: string, parentId: string | null = null) =>
      (await actor.post('/api/categories', { name, kind: 'expense', parentId })).body;
    const utilities = await category('Комунальні');
    const water = await category('Вода', utilities.id);
    const gas = await category('Газ', utilities.id);
    const spend = (categoryId: string, amountMinor: number) =>
      actor.post('/api/transactions', {
        type: 'expense',
        accountId: card.id,
        categoryId,
        amountMinor,
        occurredAt: '2026-10-10T10:00:00Z',
      });
    const { body: budget } = await createBudget(actor, CURRENT);
    return { actor, utilities, water, gas, spend, budget };
  }

  it('ліміт групи включає витрати всіх підкатегорій і самої групи', async () => {
    const { actor, utilities, water, gas, spend, budget } = await setup();
    await spend(water.id, 30_000);
    await spend(gas.id, 20_000);
    await spend(utilities.id, 5_000);
    expect((await addLimit(actor, budget.id, utilities.id, 50_000)).status).toBe(201);

    const view = await getBudget(actor, CURRENT);
    expect(view.expenseLines).toEqual([
      expect.objectContaining({
        categoryName: 'Комунальні',
        spent: 55_000,
        remaining: -5_000,
        status: 'over',
        subcategories: [
          { categoryId: water.id, categoryName: 'Вода', spent: 30_000 },
          { categoryId: gas.id, categoryName: 'Газ', spent: 20_000 },
          { categoryId: utilities.id, categoryName: 'Без підкатегорії', spent: 5_000 },
        ],
      }),
    ]);
    expect(view.unplannedExpenses).toEqual([]);
  });

  it('ліміт на підкатегорію має повну назву; решта групи — незапланована', async () => {
    const { actor, water, gas, spend, budget } = await setup();
    await spend(water.id, 30_000);
    await spend(gas.id, 20_000);
    await addLimit(actor, budget.id, water.id, 40_000);

    const view = await getBudget(actor, CURRENT);
    expect(view.expenseLines).toEqual([
      expect.objectContaining({ categoryName: 'Комунальні › Вода', spent: 30_000 }),
    ]);
    expect(view.unplannedExpenses).toEqual([
      expect.objectContaining({ categoryId: gas.id, categoryName: 'Комунальні › Газ' }),
    ]);
    expect(view.summary.spentTotal).toBe(50_000);
  });

  it('не можна ліміт і на групу, і на її підкатегорію в одному бюджеті', async () => {
    const { actor, utilities, water, gas, budget } = await setup();
    expect((await addLimit(actor, budget.id, water.id, 100)).status).toBe(201);
    expect((await addLimit(actor, budget.id, gas.id, 100)).status).toBe(201);
    expect((await addLimit(actor, budget.id, utilities.id, 100)).status).toBe(409);

    // В іншому бюджеті — навпаки: спершу група, тоді підкатегорія не додається.
    const { body: next } = await createBudget(actor, FUTURE);
    expect((await addLimit(actor, next.id, utilities.id, 100)).status).toBe(201);
    expect((await addLimit(actor, next.id, water.id, 100)).status).toBe(409);
  });
});
