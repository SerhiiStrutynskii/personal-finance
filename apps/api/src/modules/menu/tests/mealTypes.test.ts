import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { households, mealTypes } from '../../../db/schema.ts';
import { setupTestApp } from '../../../test/harness.ts';
import { addEntry, mealTypeNames, ownerWithMember, registerUser } from './helpers.ts';

const harness = setupTestApp();
const { app, db, createActor } = harness;

const DEFAULTS = ['Сніданок', 'Обід', 'Вечеря'];

describe('типові прийоми їжі', () => {
  it('нова реєстрація створює Сніданок, Обід, Вечеря в цьому порядку', async () => {
    const user = await registerUser(harness);
    const res = await user.get('/api/meal-types');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      { id: expect.any(String), name: 'Сніданок', position: 0 },
      { id: expect.any(String), name: 'Обід', position: 1 },
      { id: expect.any(String), name: 'Вечеря', position: 2 },
    ]);
  });

  it('нове домогосподарство учасника, який вийшов або якого вилучили, теж має типові', async () => {
    const left = await ownerWithMember(harness);
    // Спільний довідник власника, щоб відрізнити його від нового.
    await left.owner.post('/api/meal-types', { name: 'Перекус' });
    expect(await mealTypeNames(left.member)).toEqual(['Перекус']);
    expect((await left.member.post('/api/household/leave', {})).status).toBe(204);
    expect(await mealTypeNames(left.member)).toEqual(DEFAULTS);

    const removed = await ownerWithMember(harness);
    const { body } = await removed.owner.get('/api/household');
    const memberId = body.members.find((m: { role: string }) => m.role === 'member').userId;
    expect((await removed.owner.delete(`/api/household/members/${memberId}`)).status).toBe(204);
    expect(await mealTypeNames(removed.member)).toEqual(DEFAULTS);
  });

  it('міграція 0015 заповнює типові лише домогосподарствам без прийомів їжі й не дублює', async () => {
    const migration = readFileSync(
      new URL('../../../../drizzle/0015_menu.sql', import.meta.url),
      'utf8',
    );
    const backfill = migration.split('--> statement-breakpoint').at(-1)!;
    expect(backfill).toContain('INSERT INTO "meal_types"');

    const empty = await createActor(); // harness не створює типових
    const custom = await createActor();
    await custom.post('/api/meal-types', { name: 'Полуденок' });
    expect(await mealTypeNames(empty)).toEqual([]);

    await db.execute(sql.raw(backfill));
    await db.execute(sql.raw(backfill));

    expect(await mealTypeNames(empty)).toEqual(DEFAULTS);
    expect(await mealTypeNames(custom)).toEqual(['Полуденок']);
    // Ключ назви — у нижньому регістрі, тож дублікат «обід» відхиляється.
    const keys = await db
      .select({ key: mealTypes.nameKey })
      .from(mealTypes)
      .where(eq(mealTypes.householdId, empty.householdId))
      .orderBy(asc(mealTypes.position));
    expect(keys.map((k) => k.key)).toEqual(['сніданок', 'обід', 'вечеря']);
    expect((await empty.post('/api/meal-types', { name: 'ОБІД' })).status).toBe(409);
    expect(await db.$count(households)).toBe(2);
  });
});

