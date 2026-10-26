import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { households, menuEntries } from '../../../db/schema.ts';
import { setupTestApp } from '../../../test/harness.ts';
import { addEntry, ownerWithMember, registerUser, type Client } from './helpers.ts';

const harness = setupTestApp();
const { app, db } = harness;

const OCTOBER = '/api/menu?from=2026-10-01&to=2026-11-01';

async function product(actor: Client, body: object): Promise<string> {
  const res = await actor.post('/api/products', body);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function dish(actor: Client, name: string, ingredients: object[] = []): Promise<string> {
  const res = await actor.post('/api/dishes', { name, ingredients });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/** Користувач із типовими прийомами їжі й стравами з ціною порції 690, 1 250, 500 і неповною. */
async function kitchen() {
  const user = await registerUser(harness);
  const [breakfast, lunch, dinner] = (await user.get('/api/meal-types')).body.items.map(
    (item: { id: string }) => item.id,
  ) as [string, string, string];
  const buckwheat = await product(user, { name: 'Гречка', unit: 'kg', price: 4000 });
  const oil = await product(user, { name: 'Олія', unit: 'l', price: 9000 });
  const chicken = await product(user, { name: 'Курка', unit: 'kg', price: 12500 });
  const milk = await product(user, { name: 'Молоко', unit: 'l', price: 5000 });
  const spice = await product(user, { name: 'Спеції', unit: 'pcs' });
  const dishes = {
    // 0,15 × 4000 + 0,01 × 9000 = 690
    buckwheat: await dish(user, 'Гречка варена', [
      { productId: buckwheat, quantityMilli: 150 },
      { productId: oil, quantityMilli: 10 },
    ]),
    // 0,1 × 12500 = 1250
    chicken: await dish(user, 'Курка запечена', [{ productId: chicken, quantityMilli: 100 }]),
    // 0,1 × 5000 = 500
    porridge: await dish(user, 'Каша молочна', [{ productId: milk, quantityMilli: 100 }]),
    // 500 + продукт без ціни
    soup: await dish(user, 'Суп', [
      { productId: milk, quantityMilli: 100 },
      { productId: spice, quantityMilli: 1000 },
    ]),
  };
  return { user, meals: { breakfast, lunch, dinner }, dishes, products: { buckwheat, spice } };
}

describe('календар меню', () => {
  it('AC1: новий запис — 201 з 1 порцією, видно в місяці з вартістю дня й місяця', async () => {
    const { user, meals, dishes } = await kitchen();
    const res = await user.post('/api/menu/entries', {
      date: '2026-10-26',
      mealTypeId: meals.lunch,
      dishId: dishes.buckwheat,
    });
    expect(res.status).toBe(201);
    const entry = {
      id: expect.any(String),
      date: '2026-10-26',
      mealTypeId: meals.lunch,
      kind: 'dish',
      name: 'Гречка варена',
      dishId: dishes.buckwheat,
      servings: 1,
      portionPrice: 690,
      cost: 690,
      isPriceComplete: true,
      unpricedCount: 0,
    };
    expect(res.body).toEqual(entry);

    const period = await user.get(OCTOBER);
    expect(period.status).toBe(200);
    expect(period.body).toEqual({
      from: '2026-10-01',
      to: '2026-11-01',
      currency: 'UAH',
      entries: [entry],
      days: [{ date: '2026-10-26', cost: 690, isPriceComplete: true, entryCount: 1 }],
      total: { cost: 690, isPriceComplete: true, incompleteEntryCount: 0 },
    });
  });

  it('AC2: вартість дня й місяця — сума ціна порції × порції', async () => {
    const { user, meals, dishes } = await kitchen();
    await addEntry(user, {
      date: '2026-10-26',
      mealTypeId: meals.lunch,
      dishId: dishes.buckwheat,
      servings: 2,
    });
    const chicken = await addEntry(user, {
      date: '2026-10-26',
      mealTypeId: meals.dinner,
      dishId: dishes.chicken,
      servings: 3,
    });
    expect(chicken.cost).toBe(3750);
    await addEntry(user, {
      date: '2026-10-27',
      mealTypeId: meals.breakfast,
      dishId: dishes.porridge,
    });

    const { body } = await user.get(OCTOBER);
    expect(body.days).toEqual([
      { date: '2026-10-26', cost: 5130, isPriceComplete: true, entryCount: 2 },
      { date: '2026-10-27', cost: 500, isPriceComplete: true, entryCount: 1 },
    ]);
    expect(body.total).toEqual({ cost: 5630, isPriceComplete: true, incompleteEntryCount: 0 });
  });

  it('AC3: страва з продуктом без ціни робить неповними запис, день і місяць', async () => {
    const { user, meals, dishes } = await kitchen();
    await addEntry(user, { date: '2026-10-26', mealTypeId: meals.lunch, dishId: dishes.soup });
    await addEntry(user, {
      date: '2026-10-26',
      mealTypeId: meals.dinner,
      dishId: dishes.chicken,
    });
    await addEntry(user, {
      date: '2026-10-27',
      mealTypeId: meals.lunch,
      dishId: dishes.buckwheat,
    });

    const { body } = await user.get(OCTOBER);
    const soup = body.entries.find((entry: { dishId: string }) => entry.dishId === dishes.soup);
    expect(soup).toMatchObject({
      portionPrice: 500,
      cost: 500,
      isPriceComplete: false,
      unpricedCount: 1,
    });
    expect(body.days).toEqual([
      { date: '2026-10-26', cost: 1750, isPriceComplete: false, entryCount: 2 },
      { date: '2026-10-27', cost: 690, isPriceComplete: true, entryCount: 1 },
    ]);
    expect(body.total).toEqual({ cost: 2440, isPriceComplete: false, incompleteEntryCount: 1 });
  });

  it('AC4: вартість і назва — поточні, зокрема для минулих днів', async () => {
    const { user, meals, dishes, products } = await kitchen();
    await addEntry(user, {
      date: '2020-01-15',
      mealTypeId: meals.lunch,
      dishId: dishes.buckwheat,
      servings: 2,
    });
    const january = '/api/menu?from=2020-01-01&to=2020-02-01';
    expect((await user.get(january)).body.total.cost).toBe(1380);

    // Гречка 50 грн: 0,15 × 5000 + 90 = 840
    expect((await user.patch(`/api/products/${products.buckwheat}`, { price: 5000 })).status).toBe(
      200,
    );
    expect((await user.get(january)).body.entries[0]).toMatchObject({
      portionPrice: 840,
      cost: 1680,
    });

    // Новий склад: лише спеції без ціни
    expect(
      (
        await user.patch(`/api/dishes/${dishes.buckwheat}`, {
          name: 'Гречка з салом',
          ingredients: [{ productId: products.spice, quantityMilli: 1000 }],
        })
      ).status,
    ).toBe(200);
    const { body } = await user.get(january);
    expect(body.entries[0]).toMatchObject({
      name: 'Гречка з салом',
      portionPrice: 0,
      cost: 0,
      isPriceComplete: false,
    });
    expect(body.total).toEqual({ cost: 0, isPriceComplete: false, incompleteEntryCount: 1 });
  });

  it('AC5: повторне додавання додає порції до того самого запису', async () => {
    const { user, meals, dishes } = await kitchen();
    const first = await addEntry(user, {
      date: '2026-10-26',
      mealTypeId: meals.lunch,
      dishId: dishes.buckwheat,
    });
    const again = await user.post('/api/menu/entries', {
      date: '2026-10-26',
      mealTypeId: meals.lunch,
      dishId: dishes.buckwheat,
      servings: 2,
    });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ id: first.id, servings: 3, cost: 2070 });

    const otherMeal = await addEntry(user, {
      date: '2026-10-26',
      mealTypeId: meals.dinner,
      dishId: dishes.buckwheat,
    });
    const otherDay = await addEntry(user, {
      date: '2026-10-27',
      mealTypeId: meals.lunch,
      dishId: dishes.buckwheat,
    });
    expect(new Set([first.id, otherMeal.id, otherDay.id]).size).toBe(3);
    expect((await user.get(OCTOBER)).body.entries).toHaveLength(3);
  });

  it('AC6: PATCH змінює порції й вартість; невалідні порції — 400 без змін', async () => {
    const { user, meals, dishes } = await kitchen();
    const entry = await addEntry(user, {
      date: '2026-10-26',
      mealTypeId: meals.lunch,
      dishId: dishes.buckwheat,
    });
    const res = await user.patch(`/api/menu/entries/${entry.id}`, { servings: 4 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: entry.id, servings: 4, cost: 2760 });

    for (const body of [
      { servings: 0 },
      { servings: 100 },
      { servings: 1.5 },
      { servings: '2' },
      {},
    ]) {
      expect((await user.patch(`/api/menu/entries/${entry.id}`, body)).status).toBe(400);
    }
    for (const servings of [0, 100, 1.5, '2']) {
      expect(
        (
          await user.post('/api/menu/entries', {
            date: '2026-10-28',
            mealTypeId: meals.lunch,
            dishId: dishes.buckwheat,
            servings,
          })
        ).status,
      ).toBe(400);
    }
    const { body } = await user.get(OCTOBER);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ servings: 4, cost: 2760 });
  });

  it('AC7: сума порцій понад 99 — 400, запис лишається з 98', async () => {
    const { user, meals, dishes } = await kitchen();
    const entry = await addEntry(user, {
      date: '2026-10-26',
      mealTypeId: meals.lunch,
      dishId: dishes.buckwheat,
      servings: 98,
    });
    const res = await user.post('/api/menu/entries', {
      date: '2026-10-26',
      mealTypeId: meals.lunch,
      dishId: dishes.buckwheat,
      servings: 2,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Не більше 99 порцій');
    expect((await user.get(OCTOBER)).body.entries).toMatchObject([{ id: entry.id, servings: 98 }]);

    // Рівно 99 можна.
    await addEntry(
      user,
      { date: '2026-10-26', mealTypeId: meals.lunch, dishId: dishes.buckwheat, servings: 1 },
      200,
    );
  });

  it('AC8: DELETE прибирає запис, довідники лишаються; повторно — 404', async () => {
    const { user, meals, dishes } = await kitchen();
    const entry = await addEntry(user, {
      date: '2026-10-26',
      mealTypeId: meals.lunch,
      dishId: dishes.buckwheat,
    });
    expect((await user.delete(`/api/menu/entries/${entry.id}`)).status).toBe(204);
    expect((await user.get(OCTOBER)).body).toMatchObject({
      entries: [],
      days: [],
      total: { cost: 0, isPriceComplete: true, incompleteEntryCount: 0 },
    });
    expect((await user.get(`/api/dishes/${dishes.buckwheat}`)).status).toBe(200);
    expect((await user.get('/api/meal-types')).body.items).toHaveLength(3);
    expect((await user.delete(`/api/menu/entries/${entry.id}`)).status).toBe(404);
  });

  it('AC9: період — from включно, to виключно; невалідний період — 400', async () => {
    const { user, meals, dishes } = await kitchen();
    await addEntry(user, { date: '2026-10-31', mealTypeId: meals.lunch, dishId: dishes.chicken });
    await addEntry(user, { date: '2026-10-26', mealTypeId: meals.lunch, dishId: dishes.buckwheat });
    await addEntry(user, { date: '2026-10-27', mealTypeId: meals.lunch, dishId: dishes.porridge });
    await addEntry(user, { date: '2026-11-01', mealTypeId: meals.lunch, dishId: dishes.porridge });

    const dates = async (query: string) =>
      (await user.get(`/api/menu?${query}`)).body.entries.map((e: { date: string }) => e.date);
    expect(await dates('from=2026-10-01&to=2026-11-01')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-31',
    ]);
    expect(await dates('from=2026-11-01&to=2026-12-01')).toEqual(['2026-11-01']);
    expect(await dates('from=2026-10-26&to=2026-10-27')).toEqual(['2026-10-26']);

    for (const query of [
      'from=2026-10-26&to=2026-10-26',
      'from=2026-10-27&to=2026-10-26',
      'from=2026-10-01&to=2026-12-03',
      'from=2026-02-30&to=2026-03-01',
      'from=2026-10-01',
      'to=2026-11-01',
      '',
    ]) {
      expect((await user.get(`/api/menu?${query}`)).status, query).toBe(400);
    }
    expect((await user.get('/api/menu?from=2026-10-01&to=2026-12-02')).status).toBe(200);
  });

  it('AC10: дата запису — лише валідна YYYY-MM-DD; минулі й майбутні дозволені', async () => {
    const { user, meals, dishes } = await kitchen();
    for (const date of ['2026-13-01', '2026-10-26T00:00:00Z', '26.10.2026', '', undefined]) {
      expect(
        (
          await user.post('/api/menu/entries', {
            date,
            mealTypeId: meals.lunch,
            dishId: dishes.soup,
          })
        ).status,
      ).toBe(400);
    }
    await addEntry(user, { date: '1999-12-31', mealTypeId: meals.lunch, dishId: dishes.soup });
    await addEntry(user, { date: '2099-01-01', mealTypeId: meals.lunch, dishId: dishes.soup });
  });

  it('AC11: у дні — за position прийому їжі, далі за назвою страви; порожніх днів немає', async () => {
    const { user, meals, dishes } = await kitchen();
    await addEntry(user, { date: '2026-10-26', mealTypeId: meals.dinner, dishId: dishes.soup });
    await addEntry(user, { date: '2026-10-26', mealTypeId: meals.lunch, dishId: dishes.soup });
    await addEntry(user, { date: '2026-10-26', mealTypeId: meals.lunch, dishId: dishes.chicken });
    await addEntry(user, { date: '2026-10-26', mealTypeId: meals.lunch, dishId: dishes.buckwheat });
    await addEntry(user, {
      date: '2026-10-26',
      mealTypeId: meals.breakfast,
      dishId: dishes.porridge,
    });
    await addEntry(user, { date: '2026-10-20', mealTypeId: meals.dinner, dishId: dishes.porridge });

    const order = async () =>
      (await user.get(OCTOBER)).body.entries.map(
        (e: { date: string; mealTypeId: string; name: string }) =>
          `${e.date} ${e.mealTypeId === meals.breakfast ? 'С' : e.mealTypeId === meals.lunch ? 'О' : 'В'} ${e.name}`,
      );
    expect(await order()).toEqual([
      '2026-10-20 В Каша молочна',
      '2026-10-26 С Каша молочна',
      '2026-10-26 О Гречка варена',
      '2026-10-26 О Курка запечена',
      '2026-10-26 О Суп',
      '2026-10-26 В Суп',
    ]);
    expect((await user.get(OCTOBER)).body.days.map((d: { date: string }) => d.date)).toEqual([
      '2026-10-20',
      '2026-10-26',
    ]);

    expect(
      (
        await user.put('/api/meal-types/order', {
          ids: [meals.dinner, meals.breakfast, meals.lunch],
        })
      ).status,
    ).toBe(200);
    expect(await order()).toEqual([
      '2026-10-20 В Каша молочна',
      '2026-10-26 В Суп',
      '2026-10-26 С Каша молочна',
      '2026-10-26 О Гречка варена',
      '2026-10-26 О Курка запечена',
      '2026-10-26 О Суп',
    ]);
  });

  it('AC15: страва без складу — нуль і повна ціна', async () => {
    const { user, meals } = await kitchen();
    const empty = await dish(user, 'Вода');
    const entry = await addEntry(user, {
      date: '2026-10-26',
      mealTypeId: meals.lunch,
      dishId: empty,
      servings: 5,
    });
    expect(entry).toMatchObject({ portionPrice: 0, cost: 0, isPriceComplete: true });
    expect((await user.get(OCTOBER)).body.total).toEqual({
      cost: 0,
      isPriceComplete: true,
      incompleteEntryCount: 0,
    });
  });

  it('каскадне видалення домогосподарства видаляє меню разом зі стравами й прийомами їжі', async () => {
    // Страва без складу: продукти зі складу страв захищені RESTRICT (поза цією задачею).
    const user = await registerUser(harness);
    const [, lunch] = (await user.get('/api/meal-types')).body.items;
    const dishId = await dish(user, 'Вода');
    await addEntry(user, { date: '2026-10-26', mealTypeId: lunch.id, dishId });
    await db.delete(households).where(eq(households.id, user.householdId));
    expect(await db.$count(menuEntries)).toBe(0);
  });
});

