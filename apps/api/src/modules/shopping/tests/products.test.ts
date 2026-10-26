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

  it('AC17: продукт лише в календарі меню не видаляється: 409, архівування лишає запис', async () => {
    const actor = await createActor();
    const [mealType] = (await actor.get('/api/meal-types')).body.items as { id: string }[];
    const mealTypeId =
      mealType?.id ?? ((await actor.post('/api/meal-types', { name: 'Обід' })).body.id as string);
    const { body: milk } = await actor.post('/api/products', {
      name: 'Молоко',
      unit: 'l',
      price: 4200,
    });
    const january = '/api/menu?from=2026-01-01&to=2026-02-01';
    const entry = await actor.post('/api/menu/entries', {
      date: '2026-01-10',
      mealTypeId,
      productId: milk.id,
      quantityMilli: 500,
    });
    expect(entry.status).toBe(201);

    const deleted = await actor.delete(`/api/products/${milk.id}`);
    expect(deleted.status).toBe(409);
    expect(deleted.body.error.message).toBe(
      'Продукт використовується в списках покупок, стравах або меню. Заархівуйте його, щоб приховати з довідника',
    );
    expect((await actor.get(january)).body.entries).toMatchObject([
      { id: entry.body.id, productId: milk.id, quantityMilli: 500, cost: 2100 },
    ]);

    expect((await actor.patch(`/api/products/${milk.id}`, { isArchived: true })).status).toBe(200);
    const { body } = await actor.get(january);
    expect(body.entries).toMatchObject([{ id: entry.body.id, isArchived: true, cost: 2100 }]);
    expect(body.total.cost).toBe(2100);
  });

  it('продукт зі складу страви не видаляється: 409 з поясненням, лише архівування', async () => {
    const actor = await createActor();
    const { body: rice } = await actor.post('/api/products', { name: 'Рис', unit: 'kg' });
    const { body: dish } = await actor.post('/api/dishes', {
      name: 'Рис варений',
      ingredients: [{ productId: rice.id, quantityMilli: 100 }],
    });

    const deleted = await actor.delete(`/api/products/${rice.id}`);
    expect(deleted.status).toBe(409);
    expect(deleted.body.error.message).toBe(
      'Продукт використовується в списках покупок, стравах або меню. Заархівуйте його, щоб приховати з довідника',
    );

    expect((await actor.patch(`/api/products/${rice.id}`, { isArchived: true })).status).toBe(200);
    const { body } = await actor.get(`/api/dishes/${dish.id}`);
    expect(body.ingredients).toEqual([
      expect.objectContaining({ productId: rice.id, isArchived: true }),
    ]);
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
