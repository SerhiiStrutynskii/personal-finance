import { expect } from 'vitest';
import request from 'supertest';
import type { Actor, setupTestApp } from '../../../test/harness.ts';

type Harness = ReturnType<typeof setupTestApp>;

let counter = 0;

/** Реєстрація через API: так створюються типові прийоми їжі (harness вставляє домогосподарство напряму). */
export async function registerUser(harness: Harness) {
  counter += 1;
  const res = await request(harness.app)
    .post('/api/auth/register')
    .send({
      email: `menu${counter}@example.com`,
      password: 'a-long-test-password',
      name: `Кухар ${counter}`,
    });
  expect(res.status).toBe(201);
  return {
    userId: res.body.user.id as string,
    householdId: res.body.household.id as string,
    ...harness.client(res.body.accessToken as string),
  };
}

/** Власник із запрошеним учасником (роль member) в одному домогосподарстві. */
export async function ownerWithMember(harness: Harness) {
  const owner = await harness.createActor();
  const invite = await owner.post('/api/household/invites', {});
  expect(invite.status).toBe(201);
  counter += 1;
  const res = await request(harness.app)
    .post('/api/auth/register')
    .send({
      email: `member${counter}@example.com`,
      password: 'a-long-test-password',
      name: `Учасник ${counter}`,
      inviteToken: invite.body.token,
    });
  expect(res.status).toBe(201);
  expect(res.body.household.role).toBe('member');
  return { owner, member: harness.client(res.body.accessToken as string) };
}

export type Client = Pick<Actor, 'get' | 'post' | 'put' | 'patch' | 'delete'>;

export async function mealTypeNames(actor: Client): Promise<string[]> {
  const res = await actor.get('/api/meal-types');
  expect(res.status).toBe(200);
  return res.body.items.map((item: { name: string }) => item.name);
}

/** Додає страву в меню дня й перевіряє, що запис створено або порції додано. */
export async function addEntry(
  actor: Client,
  body: { date: string; mealTypeId: string; dishId: string; servings?: number },
  status: 200 | 201 = 201,
) {
  const res = await actor.post('/api/menu/entries', body);
  expect(res.status).toBe(status);
  return res.body as { id: string; servings: number; cost: number };
}

/** Продукт у довіднику; повертає id. */
export async function createProduct(actor: Client, body: object): Promise<string> {
  const res = await actor.post('/api/products', body);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/** Страва зі складом [{ productId, quantityMilli }]; повертає id. */
export async function createDish(
  actor: Client,
  name: string,
  ingredients: object[] = [],
): Promise<string> {
  const res = await actor.post('/api/dishes', { name, ingredients });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/** Id прийомів їжі в порядку position. */
export async function mealTypeIds(actor: Client): Promise<string[]> {
  const res = await actor.get('/api/meal-types');
  expect(res.status).toBe(200);
  return res.body.items.map((item: { id: string }) => item.id);
}
