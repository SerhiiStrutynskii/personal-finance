import { sql } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';

const { app, db, createActor } = setupTestApp();
const MISSING_ID = '11111111-1111-4111-8111-111111111111';

async function createFixtures(actor: Actor) {
  const account = async (name: string, type: string, currency = 'UAH') =>
    (await actor.post('/api/accounts', { name, type, currency })).body;
  const category = async (name: string, kind: string) =>
    (await actor.post('/api/categories', { name, kind })).body;
  return {
    card: await account('Картка', 'card'),
    cash: await account('Готівка', 'cash'),
    usd: await account('Долари', 'cash', 'USD'),
    groceries: await category('Продукти', 'expense'),
    salary: await category('Зарплата', 'income'),
  };
}

describe('створення транзакцій', () => {
  it('зберігає витрату в копійках як ціле число', async () => {
    const actor = await createActor();
    const { card, groceries } = await createFixtures(actor);

    const res = await actor.post('/api/transactions', {
      type: 'expense',
      accountId: card.id,
      categoryId: groceries.id,
      amountMinor: 128450,
      description: '  Супермаркет ',
      occurredAt: '2026-03-01T12:30:00+02:00',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'expense',
      accountId: card.id,
      toAccountId: null,
      categoryId: groceries.id,
      amountMinor: 128450,
      currency: 'UAH',
      description: 'Супермаркет',
      occurredAt: '2026-03-01T10:30:00.000Z',
    });

    const stored = await db.execute(
      sql`SELECT amount_minor::text AS amount, pg_typeof(amount_minor)::text AS type, created_by FROM transactions`,
    );
    expect(stored.rows).toEqual([{ amount: '128450', type: 'bigint', created_by: actor.userId }]);
  });

  it('приймає великі суми без втрати точності', async () => {
    const actor = await createActor();
    const { card } = await createFixtures(actor);
    const amountMinor = Number.MAX_SAFE_INTEGER;

    const created = await actor.post('/api/transactions', {
      type: 'income',
      accountId: card.id,
      amountMinor,
      occurredAt: '2026-03-01T10:00:00Z',
    });
    expect(created.status).toBe(201);
    expect((await actor.get(`/api/transactions/${created.body.id}`)).body.amountMinor).toBe(
      amountMinor,
    );
  });

  it.each([
    ['дробова сума', { amountMinor: 100.5 }],
    ['нульова сума', { amountMinor: 0 }],
    ["від'ємна сума", { amountMinor: -100 }],
    ['сума рядком', { amountMinor: '100' }],
    ['сума поза безпечним діапазоном', { amountMinor: 2 ** 60 }],
    ['невідома валюта', { currency: 'ZZZ' }],
    ['дата без часового поясу', { occurredAt: '2026-03-01T10:00:00' }],
    ['некоректна дата', { occurredAt: 'вчора' }],
    ['невідомий тип', { type: 'refund' }],
    ['некоректний рахунок', { accountId: 'abc' }],
    ['задовгий опис', { description: 'x'.repeat(501) }],
  ])('відхиляє: %s', async (_name, override) => {
    const actor = await createActor();
    const { card } = await createFixtures(actor);

    const res = await actor.post('/api/transactions', {
      type: 'expense',
      accountId: card.id,
      amountMinor: 100,
      occurredAt: '2026-03-01T10:00:00Z',
      ...override,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect((await actor.get('/api/transactions')).body.total).toBe(0);
  });

  it('вимагає, щоб валюта збігалася з валютою рахунку', async () => {
    const actor = await createActor();
    const { card, usd } = await createFixtures(actor);
    const base = { type: 'expense', amountMinor: 100, occurredAt: '2026-03-01T10:00:00Z' };

    expect(
      (await actor.post('/api/transactions', { ...base, accountId: card.id, currency: 'USD' }))
        .status,
    ).toBe(400);
    // без явної валюти береться UAH, тому для доларового рахунку це помилка
    expect((await actor.post('/api/transactions', { ...base, accountId: usd.id })).status).toBe(
      400,
    );
    expect(
      (await actor.post('/api/transactions', { ...base, accountId: usd.id, currency: 'USD' }))
        .status,
    ).toBe(201);
  });

  it('перевіряє відповідність категорії типу транзакції', async () => {
    const actor = await createActor();
    const { card, salary } = await createFixtures(actor);
    const base = { accountId: card.id, amountMinor: 100, occurredAt: '2026-03-01T10:00:00Z' };

    expect(
      (await actor.post('/api/transactions', { ...base, type: 'expense', categoryId: salary.id }))
        .status,
    ).toBe(400);
    expect(
      (await actor.post('/api/transactions', { ...base, type: 'income', categoryId: salary.id }))
        .status,
    ).toBe(201);
    expect(
      (await actor.post('/api/transactions', { ...base, type: 'expense', categoryId: MISSING_ID }))
        .status,
    ).toBe(400);
  });
});

describe('перекази', () => {
  const base = { type: 'transfer', amountMinor: 200000, occurredAt: '2026-03-01T10:00:00Z' };

  it('створює переказ між рахунками без категорії', async () => {
    const actor = await createActor();
    const { card, cash } = await createFixtures(actor);

    const res = await actor.post('/api/transactions', {
      ...base,
      accountId: card.id,
      toAccountId: cash.id,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'transfer',
      accountId: card.id,
      toAccountId: cash.id,
      categoryId: null,
    });
  });

  it('відхиляє переказ без рахунку призначення, на той самий рахунок і між валютами', async () => {
    const actor = await createActor();
    const { card, usd } = await createFixtures(actor);

    expect((await actor.post('/api/transactions', { ...base, accountId: card.id })).status).toBe(
      400,
    );
    expect(
      (await actor.post('/api/transactions', { ...base, accountId: card.id, toAccountId: card.id }))
        .status,
    ).toBe(400);
    expect(
      (await actor.post('/api/transactions', { ...base, accountId: card.id, toAccountId: usd.id }))
        .status,
    ).toBe(400);
    expect(
      (
        await actor.post('/api/transactions', {
          ...base,
          accountId: card.id,
          toAccountId: MISSING_ID,
        })
      ).status,
    ).toBe(400);
  });

  it('переказ не потрапляє до списку витрат чи доходів і видно на обох рахунках', async () => {
    const actor = await createActor();
    const { card, cash } = await createFixtures(actor);
    await actor.post('/api/transactions', { ...base, accountId: card.id, toAccountId: cash.id });

    expect((await actor.get('/api/transactions?type=expense')).body.total).toBe(0);
    expect((await actor.get('/api/transactions?type=income')).body.total).toBe(0);
    expect((await actor.get('/api/transactions?type=transfer')).body.total).toBe(1);
    expect((await actor.get(`/api/transactions?accountId=${card.id}`)).body.total).toBe(1);
    expect((await actor.get(`/api/transactions?accountId=${cash.id}`)).body.total).toBe(1);
  });
});

describe('список транзакцій', () => {
  async function seedList(actor: Actor) {
    const fixtures = await createFixtures(actor);
    const dates = [
      '2026-02-28T21:59:59Z', // 23:59:59 28 лютого за Києвом
      '2026-02-28T22:00:00Z', // 00:00 1 березня за Києвом
      '2026-03-15T10:00:00Z',
      '2026-03-31T20:59:59Z', // 23:59:59 31 березня (літній час)
      '2026-03-31T21:00:00Z', // 00:00 1 квітня
    ];
    for (const [index, occurredAt] of dates.entries()) {
      await actor.post('/api/transactions', {
        type: 'expense',
        accountId: fixtures.card.id,
        categoryId: index === 2 ? fixtures.groceries.id : null,
        amountMinor: (index + 1) * 100,
        occurredAt,
      });
    }
    return fixtures;
  }

  it('фільтрує за періодом: початок включно, кінець виключно', async () => {
    const actor = await createActor();
    await seedList(actor);

    const res = await actor.get(
      '/api/transactions?from=2026-02-28T22:00:00Z&to=2026-03-31T21:00:00Z',
    );

    expect(res.body.total).toBe(3);
    expect(res.body.items.map((item: { amountMinor: number }) => item.amountMinor)).toEqual([
      400, 300, 200,
    ]);
  });

  it('сортує від новіших до старіших і підтримує пагінацію', async () => {
    const actor = await createActor();
    await seedList(actor);

    const page = await actor.get('/api/transactions?limit=2&offset=1');
    expect(page.body).toMatchObject({ total: 5, limit: 2, offset: 1 });
    expect(page.body.items.map((item: { amountMinor: number }) => item.amountMinor)).toEqual([
      400, 300,
    ]);

    expect((await actor.get('/api/transactions?limit=0')).status).toBe(400);
    expect((await actor.get('/api/transactions?limit=201')).status).toBe(400);
    expect((await actor.get('/api/transactions?from=2026-03-01')).status).toBe(400);
  });

  it('фільтрує за категорією', async () => {
    const actor = await createActor();
    const { groceries } = await seedList(actor);

    const res = await actor.get(`/api/transactions?categoryId=${groceries.id}`);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].amountMinor).toBe(300);
  });
});