describe('прийоми їжі', () => {
  it('додає прийом їжі в кінець, обрізаючи пробіли', async () => {
    const user = await registerUser(harness);
    const res = await user.post('/api/meal-types', { name: '  Перекус ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), name: 'Перекус', position: 3 });
    expect(await mealTypeNames(user)).toEqual([...DEFAULTS, 'Перекус']);
  });

  it('у порожньому довіднику новий запис отримує позицію 0', async () => {
    const actor = await createActor();
    expect((await actor.post('/api/meal-types', { name: 'Сніданок' })).body.position).toBe(0);
  });

  it('не допускає дублікатів без урахування регістру й пробілів і відхиляє некоректні назви', async () => {
    const user = await registerUser(harness);
    expect((await user.post('/api/meal-types', { name: 'обід' })).status).toBe(409);
    expect((await user.post('/api/meal-types', { name: '  ВЕЧЕРЯ  ' })).status).toBe(409);

    const items = (await user.get('/api/meal-types')).body.items;
    const rename = await user.patch(`/api/meal-types/${items[0].id}`, { name: 'Обід' });
    expect(rename.status).toBe(409);
    expect(rename.body.error.code).toBe('CONFLICT');

    for (const name of ['', '   ', 'я'.repeat(101)]) {
      expect((await user.post('/api/meal-types', { name })).status).toBe(400);
      expect((await user.patch(`/api/meal-types/${items[0].id}`, { name })).status).toBe(400);
    }
    expect((await user.post('/api/meal-types', {})).status).toBe(400);
    expect((await user.post('/api/meal-types', { name: 'я'.repeat(100) })).status).toBe(201);
    expect(await mealTypeNames(user)).toEqual([...DEFAULTS, 'я'.repeat(100)]);
  });

  it('перейменовує запис, і він лишається на тому самому місці', async () => {
    const user = await registerUser(harness);
    const [, lunch] = (await user.get('/api/meal-types')).body.items;
    const res = await user.patch(`/api/meal-types/${lunch.id}`, { name: ' Ланч ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: lunch.id, name: 'Ланч', position: 1 });
    expect(await mealTypeNames(user)).toEqual(['Сніданок', 'Ланч', 'Вечеря']);
    // Зміна лише регістру своєї назви — не дублікат.
    expect((await user.patch(`/api/meal-types/${lunch.id}`, { name: 'ЛАНЧ' })).status).toBe(200);
  });

  it('змінює порядок за повним набором id', async () => {
    const user = await registerUser(harness);
    const [breakfast, lunch, dinner] = (await user.get('/api/meal-types')).body.items;
    const res = await user.put('/api/meal-types/order', {
      ids: [dinner.id, breakfast.id, lunch.id],
    });
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      { id: dinner.id, name: 'Вечеря', position: 0 },
      { id: breakfast.id, name: 'Сніданок', position: 1 },
      { id: lunch.id, name: 'Обід', position: 2 },
    ]);
    expect(await mealTypeNames(user)).toEqual(['Вечеря', 'Сніданок', 'Обід']);
  });

  it('відхиляє неповний, зайвий, чужий, повторний чи порожній набір і не змінює порядку', async () => {
    const user = await registerUser(harness);
    const stranger = await registerUser(harness);
    const [a, b, c] = (await user.get('/api/meal-types')).body.items.map(
      (item: { id: string }) => item.id,
    );
    const [foreign] = (await stranger.get('/api/meal-types')).body.items.map(
      (item: { id: string }) => item.id,
    );
    const invalid = [
      [c, b],
      [c, b, a, randomUUID()],
      [c, b, foreign],
      [c, b, a, foreign],
      [c, b, b],
      [c, b, a, a],
      [],
      ['not-a-uuid', a, b],
    ];
    for (const ids of invalid) {
      const res = await user.put('/api/meal-types/order', { ids });
      expect(res.status, JSON.stringify(ids)).toBe(400);
    }
    expect((await user.put('/api/meal-types/order', {})).status).toBe(400);
    expect(await mealTypeNames(user)).toEqual(DEFAULTS);
    expect(await mealTypeNames(stranger)).toEqual(DEFAULTS);
  });

  it('видаляє записи, зокрема всі; повторне видалення — 404', async () => {
    const user = await registerUser(harness);
    const items = (await user.get('/api/meal-types')).body.items;
    expect((await user.delete(`/api/meal-types/${items[1].id}`)).status).toBe(204);
    expect(await mealTypeNames(user)).toEqual(['Сніданок', 'Вечеря']);
    // Позиції решти не перераховуються, а новий запис стає в кінець.
    expect((await user.post('/api/meal-types', { name: 'Перекус' })).body.position).toBe(3);

    for (const item of (await user.get('/api/meal-types')).body.items) {
      expect((await user.delete(`/api/meal-types/${item.id}`)).status).toBe(204);
    }
    expect((await user.get('/api/meal-types')).body.items).toEqual([]);
    expect((await user.delete(`/api/meal-types/${items[0].id}`)).status).toBe(404);
  });
});

describe('прийоми їжі в календарі меню', () => {
  it('AC14: прийом їжі з записами меню не видалити (409), а після очищення — можна', async () => {
    const user = await registerUser(harness);
    const [, lunch] = (await user.get('/api/meal-types')).body.items;
    const dish = await user.post('/api/dishes', { name: 'Борщ' });
    const other = await user.post('/api/dishes', { name: 'Хліб' });
    const entries = [
      await addEntry(user, { date: '2026-10-26', mealTypeId: lunch.id, dishId: dish.body.id }),
      await addEntry(user, { date: '2026-10-26', mealTypeId: lunch.id, dishId: other.body.id }),
    ];

    const res = await user.delete(`/api/meal-types/${lunch.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe(
      'Прийом їжі використовується в меню. Приберіть його страви з календаря, щоб видалити',
    );
    expect(await mealTypeNames(user)).toEqual(DEFAULTS);

    for (const entry of entries) {
      expect((await user.delete(`/api/menu/entries/${entry.id}`)).status).toBe(204);
    }
    expect((await user.delete(`/api/meal-types/${lunch.id}`)).status).toBe(204);
    expect(await mealTypeNames(user)).toEqual(['Сніданок', 'Вечеря']);
  });
});

describe('доступ до прийомів їжі', () => {
  it('чужі записи не видно й не змінити', async () => {
    const owner = await registerUser(harness);
    const stranger = await registerUser(harness);
    const [breakfast] = (await owner.get('/api/meal-types')).body.items;

    const strangerIds = (await stranger.get('/api/meal-types')).body.items.map(
      (item: { id: string }) => item.id,
    );
    expect(strangerIds).not.toContain(breakfast.id);
    expect((await stranger.patch(`/api/meal-types/${breakfast.id}`, { name: 'Х' })).status).toBe(
      404,
    );
    expect((await stranger.delete(`/api/meal-types/${breakfast.id}`)).status).toBe(404);
    expect((await stranger.patch(`/api/meal-types/${randomUUID()}`, { name: 'Х' })).status).toBe(
      404,
    );
    expect((await stranger.patch('/api/meal-types/not-a-uuid', { name: 'Х' })).status).toBe(400);
    expect(await mealTypeNames(owner)).toEqual(DEFAULTS);
  });

  it('без access-токена — 401', async () => {
    const id = randomUUID();
    expect((await request(app).get('/api/meal-types')).status).toBe(401);
    expect((await request(app).post('/api/meal-types').send({ name: 'Х' })).status).toBe(401);
    expect(
      (
        await request(app)
          .put('/api/meal-types/order')
          .send({ ids: [id] })
      ).status,
    ).toBe(401);
    expect((await request(app).patch(`/api/meal-types/${id}`).send({ name: 'Х' })).status).toBe(
      401,
    );
    expect((await request(app).delete(`/api/meal-types/${id}`)).status).toBe(401);
  });

  it('учасник (member) веде довідник нарівні з власником', async () => {
    const { owner, member } = await ownerWithMember(harness);
    const created = await member.post('/api/meal-types', { name: 'Перекус' });
    expect(created.status).toBe(201);
    expect(
      (await member.patch(`/api/meal-types/${created.body.id}`, { name: 'Полуденок' })).status,
    ).toBe(200);
    const second = await member.post('/api/meal-types', { name: 'Пізня вечеря' });
    expect(
      (await member.put('/api/meal-types/order', { ids: [second.body.id, created.body.id] }))
        .status,
    ).toBe(200);
    expect(await mealTypeNames(owner)).toEqual(['Пізня вечеря', 'Полуденок']);
    expect((await member.delete(`/api/meal-types/${created.body.id}`)).status).toBe(204);
    expect(await mealTypeNames(owner)).toEqual(['Пізня вечеря']);
  });
});
