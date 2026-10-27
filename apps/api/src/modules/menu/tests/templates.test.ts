import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
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

const SOURCE = '2026-10-26';
const TARGET = '2026-10-28';

interface EntryBody {
  id: string;
  date: string;
  mealTypeId: string;
  kind: 'dish' | 'product';
  dishId?: string;
  servings?: number;
  productId?: string;
  quantityMilli?: number;
  cost: number;
  isArchived?: boolean;
}

async function dayEntries(actor: Client, date: string): Promise<EntryBody[]> {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const res = await actor.get(`/api/menu?from=${date}&to=${next.toISOString().slice(0, 10)}`);
  expect(res.status).toBe(200);
  return res.body.entries as EntryBody[];
}

/** Вміст записів без id і дати — для порівняння дня з шаблоном. */
const content = (entries: readonly EntryBody[]) =>
  entries
    .map((entry) =>
      entry.kind === 'dish'
        ? `${entry.mealTypeId}|dish|${entry.dishId}|${entry.servings}`
        : `${entry.mealTypeId}|product|${entry.productId}|${entry.quantityMilli}`,
    )
    .sort();

async function addProductEntry(
  actor: Client,
  body: { date: string; mealTypeId: string; productId: string; quantityMilli: number },
) {
  const res = await actor.post('/api/menu/entries', body);
  expect(res.status).toBe(201);
  return res.body as EntryBody;
}

async function templates(actor: Client) {
  const res = await actor.get('/api/menu/templates');
  expect(res.status).toBe(200);
  return res.body.items as { id: string; name: string; itemCount: number }[];
}

async function saveTemplate(actor: Client, name: string, date = SOURCE) {
  const res = await actor.post('/api/menu/templates', { name, date });
  expect(res.status).toBe(201);
  return res.body as { id: string; name: string; itemCount: number };
}

/**
 * Користувач із днем SOURCE: на обід гречка 2 порції (порція 0,15 кг × 4000 = 600),
 * на сніданок молоко 0,5 л (× 5000 = 2500).
 */
async function kitchen(actor?: Client) {
  const user = actor ?? (await registerUser(harness));
  const [breakfast, lunch, dinner] = (await mealTypeIds(user)) as [string, string, string];
  const buckwheat = await createProduct(user, { name: 'Гречка', unit: 'kg', price: 4000 });
  const milk = await createProduct(user, { name: 'Молоко', unit: 'l', price: 5000 });
  const dishes = {
    buckwheat: await createDish(user, 'Гречка варена', [
      { productId: buckwheat, quantityMilli: 150 },
    ]),
    porridge: await createDish(user, 'Каша', [{ productId: milk, quantityMilli: 100 }]),
  };
  await addEntry(user, { date: SOURCE, mealTypeId: lunch, dishId: dishes.buckwheat, servings: 2 });
  await addProductEntry(user, {
    date: SOURCE,
    mealTypeId: breakfast,
    productId: milk,
    quantityMilli: 500,
  });
  return { user, meals: { breakfast, lunch, dinner }, dishes, products: { buckwheat, milk } };
}

