import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { setupTestApp } from '../../../test/harness.ts';

const { db, createActor, setNow, insertTransaction } = setupTestApp();
const MISSING_ID = '11111111-1111-4111-8111-111111111111';

describe('accounts', () => {
  it('створює рахунок із валютою UAH за замовчуванням', async () => {
    const actor = await createActor();
    const res = await actor.post('/api/accounts', { name: '  Картка  ', type: 'card' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Картка', type: 'card', currency: 'UAH' });
    expect(res.body).not.toHaveProperty('householdId');

    const list = await actor.get('/api/accounts');
    expect(list.body.items).toHaveLength(1);
  });

  it.each([
    [{ type: 'card' }],
    [{ name: '', type: 'card' }],
    [{ name: 'Картка', type: 'crypto' }],
    [{ name: 'Картка', type: 'card', currency: 'ZZZ' }],
    [{ name: 'Картка', type: 'card', currency: 'uah' }],
  ])('відхиляє некоректні дані %j', async (body) => {
    const actor = await createActor();
    const res = await actor.post('/api/accounts', body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('оновлює назву й тип, але не валюту', async () => {
    const actor = await createActor();
    const { body: account } = await actor.post('/api/accounts', { name: 'Картка', type: 'card' });

    const renamed = await actor.patch(`/api/accounts/${account.id}`, { name: 'Основна' });
    expect(renamed.body).toMatchObject({ name: 'Основна', type: 'card' });

    const ignored = await actor.patch(`/api/accounts/${account.id}`, {
      type: 'cash',
      currency: 'USD',
    });
    expect(ignored.body).toMatchObject({ type: 'cash', currency: 'UAH' });

    expect((await actor.patch(`/api/accounts/${account.id}`, {})).status).toBe(400);
  });

  it('не показує і не дає змінювати рахунки іншого домогосподарства', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const { body: account } = await owner.post('/api/accounts', { name: 'Картка', type: 'card' });

    expect((await stranger.get('/api/accounts')).body.items).toEqual([]);
    expect((await stranger.get(`/api/accounts/${account.id}`)).status).toBe(404);
    expect((await stranger.patch(`/api/accounts/${account.id}`, { name: 'x' })).status).toBe(404);
    expect((await stranger.delete(`/api/accounts/${account.id}`)).status).toBe(404);

    expect((await owner.get(`/api/accounts/${account.id}`)).body.name).toBe('Картка');
  });

  it('початковий залишок задає баланс і записується службовою транзакцією', async () => {
    setNow('2026-03-15T12:00:00Z');
    const actor = await createActor();
    const res = await actor.post('/api/accounts', {
      name: 'Депозит',
      type: 'deposit',
      currency: 'USD',
      openingBalance: 150_000,
    });
    expect(res.status).toBe(201);
    expect(res.body.balance).toBe(150_000);
    expect((await actor.get(`/api/accounts/${res.body.id}`)).body.balance).toBe(150_000);

    const { body: page } = await actor.get('/api/transactions');
    expect(page.items).toEqual([
      expect.objectContaining({
        type: 'balance_adjustment',
        accountId: res.body.id,
        amountMinor: 150_000,
        currency: 'USD',
        description: 'Початковий залишок',
        occurredAt: '2026-03-15T12:00:00.000Z',
      }),
    ]);
  });

  it('без початкового залишку чи з нулем транзакція не створюється', async () => {
    const actor = await createActor();
    const zero = await actor.post('/api/accounts', { name: 'A', type: 'cash', openingBalance: 0 });
    const none = await actor.post('/api/accounts', { name: 'B', type: 'cash' });
    expect(zero.body.balance).toBe(0);
    expect(none.body.balance).toBe(0);
    expect((await actor.get('/api/transactions')).body.total).toBe(0);
  });

  it.each([[-1], [1.5], ['100']])('відхиляє початковий залишок %j', async (openingBalance) => {
    const actor = await createActor();
    const res = await actor.post('/api/accounts', { name: 'A', type: 'cash', openingBalance });
    expect(res.status).toBe(400);
    expect((await actor.get('/api/accounts')).body.items).toEqual([]);
  });

  it('початковий залишок не є ні прибутком, ні витратою бюджету', async () => {
    setNow('2026-03-15T12:00:00Z');
    const actor = await createActor();
    await actor.post('/api/accounts', { name: 'Картка', type: 'card', openingBalance: 500_000 });
    expect((await actor.post('/api/budgets', { month: '2026-03' })).status).toBe(201);

    const { body: budget } = await actor.get('/api/budgets?month=2026-03');
    expect(budget.summary).toMatchObject({ spentTotal: 0, receivedIncomeTotal: 0 });
    expect(budget.unplannedExpenses).toEqual([]);
  });

  it('рахунок лише з початковим залишком видаляється разом із ним, з іншими транзакціями — ні', async () => {
    setNow('2026-03-15T12:00:00Z');
    const actor = await createActor();
    const account = async (name: string) =>
      (await actor.post('/api/accounts', { name, type: 'card', openingBalance: 1000 })).body;
    const fresh = await account('Новий');
    const used = await account('Використаний');
    const target = await account('Призначення');
    await actor.post('/api/transactions', {
      type: 'transfer',
      accountId: used.id,
      toAccountId: target.id,
      amountMinor: 100,
      occurredAt: '2026-03-15T12:00:00Z',
    });

    expect((await actor.delete(`/api/accounts/${fresh.id}`)).status).toBe(204);
    // Вхідний переказ теж тримає рахунок.
    expect((await actor.delete(`/api/accounts/${target.id}`)).status).toBe(409);
    expect((await actor.delete(`/api/accounts/${used.id}`)).status).toBe(409);
    expect((await actor.get(`/api/accounts/${used.id}`)).body.balance).toBe(900);
    expect((await actor.get(`/api/accounts/${target.id}`)).body.balance).toBe(1100);
    // Лишилися два початкові залишки й переказ.
    expect((await actor.get('/api/transactions')).body.total).toBe(3);
  });

  it('видаляє порожній рахунок, а рахунок із транзакціями — ні', async () => {
    setNow('2026-03-15T12:00:00Z');
    const actor = await createActor();
    const { body: empty } = await actor.post('/api/accounts', { name: 'Порожній', type: 'cash' });
    const { body: used } = await actor.post('/api/accounts', { name: 'Картка', type: 'card' });
    await actor.post('/api/transactions', {
      type: 'expense',
      accountId: used.id,
      amountMinor: 100,
      occurredAt: '2026-03-01T10:00:00Z',
    });

    expect((await actor.delete(`/api/accounts/${empty.id}`)).status).toBe(204);
    expect((await actor.delete(`/api/accounts/${used.id}`)).status).toBe(409);
    expect((await actor.delete(`/api/accounts/${MISSING_ID}`)).status).toBe(404);
    expect((await actor.delete('/api/accounts/not-a-uuid')).status).toBe(400);
  });

  it('новий рахунок має нульовий баланс, без ліміту й не в архіві', async () => {
    const actor = await createActor();
    const { body } = await actor.post('/api/accounts', { name: 'Картка', type: 'card' });
    expect(body).toMatchObject({ balance: 0, creditLimit: null, isArchived: false });
  });

  it('рахунок кредитної картки напряму не створюється й тип на нього не змінюється', async () => {
    const actor = await createActor();
    const created = await actor.post('/api/accounts', { name: 'Кредитка', type: 'credit_card' });
    expect(created.status).toBe(400);

    const { body: account } = await actor.post('/api/accounts', { name: 'Картка', type: 'card' });
    const changed = await actor.patch(`/api/accounts/${account.id}`, { type: 'credit_card' });
    expect(changed.status).toBe(400);
  });
});

describe('баланс рахунку', () => {
  const NOW = '2026-03-31T10:00:00Z';
  const at = '2026-03-10T10:00:00Z';

  async function setup() {
    setNow(NOW);
    const actor = await createActor();
    const { body: card } = await actor.post('/api/accounts', { name: 'Картка', type: 'card' });
    const { body: cash } = await actor.post('/api/accounts', { name: 'Готівка', type: 'cash' });
    const balances = async () => {
      const { body } = await actor.get('/api/accounts');
      return Object.fromEntries(
        body.items.map((item: { name: string; balance: number }) => [item.name, item.balance]),
      );
    };
    return { actor, card, cash, balances };
  }

  it('прибутки додаються, витрати віднімаються, переказ переносить суму між рахунками', async () => {
    const { actor, card, cash, balances } = await setup();
    const post = (body: object) =>
      actor.post('/api/transactions', { accountId: card.id, occurredAt: at, ...body });

    await post({ type: 'income', amountMinor: 100_000 });
    await post({ type: 'expense', amountMinor: 30_000 });
    await post({ type: 'transfer', amountMinor: 25_000, toAccountId: cash.id });
    await actor.post('/api/transactions', {
      type: 'expense',
      accountId: cash.id,
      amountMinor: 5_000,
      occurredAt: at,
    });

    expect(await balances()).toEqual({ Картка: 45_000, Готівка: 20_000 });
    expect((await actor.get(`/api/accounts/${card.id}`)).body.balance).toBe(45_000);
  });

  it('баланс може бути від’ємним', async () => {
    const { actor, card, balances } = await setup();
    await actor.post('/api/transactions', {
      type: 'expense',
      accountId: card.id,
      amountMinor: 7_000,
      occurredAt: at,
    });
    expect((await balances()).Картка).toBe(-7_000);
  });

  it('службова зміна балансу додається зі своїм знаком', async () => {
    const { actor, card, balances } = await setup();
    const adjust = (amountMinor: number) =>
      insertTransaction(actor, {
        type: 'balance_adjustment',
        accountId: card.id,
        amountMinor,
        currency: 'UAH',
        occurredAt: new Date(at),
      });

    await adjust(50_000);
    await adjust(-8_000);
    expect((await balances()).Картка).toBe(42_000);
  });

  it('баланс рахується лише з транзакцій свого домогосподарства', async () => {
    const { actor, card, balances } = await setup();
    const stranger = await createActor();
    const { body: other } = await stranger.post('/api/accounts', { name: 'Чужа', type: 'card' });
    await stranger.post('/api/transactions', {
      type: 'income',
      accountId: other.id,
      amountMinor: 999,
      occurredAt: at,
    });
    await actor.post('/api/transactions', {
      type: 'income',
      accountId: card.id,
      amountMinor: 100,
      occurredAt: at,
    });
    expect(await balances()).toEqual({ Картка: 100, Готівка: 0 });
  });

  it('архівний рахунок не приймає нових транзакцій', async () => {
    const { actor, card, cash } = await setup();
    await db.execute(sql`UPDATE accounts SET is_archived = true WHERE id = ${card.id}`);

    const expense = await actor.post('/api/transactions', {
      type: 'expense',
      accountId: card.id,
      amountMinor: 100,
      occurredAt: at,
    });
    expect(expense.status).toBe(400);

    const transfer = await actor.post('/api/transactions', {
      type: 'transfer',
      accountId: cash.id,
      toAccountId: card.id,
      amountMinor: 100,
      occurredAt: at,
    });
    expect(transfer.status).toBe(400);
    expect((await actor.get(`/api/accounts/${card.id}`)).body.isArchived).toBe(true);
  });

  it('службові транзакції не створюються, не змінюються й не видаляються через /api/transactions', async () => {
    const { actor, card } = await setup();
    for (const type of ['debt_payment', 'balance_adjustment']) {
      const res = await actor.post('/api/transactions', {
        type,
        accountId: card.id,
        amountMinor: 100,
        occurredAt: at,
      });
      expect(res.status).toBe(400);
    }

    const adjustment = await insertTransaction(actor, {
      type: 'balance_adjustment',
      accountId: card.id,
      amountMinor: -500,
      currency: 'UAH',
      occurredAt: new Date(at),
    });
    const replaced = await actor.put(`/api/transactions/${adjustment.id}`, {
      type: 'expense',
      accountId: card.id,
      amountMinor: 500,
      occurredAt: at,
    });
    expect(replaced.status).toBe(400);
    expect((await actor.delete(`/api/transactions/${adjustment.id}`)).status).toBe(400);
    expect((await actor.get(`/api/transactions/${adjustment.id}`)).body.amountMinor).toBe(-500);
  });
});

describe('коригування балансу', () => {
  const NOW = '2026-03-15T12:00:00Z';

  async function setup() {
    setNow('2026-03-01T08:00:00Z');
    const actor = await createActor();
    const { body: card } = await actor.post('/api/accounts', {
      name: 'Картка',
      type: 'card',
      openingBalance: 100_000,
    });
    setNow(NOW);
    const adjust = (body: object, id: string = card.id) =>
      actor.post(`/api/accounts/${id}/balance`, body);
    return { actor, card, adjust };
  }

  it('записує різницю службовою транзакцією поточним моментом', async () => {
    const { actor, card, adjust } = await setup();

    const down = await adjust({ actualBalance: 75_050 });
    expect(down.status).toBe(200);
    expect(down.body).toMatchObject({ id: card.id, balance: 75_050 });

    setNow('2026-03-16T09:00:00Z');
    const up = await adjust({ actualBalance: 90_000, note: '  Знайшов готівку  ' });
    expect(up.body.balance).toBe(90_000);
    expect((await actor.get(`/api/accounts/${card.id}`)).body.balance).toBe(90_000);

    const { body: page } = await actor.get('/api/transactions');
    expect(page.items).toEqual([
      expect.objectContaining({
        type: 'balance_adjustment',
        amountMinor: 14_950,
        description: 'Знайшов готівку',
        occurredAt: '2026-03-16T09:00:00.000Z',
      }),
      expect.objectContaining({
        type: 'balance_adjustment',
        amountMinor: -24_950,
        description: 'Коригування балансу',
        occurredAt: '2026-03-15T12:00:00.000Z',
      }),
      expect.objectContaining({ description: 'Початковий залишок' }),
    ]);
  });

  it("баланс може стати від'ємним; без різниці нічого не записується", async () => {
    const { actor, adjust } = await setup();
    expect((await adjust({ actualBalance: 100_000 })).body.balance).toBe(100_000);
    expect((await actor.get('/api/transactions')).body.total).toBe(1);

    setNow('2026-03-15T13:00:00Z');
    expect((await adjust({ actualBalance: -5_000 })).body.balance).toBe(-5_000);
    expect((await actor.get('/api/transactions')).body.items[0].amountMinor).toBe(-105_000);
  });

  it('коригування не є ні прибутком, ні витратою бюджету', async () => {
    const { actor, adjust } = await setup();
    await adjust({ actualBalance: 10_000 });
    await adjust({ actualBalance: 500_000 });
    expect((await actor.post('/api/budgets', { month: '2026-03' })).status).toBe(201);

    const { body: budget } = await actor.get('/api/budgets?month=2026-03');
    expect(budget.summary).toMatchObject({ spentTotal: 0, receivedIncomeTotal: 0 });
    expect(budget.unplannedExpenses).toEqual([]);
  });

  it.each([
    [{}],
    [{ actualBalance: 1.5 }],
    [{ actualBalance: '100' }],
    [{ actualBalance: 1, note: 'x'.repeat(501) }],
  ])('відхиляє некоректні дані %j', async (body) => {
    const { actor, adjust } = await setup();
    expect((await adjust(body)).status).toBe(400);
    expect((await actor.get('/api/transactions')).body.total).toBe(1);
  });

  it('архівний рахунок, кредитна картка й чужий рахунок не коригуються', async () => {
    const { actor, card, adjust } = await setup();
    await db.execute(sql`UPDATE accounts SET is_archived = true WHERE id = ${card.id}`);
    expect((await adjust({ actualBalance: 0 })).status).toBe(400);

    const { body: debt } = await actor.post('/api/debts', {
      name: 'Кредитка',
      type: 'credit_card',
      initialAmount: 0,
      startDate: '2026-03-01',
      interestRate: 3.1,
      ratePeriod: 'month',
      monthlyPayment: 120_000,
      paymentDay: 25,
      creditLimit: 5_000_000,
    });
    const credit = await adjust({ actualBalance: 1_000 }, debt.accountId);
    expect(credit.status).toBe(400);
    expect(credit.body.error.message).toContain('сторінці її боргу');

    const stranger = await createActor();
    const { body: own } = await stranger.post('/api/accounts', { name: 'Чужий', type: 'cash' });
    expect((await adjust({ actualBalance: 1_000 }, own.id)).status).toBe(404);
    expect((await adjust({ actualBalance: 1_000 }, MISSING_ID)).status).toBe(404);
    expect((await stranger.get(`/api/accounts/${own.id}`)).body.balance).toBe(0);
    expect((await actor.get('/api/transactions')).body.total).toBe(1);
  });

  it('рахунок лише з початковим залишком і коригуваннями видаляється разом із ними', async () => {
    const { actor, card, adjust } = await setup();
    await adjust({ actualBalance: 50_000 });
    await adjust({ actualBalance: -1_000 });

    expect((await actor.delete(`/api/accounts/${card.id}`)).status).toBe(204);
    expect((await actor.get('/api/transactions')).body.total).toBe(0);
  });
});
