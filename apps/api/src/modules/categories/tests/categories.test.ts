import { describe, expect, it } from 'vitest';
import { ensureSystemCategory } from '../repo.ts';
import { setupTestApp } from '../../../test/harness.ts';

const { db, createActor, setNow } = setupTestApp();

describe('categories', () => {
  it('створює, перейменовує і видаляє категорію', async () => {
    const actor = await createActor();
    const created = await actor.post('/api/categories', { name: 'Продукти', kind: 'expense' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Продукти', kind: 'expense' });

    const renamed = await actor.patch(`/api/categories/${created.body.id}`, { name: 'Їжа' });
    expect(renamed.body.name).toBe('Їжа');

    expect((await actor.delete(`/api/categories/${created.body.id}`)).status).toBe(204);
    expect((await actor.get('/api/categories')).body.items).toEqual([]);
  });

  it('відхиляє некоректні дані', async () => {
    const actor = await createActor();
    expect((await actor.post('/api/categories', { name: 'Їжа', kind: 'transfer' })).status).toBe(
      400,
    );
    expect((await actor.post('/api/categories', { name: ' ', kind: 'expense' })).status).toBe(400);
  });

  it('не допускає дублікатів у межах домогосподарства й типу', async () => {
    const actor = await createActor();
    const other = await createActor();
    await actor.post('/api/categories', { name: 'Подарунки', kind: 'expense' });

    expect(
      (await actor.post('/api/categories', { name: 'Подарунки', kind: 'expense' })).status,
    ).toBe(409);
    // та сама назва дозволена для іншого типу та в іншому домогосподарстві
    expect(
      (await actor.post('/api/categories', { name: 'Подарунки', kind: 'income' })).status,
    ).toBe(201);
    expect(
      (await other.post('/api/categories', { name: 'Подарунки', kind: 'expense' })).status,
    ).toBe(201);

    const { body: second } = await actor.post('/api/categories', { name: 'Інше', kind: 'expense' });
    expect((await actor.patch(`/api/categories/${second.id}`, { name: 'Подарунки' })).status).toBe(
      409,
    );
  });

  it('ізолює категорії між домогосподарствами', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const { body: category } = await owner.post('/api/categories', {
      name: 'Продукти',
      kind: 'expense',
    });

    expect((await stranger.get('/api/categories')).body.items).toEqual([]);
    expect((await stranger.get(`/api/categories/${category.id}`)).status).toBe(404);
    expect((await stranger.patch(`/api/categories/${category.id}`, { name: 'x' })).status).toBe(
      404,
    );
    expect((await stranger.delete(`/api/categories/${category.id}`)).status).toBe(404);
  });

  it('не видаляє категорію, яка використовується', async () => {
    setNow('2026-03-15T12:00:00Z');
    const actor = await createActor();
    const { body: account } = await actor.post('/api/accounts', { name: 'Картка', type: 'card' });
    const { body: category } = await actor.post('/api/categories', {
      name: 'Продукти',
      kind: 'expense',
    });
    await actor.post('/api/transactions', {
      type: 'expense',
      accountId: account.id,
      categoryId: category.id,
      amountMinor: 100,
      occurredAt: '2026-03-01T10:00:00Z',
    });

    expect((await actor.delete(`/api/categories/${category.id}`)).status).toBe(409);
  });

  it('звичайна категорія не має системного ключа', async () => {
    const actor = await createActor();
    const { body } = await actor.post('/api/categories', { name: 'Продукти', kind: 'expense' });
    expect(body.systemKey).toBeNull();
  });

  it('системна категорія створюється один раз і не змінюється й не видаляється', async () => {
    const actor = await createActor();
    const first = await ensureSystemCategory(db, actor.householdId, 'debt_repayment');
    const second = await ensureSystemCategory(db, actor.householdId, 'debt_repayment');
    expect(second.id).toBe(first.id);

    const { body } = await actor.get('/api/categories');
    expect(body.items).toEqual([
      expect.objectContaining({
        name: 'Погашення боргів',
        kind: 'expense',
        systemKey: 'debt_repayment',
      }),
    ]);

    const renamed = await actor.patch(`/api/categories/${first.id}`, { name: 'Інше' });
    expect(renamed.status).toBe(409);
    expect((await actor.delete(`/api/categories/${first.id}`)).status).toBe(409);
  });

  it('наявна категорія з назвою системної стає системною, а не дублюється', async () => {
    const actor = await createActor();
    const { body: own } = await actor.post('/api/categories', {
      name: 'Відсотки та комісії',
      kind: 'expense',
    });
    const system = await ensureSystemCategory(db, actor.householdId, 'interest_fees');
    expect(system.id).toBe(own.id);
    expect((await actor.get('/api/categories')).body.items).toHaveLength(1);
  });

  it('системні категорії різних домогосподарств окремі', async () => {
    const actor = await createActor();
    const stranger = await createActor();
    const mine = await ensureSystemCategory(db, actor.householdId, 'interest_fees');
    const theirs = await ensureSystemCategory(db, stranger.householdId, 'interest_fees');
    expect(theirs.id).not.toBe(mine.id);
    expect((await stranger.patch(`/api/categories/${mine.id}`, { name: 'x' })).status).toBe(404);
  });

  describe('підкатегорії', () => {
    const create = (actor: Awaited<ReturnType<typeof createActor>>, body: object) =>
      actor.post('/api/categories', { kind: 'expense', ...body });

    it('створює підкатегорію; назва унікальна лише серед сусідів', async () => {
      const actor = await createActor();
      const { body: utilities } = await create(actor, { name: 'Комунальні' });
      const { body: transport } = await create(actor, { name: 'Транспорт' });
      expect(utilities.parentId).toBeNull();

      const water = await create(actor, { name: 'Вода', parentId: utilities.id });
      expect(water.status).toBe(201);
      expect(water.body).toMatchObject({ name: 'Вода', parentId: utilities.id });

      expect((await create(actor, { name: 'Інше', parentId: utilities.id })).status).toBe(201);
      expect((await create(actor, { name: 'Інше', parentId: transport.id })).status).toBe(201);
      expect((await create(actor, { name: 'Інше' })).status).toBe(201);
      expect((await create(actor, { name: 'Інше', parentId: utilities.id })).status).toBe(409);
    });

    it('лише два рівні, той самий тип, без системних батьків і чужих категорій', async () => {
      const actor = await createActor();
      const stranger = await createActor();
      const { body: utilities } = await create(actor, { name: 'Комунальні' });
      const { body: water } = await create(actor, { name: 'Вода', parentId: utilities.id });
      const { body: salary } = await create(actor, { name: 'Зарплата', kind: 'income' });
      const system = await ensureSystemCategory(db, actor.householdId, 'interest_fees');
      const { body: foreign } = await create(stranger, { name: 'Чужа' });

      for (const parentId of [water.id, salary.id, system.id, foreign.id]) {
        const res = await create(actor, { name: 'Х', parentId });
        expect(res.status).toBe(400);
      }
    });

    it('переносить категорію під іншу й назад, не чіпаючи транзакцій', async () => {
      setNow('2026-03-15T12:00:00Z');
      const actor = await createActor();
      const { body: account } = await actor.post('/api/accounts', { name: 'Картка', type: 'card' });
      const { body: utilities } = await create(actor, { name: 'Комунальні' });
      const { body: water } = await create(actor, { name: 'Вода' });
      const { body: expense } = await actor.post('/api/transactions', {
        type: 'expense',
        accountId: account.id,
        categoryId: water.id,
        amountMinor: 100,
        occurredAt: '2026-03-01T10:00:00Z',
      });

      const moved = await actor.patch(`/api/categories/${water.id}`, { parentId: utilities.id });
      expect(moved.status).toBe(200);
      expect(moved.body).toMatchObject({ name: 'Вода', parentId: utilities.id });
      expect((await actor.get(`/api/transactions/${expense.id}`)).body.categoryId).toBe(water.id);

      const back = await actor.patch(`/api/categories/${water.id}`, { parentId: null });
      expect(back.body.parentId).toBeNull();
    });

    it('не переносить категорію з підкатегоріями, саму під себе чи на місце з тією самою назвою', async () => {
      const actor = await createActor();
      const { body: utilities } = await create(actor, { name: 'Комунальні' });
      const { body: home } = await create(actor, { name: 'Дім' });
      await create(actor, { name: 'Вода', parentId: utilities.id });
      const { body: water2 } = await create(actor, { name: 'Вода' });

      const patch = (id: string, body: object) => actor.patch(`/api/categories/${id}`, body);
      expect((await patch(utilities.id, { parentId: home.id })).status).toBe(409);
      expect((await patch(home.id, { parentId: home.id })).status).toBe(400);
      expect((await patch(water2.id, { parentId: utilities.id })).status).toBe(409);
      expect((await patch(home.id, {})).status).toBe(400);
    });

    it('не переносить, якщо в бюджеті є ліміти і на категорії, і на новому батькові', async () => {
      setNow('2026-03-15T12:00:00Z');
      const actor = await createActor();
      const { body: utilities } = await create(actor, { name: 'Комунальні' });
      const { body: water } = await create(actor, { name: 'Вода' });
      const { body: budget } = await actor.post('/api/budgets', { month: '2026-03' });
      for (const category of [utilities, water]) {
        await actor.post(`/api/budgets/${budget.id}/expense-lines`, {
          categoryId: category.id,
          plannedAmount: 1000,
        });
      }

      const res = await actor.patch(`/api/categories/${water.id}`, { parentId: utilities.id });
      expect(res.status).toBe(409);
      expect((await actor.get(`/api/categories/${water.id}`)).body.parentId).toBeNull();
    });

    it('категорію з підкатегоріями не видалити, порожню підкатегорію — можна', async () => {
      const actor = await createActor();
      const { body: utilities } = await create(actor, { name: 'Комунальні' });
      const { body: water } = await create(actor, { name: 'Вода', parentId: utilities.id });

      expect((await actor.delete(`/api/categories/${utilities.id}`)).status).toBe(409);
      expect((await actor.delete(`/api/categories/${water.id}`)).status).toBe(204);
      expect((await actor.delete(`/api/categories/${utilities.id}`)).status).toBe(204);
    });

    it('підкатегорія з назвою системної не стає системною', async () => {
      const actor = await createActor();
      const { body: bank } = await create(actor, { name: 'Банк' });
      const { body: fees } = await create(actor, {
        name: 'Відсотки та комісії',
        parentId: bank.id,
      });
      const system = await ensureSystemCategory(db, actor.householdId, 'interest_fees');
      expect(system.id).not.toBe(fees.id);
      expect(system.parentId).toBeNull();
    });
  });
});
