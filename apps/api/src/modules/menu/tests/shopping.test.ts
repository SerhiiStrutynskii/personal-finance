import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { shoppingListItems, shoppingLists } from '../../../db/schema.ts';
import { setupTestApp } from '../../../test/harness.ts';
import {
  addEntry,
  createDish,
  createProduct,
  mealTypeIds,
  ownerWithMember,
  registerUser,
  type Client,
} from './helpers.ts';

const harness = setupTestApp();
const { app } = harness;

const WEEK = { from: '2026-10-26', to: '2026-11-02' };
const shoppingUrl = ({ from, to }: { from: string; to: string }) =>
  `/api/menu/shopping?from=${from}&to=${to}`;

async function getShopping(actor: Client, period = WEEK) {
  const res = await actor.get(shoppingUrl(period));
  expect(res.status).toBe(200);
  return res.body;
}

async function listCount(actor: Client): Promise<number> {
  const res = await actor.get('/api/shopping-lists');
  expect(res.status).toBe(200);
  return res.body.items.length;
}

/** Гречка 4 000/кг, олія 9 000/л; «Гречка варена» — 0,15 кг гречки й 0,01 л олії на порцію. */
async function kitchen() {
  const user = await registerUser(harness);
  const [breakfast, lunch, dinner] = (await mealTypeIds(user)) as [string, string, string];
  const buckwheat = await createProduct(user, { name: 'Гречка', unit: 'kg', price: 4000 });
  const oil = await createProduct(user, { name: 'Олія', unit: 'l', price: 9000 });
  const porridge = await createDish(user, 'Гречка варена', [
    { productId: buckwheat, quantityMilli: 150 },
    { productId: oil, quantityMilli: 10 },
  ]);
  return {
    user,
    meals: { breakfast, lunch, dinner },
    products: { buckwheat, oil },
    dishes: { porridge },
  };
}

/** AC1: гречка 2 + 2 порції в різні дні й 1 порція в інший прийом їжі. */
async function weekOfBuckwheat() {
  const k = await kitchen();
  await addEntry(k.user, {
    date: '2026-10-26',
    mealTypeId: k.meals.lunch,
    dishId: k.dishes.porridge,
    servings: 2,
  });
  await addEntry(k.user, {
    date: '2026-10-28',
    mealTypeId: k.meals.lunch,
    dishId: k.dishes.porridge,
    servings: 2,
  });
  await addEntry(k.user, {
    date: '2026-11-01',
    mealTypeId: k.meals.dinner,
    dishId: k.dishes.porridge,
    servings: 1,
  });
  return k;
}

