import { describe, expect, it } from 'vitest';
import { setupTestApp } from '../../../test/harness.ts';

const { createActor } = setupTestApp();

describe('products', () => {
  it('створює, змінює і видаляє продукт', async () => {
    const actor = await createActor();
    const created = await actor.post('/api/products', { name: 'Молоко', unit: 'l', price: 4250 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Молоко', unit: 'l', price: 4250, currency: 'UAH' });

    const updated = await actor.patch(`/api/products/${created.body.id}`, { price: 4590 });
    expect(updated.body).toMatchObject({ name: 'Молоко', unit: 'l', price: 4590 });

    expect((await actor.delete(`/api/products/${created.body.id}`)).status).toBe(204);
    expect((await actor.get('/api/products')).body.items).toEqual([]);
  });

  it('за замовчуванням рахує в штуках і без ціни; ціну можна стерти', async () => {
    const actor = await createActor();
    const { body: bread } = await actor.post('/api/products', { name: 'Хліб' });
    expect(bread).toMatchObject({ unit: 'pcs', price: null });

    await actor.patch(`/api/products/${bread.id}`, { price: 3200 });
    const cleared = await actor.patch(`/api/products/${bread.id}`, { price: null });
    expect(cleared.body.price).toBeNull();
  });

  it('сортує за назвою без урахування регістру', async () => {
    const actor = await createActor();
    for (const name of ['хліб', 'Яблука', 'Банани']) await actor.post('/api/products', { name });
    const names = (await actor.get('/api/products')).body.items.map(
      (product: { name: string }) => product.name,
    );
    expect(names).toEqual(['Банани', 'хліб', 'Яблука']);
  });

  it('відхиляє некоректні дані', async () => {
    const actor = await createActor();
    const invalid = [
      { name: ' ' },
      { name: 'Сир', unit: 'g' },
      { name: 'Сир', price: 0 },
      { name: 'Сир', price: -100 },
      { name: 'Сир', price: 10.5 },
    ];
    for (const body of invalid) expect((await actor.post('/api/products', body)).status).toBe(400);

    const { body: cheese } = await actor.post('/api/products', { name: 'Сир' });
    expect((await actor.patch(`/api/products/${cheese.id}`, {})).status).toBe(400);
  });

  it('не допускає дублікатів назви без урахування регістру, але лише в межах домогосподарства', async () => {
    const actor = await createActor();
    const other = await createActor();
    await actor.post('/api/products', { name: 'Молоко' });

    expect((await actor.post('/api/products', { name: 'молоко' })).status).toBe(409);
    expect((await other.post('/api/products', { name: 'Молоко' })).status).toBe(201);

    const { body: kefir } = await actor.post('/api/products', { name: 'Кефір' });
    expect((await actor.patch(`/api/products/${kefir.id}`, { name: 'МОЛОКО' })).status).toBe(409);
  });

  it('ізолює продукти між домогосподарствами', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const { body: product } = await owner.post('/api/products', { name: 'Сир' });

    expect((await stranger.get('/api/products')).body.items).toEqual([]);
    expect((await stranger.get(`/api/products/${product.id}`)).status).toBe(404);
    expect((await stranger.patch(`/api/products/${product.id}`, { price: 1 })).status).toBe(404);
    expect((await stranger.delete(`/api/products/${product.id}`)).status).toBe(404);
    expect((await owner.get(`/api/products/${product.id}`)).body.price).toBeNull();
  });
});
