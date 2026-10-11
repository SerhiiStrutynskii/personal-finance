import { describe, expect, it } from 'vitest';
import { setupTestApp } from '../../../test/harness.ts';

const { createActor } = setupTestApp();

describe('categories', () => {
  it('створює, перейменовує і видаляє категорію', async () => {
    const actor = await createActor();
    const created = await actor.post('/api/categories', { name: 'Продукти', kind: 'expense' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Продукти', kind: 'expense' });

    const renamed = await actor.patch(`/api/categories/${created.body.id}`, { name: 'Їжа' });
    expect(renamed.body.name).toBe('Їжа');

    expect((await actor.delete(`/api/categories/${created.body.id}`)).status).toBe(204);
    expect((await actor.get('/api/categories')).body.items).toEqual([]);
  });

  it('відхиляє некоректні дані', async () => {
    const actor = await createActor();
    expect((await actor.post('/api/categories', { name: 'Їжа', kind: 'transfer' })).status).toBe(
      400,
    );
    expect((await actor.post('/api/categories', { name: ' ', kind: 'expense' })).status).toBe(400);
  });

  it('не допускає дублікатів у межах домогосподарства й типу', async () => {
    const actor = await createActor();
    const other = await createActor();
    await actor.post('/api/categories', { name: 'Подарунки', kind: 'expense' });

    expect(
      (await actor.post('/api/categories', { name: 'Подарунки', kind: 'expense' })).status,
    ).toBe(409);
    // та сама назва дозволена для іншого типу та в іншому домогосподарстві
    expect(
      (await actor.post('/api/categories', { name: 'Подарунки', kind: 'income' })).status,
    ).toBe(201);
    expect(
      (await other.post('/api/categories', { name: 'Подарунки', kind: 'expense' })).status,
    ).toBe(201);

    const { body: second } = await actor.post('/api/categories', { name: 'Інше', kind: 'expense' });
    expect((await actor.patch(`/api/categories/${second.id}`, { name: 'Подарунки' })).status).toBe(
      409,
    );
  });

  it('ізолює категорії між домогосподарствами', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const { body: category } = await owner.post('/api/categories', {
      name: 'Продукти',
      kind: 'expense',
    });

    expect((await stranger.get('/api/categories')).body.items).toEqual([]);
    expect((await stranger.get(`/api/categories/${category.id}`)).status).toBe(404);
    expect((await stranger.patch(`/api/categories/${category.id}`, { name: 'x' })).status).toBe(
      404,
    );
    expect((await stranger.delete(`/api/categories/${category.id}`)).status).toBe(404);
  });

  it('не видаляє категорію, яка використовується', async () => {
    const actor = await createActor();
    const { body: account } = await actor.post('/api/accounts', { name: 'Картка', type: 'card' });
    const { body: category } = await actor.post('/api/categories', {
      name: 'Продукти',
      kind: 'expense',
    });
    await actor.post('/api/transactions', {
      type: 'expense',
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100,
      occurredAt: '2026-03-01T10:00:00Z',
    });

    expect((await actor.delete(`/api/categories/${category.id}`)).status).toBe(409);
  });
});
