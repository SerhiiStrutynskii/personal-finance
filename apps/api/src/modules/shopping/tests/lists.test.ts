import { describe, expect, it } from 'vitest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';

const { createActor, setNow } = setupTestApp();

async function createList(actor: Actor, name = 'На тиждень') {
  const { body } = await actor.post('/api/shopping-lists', { name });
  return body as { id: string };
}

async function addProduct(actor: Actor, body: object) {
  return (await actor.post('/api/products', body)).body as { id: string };
}

type ItemBody = Record<string, unknown> & { id: string; name: string };
const itemOf = (list: { items: ItemBody[] }, name: string) =>
  list.items.find((item) => item.name === name)!;

describe('shopping lists', () => {
  it('додає продукт з очікуваною ціною з довідника й рахує підсумки', async () => {
    const actor = await createActor();
    const milk = await addProduct(actor, { name: 'Молоко', unit: 'l', price: 4250 });
    const list = await createList(actor);

    const added = await actor.post(`/api/shopping-lists/${list.id}/items`, {
      productId: milk.id,
      quantityMilli: 2000,
    });
    expect(added.status).toBe(201);
    expect(added.body.items).toEqual([
      expect.objectContaining({
        productId: milk.id,
        name: 'Молоко',
        unit: 'l',
        quantityMilli: 2000,
        expectedUnitPrice: 4250,
        expectedTotal: 8500,
        actualUnitPrice: null,
        actualTotal: null,
        isBought: false,
        boughtAt: null,
      }),
    ]);
    expect(added.body.totals).toMatchObject({ itemCount: 1, expected: 8500, remaining: 8500 });

    const summaries = (await actor.get('/api/shopping-lists')).body.items;
    expect(summaries).toEqual([
      expect.objectContaining({ id: list.id, name: 'На тиждень', currency: 'UAH' }),
    ]);
    expect(summaries[0].totals).toMatchObject({ itemCount: 1, expected: 8500 });
  });

  it('створює продукт за новою назвою, а наявну назву бере з довідника', async () => {
    const actor = await createActor();
    await addProduct(actor, { name: 'Хліб', price: 3200 });
    const list = await createList(actor);

    await actor.post(`/api/shopping-lists/${list.id}/items`, { name: 'хліб' });
    const { body } = await actor.post(`/api/shopping-lists/${list.id}/items`, {
      name: 'Сир',
      unit: 'kg',
      price: 32000,
      quantityMilli: 300,
    });

    expect(body.items.map((item: { name: string }) => item.name)).toEqual(['Хліб', 'Сир']);
    expect(itemOf(body, 'Хліб')).toMatchObject({ expectedUnitPrice: 3200 });
    expect(itemOf(body, 'Сир')).toMatchObject({ unit: 'kg', expectedTotal: 9600 });
    const names = (await actor.get('/api/products')).body.items.map(
      (product: { name: string }) => product.name,
    );
    expect(names).toEqual(['Сир', 'Хліб']);
  });

  it('повторне додавання збільшує кількість і знімає позначку «куплено»', async () => {
    const actor = await createActor();
    const eggs = await addProduct(actor, { name: 'Яйця', price: 600 });
    const list = await createList(actor);
    const { body: first } = await actor.post(`/api/shopping-lists/${list.id}/items`, {
      productId: eggs.id,
      quantityMilli: 10_000,
    });
    await actor.patch(`/api/shopping-lists/${list.id}/items/${first.items[0].id}`, {
      isBought: true,
    });

    const { body } = await actor.post(`/api/shopping-lists/${list.id}/items`, {
      productId: eggs.id,
      quantityMilli: 5000,
    });
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ quantityMilli: 15_000, isBought: false, boughtAt: null });
  });

  it('позначка «куплено» бере очікувану ціну й оновлює довідник фактичною', async () => {
    const actor = await createActor();
    setNow('2026-10-20T10:00:00Z');
    const milk = await addProduct(actor, { name: 'Молоко', unit: 'l', price: 4250 });
    const bread = await addProduct(actor, { name: 'Хліб', price: 3200 });
    const list = await createList(actor);
    await actor.post(`/api/shopping-lists/${list.id}/items`, {
      productId: milk.id,
      quantityMilli: 2000,
    });
    const { body: withItems } = await actor.post(`/api/shopping-lists/${list.id}/items`, {
      productId: bread.id,
    });

    // Без фактичної ціни підставляється очікувана.
    const { body: boughtMilk } = await actor.patch(
      `/api/shopping-lists/${list.id}/items/${itemOf(withItems, 'Молоко').id}`,
      { isBought: true },
    );
    expect(itemOf(boughtMilk, 'Молоко')).toMatchObject({
      isBought: true,
      actualUnitPrice: 4250,
      boughtAt: '2026-10-20T10:00:00.000Z',
    });

    // Хліб подорожчав: довідник запам'ятовує нову ціну.
    const { body } = await actor.patch(
      `/api/shopping-lists/${list.id}/items/${itemOf(withItems, 'Хліб').id}`,
      { isBought: true, actualUnitPrice: 3500 },
    );
    expect(body.totals).toEqual({
      itemCount: 2,
      boughtCount: 2,
      expected: 8500 + 3200,
      actual: 8500 + 3500,
      remaining: 0,
      deviation: 300,
      unpricedCount: 0,
    });
    // Куплене опускається вниз у порядку додавання.
    expect(body.items.map((item: { name: string }) => item.name)).toEqual(['Молоко', 'Хліб']);
    expect((await actor.get(`/api/products/${bread.id}`)).body.price).toBe(3500);

    // Новий список уже очікує нову ціну.
    const next = await createList(actor, 'Наступний');
    const { body: nextList } = await actor.post(`/api/shopping-lists/${next.id}/items`, {
      productId: bread.id,
    });
    expect(nextList.items[0].expectedUnitPrice).toBe(3500);
  });

  it('зняття позначки скидає момент покупки, але не повертає ціну довідника', async () => {
    const actor = await createActor();
    const bread = await addProduct(actor, { name: 'Хліб', price: 3200 });
    const list = await createList(actor);
    const { body: added } = await actor.post(`/api/shopping-lists/${list.id}/items`, {
      productId: bread.id,
    });
    const itemPath = `/api/shopping-lists/${list.id}/items/${added.items[0].id}`;
    await actor.patch(itemPath, { isBought: true, actualUnitPrice: 3500 });

    const { body } = await actor.patch(itemPath, { isBought: false });
    expect(body.items[0]).toMatchObject({ isBought: false, boughtAt: null, actualUnitPrice: 3500 });
    expect(body.totals).toMatchObject({ boughtCount: 0, actual: 0, remaining: 3200 });
    expect((await actor.get(`/api/products/${bread.id}`)).body.price).toBe(3500);
  });

  it('правка довідника не змінює очікувану ціну вже доданих рядків', async () => {
    const actor = await createActor();
    const bread = await addProduct(actor, { name: 'Хліб', price: 3200 });
    const list = await createList(actor);
    await actor.post(`/api/shopping-lists/${list.id}/items`, { productId: bread.id });

    await actor.patch(`/api/products/${bread.id}`, { price: 9900 });
    const { body } = await actor.get(`/api/shopping-lists/${list.id}`);
    expect(body.items[0].expectedUnitPrice).toBe(3200);
  });

  it('змінює кількість і очікувану ціну рядка, видаляє рядок', async () => {
    const actor = await createActor();
    const list = await createList(actor);
    const { body: added } = await actor.post(`/api/shopping-lists/${list.id}/items`, {
      name: 'Яблука',
      unit: 'kg',
    });
    const itemPath = `/api/shopping-lists/${list.id}/items/${added.items[0].id}`;
    expect(added.totals).toMatchObject({ expected: 0, unpricedCount: 1 });

    const { body } = await actor.patch(itemPath, { quantityMilli: 1500, expectedUnitPrice: 4590 });
    expect(body.items[0]).toMatchObject({ quantityMilli: 1500, expectedTotal: 6885 });

    const removed = await actor.delete(itemPath);
    expect(removed.status).toBe(200);
    expect(removed.body.items).toEqual([]);
    expect((await actor.delete(itemPath)).status).toBe(404);
  });

  it('перейменовує й видаляє список', async () => {
    const actor = await createActor();
    const list = await createList(actor);
    await actor.post(`/api/shopping-lists/${list.id}/items`, { name: 'Хліб' });

    const renamed = await actor.patch(`/api/shopping-lists/${list.id}`, { name: 'Субота' });
    expect(renamed.body).toMatchObject({ name: 'Субота', items: [expect.anything()] });

    expect((await actor.delete(`/api/shopping-lists/${list.id}`)).status).toBe(204);
    expect((await actor.get(`/api/shopping-lists/${list.id}`)).status).toBe(404);
    expect((await actor.get('/api/shopping-lists')).body.items).toEqual([]);
  });

  it('відхиляє некоректні дані', async () => {
    const actor = await createActor();
    const list = await createList(actor);
    const items = `/api/shopping-lists/${list.id}/items`;

    expect((await actor.post('/api/shopping-lists', { name: ' ' })).status).toBe(400);
    for (const body of [
      {},
      { name: 'Хліб', quantityMilli: 0 },
      { name: 'Хліб', quantityMilli: 1.5 },
      { name: 'Хліб', quantityMilli: 1_000_000_001 },
      { productId: 'not-a-uuid' },
      { productId: crypto.randomUUID(), name: 'Хліб' },
    ]) {
      expect((await actor.post(items, body)).status).toBe(400);
    }
    expect((await actor.post(items, { productId: crypto.randomUUID() })).status).toBe(404);

    const { body } = await actor.post(items, { name: 'Хліб' });
    const itemPath = `${items}/${body.items[0].id}`;
    for (const patch of [{}, { actualUnitPrice: 0 }, { quantityMilli: -1000 }]) {
      expect((await actor.patch(itemPath, patch)).status).toBe(400);
    }
  });

  it('продукт зі списку не видаляється, а архівується й повертається, коли його знову додають', async () => {
    const actor = await createActor();
    const bread = await addProduct(actor, { name: 'Хліб' });
    const list = await createList(actor);
    await actor.post(`/api/shopping-lists/${list.id}/items`, { productId: bread.id });

    const deleted = await actor.delete(`/api/products/${bread.id}`);
    expect(deleted.status).toBe(409);
    expect(deleted.body.error.message).toMatch(/Заархівуйте/);

    const archived = await actor.patch(`/api/products/${bread.id}`, { isArchived: true });
    expect(archived.body.isArchived).toBe(true);
    expect((await actor.get('/api/products')).body.items).toEqual([]);
    expect((await actor.get('/api/products?archived=true')).body.items).toHaveLength(1);
    // Список і далі показує архівний продукт.
    expect((await actor.get(`/api/shopping-lists/${list.id}`)).body.items[0].name).toBe('Хліб');

    const other = await createList(actor, 'Інший');
    await actor.post(`/api/shopping-lists/${other.id}/items`, { name: 'ХЛІБ' });
    expect((await actor.get(`/api/products/${bread.id}`)).body.isArchived).toBe(false);

    // Без списків продукт знову можна видалити.
    await actor.delete(`/api/shopping-lists/${list.id}`);
    await actor.delete(`/api/shopping-lists/${other.id}`);
    expect((await actor.delete(`/api/products/${bread.id}`)).status).toBe(204);
  });

  it('ізолює списки й продукти між домогосподарствами', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const list = await createList(owner);
    const { body } = await owner.post(`/api/shopping-lists/${list.id}/items`, { name: 'Хліб' });
    const item = body.items[0];
    const strangerList = await createList(stranger);

    expect((await stranger.get('/api/shopping-lists')).body.items).toHaveLength(1);
    expect((await stranger.get(`/api/shopping-lists/${list.id}`)).status).toBe(404);
    expect((await stranger.patch(`/api/shopping-lists/${list.id}`, { name: 'x' })).status).toBe(
      404,
    );
    expect((await stranger.delete(`/api/shopping-lists/${list.id}`)).status).toBe(404);
    expect(
      (await stranger.post(`/api/shopping-lists/${list.id}/items`, { name: 'Сир' })).status,
    ).toBe(404);
    expect(
      (
        await stranger.patch(`/api/shopping-lists/${list.id}/items/${item.id}`, {
          isBought: true,
        })
      ).status,
    ).toBe(404);
    expect((await stranger.delete(`/api/shopping-lists/${list.id}/items/${item.id}`)).status).toBe(
      404,
    );
    // Чужий продукт не додається у свій список.
    expect(
      (
        await stranger.post(`/api/shopping-lists/${strangerList.id}/items`, {
          productId: item.productId,
        })
      ).status,
    ).toBe(404);
    // Рядок чужого списку не змінюється через свій список.
    expect(
      (
        await stranger.patch(`/api/shopping-lists/${strangerList.id}/items/${item.id}`, {
          isBought: true,
        })
      ).status,
    ).toBe(404);

    expect((await owner.get(`/api/shopping-lists/${list.id}`)).body.items[0].isBought).toBe(false);
  });
});
