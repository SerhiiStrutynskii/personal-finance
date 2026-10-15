import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';

const { app, createActor } = setupTestApp();
const MISSING_ID = '11111111-1111-4111-8111-111111111111';

async function createAccounts(actor: Actor) {
  const account = async (name: string, currency = 'UAH') =>
    (await actor.post('/api/accounts', { name, type: 'card', currency })).body;
  return {
    card: await account('Картка'),
    cash: await account('Готівка'),
    usd: await account('USD', 'USD'),
  };
}

const salary = (accountId: string, override: object = {}) => ({
  name: 'Зарплата',
  accountId,
  plannedAmount: 4500000,
  frequency: 'monthly',
  dayOfMonth: 5,
  startDate: '2026-01-01',
  ...override,
});

describe('джерела прибутку', () => {
  it('створює джерело з валютою рахунку й відкидає зайві поля правила', async () => {
    const actor = await createActor();
    const { card } = await createAccounts(actor);

    const res = await actor.post(
      '/api/income-sources',
      salary(card.id, { name: '  Зарплата ', dayOfWeek: 3, intervalMonths: 2 }),
    );

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'Зарплата',
      accountId: card.id,
      currency: 'UAH',
      plannedAmount: 4500000,
      frequency: 'monthly',
      dayOfMonth: 5,
      dayOfWeek: null,
      intervalMonths: null,
      startDate: '2026-01-01',
      endDate: null,
      isActive: true,
    });
    expect((await actor.get('/api/income-sources')).body.items).toEqual([res.body]);
  });

  it('приймає всі частоти з їхніми полями', async () => {
    const actor = await createActor();
    const { card } = await createAccounts(actor);
    const create = (override: object) =>
      actor.post('/api/income-sources', salary(card.id, override));

    const weekly = await create({ frequency: 'weekly', dayOfMonth: undefined, dayOfWeek: 5 });
    expect(weekly.body).toMatchObject({ frequency: 'weekly', dayOfWeek: 5, dayOfMonth: null });
    const biweekly = await create({ frequency: 'biweekly', dayOfMonth: null, dayOfWeek: 1 });
    expect(biweekly.status).toBe(201);
    const quarterly = await create({
      frequency: 'every_n_months',
      intervalMonths: 3,
      dayOfMonth: 31,
      endDate: '2027-12-31',
    });
    expect(quarterly.body).toMatchObject({
      frequency: 'every_n_months',
      intervalMonths: 3,
      dayOfMonth: 31,
      endDate: '2027-12-31',
    });
  });

  it.each([
    ['monthly без дня місяця', { dayOfMonth: undefined }],
    ['weekly без дня тижня', { frequency: 'weekly', dayOfMonth: undefined }],
    ['every_n_months без інтервалу', { frequency: 'every_n_months' }],
    ['день місяця 32', { dayOfMonth: 32 }],
    ['день місяця 0', { dayOfMonth: 0 }],
    ['день тижня 8', { frequency: 'weekly', dayOfWeek: 8 }],
    ['інтервал 0', { frequency: 'every_n_months', intervalMonths: 0 }],
    ['невідома частота', { frequency: 'daily' }],
    ['нульова сума', { plannedAmount: 0 }],
    ['дробова сума', { plannedAmount: 100.5 }],
    ['неіснуюча дата', { startDate: '2026-02-30' }],
    ['дата не у форматі YYYY-MM-DD', { startDate: '01.01.2026' }],
    ['кінець раніше за початок', { endDate: '2025-12-31' }],
    ['без назви', { name: ' ' }],
  ])('400: %s', async (_name, override) => {
    const actor = await createActor();
    const { card } = await createAccounts(actor);
    const res = await actor.post('/api/income-sources', salary(card.id, override));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('відхиляє чужий, неіснуючий і валютний рахунок', async () => {
    const actor = await createActor();
    const stranger = await createActor();
    const { usd } = await createAccounts(actor);
    const foreign = await createAccounts(stranger);

    for (const accountId of [foreign.card.id, MISSING_ID, usd.id]) {
      const res = await actor.post('/api/income-sources', salary(accountId));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    }
    expect((await actor.get('/api/income-sources')).body.items).toEqual([]);
  });

  it('змінює окремі поля й перевіряє правило цілим', async () => {
    const actor = await createActor();
    const { card, cash } = await createAccounts(actor);
    const { body: source } = await actor.post('/api/income-sources', salary(card.id));
    const patch = (body: object) => actor.patch(`/api/income-sources/${source.id}`, body);

    const renamed = await patch({ name: 'Оклад', plannedAmount: 5000000, accountId: cash.id });
    expect(renamed.body).toMatchObject({
      name: 'Оклад',
      plannedAmount: 5000000,
      accountId: cash.id,
      dayOfMonth: 5,
    });

    // перехід на тижневу частоту без дня тижня неможливий
    expect((await patch({ frequency: 'weekly' })).status).toBe(400);
    const weekly = await patch({ frequency: 'weekly', dayOfWeek: 2 });
    expect(weekly.body).toMatchObject({ frequency: 'weekly', dayOfWeek: 2, dayOfMonth: null });

    expect((await patch({ endDate: '2025-01-01' })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ plannedAmount: -1 })).status).toBe(400);
  });

  it('деактивує й видаляє джерело без отриманих прибутків', async () => {
    const actor = await createActor();
    const { card } = await createAccounts(actor);
    const { body: source } = await actor.post('/api/income-sources', salary(card.id));

    const deactivated = await actor.post(`/api/income-sources/${source.id}/deactivate`, {});
    expect(deactivated.body).toMatchObject({ id: source.id, isActive: false });

    expect((await actor.delete(`/api/income-sources/${source.id}`)).status).toBe(204);
    expect((await actor.delete(`/api/income-sources/${source.id}`)).status).toBe(404);
    expect((await actor.get('/api/income-sources')).body.items).toEqual([]);
  });

  it('чужі джерела — 404', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const { card } = await createAccounts(owner);
    const { body: source } = await owner.post('/api/income-sources', salary(card.id));

    expect((await stranger.get('/api/income-sources')).body.items).toEqual([]);
    const attempts = await Promise.all([
      stranger.patch(`/api/income-sources/${source.id}`, { name: 'x' }),
      stranger.post(`/api/income-sources/${source.id}/deactivate`, {}),
      stranger.delete(`/api/income-sources/${source.id}`),
    ]);
    expect(attempts.map((res) => res.status)).toEqual([404, 404, 404]);
    expect((await owner.get('/api/income-sources')).body.items[0]).toMatchObject({
      name: 'Зарплата',
      isActive: true,
    });
  });

  it('рахунок, на який посилається джерело, видалити не можна', async () => {
    const actor = await createActor();
    const { card } = await createAccounts(actor);
    await actor.post('/api/income-sources', salary(card.id));
    expect((await actor.delete(`/api/accounts/${card.id}`)).status).toBe(409);
  });

  it('401 без токена', async () => {
    expect((await request(app).get('/api/income-sources')).status).toBe(401);
  });
});