describe('доступ до календаря меню', () => {
  it('AC16: чужі записи не видно й не змінити; чужі довідники — 404', async () => {
    const owner = await kitchen();
    const stranger = await kitchen();
    const entry = await addEntry(owner.user, {
      date: '2026-10-26',
      mealTypeId: owner.meals.lunch,
      dishId: owner.dishes.buckwheat,
      servings: 2,
    });

    expect((await stranger.user.get(OCTOBER)).body.entries).toEqual([]);
    expect(
      (await stranger.user.patch(`/api/menu/entries/${entry.id}`, { servings: 5 })).status,
    ).toBe(404);
    expect((await stranger.user.delete(`/api/menu/entries/${entry.id}`)).status).toBe(404);
    const foreign = [
      { mealTypeId: owner.meals.lunch, dishId: stranger.dishes.buckwheat },
      { mealTypeId: stranger.meals.lunch, dishId: owner.dishes.buckwheat },
    ];
    for (const ids of foreign) {
      expect(
        (await stranger.user.post('/api/menu/entries', { date: '2026-10-26', ...ids })).status,
      ).toBe(404);
    }

    expect((await owner.user.get(OCTOBER)).body.entries).toMatchObject([
      { id: entry.id, servings: 2 },
    ]);
    expect((await stranger.user.get(OCTOBER)).body.entries).toEqual([]);
  });

  it('AC17: неіснуючі id — 404, невалідний uuid — 400, без токена — 401', async () => {
    const { user, meals, dishes } = await kitchen();
    const date = '2026-10-26';
    expect(
      (
        await user.post('/api/menu/entries', {
          date,
          mealTypeId: randomUUID(),
          dishId: dishes.soup,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await user.post('/api/menu/entries', {
          date,
          mealTypeId: meals.lunch,
          dishId: randomUUID(),
        })
      ).status,
    ).toBe(404);
    expect((await user.patch(`/api/menu/entries/${randomUUID()}`, { servings: 2 })).status).toBe(
      404,
    );
    expect((await user.delete(`/api/menu/entries/${randomUUID()}`)).status).toBe(404);
    expect(
      (await user.post('/api/menu/entries', { date, mealTypeId: 'x', dishId: dishes.soup })).status,
    ).toBe(400);
    expect((await user.patch('/api/menu/entries/not-a-uuid', { servings: 2 })).status).toBe(400);
    expect((await user.delete('/api/menu/entries/not-a-uuid')).status).toBe(400);

    const id = randomUUID();
    expect((await request(app).get(OCTOBER)).status).toBe(401);
    expect((await request(app).post('/api/menu/entries').send({})).status).toBe(401);
    expect((await request(app).patch(`/api/menu/entries/${id}`).send({ servings: 1 })).status).toBe(
      401,
    );
    expect((await request(app).delete(`/api/menu/entries/${id}`)).status).toBe(401);
  });

  it('AC18: учасник (member) читає й веде календар', async () => {
    const { owner, member } = await ownerWithMember(harness);
    const lunch = (await owner.post('/api/meal-types', { name: 'Обід' })).body.id as string;
    const dishId = await dish(owner, 'Борщ');

    const created = await member.post('/api/menu/entries', {
      date: '2026-10-26',
      mealTypeId: lunch,
      dishId,
    });
    expect(created.status).toBe(201);
    expect(
      (await member.post('/api/menu/entries', { date: '2026-10-26', mealTypeId: lunch, dishId }))
        .status,
    ).toBe(200);
    expect(
      (await member.patch(`/api/menu/entries/${created.body.id}`, { servings: 4 })).status,
    ).toBe(200);
    expect((await member.get(OCTOBER)).status).toBe(200);
    expect((await owner.get(OCTOBER)).body.entries).toMatchObject([{ servings: 4 }]);
    expect((await member.delete(`/api/menu/entries/${created.body.id}`)).status).toBe(204);
    expect((await owner.get(OCTOBER)).body.entries).toEqual([]);
  });
});

/** Користувач із прийомами їжі й продуктами: молоко 42,00/л, гречка 10,01/кг, яйця 6,50/шт, сіль без ціни. */
async function pantry() {
  const user = await registerUser(harness);
  const [breakfast, lunch, dinner] = (await user.get('/api/meal-types')).body.items.map(
    (item: { id: string }) => item.id,
  ) as [string, string, string];
  return {
    user,
    meals: { breakfast, lunch, dinner },
    products: {
      milk: await product(user, { name: 'Молоко', unit: 'l', price: 4200 }),
      buckwheat: await product(user, { name: 'Гречка', unit: 'kg', price: 1001 }),
      eggs: await product(user, { name: 'Яйця', unit: 'pcs', price: 650 }),
      salt: await product(user, { name: 'Сіль', unit: 'pack' }),
      penny: await product(user, { name: 'Ягода', unit: 'pcs', price: 100 }),
    },
  };
}

async function addProduct(
  actor: Client,
  body: { date: string; mealTypeId: string; productId: string; quantityMilli: number },
  status: 200 | 201 = 201,
) {
  const res = await actor.post('/api/menu/entries', body);
  expect(res.status).toBe(status);
  return res.body as { id: string; quantityMilli: number; cost: number };
}

describe('продукт у календарі', () => {
  it('AC4: продукт з кількістю — 201 з kind product, видно в дні меню', async () => {
    const { user, meals, products } = await pantry();
    const res = await user.post('/api/menu/entries', {
      date: '2026-10-26',
      mealTypeId: meals.breakfast,
      productId: products.milk,
      quantityMilli: 500,
    });
    expect(res.status).toBe(201);
    const entry = {
      id: expect.any(String),
      date: '2026-10-26',
      mealTypeId: meals.breakfast,
      kind: 'product',
      name: 'Молоко',
      productId: products.milk,
      unit: 'l',
      isArchived: false,
      quantityMilli: 500,
      unitPrice: 4200,
      cost: 2100,
      isPriceComplete: true,
      unpricedCount: 0,
    };
    expect(res.body).toEqual(entry);
    const { body } = await user.get(OCTOBER);
    expect(body.entries).toEqual([entry]);
    expect(body.days).toEqual([
      { date: '2026-10-26', cost: 2100, isPriceComplete: true, entryCount: 1 },
    ]);
  });

  it('AC5: вартість — кількість × ціна half-up; день і місяць — сума страв і продуктів', async () => {
    const { user, meals, products } = await pantry();
    const date = '2026-10-26';
    // 0,333 кг × 10,01 = 3,33333 → 333.
    const buckwheat = await addProduct(user, {
      date,
      mealTypeId: meals.lunch,
      productId: products.buckwheat,
      quantityMilli: 333,
    });
    expect(buckwheat.cost).toBe(333);
    // 0,005 × 1,00 = 0,5 коп. → 1 коп.
    const penny = await addProduct(user, {
      date: '2026-10-27',
      mealTypeId: meals.lunch,
      productId: products.penny,
      quantityMilli: 5,
    });
    expect(penny.cost).toBe(1);
    // Страва 0,1 л молока = 420 × 2 порції.
    const dishId = await dish(user, 'Какао', [{ productId: products.milk, quantityMilli: 100 }]);
    await addEntry(user, { date, mealTypeId: meals.breakfast, dishId, servings: 2 });

    const { body } = await user.get(OCTOBER);
    expect(body.days).toEqual([
      { date, cost: 333 + 840, isPriceComplete: true, entryCount: 2 },
      { date: '2026-10-27', cost: 1, isPriceComplete: true, entryCount: 1 },
    ]);
    expect(body.total).toEqual({
      cost: 333 + 840 + 1,
      isPriceComplete: true,
      incompleteEntryCount: 0,
    });
  });

  it('AC6: продукт без ціни — 0, неповна ціна; день і період неповні', async () => {
    const { user, meals, products } = await pantry();
    const date = '2026-10-26';
    const salt = await user.post('/api/menu/entries', {
      date,
      mealTypeId: meals.lunch,
      productId: products.salt,
      quantityMilli: 1000,
    });
    expect(salt.body).toMatchObject({
      unitPrice: null,
      cost: 0,
      isPriceComplete: false,
      unpricedCount: 1,
    });
    await addProduct(user, {
      date,
      mealTypeId: meals.lunch,
      productId: products.milk,
      quantityMilli: 1000,
    });
    const { body } = await user.get(OCTOBER);
    expect(body.days).toEqual([{ date, cost: 4200, isPriceComplete: false, entryCount: 2 }]);
    expect(body.total).toEqual({ cost: 4200, isPriceComplete: false, incompleteEntryCount: 1 });
  });

  it('AC7: повторне додавання збільшує кількість; понад межу — 400 без змін; інший день — окремо', async () => {
    const { user, meals, products } = await pantry();
    const body = { date: '2026-10-26', mealTypeId: meals.breakfast, productId: products.milk };
    const first = await addProduct(user, { ...body, quantityMilli: 500 });
    const second = await addProduct(user, { ...body, quantityMilli: 250 }, 200);
    expect(second).toMatchObject({ id: first.id, quantityMilli: 750, cost: 3150 });

    const big = await addProduct(user, { ...body, quantityMilli: 999_999_250 }, 200);
    expect(big.quantityMilli).toBe(1_000_000_000);
    const over = await user.post('/api/menu/entries', { ...body, quantityMilli: 1 });
    expect(over.status).toBe(400);
    expect(over.body.error.message).toBe('Кількість продукту завелика');
    expect((await user.get(OCTOBER)).body.entries).toMatchObject([
      { id: first.id, quantityMilli: 1_000_000_000 },
    ]);

    const otherMeal = await addProduct(user, {
      ...body,
      mealTypeId: meals.dinner,
      quantityMilli: 100,
    });
    const otherDay = await addProduct(user, { ...body, date: '2026-10-27', quantityMilli: 100 });
    expect(new Set([first.id, otherMeal.id, otherDay.id]).size).toBe(3);
  });

  it('AC8: страва й продукт з однаковою назвою — два записи; порядок за назвою разом', async () => {
    const { user, meals, products } = await pantry();
    const date = '2026-10-26';
    const mealTypeId = meals.breakfast;
    const milkDish = await dish(user, 'Молоко', [{ productId: products.milk, quantityMilli: 200 }]);
    await addEntry(user, { date, mealTypeId, dishId: milkDish });
    await addProduct(user, { date, mealTypeId, productId: products.milk, quantityMilli: 200 });
    await addProduct(user, { date, mealTypeId, productId: products.eggs, quantityMilli: 2000 });
    await addEntry(user, { date, mealTypeId, dishId: await dish(user, 'Яєчня') });
    await addProduct(user, { date, mealTypeId, productId: products.buckwheat, quantityMilli: 100 });
    await addEntry(user, { date, mealTypeId, dishId: await dish(user, 'Ґоґель-моґель') });
    await addEntry(user, { date, mealTypeId, dishId: await dish(user, 'Вівсянка') });

    const { body } = await user.get(OCTOBER);
    expect(body.entries.map((e: { kind: string; name: string }) => `${e.name} ${e.kind}`)).toEqual([
      'Вівсянка dish',
      'Гречка product',
      'Ґоґель-моґель dish',
      expect.stringMatching(/^Молоко (dish|product)$/),
      expect.stringMatching(/^Молоко (dish|product)$/),
      'Яєчня dish',
      'Яйця product',
    ]);
    const milk = body.entries.filter((e: { name: string }) => e.name === 'Молоко');
    expect(milk.map((e: { kind: string }) => e.kind).sort()).toEqual(['dish', 'product']);
  });

  it('AC9: PATCH quantityMilli змінює кількість і вартість; чужий вид і невалідні — 400', async () => {
    const { user, meals, products } = await pantry();
    const date = '2026-10-26';
    const entry = await addProduct(user, {
      date,
      mealTypeId: meals.lunch,
      productId: products.milk,
      quantityMilli: 500,
    });
    const patched = await user.patch(`/api/menu/entries/${entry.id}`, { quantityMilli: 1500 });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ id: entry.id, quantityMilli: 1500, cost: 6300 });

    const servings = await user.patch(`/api/menu/entries/${entry.id}`, { servings: 2 });
    expect(servings.status).toBe(400);
    expect(servings.body.error.message).toBe('Для продукту вказується кількість');

    const dishEntry = await addEntry(user, {
      date,
      mealTypeId: meals.lunch,
      dishId: await dish(user, 'Каша'),
      servings: 2,
    });
    const quantity = await user.patch(`/api/menu/entries/${dishEntry.id}`, { quantityMilli: 500 });
    expect(quantity.status).toBe(400);
    expect(quantity.body.error.message).toBe('Для страви вказуються порції');

    for (const quantityMilli of [0, -1, 1.5, 1_000_000_001]) {
      expect((await user.patch(`/api/menu/entries/${entry.id}`, { quantityMilli })).status).toBe(
        400,
      );
    }
    expect(
      (await user.patch(`/api/menu/entries/${entry.id}`, { quantityMilli: 1, servings: 1 })).status,
    ).toBe(400);
    expect((await user.get(OCTOBER)).body.entries).toMatchObject([
      { id: dishEntry.id, servings: 2 },
      { id: entry.id, quantityMilli: 1500 },
    ]);
  });

  it('AC10: dishId з productId, жодного, продукт з servings — 400 і нічого не створено', async () => {
    const { user, meals, products } = await pantry();
    const dishId = await dish(user, 'Каша');
    const base = { date: '2026-10-26', mealTypeId: meals.lunch };
    const bodies = [
      { ...base, dishId, productId: products.milk, quantityMilli: 500 },
      { ...base, dishId, productId: products.milk },
      { ...base },
      { ...base, quantityMilli: 500 },
      { ...base, productId: products.milk, servings: 2 },
      { ...base, productId: products.milk },
      { ...base, productId: products.milk, quantityMilli: 0 },
    ];
    for (const body of bodies) {
      expect((await user.post('/api/menu/entries', body)).status).toBe(400);
    }
    expect((await user.get(OCTOBER)).body.entries).toEqual([]);
  });

  it('AC11: ціна, назва й одиниця поточні — і для минулих днів', async () => {
    const { user, meals, products } = await pantry();
    const january = '/api/menu?from=2026-01-01&to=2026-02-01';
    await addProduct(user, {
      date: '2026-01-10',
      mealTypeId: meals.lunch,
      productId: products.milk,
      quantityMilli: 500,
    });
    expect(
      (
        await user.patch(`/api/products/${products.milk}`, {
          name: 'Кефір',
          unit: 'pack',
          price: 3000,
        })
      ).status,
    ).toBe(200);
    expect((await user.get(january)).body.entries[0]).toMatchObject({
      name: 'Кефір',
      unit: 'pack',
      unitPrice: 3000,
      cost: 1500,
    });
    expect((await user.patch(`/api/products/${products.milk}`, { price: null })).status).toBe(200);
    expect((await user.get(january)).body.entries[0]).toMatchObject({
      unitPrice: null,
      cost: 0,
      isPriceComplete: false,
    });
  });

  it('AC12: архівний продукт свого домогосподарства додається й не розархівовується', async () => {
    const { user, meals, products } = await pantry();
    expect((await user.patch(`/api/products/${products.eggs}`, { isArchived: true })).status).toBe(
      200,
    );
    const entry = await user.post('/api/menu/entries', {
      date: '2026-10-26',
      mealTypeId: meals.breakfast,
      productId: products.eggs,
      quantityMilli: 10_000,
    });
    expect(entry.status).toBe(201);
    expect(entry.body).toMatchObject({ isArchived: true, cost: 6500 });
    const archived = await user.get('/api/products?archived=true');
    expect(archived.body.items).toContainEqual(
      expect.objectContaining({ id: products.eggs, isArchived: true }),
    );
    const { body } = await user.get(`/api/menu?from=2026-10-26&to=2026-10-27`);
    expect(body.entries).toMatchObject([{ productId: products.eggs, isArchived: true }]);
  });

  it('AC13: DELETE прибирає продукт з дня, довідник лишається; повторно — 404', async () => {
    const { user, meals, products } = await pantry();
    const entry = await addProduct(user, {
      date: '2026-10-26',
      mealTypeId: meals.lunch,
      productId: products.milk,
      quantityMilli: 500,
    });
    expect((await user.delete(`/api/menu/entries/${entry.id}`)).status).toBe(204);
    expect((await user.delete(`/api/menu/entries/${entry.id}`)).status).toBe(404);
    expect((await user.get(OCTOBER)).body.entries).toEqual([]);
    const list = (await user.get('/api/products')).body.items as { id: string }[];
    expect(list.map((item) => item.id)).toContain(products.milk);
  });
});

