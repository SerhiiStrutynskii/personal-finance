import { describe, expect, it } from 'vitest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';

const { createActor, setNow } = setupTestApp();

/** Купує продукт новим списком у момент `at` за фактичною ціною. */
async function buy(
  actor: Actor,
  at: string,
  item: { name: string; unit?: string; price: number; quantityMilli?: number },
  actualUnitPrice?: number,
) {
  setNow(at);
  const { body: list } = await actor.post('/api/shopping-lists', { name: `Список ${at}` });
  const { body } = await actor.post(`/api/shopping-lists/${list.id}/items`, {
    name: item.name,
    unit: item.unit ?? 'pcs',
    price: item.price,
    quantityMilli: item.quantityMilli ?? 1000,
  });
  const line = body.items.find((i: { name: string }) => i.name === item.name);
  await actor.patch(`/api/shopping-lists/${list.id}/items/${line.id}`, {
    isBought: true,
    ...(actualUnitPrice !== undefined && { actualUnitPrice }),
  });
  return { listId: list.id as string, productId: line.productId as string };
}

describe('shopping analytics', () => {
  it('відносить покупку до місяця за київським часом і порівнює з попереднім місяцем', async () => {
    const actor = await createActor();
    // 30 вересня 23:30 за Києвом — ще вересень.
    await buy(actor, '2026-09-30T20:30:00Z', { name: 'Хліб', price: 3000 });
    // 1 жовтня 00:30 за Києвом — уже жовтень, хоча за UTC ще 30 вересня.
    await buy(actor, '2026-09-30T21:30:00Z', { name: 'Хліб', price: 3000 }, 3200);
    await buy(
      actor,
      '2026-10-10T09:00:00Z',
      { name: 'Сир', unit: 'kg', price: 40000, quantityMilli: 350 },
      38990,
    );

    setNow('2026-10-20T10:00:00Z');
    const { body } = await actor.get('/api/shopping/analytics?month=2026-10');
    expect(body).toMatchObject({
      month: '2026-10',
      currency: 'UAH',
      spent: 3200 + 13647,
      previousSpent: 3000,
      change: 3200 + 13647 - 3000,
      expectedOfPriced: 3000 + 14000,
      deviation: 200 - 353,
      purchaseCount: 2,
      unpricedCount: 0,
    });
    expect(body.products).toEqual([
      // Середня ціна — з округленої суми рядка: 136,47 / 0,35 = 389,914 грн.
      expect.objectContaining({ name: 'Сир', spent: 13647, averageUnitPrice: 38991 }),
      // Ціна порівнюється з вереснем.
      expect.objectContaining({ name: 'Хліб', lastUnitPrice: 3200, previousUnitPrice: 3000 }),
    ]);

    // Без month — поточний місяць.
    expect((await actor.get('/api/shopping/analytics')).body.month).toBe('2026-10');
  });

  it('не рахує некуплене, а зняття позначки прибирає покупку', async () => {
    const actor = await createActor();
    const { listId } = await buy(actor, '2026-10-05T10:00:00Z', { name: 'Хліб', price: 3000 });
    setNow('2026-10-06T10:00:00Z');
    await actor.post(`/api/shopping-lists/${listId}/items`, { name: 'Молоко', price: 4200 });

    expect((await actor.get('/api/shopping/analytics')).body).toMatchObject({
      spent: 3000,
      purchaseCount: 1,
    });

    const { body: list } = await actor.get(`/api/shopping-lists/${listId}`);
    const bread = list.items.find((i: { name: string }) => i.name === 'Хліб');
    await actor.patch(`/api/shopping-lists/${listId}/items/${bread.id}`, { isBought: false });
    expect((await actor.get('/api/shopping/analytics')).body).toMatchObject({
      spent: 0,
      purchaseCount: 0,
      products: [],
    });
  });

  it('відхиляє майбутній і некоректний місяць', async () => {
    const actor = await createActor();
    setNow('2026-10-20T10:00:00Z');
    expect((await actor.get('/api/shopping/analytics?month=2026-11')).status).toBe(400);
    expect((await actor.get('/api/shopping/analytics?month=2026-13')).status).toBe(400);
  });

  it('показує історію фактичних цін продукту від найдавнішої', async () => {
    const actor = await createActor();
    const first = await buy(actor, '2026-08-01T10:00:00Z', { name: 'Хліб', price: 3000 });
    await buy(actor, '2026-09-01T10:00:00Z', { name: 'Хліб', price: 3000 }, 3300);

    const { body } = await actor.get(`/api/products/${first.productId}/prices`);
    expect(body.product).toMatchObject({ id: first.productId, name: 'Хліб', price: 3300 });
    expect(body.points).toEqual([
      expect.objectContaining({
        boughtAt: '2026-08-01T10:00:00.000Z',
        unitPrice: 3000,
        quantityMilli: 1000,
        listId: first.listId,
      }),
      expect.objectContaining({ boughtAt: '2026-09-01T10:00:00.000Z', unitPrice: 3300 }),
    ]);
  });

  it('ізолює аналітику й історію цін між домогосподарствами', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const { productId } = await buy(owner, '2026-10-05T10:00:00Z', { name: 'Хліб', price: 3000 });

    setNow('2026-10-20T10:00:00Z');
    expect((await stranger.get('/api/shopping/analytics')).body).toMatchObject({
      spent: 0,
      products: [],
    });
    expect((await stranger.get(`/api/products/${productId}/prices`)).status).toBe(404);
  });

  it('за період: суми по місяцях за київським часом і помісячно по продукту', async () => {
    const actor = await createActor();
    // Шість місяців до жовтня — травень–жовтень; квітень у період не входить, але є в річному.
    await buy(actor, '2026-04-15T10:00:00Z', { name: 'Хліб', price: 9900 });
    await buy(
      actor,
      '2026-08-10T10:00:00Z',
      { name: 'Хліб', price: 3000, quantityMilli: 2000 },
      3000,
    );
    // 1 жовтня 00:30 за Києвом — жовтень.
    await buy(actor, '2026-09-30T21:30:00Z', { name: 'Хліб', price: 3000 }, 3200);
    await buy(
      actor,
      '2026-10-10T09:00:00Z',
      { name: 'Сир', unit: 'kg', price: 40000, quantityMilli: 500 },
      40000,
    );

    setNow('2026-10-20T10:00:00Z');
    const { body } = await actor.get('/api/shopping/analytics/period?months=6');
    expect(body).toMatchObject({
      month: '2026-10',
      months: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
      total: 6000 + 3200 + 20000,
      averagePerMonth: Math.round(29200 / 6),
      purchaseCount: 3,
    });
    expect(body.points.map((p: { spent: number }) => p.spent)).toEqual([0, 0, 0, 6000, 0, 23200]);
    expect(body.products.map((p: { name: string }) => p.name)).toEqual(['Сир', 'Хліб']);
    const bread = body.products[1];
    expect(bread).toMatchObject({ spent: 9200, minUnitPrice: 3000, maxUnitPrice: 3200 });
    expect(bread.byMonth.map((m: { spent: number }) => m.spent)).toEqual([0, 0, 0, 6000, 0, 3200]);

    const year = await actor.get('/api/shopping/analytics/period?month=2026-10&months=12');
    expect(year.body.months).toHaveLength(12);
    expect(year.body.total).toBe(9900 + 29200);
  });

  it('за період: відхиляє майбутній місяць і іншу довжину, ізолює домогосподарства', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    await buy(owner, '2026-10-05T10:00:00Z', { name: 'Хліб', price: 3000 });

    setNow('2026-10-20T10:00:00Z');
    expect((await owner.get('/api/shopping/analytics/period?month=2026-11')).status).toBe(400);
    expect((await owner.get('/api/shopping/analytics/period?months=3')).status).toBe(400);
    expect((await stranger.get('/api/shopping/analytics/period')).body).toMatchObject({
      total: 0,
      products: [],
    });
  });
});
