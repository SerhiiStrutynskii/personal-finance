import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach } from 'vitest';
import { createApp } from '../app.ts';
import { createDb } from '../db/client.ts';
import { householdMembers, households, users } from '../db/schema.ts';
import { DEV_USER_HEADER } from '../http/auth.ts';
import { testDatabaseUrl } from './database-url.ts';

/** Клієнт API від імені одного користувача. */
export interface Actor {
  userId: string;
  householdId: string;
  get(path: string): request.Test;
  post(path: string, body: unknown): request.Test;
  put(path: string, body: unknown): request.Test;
  patch(path: string, body: unknown): request.Test;
  delete(path: string): request.Test;
}

/** Піднімає застосунок на тестовій базі й очищає її перед кожним тестом. */
export function setupTestApp() {
  const { db, pool } = createDb(testDatabaseUrl());
  const app = createApp({ db, corsOrigin: 'http://localhost', devAuth: { enabled: true } });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE users, households RESTART IDENTITY CASCADE`);
  });
  afterAll(() => pool.end());

  let counter = 0;

  /** Створює окреме домогосподарство з одним користувачем. */
  async function createActor(): Promise<Actor> {
    counter += 1;
    const [user] = await db
      .insert(users)
      .values({ email: `user${counter}@example.com`, name: `Тест ${counter}` })
      .returning();
    const [household] = await db
      .insert(households)
      .values({ name: `Родина ${counter}` })
      .returning();
    const userId = user!.id;
    const householdId = household!.id;
    await db.insert(householdMembers).values({ householdId, userId, role: 'owner' });

    const as = (test: request.Test) => test.set(DEV_USER_HEADER, userId);
    return {
      userId,
      householdId,
      get: (path) => as(request(app).get(path)),
      post: (path, body) => as(request(app).post(path)).send(body as object),
      put: (path, body) => as(request(app).put(path)).send(body as object),
      patch: (path, body) => as(request(app).patch(path)).send(body as object),
      delete: (path) => as(request(app).delete(path)),
    };
  }

  return { app, db, createActor };
}
