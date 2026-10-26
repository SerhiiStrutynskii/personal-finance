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
