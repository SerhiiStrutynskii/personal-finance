import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach } from 'vitest';
import { createApp } from '../app.ts';
import { createDb } from '../db/client.ts';
import { householdMembers, households, transactions, users } from '../db/schema.ts';
import { createLoginLimiter } from '../modules/auth/rate-limiter.ts';
import { createTokenService } from '../modules/auth/tokens.ts';
import { testDatabaseUrl } from './database-url.ts';

export const TEST_JWT_SECRET = 'test-secret-test-secret-test-secret-1234';

/** Клієнт API від імені одного користувача. */
export interface Actor {
  userId: string;
  householdId: string;
  accessToken: string;
  get(path: string): request.Test;
  post(path: string, body: unknown): request.Test;
  put(path: string, body: unknown): request.Test;
  patch(path: string, body: unknown): request.Test;
  delete(path: string): request.Test;
}

/** Піднімає застосунок на тестовій базі й очищає її перед кожним тестом. */
export function setupTestApp() {
  const { db, pool } = createDb(testDatabaseUrl());
  const tokens = createTokenService(TEST_JWT_SECRET);
  const clock = { now: Date.now() };
  // Поточний момент для правил про періоди; без setNow — справжній час.
  const time: { fixed: Date | undefined } = { fixed: undefined };
  const app = createApp({
    db,
    corsOrigin: 'http://localhost',
    jwtSecret: TEST_JWT_SECRET,
    loginLimiter: createLoginLimiter(() => clock.now),
    now: () => time.fixed ?? new Date(),
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE users, households RESTART IDENTITY CASCADE`);
    // Зсув часу скидає лічильник невдалих входів між тестами.
    clock.now += 24 * 60 * 60 * 1000;
    time.fixed = undefined;
  });
  afterAll(() => pool.end());

  let counter = 0;

  /** Клієнт, що підписує запити вказаним access-токеном. */
  function client(accessToken: string) {
    const as = (test: request.Test) => test.set('Authorization', `Bearer ${accessToken}`);
    return {
      get: (path: string) => as(request(app).get(path)),
      post: (path: string, body: unknown) => as(request(app).post(path)).send(body as object),
      put: (path: string, body: unknown) => as(request(app).put(path)).send(body as object),
      patch: (path: string, body: unknown) => as(request(app).patch(path)).send(body as object),
      delete: (path: string) => as(request(app).delete(path)),
    };
  }

  /**
   * Створює окреме домогосподарство з одним користувачем напряму в БД і видає йому access-токен.
   * Реєстрацію й вхід перевіряють тести модуля auth.
   */
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

    const accessToken = await tokens.signAccessToken(userId);
    return { userId, householdId, accessToken, ...client(accessToken) };
  }

  /** Фіксує «зараз» для застосунку до кінця тесту. */
  function setNow(iso: string): void {
    time.fixed = new Date(iso);
  }

  /** Вставляє транзакцію напряму в базу, оминаючи правила API (наприклад, видаток минулого місяця). */
  async function insertTransaction(
    actor: Actor,
    values: Omit<typeof transactions.$inferInsert, 'householdId' | 'createdBy'>,
  ) {
    const [row] = await db
      .insert(transactions)
      .values({ ...values, householdId: actor.householdId, createdBy: actor.userId })
      .returning();
    return row!;
  }

  return { app, db, tokens, clock, client, createActor, setNow, insertTransaction };
}