describe('доступ: продукт у календарі', () => {
  it('AC20: чужий продукт — 404; чужий запис не видно й не змінити; 401; 400', async () => {
    const owner = await pantry();
    const stranger = await pantry();
    const date = '2026-10-26';
    const entry = await addProduct(owner.user, {
      date,
      mealTypeId: owner.meals.lunch,
      productId: owner.products.milk,
      quantityMilli: 500,
    });

    const foreign = await stranger.user.post('/api/menu/entries', {
      date,
      mealTypeId: stranger.meals.lunch,
      productId: owner.products.milk,
      quantityMilli: 500,
    });
    expect(foreign.status).toBe(404);
    expect(
      (
        await stranger.user.post('/api/menu/entries', {
          date,
          mealTypeId: stranger.meals.lunch,
          productId: randomUUID(),
          quantityMilli: 500,
        })
      ).status,
    ).toBe(404);
    expect((await stranger.user.get(OCTOBER)).body.entries).toEqual([]);
    expect(
      (await stranger.user.get('/api/menu/shopping?from=2026-10-01&to=2026-11-01')).body.items,
    ).toEqual([]);
    expect(
      (await stranger.user.patch(`/api/menu/entries/${entry.id}`, { quantityMilli: 1 })).status,
    ).toBe(404);
    expect((await stranger.user.delete(`/api/menu/entries/${entry.id}`)).status).toBe(404);
    expect((await owner.user.get(OCTOBER)).body.entries).toMatchObject([
      { id: entry.id, quantityMilli: 500 },
    ]);

    expect(
      (
        await owner.user.post('/api/menu/entries', {
          date,
          mealTypeId: owner.meals.lunch,
          productId: 'not-a-uuid',
          quantityMilli: 500,
        })
      ).status,
    ).toBe(400);
    expect(
      (await request(app).post('/api/menu/entries').send({ date, productId: owner.products.milk }))
        .status,
    ).toBe(401);
    expect(
      (await request(app).patch(`/api/menu/entries/${entry.id}`).send({ quantityMilli: 1 })).status,
    ).toBe(401);
  });

  it('AC21: учасник (member) додає, змінює й прибирає продукти в меню', async () => {
    const { owner, member } = await ownerWithMember(harness);
    const lunch = (await owner.post('/api/meal-types', { name: 'Обід' })).body.id as string;
    const productId = await product(owner, { name: 'Хліб', unit: 'pcs', price: 3000 });
    const body = { date: '2026-10-26', mealTypeId: lunch, productId, quantityMilli: 1000 };

    const created = await member.post('/api/menu/entries', body);
    expect(created.status).toBe(201);
    expect((await member.post('/api/menu/entries', body)).status).toBe(200);
    expect(
      (await member.patch(`/api/menu/entries/${created.body.id}`, { quantityMilli: 3000 })).status,
    ).toBe(200);
    expect((await owner.get(OCTOBER)).body.entries).toMatchObject([
      { kind: 'product', quantityMilli: 3000, cost: 9000 },
    ]);
    expect((await member.delete(`/api/menu/entries/${created.body.id}`)).status).toBe(204);
    expect((await owner.get(OCTOBER)).body.entries).toEqual([]);
  });

  it('каскадне видалення домогосподарства видаляє й записи-продукти', async () => {
    const { user, meals, products } = await pantry();
    await addProduct(user, {
      date: '2026-10-26',
      mealTypeId: meals.lunch,
      productId: products.milk,
      quantityMilli: 500,
    });
    await db.delete(households).where(eq(households.id, user.householdId));
    expect(await db.$count(menuEntries, eq(menuEntries.householdId, user.householdId))).toBe(0);
  });

  it('БД: запис без виду або з обома видами порушує check menu_entries_kind', async () => {
    const { user, meals, products } = await pantry();
    const dishId = await dish(user, 'Каша');
    const base = { householdId: user.householdId, date: '2026-10-26', mealTypeId: meals.lunch };
    await expect(db.insert(menuEntries).values({ ...base })).rejects.toThrow();
    await expect(
      db
        .insert(menuEntries)
        .values({ ...base, dishId, servings: 1, productId: products.milk, quantityMilli: 1 }),
    ).rejects.toThrow();
    await expect(
      db.insert(menuEntries).values({ ...base, productId: products.milk, servings: 1 }),
    ).rejects.toThrow();
  });
});