describe('покупки за меню: перелік і бюджет', () => {
  it('AC1: сумарна кількість продукту на всі записи періоду й бюджет', async () => {
    const { user, products } = await weekOfBuckwheat();
    const body = await getShopping(user);
    expect(body).toEqual({
      from: '2026-10-26',
      to: '2026-11-02',
      currency: 'UAH',
      entryCount: 3,
      items: [
        {
          productId: products.buckwheat,
          name: 'Гречка',
          unit: 'kg',
          isArchived: false,
          quantityMilli: 750,
          unitPrice: 4000,
          lineTotal: 3000,
        },
        {
          productId: products.oil,
          name: 'Олія',
          unit: 'l',
          isArchived: false,
          quantityMilli: 50,
          unitPrice: 9000,
          lineTotal: 450,
        },
      ],
      total: { cost: 3450, isPriceComplete: true, unpricedCount: 0 },
    });
  });

  it('AC2: продукт із кількох страв — один рядок; рядки за українським алфавітом', async () => {
    const { user, meals, products, dishes } = await kitchen();
    const apple = await createProduct(user, { name: 'їжак-яблуко', unit: 'pcs', price: 1000 });
    const salad = await createDish(user, 'Салат', [
      { productId: products.oil, quantityMilli: 20 },
      { productId: apple, quantityMilli: 1000 },
    ]);
    await addEntry(user, { date: '2026-10-27', mealTypeId: meals.lunch, dishId: dishes.porridge });
    await addEntry(user, { date: '2026-10-27', mealTypeId: meals.dinner, dishId: salad });

    const body = await getShopping(user);
    expect(body.items.map((item: { name: string; quantityMilli: number }) => item.name)).toEqual([
      'Гречка',
      'їжак-яблуко',
      'Олія',
    ]);
    const oil = body.items.find((item: { productId: string }) => item.productId === products.oil);
    expect(oil).toMatchObject({ quantityMilli: 30, lineTotal: 270 });
    expect(body.total.cost).toBe(600 + 1000 + 270);
  });

  it('AC3: продукт без ціни рахується як 0 і один раз на продукт', async () => {
    const { user, meals, products } = await kitchen();
    const salt = await createProduct(user, { name: 'Сіль', unit: 'kg' });
    const a = await createDish(user, 'Гречка з сіллю', [
      { productId: products.buckwheat, quantityMilli: 150 },
      { productId: salt, quantityMilli: 5 },
    ]);
    const b = await createDish(user, 'Солоний суп', [{ productId: salt, quantityMilli: 10 }]);
    await addEntry(user, { date: '2026-10-26', mealTypeId: meals.lunch, dishId: a });
    await addEntry(user, { date: '2026-10-27', mealTypeId: meals.lunch, dishId: b, servings: 2 });

    const body = await getShopping(user);
    expect(body.items).toEqual([
      expect.objectContaining({ name: 'Гречка', quantityMilli: 150, lineTotal: 600 }),
      expect.objectContaining({
        productId: salt,
        name: 'Сіль',
        quantityMilli: 25,
        unitPrice: null,
        lineTotal: null,
      }),
    ]);
    expect(body.total).toEqual({ cost: 600, isPriceComplete: false, unpricedCount: 1 });
  });

  it('AC4: округлення від сумарної кількості — 3 × 0,001 кг × 5 грн = 0,02 грн', async () => {
    const { user, meals } = await kitchen();
    const pepper = await createProduct(user, { name: 'Перець', unit: 'kg', price: 500 });
    const dish = await createDish(user, 'Перчик', [{ productId: pepper, quantityMilli: 1 }]);
    for (const date of ['2026-10-26', '2026-10-27', '2026-10-28']) {
      await addEntry(user, { date, mealTypeId: meals.breakfast, dishId: dish });
    }
    const body = await getShopping(user);
    expect(body.items).toEqual([expect.objectContaining({ quantityMilli: 3, lineTotal: 2 })]);
    expect(body.total.cost).toBe(2);
  });

  it('AC5: період [from, to) — день, тиждень пн–нд і місяць', async () => {
    const { user, meals, dishes } = await kitchen();
    for (const date of ['2026-10-25', '2026-10-26', '2026-11-01', '2026-11-02']) {
      await addEntry(user, { date, mealTypeId: meals.lunch, dishId: dishes.porridge });
    }
    // Тиждень: понеділок 26.10 включно, понеділок 02.11 — ні.
    expect((await getShopping(user)).entryCount).toBe(2);
    expect((await getShopping(user)).items[0].quantityMilli).toBe(300);
    // День.
    const day = await getShopping(user, { from: '2026-11-02', to: '2026-11-03' });
    expect(day.entryCount).toBe(1);
    expect(day.items[0].quantityMilli).toBe(150);
    // Календарний місяць.
    const october = await getShopping(user, { from: '2026-10-01', to: '2026-11-01' });
    expect(october.entryCount).toBe(2);
    expect(october.total.cost).toBe(1380);
  });

  it('AC5: невалідний період — 400', async () => {
    const { user } = await kitchen();
    for (const query of [
      'from=2026-10-26&to=2026-10-26',
      'from=2026-10-27&to=2026-10-26',
      'from=2026-10-01&to=2026-12-03',
      'from=2026-02-30&to=2026-03-02',
      'from=2026-10-26',
      'to=2026-11-02',
      '',
    ]) {
      const res = await user.get(`/api/menu/shopping?${query}`);
      expect(res.status, query).toBe(400);
    }
  });

  it('AC6: порожній період і страви без складу — порожній перелік і нульовий бюджет', async () => {
    const { user, meals } = await kitchen();
    const empty = await getShopping(user);
    expect(empty).toMatchObject({
      entryCount: 0,
      items: [],
      total: { cost: 0, isPriceComplete: true, unpricedCount: 0 },
    });

    const tea = await createDish(user, 'Чай');
    await addEntry(user, { date: '2026-10-26', mealTypeId: meals.breakfast, dishId: tea });
    await addEntry(user, { date: '2026-10-27', mealTypeId: meals.breakfast, dishId: tea });
    expect(await getShopping(user)).toMatchObject({
      entryCount: 2,
      items: [],
      total: { cost: 0, isPriceComplete: true, unpricedCount: 0 },
    });
  });

  it('AC7: поточні ціни, склад і порції', async () => {
    const { user, meals, products, dishes } = await kitchen();
    const entry = await addEntry(user, {
      date: '2026-10-26',
      mealTypeId: meals.lunch,
      dishId: dishes.porridge,
    });
    expect((await getShopping(user)).total.cost).toBe(690);

    expect((await user.patch(`/api/products/${products.buckwheat}`, { price: 5000 })).status).toBe(
      200,
    );
    expect((await getShopping(user)).total.cost).toBe(750 + 90);

    const res = await user.patch(`/api/dishes/${dishes.porridge}`, {
      ingredients: [{ productId: products.buckwheat, quantityMilli: 200 }],
    });
    expect(res.status).toBe(200);
    const afterDish = await getShopping(user);
    expect(afterDish.items).toHaveLength(1);
    expect(afterDish.total.cost).toBe(1000);

    expect((await user.patch(`/api/menu/entries/${entry.id}`, { servings: 3 })).status).toBe(200);
    const afterServings = await getShopping(user);
    expect(afterServings.items[0]).toMatchObject({ quantityMilli: 600, lineTotal: 3000 });
  });
});

