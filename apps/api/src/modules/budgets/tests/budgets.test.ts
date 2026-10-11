import { sql } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';

const { app, db, createActor } = setupTestApp();
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

const expense = (actor: Actor, f: Fixtures, override: object) =>
  actor.post('/api/transactions', {
    type: 'expense',
    accountId: f.card.id,
    amountMinor: 100,
    occurredAt: '2099-10-15T10:00:00Z',
    ...override,
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
      incomeLines: [],
      expenseLines: [],
      unplannedExpenses: [],
      otherIncome: 0,
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
  it('додає, змінює і видаляє статті доходів', async () => {
    const actor = await createActor();
    const { body: budget } = await createBudget(actor, FUTURE);
    const base = `/api/budgets/${budget.id}/income-lines`;

    const added = await actor.post(base, { name: '  Зарплата ', plannedAmount: 5000000 });
    expect(added.status).toBe(201);
    await actor.post(base, { name: 'Фріланс', plannedAmount: 0 });
    const lines = (await actor.get(`/api/budgets?month=${FUTURE}`)).body.incomeLines;
    expect(lines).toEqual([
      expect.objectContaining({ name: 'Зарплата', planned: 5000000, received: 0, diff: -5000000 }),
      expect.objectContaining({ name: 'Фріланс', planned: 0, received: 0, diff: 0 }),
    ]);

    const updated = await actor.patch(`${base}/${lines[0].id}`, { plannedAmount: 6000000 });
    expect(updated.body.incomeLines[0]).toMatchObject({ name: 'Зарплата', planned: 6000000 });
    expect(updated.body.summary.plannedIncomeTotal).toBe(6000000);

    const removed = await actor.delete(`${base}/${lines[1].id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.incomeLines).toHaveLength(1);
  });

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

  it('відхиляє некоректні статті', async () => {
    const actor = await createActor();
    const stranger = await createActor();
    const f = await createFixtures(actor);
    const foreign = await createFixtures(stranger);
    const { body: budget } = await createBudget(actor, FUTURE);
    const incomeLines = `/api/budgets/${budget.id}/income-lines`;
    const expenseLines = `/api/budgets/${budget.id}/expense-lines`;

    const statuses = async (requests: Promise<{ status: number }>[]) =>
      (await Promise.all(requests)).map((res) => res.status);

    expect(
      await statuses([
        actor.post(incomeLines, { name: 'Зарплата', plannedAmount: -1 }),
        actor.post(incomeLines, { name: 'Зарплата', plannedAmount: 100.5 }),
        actor.post(incomeLines, { name: 'Зарплата', plannedAmount: '100' }),
        actor.post(incomeLines, { name: ' ', plannedAmount: 100 }),
        actor.post(incomeLines, { plannedAmount: 100 }),
        actor.post(expenseLines, { categoryId: 'abc', plannedAmount: 100 }),
        actor.post(expenseLines, { categoryId: f.food.id, plannedAmount: -5 }),
        // категорія доходів, чужа категорія, неіснуюча категорія
        actor.post(expenseLines, { categoryId: f.salaryCategory.id, plannedAmount: 100 }),
        actor.post(expenseLines, { categoryId: foreign.food.id, plannedAmount: 100 }),
        actor.post(expenseLines, { categoryId: MISSING_ID, plannedAmount: 100 }),
      ]),
    ).toEqual(Array(10).fill(400));

    await actor.post(expenseLines, { categoryId: f.food.id, plannedAmount: 100 });
    const duplicate = await actor.post(expenseLines, { categoryId: f.food.id, plannedAmount: 200 });
    expect(duplicate.status).toBe(409);

    expect((await actor.patch(`${incomeLines}/${MISSING_ID}`, { name: 'x' })).status).toBe(404);
    expect((await actor.patch(`${incomeLines}/${MISSING_ID}`, {})).status).toBe(400);
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
    await actor.post(`/api/budgets/${budget.id}/expense-lines`, {
      categoryId: f.transport.id,
      plannedAmount: 300000,
    });
    const { body } = await actor.post(`/api/budgets/${budget.id}/income-lines`, {
      name: 'Зарплата',
      plannedAmount: 5000000,
    });
    return body as {
      id: string;
      incomeLines: { id: string }[];
      expenseLines: { id: string; categoryId: string }[];
    };
  }

  it('рахує витрати, перевищення, незаплановані витрати, доходи й підсумки', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const budget = await plannedBudget(actor, f);
    const salaryLine = budget.incomeLines[0]!.id;

    await expense(actor, f, { categoryId: f.food.id, amountMinor: 1000000 });
    await expense(actor, f, { categoryId: f.food.id, amountMinor: 350000 });
    await expense(actor, f, { categoryId: f.transport.id, amountMinor: 120000 });
    await expense(actor, f, { categoryId: f.gifts.id, amountMinor: 80000 });
    await expense(actor, f, { amountMinor: 5000 });
    await income(actor, f, { incomeLineId: salaryLine, amountMinor: 4500000 });
    await income(actor, f, { amountMinor: 20000, categoryId: f.salaryCategory.id });

    const { body } = await actor.get(`/api/budgets?month=${FUTURE}`);

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
        status: 'neutral',
      }),
    ]);
    expect(body.unplannedExpenses).toEqual(
      expect.arrayContaining([
        { categoryId: f.gifts.id, categoryName: 'Подарунки', spent: 80000, status: 'over' },
        { categoryId: null, categoryName: 'Без категорії', spent: 5000, status: 'over' },
      ]),
    );
    expect(body.unplannedExpenses).toHaveLength(2);
    expect(body.incomeLines).toEqual([
      expect.objectContaining({
        name: 'Зарплата',
        planned: 5000000,
        received: 4500000,
        diff: -500000,
      }),
    ]);
    expect(body.otherIncome).toBe(20000);
    expect(body.summary).toEqual({
      plannedIncomeTotal: 5000000,
      receivedIncomeTotal: 4520000,
      plannedExpenseTotal: 1500000,
      spentTotal: 1555000,
      plannedBalance: 3500000,
      actualBalance: 2965000,
    });
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
    const actor = await createActor();
    const f = await createFixtures(actor);
    await plannedBudget(actor, f);

    const first = await expense(actor, f, { categoryId: f.food.id, amountMinor: 1200001 });
    expect(first.status).toBe(201);
    const overLimit = (await actor.get(`/api/budgets?month=${FUTURE}`)).body.expenseLines[0];
    expect(overLimit.status).toBe('over');

    const second = await expense(actor, f, { categoryId: f.food.id, amountMinor: 500000 });
    expect(second.status).toBe(201);

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

  it('перенесення дати транзакції переносить її в інший місяць', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    await createBudget(actor, '2026-10');
    await createBudget(actor, '2026-11');
    const body = {
      type: 'expense',
      accountId: f.card.id,
      amountMinor: 500,
      occurredAt: '2026-10-10T10:00:00Z',
    };
    const { body: created } = await actor.post('/api/transactions', body);

    await actor.put(`/api/transactions/${created.id}`, {
      ...body,
      occurredAt: '2026-11-10T10:00:00Z',
    });

    expect((await actor.get('/api/budgets?month=2026-10')).body.summary.spentTotal).toBe(0);
    expect((await actor.get('/api/budgets?month=2026-11')).body.summary.spentTotal).toBe(500);
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
    expect(body.otherIncome).toBe(0);
  });

  it('зміна й видалення доходу зменшують отримане за статтею', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const budget = await plannedBudget(actor, f);
    const incomeLineId = budget.incomeLines[0]!.id;
    const body = {
      type: 'income',
      accountId: f.card.id,
      incomeLineId,
      amountMinor: 4500000,
      occurredAt: '2099-10-05T10:00:00Z',
    };
    const { body: created } = await actor.post('/api/transactions', body);
    expect(created.incomeLineId).toBe(incomeLineId);

    await actor.put(`/api/transactions/${created.id}`, { ...body, amountMinor: 4000000 });
    const received = async () =>
      (await actor.get(`/api/budgets?month=${FUTURE}`)).body.incomeLines[0].received;
    expect(await received()).toBe(4000000);

    await actor.delete(`/api/transactions/${created.id}`);
    expect(await received()).toBe(0);
  });

  it('видалення статті доходу переводить її транзакції в «Інші доходи»', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const budget = await plannedBudget(actor, f);
    const incomeLineId = budget.incomeLines[0]!.id;
    const { body: created } = await income(actor, f, { incomeLineId, amountMinor: 4500000 });

    const { body } = await actor.delete(`/api/budgets/${budget.id}/income-lines/${incomeLineId}`);

    expect(body.incomeLines).toEqual([]);
    expect(body.otherIncome).toBe(4500000);
    expect(body.summary.receivedIncomeTotal).toBe(4500000);
    const transaction = await actor.get(`/api/transactions/${created.id}`);
    expect(transaction.body).toMatchObject({ incomeLineId: null, amountMinor: 4500000 });
  });
});

describe('копіювання з попереднього місяця', () => {
  it('переносить статті, але не транзакції', async () => {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const { body: september } = await createBudget(actor, '2099-09');
    await actor.post(`/api/budgets/${september.id}/expense-lines`, {
      categoryId: f.food.id,
      plannedAmount: 1200000,
    });
    await actor.post(`/api/budgets/${september.id}/expense-lines`, {
      categoryId: f.transport.id,
      plannedAmount: 300000,
    });
    const { body: withIncome } = await actor.post(`/api/budgets/${september.id}/income-lines`, {
      name: 'Зарплата',
      plannedAmount: 5000000,
    });
    await expense(actor, f, {
      categoryId: f.food.id,
      amountMinor: 999,
      occurredAt: '2099-09-10T10:00:00Z',
    });
    await income(actor, f, {
      incomeLineId: withIncome.incomeLines[0].id,
      amountMinor: 888,
      occurredAt: '2099-09-10T10:00:00Z',
    });

    const res = await createBudget(actor, '2099-10', '2099-09');

    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(september.id);
    expect(res.body.expenseLines).toEqual([
      expect.objectContaining({ categoryName: 'Продукти', planned: 1200000, spent: 0 }),
      expect.objectContaining({ categoryName: 'Транспорт', planned: 300000, spent: 0 }),
    ]);
    expect(res.body.incomeLines).toEqual([
      expect.objectContaining({ name: 'Зарплата', planned: 5000000, received: 0 }),
    ]);
    // нові статті — окремі записи, а не посилання на вересневі
    expect(res.body.incomeLines[0].id).not.toBe(withIncome.incomeLines[0].id);
    expect(res.body.summary).toMatchObject({ spentTotal: 0, receivedIncomeTotal: 0 });

    const source = await actor.get('/api/budgets?month=2099-09');
    expect(source.body.summary).toMatchObject({ spentTotal: 999, receivedIncomeTotal: 888 });
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
    const { body: withIncome } = await actor.post(`/api/budgets/${budget.id}/income-lines`, {
      name: 'Зарплата',
      plannedAmount: 5000,
    });
    const expenseLine = withLines.expenseLines[0].id;
    const incomeLine = withIncome.incomeLines[0].id;

    const closed = await actor.patch(`/api/budgets/${budget.id}`, { status: 'closed' });
    expect(closed.body.status).toBe('closed');

    const base = `/api/budgets/${budget.id}`;
    const attempts = await Promise.all([
      actor.post(`${base}/income-lines`, { name: 'Фріланс', plannedAmount: 1 }),
      actor.patch(`${base}/income-lines/${incomeLine}`, { plannedAmount: 1 }),
      actor.delete(`${base}/income-lines/${incomeLine}`),
      actor.post(`${base}/expense-lines`, { categoryId: f.transport.id, plannedAmount: 1 }),
      actor.patch(`${base}/expense-lines/${expenseLine}`, { plannedAmount: 1 }),
      actor.delete(`${base}/expense-lines/${expenseLine}`),
    ]);
    expect(attempts.map((res) => res.status)).toEqual(Array(6).fill(409));

    // транзакції заднім числом дозволені, розрахунки оновлюються
    await expense(actor, f, { categoryId: f.food.id, amountMinor: 1500 });
    await income(actor, f, { incomeLineId: incomeLine, amountMinor: 700 });
    const { body } = await actor.get(`/api/budgets?month=${FUTURE}`);
    expect(body.expenseLines[0]).toMatchObject({ planned: 1000, spent: 1500, status: 'over' });
    expect(body.incomeLines[0]).toMatchObject({ planned: 5000, received: 700 });
  });

  it('закритий бюджет можна відкрити знову', async () => {
    const actor = await createActor();
    const { body: budget } = await createBudget(actor, FUTURE);
    await actor.patch(`/api/budgets/${budget.id}`, { status: 'closed' });

    expect((await actor.patch(`/api/budgets/${budget.id}`, { status: 'draft' })).body.status).toBe(
      'draft',
    );
    const added = await actor.post(`/api/budgets/${budget.id}/income-lines`, {
      name: 'Зарплата',
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
    const { body: withLine } = await owner.post(`/api/budgets/${budget.id}/income-lines`, {
      name: 'Зарплата',
      plannedAmount: 5000,
    });
    const { body: withExpense } = await owner.post(`/api/budgets/${budget.id}/expense-lines`, {
      categoryId: ownerData.food.id,
      plannedAmount: 1000,
    });
    const incomeLine = withLine.incomeLines[0].id;
    const expenseLine = withExpense.expenseLines[0].id;
    const base = `/api/budgets/${budget.id}`;

    expect((await stranger.get(`/api/budgets?month=${FUTURE}`)).status).toBe(404);
    const attempts = await Promise.all([
      stranger.patch(base, { status: 'closed' }),
      stranger.post(`${base}/income-lines`, { name: 'x', plannedAmount: 1 }),
      stranger.patch(`${base}/income-lines/${incomeLine}`, { plannedAmount: 1 }),
      stranger.delete(`${base}/income-lines/${incomeLine}`),
      stranger.post(`${base}/expense-lines`, {
        categoryId: strangerData.food.id,
        plannedAmount: 1,
      }),
      stranger.patch(`${base}/expense-lines/${expenseLine}`, { plannedAmount: 1 }),
      stranger.delete(`${base}/expense-lines/${expenseLine}`),
    ]);
    expect(attempts.map((res) => res.status)).toEqual(Array(7).fill(404));

    const untouched = await owner.get(`/api/budgets?month=${FUTURE}`);
    expect(untouched.body).toMatchObject({ status: 'active' });
    expect(untouched.body.incomeLines[0].planned).toBe(5000);
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

  it('статті одного бюджету не можна змінити через адресу іншого', async () => {
    const actor = await createActor();
    const { body: october } = await createBudget(actor, '2099-10');
    const { body: november } = await createBudget(actor, '2099-11');
    const { body } = await actor.post(`/api/budgets/${october.id}/income-lines`, {
      name: 'Зарплата',
      plannedAmount: 1,
    });

    const res = await actor.patch(
      `/api/budgets/${november.id}/income-lines/${body.incomeLines[0].id}`,
      { plannedAmount: 2 },
    );
    expect(res.status).toBe(404);
  });
});

describe('привʼязка доходу до статті', () => {
  async function setup() {
    const actor = await createActor();
    const f = await createFixtures(actor);
    const { body: budget } = await createBudget(actor, '2026-10');
    const { body } = await actor.post(`/api/budgets/${budget.id}/income-lines`, {
      name: 'Зарплата',
      plannedAmount: 5000000,
    });
    return { actor, f, incomeLineId: body.incomeLines[0].id as string };
  }

  it('дата доходу має бути в межах місяця бюджету статті', async () => {
    const { actor, f, incomeLineId } = await setup();
    const at = (occurredAt: string) => income(actor, f, { incomeLineId, occurredAt });

    expect((await at('2026-09-30T20:59:59Z')).status).toBe(400);
    expect((await at('2026-09-30T21:00:00Z')).status).toBe(201);
    expect((await at('2026-10-31T21:59:59Z')).status).toBe(201);
    expect((await at('2026-10-31T22:00:00Z')).status).toBe(400);
  });

  it('не дає перенести привʼязаний дохід на дату поза місяцем', async () => {
    const { actor, f, incomeLineId } = await setup();
    const body = {
      type: 'income',
      accountId: f.card.id,
      incomeLineId,
      amountMinor: 100,
      occurredAt: '2026-10-10T10:00:00Z',
    };
    const { body: created } = await actor.post('/api/transactions', body);

    const moved = await actor.put(`/api/transactions/${created.id}`, {
      ...body,
      occurredAt: '2026-11-10T10:00:00Z',
    });
    expect(moved.status).toBe(400);
    expect(moved.body.error.code).toBe('BAD_REQUEST');
    expect((await actor.get(`/api/transactions/${created.id}`)).body.occurredAt).toBe(
      '2026-10-10T10:00:00.000Z',
    );

    // у межах місяця дату міняти можна; без статті — можна перенести будь-куди
    expect(
      (
        await actor.put(`/api/transactions/${created.id}`, {
          ...body,
          occurredAt: '2026-10-20T10:00:00Z',
        })
      ).status,
    ).toBe(200);
    const unlinked = await actor.put(`/api/transactions/${created.id}`, {
      ...body,
      incomeLineId: null,
      occurredAt: '2026-11-10T10:00:00Z',
    });
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.incomeLineId).toBeNull();
  });

  it('відхиляє чужу й неіснуючу статтю, статтю для витрати й переказу, іншу валюту', async () => {
    const { actor, f, incomeLineId } = await setup();
    const stranger = await createActor();
    const foreign = await createFixtures(stranger);
    const at = { occurredAt: '2026-10-10T10:00:00Z' };

    const responses = await Promise.all([
      income(stranger, foreign, { ...at, incomeLineId }),
      income(actor, f, { ...at, incomeLineId: MISSING_ID }),
      income(actor, f, { ...at, incomeLineId: 'abc' }),
      expense(actor, f, { ...at, incomeLineId }),
      actor.post('/api/transactions', {
        type: 'transfer',
        accountId: f.card.id,
        toAccountId: f.cash.id,
        amountMinor: 100,
        incomeLineId,
        ...at,
      }),
      income(actor, f, { ...at, incomeLineId, accountId: f.usd.id, currency: 'USD' }),
    ]);
    expect(responses.map((res) => res.status)).toEqual(Array(6).fill(400));

    const count = await db.execute(sql`SELECT count(*)::int AS n FROM transactions`);
    expect(count.rows).toEqual([{ n: 0 }]);
  });
});
