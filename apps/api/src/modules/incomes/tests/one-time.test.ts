import { describe, expect, it } from 'vitest';
import { setupTestApp } from '../../../test/harness.ts';

const { createActor, insertTransaction } = setupTestApp();
const MISSING_ID = '11111111-1111-4111-8111-111111111111';

async function setup() {
  const actor = await createActor();
  const account = async (name: string, currency = 'UAH') =>
    (await actor.post('/api/accounts', { name, type: 'card', currency })).body;
  const category = async (name: string, kind: string) =>
    (await actor.post('/api/categories', { name, kind })).body;
  return {
    actor,
    card: await account('Картка'),
    usd: await account('USD', 'USD'),
    bonus: await category('Бонус', 'income'),
    food: await category('Продукти', 'expense'),
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const oneTime = ({ actor, card }: Setup, override: object = {}) =>
  actor.post('/api/incomes/one-time', {
    amount: 750000,
    date: '2020-03-09',
    accountId: card.id,
    name: 'Продаж велосипеда',
    ...override,
  });

describe('разові доходи', () => {
  it('створює дохід без привʼязки до надходження, одразу отриманий', async () => {
    const ctx = await setup();
    const res = await oneTime(ctx, { name: '  Продаж велосипеда ', categoryId: ctx.bonus.id });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'income',
      accountId: ctx.card.id,
      categoryId: ctx.bonus.id,
      occurrenceId: null,
      amountMinor: 750000,
      currency: 'UAH',
      description: 'Продаж велосипеда',
      // 9 березня 00:00 за Києвом
      occurredAt: '2020-03-08T22:00:00.000Z',
    });

    const view = (await ctx.actor.get('/api/incomes?month=2020-03')).body;
    expect(view.oneTime).toEqual([
      {
        transactionId: res.body.id,
        name: 'Продаж велосипеда',
        date: '2020-03-09',
        amount: 750000,
        status: 'received',
      },
    ]);
    expect(view.summary).toEqual({
      plannedTotal: 0,
      receivedTotal: 750000,
      receivedRecurring: 0,
      oneTimeTotal: 750000,
      expectedRemaining: 0,
      counts: { received: 0, partial: 0, pending: 0, overdue: 0, skipped: 0 },
    });
  });

  it('разові й періодичні доходи складаються в підсумку окремо', async () => {
    const ctx = await setup();
    await ctx.actor.post('/api/income-sources', {
      name: 'Зарплата',
      accountId: ctx.card.id,
      plannedAmount: 4500000,
      frequency: 'monthly',
      dayOfMonth: 5,
      startDate: '2020-01-01',
    });
    const [occurrence] = (await ctx.actor.get('/api/incomes?month=2020-03')).body.occurrences;
    await ctx.actor.post(`/api/income-occurrences/${occurrence.id}/receive`, {
      date: '2020-03-05',
    });
    await oneTime(ctx);
    await oneTime(ctx, { amount: 50000, date: '2020-03-20', name: 'Подарунок' });

    const view = (await ctx.actor.get('/api/incomes?month=2020-03')).body;
    expect(view.summary).toMatchObject({
      plannedTotal: 4500000,
      receivedTotal: 5300000,
      receivedRecurring: 4500000,
      oneTimeTotal: 800000,
    });
    expect(view.oneTime.map((item: { name: string }) => item.name)).toEqual([
      'Продаж велосипеда',
      'Подарунок',
    ]);
    expect(view.occurrences).toHaveLength(1);
  });

  it('транзакція 31-го о 23:30 за Києвом рахується в цьому місяці', async () => {
    const ctx = await setup();
    const post = (occurredAt: string, amountMinor: number) =>
      ctx.actor.post('/api/transactions', {
        type: 'income',
        accountId: ctx.card.id,
        amountMinor,
        description: 'Дохід',
        occurredAt,
      });
    // 31.10.2026 23:30 за Києвом = 21:30 UTC; 1.11 00:00 = 22:00 UTC
    await post('2026-10-31T23:30:00+02:00', 700);
    await post('2026-10-31T22:00:00Z', 30);

    const october = (await ctx.actor.get('/api/incomes?month=2026-10')).body;
    expect(october.summary.receivedTotal).toBe(700);
    expect(october.oneTime).toEqual([expect.objectContaining({ date: '2026-10-31', amount: 700 })]);
    const november = (await ctx.actor.get('/api/incomes?month=2026-11')).body;
    expect(november.summary.receivedTotal).toBe(30);
    expect(november.oneTime[0].date).toBe('2026-11-01');
  });

  it('у списку разових немає доходів, привʼязаних до надходжень, витрат, переказів і чужих доходів', async () => {
    const ctx = await setup();
    const stranger = await setup();
    await oneTime(stranger);
    // видаток минулого місяця через API внести не можна, тому вставляється напряму
    await insertTransaction(ctx.actor, {
      type: 'expense',
      accountId: ctx.card.id,
      amountMinor: 999,
      currency: 'UAH',
      occurredAt: new Date('2020-03-09T10:00:00Z'),
    });
    await ctx.actor.post('/api/transactions', {
      type: 'income',
      accountId: ctx.usd.id,
      currency: 'USD',
      amountMinor: 555,
      occurredAt: '2020-03-09T10:00:00Z',
    });

    const view = (await ctx.actor.get('/api/incomes?month=2020-03')).body;
    expect(view.oneTime).toEqual([]);
    expect(view.summary.receivedTotal).toBe(0);
  });

  it.each([
    ['нульова сума', { amount: 0 }],
    ['дробова сума', { amount: 10.5 }],
    ['неіснуюча дата', { date: '2020-02-30' }],
    ['без назви', { name: ' ' }],
    ['некоректний рахунок', { accountId: 'abc' }],
  ])('400 (валідація): %s', async (_name, override) => {
    const ctx = await setup();
    const res = await oneTime(ctx, override);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('відхиляє чужий рахунок, валютний рахунок і невідповідну категорію', async () => {
    const ctx = await setup();
    const stranger = await setup();

    const responses = await Promise.all([
      oneTime(ctx, { accountId: stranger.card.id }),
      oneTime(ctx, { accountId: MISSING_ID }),
      oneTime(ctx, { accountId: ctx.usd.id }),
      oneTime(ctx, { categoryId: ctx.food.id }),
      oneTime(ctx, { categoryId: stranger.bonus.id }),
    ]);
    expect(responses.map((res) => res.status)).toEqual(Array(5).fill(400));
    expect((await ctx.actor.get('/api/incomes?month=2020-03')).body.oneTime).toEqual([]);
  });

  it('разовий дохід редагується й видаляється як звичайна транзакція', async () => {
    const ctx = await setup();
    const { body: created } = await oneTime(ctx);

    await ctx.actor.put(`/api/transactions/${created.id}`, {
      type: 'income',
      accountId: ctx.card.id,
      amountMinor: 800000,
      description: 'Продаж велосипеда',
      occurredAt: created.occurredAt,
    });
    const view = async () => (await ctx.actor.get('/api/incomes?month=2020-03')).body;
    expect((await view()).summary.oneTimeTotal).toBe(800000);

    await ctx.actor.delete(`/api/transactions/${created.id}`);
    expect((await view()).oneTime).toEqual([]);
  });
});
