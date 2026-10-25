import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { dishIngredients } from '../../../db/schema.ts';
import { setupTestApp } from '../../../test/harness.ts';
import { addEntry, ownerWithMember, type Client } from './helpers.ts';

const harness = setupTestApp();
const { app, db, createActor } = harness;

async function product(actor: Client, body: object): Promise<string> {
  const res = await actor.post('/api/products', body);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/** Гречка (кг, 40 грн) і олія (л, 90 грн). */
async function pantry(actor: Client) {
  return {
    buckwheat: await product(actor, { name: 'Гречка', unit: 'kg', price: 4000 }),
    oil: await product(actor, { name: 'Олія', unit: 'l', price: 9000 }),
  };
}

async function dishNames(actor: Client): Promise<string[]> {
  const res = await actor.get('/api/dishes');
  expect(res.status).toBe(200);
  return res.body.items.map((item: { name: string }) => item.name);
}

describe('страви', () => {
  it('створює страву зі складом і рахує ціну порції', async () => {
    const actor = await createActor();
    const { buckwheat, oil } = await pantry(actor);
    const res = await actor.post('/api/dishes', {
      name: 'Гречка варена',
      ingredients: [
        { productId: buckwheat, quantityMilli: 150 },
        { productId: oil, quantityMilli: 10 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'Гречка варена',
      currency: 'UAH',
      portionPrice: 690,
      isPriceComplete: true,
      unpricedCount: 0,
      ingredientCount: 2,
      createdAt: expect.any(String),
      ingredients: [
        {
          productId: buckwheat,
          name: 'Гречка',
          unit: 'kg',
          isArchived: false,
          quantityMilli: 150,
          unitPrice: 4000,
          lineTotal: 600,
        },
        {
          productId: oil,
          name: 'Олія',
          unit: 'l',
          isArchived: false,
          quantityMilli: 10,
          unitPrice: 9000,
          lineTotal: 90,
        },
      ],
    });

    const summary = { ...res.body };
    delete summary.ingredients;
    expect((await actor.get('/api/dishes')).body.items).toEqual([summary]);
    expect((await actor.get(`/api/dishes/${res.body.id}`)).body).toEqual(res.body);
  });

  it('рядки складу йдуть у переданому порядку', async () => {
    const actor = await createActor();
    const { buckwheat, oil } = await pantry(actor);
    const res = await actor.post('/api/dishes', {
      name: 'Каша',
      ingredients: [
        { productId: oil, quantityMilli: 10 },
        { productId: buckwheat, quantityMilli: 150 },
      ],
    });
    expect(res.body.ingredients.map((i: { name: string }) => i.name)).toEqual(['Олія', 'Гречка']);
  });

  it('продукт без ціни рахується як 0, і ціна неповна', async () => {
    const actor = await createActor();
    const { buckwheat } = await pantry(actor);
    const salt = await product(actor, { name: 'Сіль', unit: 'kg' });
    const res = await actor.post('/api/dishes', {
      name: 'Гречка з сіллю',
      ingredients: [
        { productId: buckwheat, quantityMilli: 150 },
        { productId: salt, quantityMilli: 5 },
      ],
    });
    expect(res.body).toMatchObject({
      portionPrice: 600,
      isPriceComplete: false,
      unpricedCount: 1,
      ingredientCount: 2,
    });
    expect(res.body.ingredients[1]).toMatchObject({ unitPrice: null, lineTotal: null });
  });

  it('страва без складу має нульову повну ціну', async () => {
    const actor = await createActor();
    const res = await actor.post('/api/dishes', { name: 'Чай' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      portionPrice: 0,
      isPriceComplete: true,
      unpricedCount: 0,
      ingredientCount: 0,
      ingredients: [],
    });
  });

  it('округлює кожен рядок, половина — вгору', async () => {
    const actor = await createActor();
    const cheese = await product(actor, { name: 'Сир', unit: 'kg', price: 1501 });
    const res = await actor.post('/api/dishes', {
      name: 'Канапка',
      ingredients: [{ productId: cheese, quantityMilli: 333 }],
    });
    expect(res.body.portionPrice).toBe(500);
    expect(res.body.ingredients[0].lineTotal).toBe(500);
  });

  it('ціна порції рахується за поточною ціною продукту', async () => {
    const actor = await createActor();
    const { buckwheat, oil } = await pantry(actor);
    const { body: dish } = await actor.post('/api/dishes', {
      name: 'Гречка варена',
      ingredients: [
        { productId: buckwheat, quantityMilli: 150 },
        { productId: oil, quantityMilli: 10 },
      ],
    });
    const portion = async () => (await actor.get('/api/dishes')).body.items[0];

    // Зміна ціни в довіднику.
    await actor.patch(`/api/products/${buckwheat}`, { price: 5000 });
    expect((await portion()).portionPrice).toBe(750 + 90);

    // Позначка «куплено» з новою фактичною ціною оновлює ціну продукту.
    const { body: list } = await actor.post('/api/shopping-lists', { name: 'Тиждень' });
    const { body: withItem } = await actor.post(`/api/shopping-lists/${list.id}/items`, {
      productId: oil,
      quantityMilli: 1000,
    });
    const bought = await actor.patch(
      `/api/shopping-lists/${list.id}/items/${withItem.items[0].id}`,
      { actualUnitPrice: 10_000, isBought: true },
    );
    expect(bought.status).toBe(200);
    expect((await portion()).portionPrice).toBe(750 + 100);
    expect((await actor.get(`/api/dishes/${dish.id}`)).body.ingredients[1].unitPrice).toBe(10_000);

    // Без ціни — неповна.
    await actor.patch(`/api/products/${buckwheat}`, { price: null });
    expect(await portion()).toMatchObject({
      portionPrice: 100,
      isPriceComplete: false,
      unpricedCount: 1,
    });
  });

  it('не допускає дублікатів назви без урахування регістру й пробілів', async () => {
    const actor = await createActor();
    const other = await createActor();
    await actor.post('/api/dishes', { name: 'Борщ' });
    expect((await actor.post('/api/dishes', { name: '  БОРЩ ' })).status).toBe(409);
    expect((await other.post('/api/dishes', { name: 'Борщ' })).status).toBe(201);

    const { body: soup } = await actor.post('/api/dishes', { name: 'Суп' });
    const rename = await actor.patch(`/api/dishes/${soup.id}`, { name: 'борщ' });
    expect(rename.status).toBe(409);
    expect(rename.body.error.code).toBe('CONFLICT');
    expect((await actor.patch(`/api/dishes/${soup.id}`, { name: 'СУП' })).status).toBe(200);
    // Страва може мати ту саму назву, що й продукт.
    await product(actor, { name: 'Вареники' });
    expect((await actor.post('/api/dishes', { name: 'Вареники' })).status).toBe(201);
  });

  it('відхиляє некоректний склад', async () => {
    const actor = await createActor();
    const { buckwheat } = await pantry(actor);
    const line = (quantityMilli: unknown, productId = buckwheat) => ({ productId, quantityMilli });
    const many = Array.from({ length: 51 }, () => line(1, randomUUID()));
    const invalid = [
      [line(100), line(200)],
      [line(0)],
      [line(-1)],
      [line(1.5)],
      [line('100')],
      [line(1_000_000_001)],
      [line(100, 'not-a-uuid')],
      many,
    ];
    for (const ingredients of invalid) {
      expect((await actor.post('/api/dishes', { name: 'Каша', ingredients })).status).toBe(400);
    }
    for (const name of ['', '  ', 'я'.repeat(101)]) {
      expect((await actor.post('/api/dishes', { name })).status).toBe(400);
    }
    const { status, body: dish } = await actor.post('/api/dishes', {
      name: 'Каша',
      ingredients: [line(1_000_000_000)],
    });
    expect(status).toBe(201);
    expect(await dishNames(actor)).toEqual(['Каша']);

    for (const ingredients of invalid) {
      expect((await actor.patch(`/api/dishes/${dish.id}`, { ingredients })).status).toBe(400);
    }
    expect((await actor.get(`/api/dishes/${dish.id}`)).body).toEqual(dish);
  });

  it('PATCH замінює склад цілком, не чіпаючи назви, і навпаки; порожнє тіло — 400', async () => {
    const actor = await createActor();
    const { buckwheat, oil } = await pantry(actor);
    const { body: dish } = await actor.post('/api/dishes', {
      name: 'Каша',
      ingredients: [
        { productId: buckwheat, quantityMilli: 150 },
        { productId: oil, quantityMilli: 10 },
      ],
    });

    const replaced = await actor.patch(`/api/dishes/${dish.id}`, {
      ingredients: [{ productId: oil, quantityMilli: 20 }],
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body).toMatchObject({ name: 'Каша', portionPrice: 180, ingredientCount: 1 });

    const renamed = await actor.patch(`/api/dishes/${dish.id}`, { name: 'Олійна каша' });
    expect(renamed.body).toMatchObject({ name: 'Олійна каша', ingredientCount: 1 });
    expect(renamed.body.ingredients).toEqual(replaced.body.ingredients);

    const both = await actor.patch(`/api/dishes/${dish.id}`, { name: 'Порожня', ingredients: [] });
    expect(both.body).toMatchObject({ name: 'Порожня', ingredientCount: 0, ingredients: [] });

    expect((await actor.patch(`/api/dishes/${dish.id}`, {})).status).toBe(400);
  });

  it('видалення страви видаляє склад, а продукти лишаються', async () => {
    const actor = await createActor();
    const { buckwheat, oil } = await pantry(actor);
    const { body: dish } = await actor.post('/api/dishes', {
      name: 'Каша',
      ingredients: [{ productId: buckwheat, quantityMilli: 150 }],
    });
    expect((await actor.delete(`/api/dishes/${dish.id}`)).status).toBe(204);
    expect((await actor.get(`/api/dishes/${dish.id}`)).status).toBe(404);
    expect((await actor.delete(`/api/dishes/${dish.id}`)).status).toBe(404);
    expect(await db.$count(dishIngredients, eq(dishIngredients.dishId, dish.id))).toBe(0);
    const products = (await actor.get('/api/products')).body.items.map((p: { id: string }) => p.id);
    expect(products.sort()).toEqual([buckwheat, oil].sort());
    // Продукт без складу тепер можна видалити.
    expect((await actor.delete(`/api/products/${buckwheat}`)).status).toBe(204);
  });

  it('AC13: страву з меню не видалити (409), а після очищення календаря — можна', async () => {
    const actor = await createActor();
    const { buckwheat } = await pantry(actor);
    const lunch = (await actor.post('/api/meal-types', { name: 'Обід' })).body.id as string;
    const { body: dish } = await actor.post('/api/dishes', {
      name: 'Каша',
      ingredients: [{ productId: buckwheat, quantityMilli: 150 }],
    });
    const entries = [
      await addEntry(actor, { date: '2026-10-26', mealTypeId: lunch, dishId: dish.id }),
      await addEntry(actor, { date: '2020-01-01', mealTypeId: lunch, dishId: dish.id }),
    ];

    const res = await actor.delete(`/api/dishes/${dish.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Страва є в меню. Приберіть її з календаря, щоб видалити');
    expect((await actor.get(`/api/dishes/${dish.id}`)).body.ingredientCount).toBe(1);
    expect((await actor.get('/api/menu?from=2026-10-01&to=2026-11-01')).body.entries).toHaveLength(
      1,
    );

    // Один запис лишився — усе ще 409.
    expect((await actor.delete(`/api/menu/entries/${entries[0]!.id}`)).status).toBe(204);
    expect((await actor.delete(`/api/dishes/${dish.id}`)).status).toBe(409);
    expect((await actor.delete(`/api/menu/entries/${entries[1]!.id}`)).status).toBe(204);
    expect((await actor.delete(`/api/dishes/${dish.id}`)).status).toBe(204);
  });

  it('сортує страви за українським алфавітом без урахування регістру', async () => {
    const actor = await createActor();
    for (const name of ['ґоґель-моґель', 'Єгипетська каша', 'гарбуз', 'Енергетик', 'абрикоси']) {
      await actor.post('/api/dishes', { name });
    }
    expect(await dishNames(actor)).toEqual([
      'абрикоси',
      'гарбуз',
      'ґоґель-моґель',
      'Енергетик',
      'Єгипетська каша',
    ]);
  });

  it('архівний продукт можна мати в складі, і його ціна врахована', async () => {
    const actor = await createActor();
    const { buckwheat, oil } = await pantry(actor);
    await actor.patch(`/api/products/${oil}`, { isArchived: true });
    const res = await actor.post('/api/dishes', {
      name: 'Каша',
      ingredients: [
        { productId: buckwheat, quantityMilli: 150 },
        { productId: oil, quantityMilli: 10 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.portionPrice).toBe(690);
    expect(res.body.ingredients[1]).toMatchObject({ productId: oil, isArchived: true });
  });

  it('продукт зі складу страви не видаляється, лише архівується', async () => {
    const actor = await createActor();
    const { buckwheat } = await pantry(actor);
    const { body: dish } = await actor.post('/api/dishes', {
      name: 'Каша',
      ingredients: [{ productId: buckwheat, quantityMilli: 150 }],
    });
    const res = await actor.delete(`/api/products/${buckwheat}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('стравах');

    expect((await actor.patch(`/api/products/${buckwheat}`, { isArchived: true })).status).toBe(
      200,
    );
    const { body } = await actor.get(`/api/dishes/${dish.id}`);
    expect(body.ingredients).toEqual([
      expect.objectContaining({ productId: buckwheat, isArchived: true }),
    ]);
  });
});

describe('доступ до страв', () => {
  it('чужі страви не видно й не змінити', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const { buckwheat } = await pantry(owner);
    const { body: dish } = await owner.post('/api/dishes', {
      name: 'Каша',
      ingredients: [{ productId: buckwheat, quantityMilli: 150 }],
    });

    expect((await stranger.get('/api/dishes')).body.items).toEqual([]);
    expect((await stranger.get(`/api/dishes/${dish.id}`)).status).toBe(404);
    expect((await stranger.patch(`/api/dishes/${dish.id}`, { name: 'Х' })).status).toBe(404);
    expect((await stranger.delete(`/api/dishes/${dish.id}`)).status).toBe(404);
    expect((await stranger.get(`/api/dishes/${randomUUID()}`)).status).toBe(404);
    expect((await stranger.get('/api/dishes/not-a-uuid')).status).toBe(400);
    expect((await owner.get(`/api/dishes/${dish.id}`)).body).toEqual(dish);
  });

  it('чужий чи неіснуючий продукт у складі — 404, і нічого не змінюється', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const { buckwheat } = await pantry(owner);
    const foreign = await product(stranger, { name: 'Чужа олія', unit: 'l', price: 1 });

    for (const productId of [foreign, randomUUID()]) {
      const res = await owner.post('/api/dishes', {
        name: 'Каша',
        ingredients: [
          { productId: buckwheat, quantityMilli: 150 },
          { productId, quantityMilli: 10 },
        ],
      });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    expect(await dishNames(owner)).toEqual([]);

    const { body: dish } = await owner.post('/api/dishes', {
      name: 'Каша',
      ingredients: [{ productId: buckwheat, quantityMilli: 150 }],
    });
    const patch = await owner.patch(`/api/dishes/${dish.id}`, {
      name: 'Інша каша',
      ingredients: [{ productId: foreign, quantityMilli: 10 }],
    });
    expect(patch.status).toBe(404);
    expect((await owner.get(`/api/dishes/${dish.id}`)).body).toEqual(dish);
  });

  it('без access-токена — 401', async () => {
    const id = randomUUID();
    expect((await request(app).get('/api/dishes')).status).toBe(401);
    expect((await request(app).post('/api/dishes').send({ name: 'Х' })).status).toBe(401);
    expect((await request(app).get(`/api/dishes/${id}`)).status).toBe(401);
    expect((await request(app).patch(`/api/dishes/${id}`).send({ name: 'Х' })).status).toBe(401);
    expect((await request(app).delete(`/api/dishes/${id}`)).status).toBe(401);
  });

  it('учасник (member) створює, змінює й видаляє страви', async () => {
    const { owner, member } = await ownerWithMember(harness);
    const { buckwheat } = await pantry(owner);
    const created = await member.post('/api/dishes', {
      name: 'Каша',
      ingredients: [{ productId: buckwheat, quantityMilli: 150 }],
    });
    expect(created.status).toBe(201);
    const updated = await member.patch(`/api/dishes/${created.body.id}`, {
      ingredients: [{ productId: buckwheat, quantityMilli: 200 }],
    });
    expect(updated.status).toBe(200);
    expect((await owner.get('/api/dishes')).body.items[0].portionPrice).toBe(800);
    expect((await member.delete(`/api/dishes/${created.body.id}`)).status).toBe(204);
    expect(await dishNames(owner)).toEqual([]);
  });
});