describe('покупки за меню: створення списку', () => {
  it('AC9: список з тими самими рядками й сумами, типова назва тижня; меню не змінюється', async () => {
    const { user, products } = await weekOfBuckwheat();
    const menuBefore = await user.get(`/api/menu?from=${WEEK.from}&to=${WEEK.to}`);
    const shopping = await getShopping(user);

    const res = await user.post('/api/menu/shopping-list', WEEK);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Меню 26.10.2026–01.11.2026',
      currency: 'UAH',
      totals: {
        itemCount: 2,
        boughtCount: 0,
        expected: shopping.total.cost,
        actual: 0,
        unpricedCount: shopping.total.unpricedCount,
      },
    });
    expect(res.body.totals.expected).toBe(3450);
    expect(res.body.items).toEqual([
      {
        id: expect.any(String),
        productId: products.buckwheat,
        name: 'Гречка',
        unit: 'kg',
        quantityMilli: 750,
        expectedUnitPrice: 4000,
        actualUnitPrice: null,
        expectedTotal: 3000,
        actualTotal: null,
        isBought: false,
        boughtAt: null,
      },
      {
        id: expect.any(String),
        productId: products.oil,
        name: 'Олія',
        unit: 'l',
        quantityMilli: 50,
        expectedUnitPrice: 9000,
        actualUnitPrice: null,
        expectedTotal: 450,
        actualTotal: null,
        isBought: false,
        boughtAt: null,
      },
    ]);

    const all = await user.get('/api/shopping-lists');
    expect(all.body.items).toEqual([expect.objectContaining({ id: res.body.id })]);
    const fetched = await user.get(`/api/shopping-lists/${res.body.id}`);
    expect(fetched.body).toEqual(res.body);

    const menuAfter = await user.get(`/api/menu?from=${WEEK.from}&to=${WEEK.to}`);
    expect(menuAfter.body).toEqual(menuBefore.body);
  });

  it('AC9: день — «Меню на …», передана назва замість типової, продукт без ціни', async () => {
    const { user, meals, dishes } = await kitchen();
    const salt = await createProduct(user, { name: 'Сіль', unit: 'kg' });
    const salted = await createDish(user, 'Сіль', [{ productId: salt, quantityMilli: 5 }]);
    await addEntry(user, { date: '2026-10-26', mealTypeId: meals.lunch, dishId: dishes.porridge });
    await addEntry(user, { date: '2026-10-26', mealTypeId: meals.dinner, dishId: salted });
    const day = { from: '2026-10-26', to: '2026-10-27' };
    const shopping = await getShopping(user, day);

    const res = await user.post('/api/menu/shopping-list', day);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Меню на 26.10.2026');
    expect(res.body.totals).toMatchObject({ expected: 690, unpricedCount: 1 });
    expect(res.body.totals.expected).toBe(shopping.total.cost);
    expect(res.body.totals.unpricedCount).toBe(shopping.total.unpricedCount);
    expect(res.body.items.find((item: { name: string }) => item.name === 'Сіль')).toMatchObject({
      quantityMilli: 5,
      expectedUnitPrice: null,
      expectedTotal: null,
    });

    const named = await user.post('/api/menu/shopping-list', { ...day, name: '  На понеділок ' });
    expect(named.status).toBe(201);
    expect(named.body.name).toBe('На понеділок');
  });

  it('AC10: список — знімок; повторне створення дає ще один список', async () => {
    const { user, meals, products, dishes } = await weekOfBuckwheat();
    const first = await user.post('/api/menu/shopping-list', WEEK);
    expect(first.status).toBe(201);

    await user.patch(`/api/products/${products.buckwheat}`, { price: 8000 });
    await addEntry(user, {
      date: '2026-10-30',
      mealTypeId: meals.breakfast,
      dishId: dishes.porridge,
    });

    const unchanged = await user.get(`/api/shopping-lists/${first.body.id}`);
    expect(unchanged.body).toEqual(first.body);

    const second = await user.post('/api/menu/shopping-list', WEEK);
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
    expect(second.body.items[0]).toMatchObject({
      name: 'Гречка',
      quantityMilli: 900,
      expectedUnitPrice: 8000,
    });
    expect(await listCount(user)).toBe(2);
  });

  it('AC11: порожній перелік — 400 без списку; невалідний період чи назва — 400', async () => {
    const { user, meals } = await kitchen();
    const empty = await user.post('/api/menu/shopping-list', WEEK);
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toBe('За цей період у меню немає продуктів');

    const tea = await createDish(user, 'Чай');
    await addEntry(user, { date: '2026-10-26', mealTypeId: meals.breakfast, dishId: tea });
    const noIngredients = await user.post('/api/menu/shopping-list', WEEK);
    expect(noIngredients.status).toBe(400);
    expect(noIngredients.body.error.message).toBe('За цей період у меню немає продуктів');

    for (const body of [
      { ...WEEK, name: '' },
      { ...WEEK, name: '   ' },
      { ...WEEK, name: 'а'.repeat(101) },
      { from: '2026-10-26', to: '2026-10-26' },
      { from: '2026-10-01', to: '2026-12-03' },
      { from: '2026-02-30', to: '2026-03-02' },
      { from: '2026-10-26' },
      {},
    ]) {
      const res = await user.post('/api/menu/shopping-list', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await listCount(user)).toBe(0);
  });

  it('AC12: кількість понад межу рядка — 400, ні списку, ні рядків', async () => {
    const { user, meals, products } = await kitchen();
    const sand = await createProduct(user, { name: 'Пісок', unit: 'kg' });
    // Мільйон кілограмів на порцію — межа рядка; дві порції — понад неї.
    const dish = await createDish(user, 'Піщаний замок', [
      { productId: products.buckwheat, quantityMilli: 100 },
      { productId: sand, quantityMilli: 1_000_000_000 },
    ]);
    await addEntry(user, {
      date: '2026-10-26',
      mealTypeId: meals.lunch,
      dishId: dish,
      servings: 2,
    });

    const shopping = await getShopping(user);
    expect(shopping.items.find((item: { name: string }) => item.name === 'Пісок')).toMatchObject({
      quantityMilli: 2_000_000_000,
    });

    const res = await user.post('/api/menu/shopping-list', WEEK);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Кількість продукту «Пісок» завелика для списку покупок');
    expect(await listCount(user)).toBe(0);
    expect(await harness.db.select().from(shoppingListItems)).toEqual([]);
    expect(await harness.db.select().from(shoppingLists)).toEqual([]);
  });

  it('AC13: архівний продукт зі складу потрапляє в список і повертається в довідник', async () => {
    const { user, products } = await weekOfBuckwheat();
    const archived = await user.patch(`/api/products/${products.oil}`, { isArchived: true });
    expect(archived.status).toBe(200);
    expect((await getShopping(user)).items[1]).toMatchObject({ name: 'Олія', isArchived: true });

    const res = await user.post('/api/menu/shopping-list', WEEK);
    expect(res.status).toBe(201);
    expect(res.body.items.map((item: { name: string }) => item.name)).toEqual(['Гречка', 'Олія']);

    const catalog = await user.get('/api/products');
    expect(catalog.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: products.oil, isArchived: false })]),
    );
    expect((await getShopping(user)).items[1]).toMatchObject({ isArchived: false });
  });
});

