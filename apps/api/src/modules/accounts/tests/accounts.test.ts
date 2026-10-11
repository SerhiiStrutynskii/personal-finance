import { describe, expect, it } from 'vitest';
import { setupTestApp } from '../../../test/harness.ts';

const { createActor, setNow } = setupTestApp();
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
});