describe('зміна й видалення', () => {
  it('замінює транзакцію, зокрема перетворює витрату на переказ', async () => {
    const actor = await createActor();
    const { card, cash, groceries } = await createFixtures(actor);
    const { body: created } = await actor.post('/api/transactions', {
      type: 'expense',
      accountId: card.id,
      categoryId: groceries.id,
      amountMinor: 100,
      occurredAt: '2026-03-01T10:00:00Z',
    });

    const res = await actor.put(`/api/transactions/${created.id}`, {
      type: 'transfer',
      accountId: card.id,
      toAccountId: cash.id,
      amountMinor: 250,
      occurredAt: '2026-03-02T10:00:00Z',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created.id,
      type: 'transfer',
      toAccountId: cash.id,
      categoryId: null,
      amountMinor: 250,
    });
    expect((await actor.put(`/api/transactions/${created.id}`, { amountMinor: 1 })).status).toBe(
      400,
    );
  });

  it('видаляє транзакцію', async () => {
    const actor = await createActor();
    const { card } = await createFixtures(actor);
    const { body: created } = await actor.post('/api/transactions', {
      type: 'expense',
      accountId: card.id,
      amountMinor: 100,
      occurredAt: '2026-03-01T10:00:00Z',
    });

    expect((await actor.delete(`/api/transactions/${created.id}`)).status).toBe(204);
    expect((await actor.get(`/api/transactions/${created.id}`)).status).toBe(404);
    expect((await actor.delete(`/api/transactions/${created.id}`)).status).toBe(404);
  });
});