describe('покупки за меню: доступ', () => {
  it('AC14: інше домогосподарство не бачить чужого меню й не створює з нього список', async () => {
    const { user } = await weekOfBuckwheat();
    const stranger = await registerUser(harness);

    expect(await getShopping(stranger)).toMatchObject({ entryCount: 0, items: [] });
    const res = await stranger.post('/api/menu/shopping-list', WEEK);
    expect(res.status).toBe(400);
    expect(await listCount(stranger)).toBe(0);
    expect(await listCount(user)).toBe(0);
  });

  it('AC14: без токена — 401', async () => {
    expect((await request(app).get(shoppingUrl(WEEK))).status).toBe(401);
    expect((await request(app).post('/api/menu/shopping-list').send(WEEK)).status).toBe(401);
  });

  it('AC14: учасник (member) отримує перелік і створює список', async () => {
    const { owner, member } = await ownerWithMember(harness);
    const meal = await owner.post('/api/meal-types', { name: 'Обід' });
    expect(meal.status).toBe(201);
    const rice = await createProduct(owner, { name: 'Рис', unit: 'kg', price: 6000 });
    const dish = await createDish(owner, 'Рис варений', [{ productId: rice, quantityMilli: 100 }]);
    await addEntry(owner, { date: '2026-10-26', mealTypeId: meal.body.id, dishId: dish });

    const shopping = await member.get(shoppingUrl(WEEK));
    expect(shopping.status).toBe(200);
    expect(shopping.body.total.cost).toBe(600);
    const res = await member.post('/api/menu/shopping-list', WEEK);
    expect(res.status).toBe(201);
    expect(await listCount(owner)).toBe(1);
  });
});