describe('шаблони меню дня', () => {
  it('AC1: збереження дня — 201, назва обрізана, 2 позиції; шаблон є в списку', async () => {
    const { user } = await kitchen();
    const res = await user.post('/api/menu/templates', { name: '  Будній день ', date: SOURCE });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'Будній день',
      itemCount: 2,
      createdAt: expect.any(String),
    });
    expect(await templates(user)).toEqual([res.body]);
  });

  it('AC1: список за українським алфавітом', async () => {
    const { user } = await kitchen();
    for (const name of ['Їжа', 'Вихідний', 'Будній', 'Іспит']) await saveTemplate(user, name);
    expect((await templates(user)).map((t) => t.name)).toEqual([
      'Будній',
      'Вихідний',
      'Іспит',
      'Їжа',
    ]);
  });

  it('AC2: порожній день — 400, шаблон не створюється', async () => {
    const { user } = await kitchen();
    const res = await user.post('/api/menu/templates', { name: 'Порожній', date: TARGET });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('У дні немає страв чи продуктів');
    expect(await templates(user)).toEqual([]);
  });

  it('AC3: дубль назви — 409 у POST і PATCH; в іншому домогосподарстві дозволено', async () => {
    const { user } = await kitchen();
    await saveTemplate(user, 'Будній день');
    const duplicate = await user.post('/api/menu/templates', {
      name: ' будній ДЕНЬ ',
      date: SOURCE,
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.message).toBe('Шаблон з такою назвою вже є');

    const weekend = await saveTemplate(user, 'Вихідний');
    const rename = await user.patch(`/api/menu/templates/${weekend.id}`, { name: 'будній день' });
    expect(rename.status).toBe(409);
    expect((await templates(user)).map((t) => t.name)).toEqual(['Будній день', 'Вихідний']);

    const { user: other } = await kitchen();
    expect((await saveTemplate(other, 'Будній день')).name).toBe('Будній день');
  });

  it('AC4: застосування до порожнього дня відтворює записи з новими id', async () => {
    const { user } = await kitchen();
    const template = await saveTemplate(user, 'Будній день');
    const res = await user.post(`/api/menu/templates/${template.id}/apply`, { date: TARGET });
    expect(res.status).toBe(200);
    expect(res.body.from).toBe(TARGET);
    expect(res.body.to).toBe('2026-10-29');
    expect(res.body.days).toEqual([
      { date: TARGET, cost: 1200 + 2500, isPriceComplete: true, entryCount: 2 },
    ]);

    const source = await dayEntries(user, SOURCE);
    const target = await dayEntries(user, TARGET);
    expect(content(target)).toEqual(content(source));
    expect(target.every((entry) => entry.date === TARGET)).toBe(true);
    const sourceIds = new Set(source.map((entry) => entry.id));
    expect(target.some((entry) => sourceIds.has(entry.id))).toBe(false);
    expect(res.body.entries).toEqual(target);
  });

  it('AC5: застосування замінює день: зайві записи зникають, порції — з шаблону', async () => {
    const { user, meals, dishes } = await kitchen();
    const template = await saveTemplate(user, 'Будній день');
    await addEntry(user, {
      date: TARGET,
      mealTypeId: meals.lunch,
      dishId: dishes.buckwheat,
      servings: 5,
    });
    await addEntry(user, { date: TARGET, mealTypeId: meals.dinner, dishId: dishes.porridge });
    const otherDay = await addEntry(user, {
      date: '2026-10-27',
      mealTypeId: meals.dinner,
      dishId: dishes.porridge,
    });

    const res = await user.post(`/api/menu/templates/${template.id}/apply`, { date: TARGET });
    expect(res.status).toBe(200);
    const target = await dayEntries(user, TARGET);
    expect(content(target)).toEqual(content(await dayEntries(user, SOURCE)));
    expect(target.find((entry) => entry.dishId === dishes.buckwheat)?.servings).toBe(2);
    expect(target.some((entry) => entry.dishId === dishes.porridge)).toBe(false);
    expect((await dayEntries(user, '2026-10-27')).map((entry) => entry.id)).toEqual([otherDay.id]);
  });

  it('AC6: вартість застосованого дня — за поточними цінами', async () => {
    const { user, products } = await kitchen();
    const template = await saveTemplate(user, 'Будній день');
    const patch = await user.patch(`/api/products/${products.milk}`, { price: 6000 });
    expect(patch.status).toBe(200);
    const res = await user.post(`/api/menu/templates/${template.id}/apply`, { date: TARGET });
    expect(res.status).toBe(200);
    // 0,5 л × 6000 = 3000, гречка 2 × 600 = 1200.
    expect(res.body.days[0].cost).toBe(4200);
    expect(
      (await dayEntries(user, TARGET)).find((entry) => entry.productId === products.milk)?.cost,
    ).toBe(3000);
  });

  it('AC7: зміни дня-джерела не змінюють шаблон; застосування до джерела дозволене', async () => {
    const { user, dishes } = await kitchen();
    const template = await saveTemplate(user, 'Будній день');
    const before = content(await dayEntries(user, SOURCE));
    const source = await dayEntries(user, SOURCE);
    const dish = source.find((entry) => entry.dishId === dishes.buckwheat)!;
    const milk = source.find((entry) => entry.kind === 'product')!;
    expect((await user.patch(`/api/menu/entries/${dish.id}`, { servings: 7 })).status).toBe(200);
    expect((await user.delete(`/api/menu/entries/${milk.id}`)).status).toBe(204);
    expect((await templates(user))[0]!.itemCount).toBe(2);

    await user.post(`/api/menu/templates/${template.id}/apply`, { date: TARGET }).expect(200);
    expect(content(await dayEntries(user, TARGET))).toEqual(before);

    await user.post(`/api/menu/templates/${template.id}/apply`, { date: SOURCE }).expect(200);
    expect(content(await dayEntries(user, SOURCE))).toEqual(before);
  });

  it('AC8: перейменування й видалення шаблону не змінюють днів', async () => {
    const { user } = await kitchen();
    const template = await saveTemplate(user, 'Будній день');
    await user.post(`/api/menu/templates/${template.id}/apply`, { date: TARGET }).expect(200);
    const applied = await dayEntries(user, TARGET);

    const rename = await user.patch(`/api/menu/templates/${template.id}`, { name: ' Робочий ' });
    expect(rename.status).toBe(200);
    expect(rename.body).toEqual({ ...template, name: 'Робочий' });
    expect(await dayEntries(user, TARGET)).toEqual(applied);

    expect((await user.delete(`/api/menu/templates/${template.id}`)).status).toBe(204);
    expect(await templates(user)).toEqual([]);
    expect(await dayEntries(user, TARGET)).toEqual(applied);
    expect(await dayEntries(user, SOURCE)).toHaveLength(2);
  });

  it('AC9: видалена страва зникає з шаблону, решта застосовується', async () => {
    const { user, meals, dishes } = await kitchen();
    const porridge = await addEntry(user, {
      date: SOURCE,
      mealTypeId: meals.dinner,
      dishId: dishes.porridge,
    });
    const template = await saveTemplate(user, 'Будній день');
    expect(template.itemCount).toBe(3);

    // Страва в календарі — як і раніше 409.
    expect((await user.delete(`/api/dishes/${dishes.porridge}`)).status).toBe(409);
    await user.delete(`/api/menu/entries/${porridge.id}`).expect(204);
    expect((await user.delete(`/api/dishes/${dishes.porridge}`)).status).toBe(204);
    expect((await templates(user))[0]!.itemCount).toBe(2);

    await user.post(`/api/menu/templates/${template.id}/apply`, { date: TARGET }).expect(200);
    expect(content(await dayEntries(user, TARGET))).toEqual(
      content(await dayEntries(user, SOURCE)),
    );
  });

  it('AC9: видалений прийом їжі зникає з шаблону разом з позиціями', async () => {
    const { user, meals, dishes } = await kitchen();
    const snack = await user.post('/api/meal-types', { name: 'Перекус' });
    expect(snack.status).toBe(201);
    const entry = await addEntry(user, {
      date: SOURCE,
      mealTypeId: snack.body.id,
      dishId: dishes.porridge,
    });
    const template = await saveTemplate(user, 'Будній день');
    expect(template.itemCount).toBe(3);

    expect((await user.delete(`/api/meal-types/${snack.body.id}`)).status).toBe(409);
    await user.delete(`/api/menu/entries/${entry.id}`).expect(204);
    expect((await user.delete(`/api/meal-types/${snack.body.id}`)).status).toBe(204);
    expect((await templates(user))[0]!.itemCount).toBe(2);

    await user.post(`/api/menu/templates/${template.id}/apply`, { date: TARGET }).expect(200);
    const target = await dayEntries(user, TARGET);
    expect(target).toHaveLength(2);
    expect(target.some((row) => row.mealTypeId === snack.body.id)).toBe(false);
    expect(target.some((row) => row.mealTypeId === meals.lunch)).toBe(true);
  });

  it('AC10: продукт із шаблону не видаляється; архівний застосовується й лишається архівним', async () => {
    const { user, products } = await kitchen();
    const template = await saveTemplate(user, 'Будній день');
    const milkEntry = (await dayEntries(user, SOURCE)).find((entry) => entry.kind === 'product')!;
    await user.delete(`/api/menu/entries/${milkEntry.id}`).expect(204);
    // Молоко лишилося лише в шаблоні (і в складі каші) — видалимо кашу, щоб лишився тільки шаблон.
    const dishes = (await user.get('/api/dishes')).body.items as { id: string; name: string }[];
    await user.delete(`/api/dishes/${dishes.find((d) => d.name === 'Каша')!.id}`).expect(204);

    const res = await user.delete(`/api/products/${products.milk}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('шаблонах меню');

    await user.patch(`/api/products/${products.milk}`, { isArchived: true }).expect(200);
    expect((await templates(user))[0]!.itemCount).toBe(2);
    await user.post(`/api/menu/templates/${template.id}/apply`, { date: TARGET }).expect(200);
    const applied = (await dayEntries(user, TARGET)).find((entry) => entry.kind === 'product');
    expect(applied).toMatchObject({
      productId: products.milk,
      quantityMilli: 500,
      isArchived: true,
    });
    const product = await user.get(`/api/products?archived=true`);
    expect(
      (product.body.items as { id: string; isArchived: boolean }[]).find(
        (item) => item.id === products.milk,
      )?.isArchived,
    ).toBe(true);
  });

  it('AC11: шаблон без позицій — itemCount 0, застосування 400, день не змінюється', async () => {
    const user = await registerUser(harness);
    const [, lunch] = (await mealTypeIds(user)) as [string, string];
    const soup = await createDish(user, 'Суп');
    const tea = await createDish(user, 'Чай');
    const entry = await addEntry(user, { date: SOURCE, mealTypeId: lunch, dishId: soup });
    const template = await saveTemplate(user, 'Суповий');
    await user.delete(`/api/menu/entries/${entry.id}`).expect(204);
    await user.delete(`/api/dishes/${soup}`).expect(204);
    expect((await templates(user))[0]!.itemCount).toBe(0);

    await addEntry(user, { date: TARGET, mealTypeId: lunch, dishId: tea });
    const before = await dayEntries(user, TARGET);
    const res = await user.post(`/api/menu/templates/${template.id}/apply`, { date: TARGET });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Шаблон порожній');
    expect(await dayEntries(user, TARGET)).toEqual(before);
  });

  it('AC12: чужі шаблони — 404, не видно; збереження бере лише свої записи', async () => {
    const { user: owner } = await kitchen();
    const template = await saveTemplate(owner, 'Будній день');
    const { user: stranger, meals, dishes } = await kitchen();
    await addEntry(stranger, { date: TARGET, mealTypeId: meals.dinner, dishId: dishes.porridge });
    const strangerDay = await dayEntries(stranger, TARGET);

    expect(await templates(stranger)).toEqual([]);
    for (const res of [
      await stranger.patch(`/api/menu/templates/${template.id}`, { name: 'Чужий' }),
      await stranger.post(`/api/menu/templates/${template.id}/apply`, { date: TARGET }),
      await stranger.delete(`/api/menu/templates/${template.id}`),
    ]) {
      expect(res.status).toBe(404);
    }
    expect(await templates(owner)).toEqual([template]);
    expect(await dayEntries(stranger, TARGET)).toEqual(strangerDay);

    // У власника день TARGET порожній, а в чужого є запис — збереження його не бере.
    const empty = await owner.post('/api/menu/templates', { name: 'Чужий день', date: TARGET });
    expect(empty.status).toBe(400);
    // У SOURCE в обох по 2 записи — у шаблоні лише свої.
    const own = await saveTemplate(stranger, 'Свій');
    expect(own.itemCount).toBe(2);
  });

  it('AC13: учасник веде шаблони власника; без токена — 401', async () => {
    const { owner, member } = await ownerWithMember(harness);
    // Власник створений напряму в БД, без типових прийомів їжі.
    for (const name of ['Сніданок', 'Обід', 'Вечеря']) {
      await owner.post('/api/meal-types', { name }).expect(201);
    }
    await kitchen(owner);
    const created = await member.post('/api/menu/templates', {
      name: 'Від учасника',
      date: SOURCE,
    });
    expect(created.status).toBe(201);
    const ownerTemplate = await saveTemplate(owner, 'Від власника');
    expect((await templates(member)).map((t) => t.name)).toEqual(['Від власника', 'Від учасника']);
    await member
      .post(`/api/menu/templates/${ownerTemplate.id}/apply`, { date: TARGET })
      .expect(200);
    await member.patch(`/api/menu/templates/${ownerTemplate.id}`, { name: 'Інша' }).expect(200);
    await member.delete(`/api/menu/templates/${ownerTemplate.id}`).expect(204);
    expect((await templates(owner)).map((t) => t.name)).toEqual(['Від учасника']);
    expect(await dayEntries(owner, TARGET)).toHaveLength(2);

    const id = created.body.id as string;
    for (const res of [
      await request(app).get('/api/menu/templates'),
      await request(app).post('/api/menu/templates').send({ name: 'Х', date: SOURCE }),
      await request(app).patch(`/api/menu/templates/${id}`).send({ name: 'Х' }),
      await request(app).delete(`/api/menu/templates/${id}`),
      await request(app).post(`/api/menu/templates/${id}/apply`).send({ date: TARGET }),
    ]) {
      expect(res.status).toBe(401);
    }
  });

  it('AC14: валідація — 400, нічого не змінюється', async () => {
    const { user } = await kitchen();
    const template = await saveTemplate(user, 'Будній день');
    const bad = [
      await user.post('/api/menu/templates', { name: '   ', date: SOURCE }),
      await user.post('/api/menu/templates', { name: 'я'.repeat(101), date: SOURCE }),
      await user.post('/api/menu/templates', { name: 'День', date: '2026-02-30' }),
      await user.post('/api/menu/templates', { name: 'День', date: '26-10-2026' }),
      await user.post('/api/menu/templates', { name: 'День', date: SOURCE, items: [] }),
      await user.post('/api/menu/templates', { date: SOURCE }),
      await user.patch(`/api/menu/templates/${template.id}`, { name: '' }),
      await user.patch(`/api/menu/templates/${template.id}`, { name: 'День', extra: 1 }),
      await user.patch('/api/menu/templates/not-a-uuid', { name: 'День' }),
      await user.delete('/api/menu/templates/not-a-uuid'),
      await user.post(`/api/menu/templates/${template.id}/apply`, { date: '2026-02-30' }),
      await user.post(`/api/menu/templates/${template.id}/apply`, { date: '26-10-2026' }),
      await user.post(`/api/menu/templates/${template.id}/apply`, { date: TARGET, force: true }),
      await user.post('/api/menu/templates/not-a-uuid/apply', { date: TARGET }),
    ];
    for (const res of bad) expect(res.status).toBe(400);
    expect(await templates(user)).toEqual([template]);
    expect(await dayEntries(user, TARGET)).toEqual([]);

    const missing = await user.post(`/api/menu/templates/${randomUUID()}/apply`, { date: TARGET });
    expect(missing.status).toBe(404);
  });
});