describe('ізоляція домогосподарств', () => {
  it('не показує і не дає змінювати чужі транзакції', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const ownerData = await createFixtures(owner);
    const strangerData = await createFixtures(stranger);
    const { body: created } = await owner.post('/api/transactions', {
      type: 'expense',
      accountId: ownerData.card.id,
      amountMinor: 100,
      occurredAt: '2026-03-01T10:00:00Z',
    });
    const replacement = {
      type: 'expense',
      accountId: strangerData.card.id,
      amountMinor: 999,
      occurredAt: '2026-03-01T10:00:00Z',
    };

    expect((await stranger.get('/api/transactions')).body.total).toBe(0);
    expect(
      (await stranger.get(`/api/transactions?accountId=${ownerData.card.id}`)).body.total,
    ).toBe(0);
    expect((await stranger.get(`/api/transactions/${created.id}`)).status).toBe(404);
    expect((await stranger.put(`/api/transactions/${created.id}`, replacement)).status).toBe(404);
    expect((await stranger.delete(`/api/transactions/${created.id}`)).status).toBe(404);

    expect((await owner.get(`/api/transactions/${created.id}`)).body.amountMinor).toBe(100);
  });

  it('не дає використати чужий рахунок чи категорію', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const ownerData = await createFixtures(owner);
    const strangerData = await createFixtures(stranger);
    const base = { amountMinor: 100, occurredAt: '2026-03-01T10:00:00Z' };

    const responses = await Promise.all([
      stranger.post('/api/transactions', {
        ...base,
        type: 'expense',
        accountId: ownerData.card.id,
      }),
      stranger.post('/api/transactions', {
        ...base,
        type: 'expense',
        accountId: strangerData.card.id,
        categoryId: ownerData.groceries.id,
      }),
      stranger.post('/api/transactions', {
        ...base,
        type: 'transfer',
        accountId: strangerData.card.id,
        toAccountId: ownerData.cash.id,
      }),
    ]);

    expect(responses.map((res) => res.status)).toEqual([400, 400, 400]);
    expect((await owner.get('/api/transactions')).body.total).toBe(0);
    expect((await stranger.get('/api/transactions')).body.total).toBe(0);
  });
});

describe('доступ', () => {
  it('відповідає 401 без токена', async () => {
    for (const path of ['/api/transactions', '/api/accounts', '/api/categories']) {
      expect((await request(app).get(path)).status).toBe(401);
    }
  });

  it('не розкриває внутрішні деталі в помилках', async () => {
    const actor = await createActor();
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .set('Content-Type', 'application/json')
      .send('{ не json');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'BAD_REQUEST', message: 'Некоректний запит' } });
    expect((await request(app).get('/nope')).status).toBe(404);
  });
});
