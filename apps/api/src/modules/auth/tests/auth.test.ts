import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { refreshTokens, users } from '../../../db/schema.ts';
import { setupTestApp } from '../../../test/harness.ts';
import { LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS } from '../rate-limiter.ts';
import { ACCESS_TOKEN_TTL_SECONDS, createTokenService, hashRefreshToken } from '../tokens.ts';

const { app, db, tokens, clock, client, createActor } = setupTestApp();

const credentials = { email: 'olena@example.com', password: 'correct-horse-battery' };
const registration = { ...credentials, name: 'Олена' };

const post = (path: string, body: unknown) =>
  request(app)
    .post(path)
    .send(body as object);
const register = (override: object = {}) =>
  post('/api/auth/register', { ...registration, ...override });
const login = (override: object = {}) => post('/api/auth/login', { ...credentials, ...override });
const me = (accessToken: string) => client(accessToken).get('/api/auth/me');

describe('реєстрація', () => {
  it('створює користувача з власним домогосподарством і видає токени', async () => {
    const res = await register({ email: '  Olena@Example.COM ', householdName: 'Родина' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      user: { email: 'olena@example.com', name: 'Олена', timeZone: 'Europe/Kyiv' },
      household: { name: 'Родина', role: 'owner' },
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
    expect(Object.keys(res.body).sort()).toEqual([
      'accessToken',
      'expiresIn',
      'household',
      'refreshToken',
      'user',
    ]);
    expect(Object.keys(res.body.user).sort()).toEqual(['email', 'id', 'name', 'timeZone']);

    const current = await me(res.body.accessToken);
    expect(current.status).toBe(200);
    expect(current.body).toEqual({ user: res.body.user, household: res.body.household });
  });

  it('зберігає пароль лише як хеш argon2id', async () => {
    await register();
    const [user] = await db.select().from(users).where(eq(users.email, credentials.email));

    expect(user!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user!.passwordHash).not.toContain(credentials.password);
  });

  it('дає назву домогосподарству за замовчуванням', async () => {
    expect((await register()).body.household.name).toBe('Моє домогосподарство');
  });

  it('відхиляє повторний email незалежно від регістру', async () => {
    await register();
    const res = await register({ email: 'OLENA@example.com' });

    expect(res.status).toBe(409);
    const count = await db.execute(sql`SELECT count(*)::int AS n FROM households`);
    expect(count.rows).toEqual([{ n: 1 }]);
  });

  it.each([
    ['короткий пароль', { password: 'short' }],
    ['пароль із 9 символів', { password: '123456789' }],
    ['задовгий пароль', { password: 'x'.repeat(129) }],
    ['некоректний email', { email: 'not-an-email' }],
    ['порожнє імʼя', { name: ' ' }],
    ['пароль не рядком', { password: 1234567890 }],
  ])('відхиляє: %s', async (_name, override) => {
    const res = await register(override);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('приймає пароль мінімальної довжини', async () => {
    expect((await register({ password: '1234567890' })).status).toBe(201);
  });

  it('новий користувач бачить лише власні дані', async () => {
    const other = await createActor();
    await other.post('/api/accounts', { name: 'Чужа картка', type: 'card' });
    const { body } = await register();

    expect((await client(body.accessToken).get('/api/accounts')).body.items).toEqual([]);
  });
});

describe('вхід', () => {
  it('видає токени за правильними даними', async () => {
    const registered = await register();
    const res = await login({ email: 'OLENA@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(registered.body.user);
    expect(res.body.refreshToken).not.toBe(registered.body.refreshToken);
    expect((await me(res.body.accessToken)).status).toBe(200);
  });

  it('відповідає однаково на невірний пароль і невідомий email', async () => {
    await register();
    const wrongPassword = await login({ password: 'wrong-password-123' });
    const unknownEmail = await login({ email: 'nobody@example.com' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('не пускає користувача без пароля', async () => {
    await createActor(); // створений напряму в БД, без password_hash
    expect((await login({ email: 'user1@example.com', password: 'anything-goes' })).status).toBe(
      401,
    );
  });

  it('відхиляє запит без пароля', async () => {
    expect((await post('/api/auth/login', { email: credentials.email })).status).toBe(400);
  });

  it(`блокує вхід після ${LOGIN_MAX_FAILURES} невдалих спроб і знімає блокування з часом`, async () => {
    await register();
    for (let attempt = 0; attempt < LOGIN_MAX_FAILURES; attempt++) {
      expect((await login({ password: 'wrong-password-123' })).status).toBe(401);
    }

    const blocked = await login();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');

    // інший обліковий запис із тієї ж адреси не заблоковано
    await register({ email: 'ivan@example.com' });
    expect((await login({ email: 'ivan@example.com' })).status).toBe(200);

    clock.now += LOGIN_WINDOW_MS;
    expect((await login()).status).toBe(200);
  });

  it('успішний вхід скидає лічильник невдач', async () => {
    await register();
    for (let round = 0; round < 2; round++) {
      for (let attempt = 0; attempt < LOGIN_MAX_FAILURES - 1; attempt++) {
        await login({ password: 'wrong-password-123' });
      }
      expect((await login()).status).toBe(200);
    }
  });
});

describe('access-токен', () => {
  it.each([
    ['без заголовка', undefined],
    ['не Bearer', 'Basic abc'],
    ['порожній Bearer', 'Bearer '],
    ['сміття', 'Bearer not.a.jwt'],
  ])('401: %s', async (_name, header) => {
    const req = request(app).get('/api/auth/me');
    if (header) req.set('Authorization', header);
    expect((await req).status).toBe(401);
  });

  it('401 для простроченого токена', async () => {
    const actor = await createActor();
    const justExpired = new Date(Date.now() - (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000);
    const stillValid = new Date(Date.now() - (ACCESS_TOKEN_TTL_SECONDS - 30) * 1000);

    expect((await me(await tokens.signAccessToken(actor.userId, justExpired))).status).toBe(401);
    expect((await me(await tokens.signAccessToken(actor.userId, stillValid))).status).toBe(200);
  });

  it('401 для токена, підписаного іншим секретом, і для токена без підпису', async () => {
    const actor = await createActor();
    const foreign = createTokenService('another-secret-another-secret-another-1');
    const [header, payload] = actor.accessToken.split('.');
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${payload}.`;

    expect((await me(await foreign.signAccessToken(actor.userId))).status).toBe(401);
    expect((await me(unsigned)).status).toBe(401);
    expect((await me(`${header}.${payload}.`)).status).toBe(401);
  });

  it('401, якщо користувача видалено або він втратив членство', async () => {
    const actor = await createActor();
    await db.execute(sql`DELETE FROM household_members WHERE user_id = ${actor.userId}`);
    expect((await actor.get('/api/accounts')).status).toBe(401);

    const removed = await createActor();
    await db.delete(users).where(eq(users.id, removed.userId));
    expect((await removed.get('/api/auth/me')).status).toBe(401);
  });
});

describe('refresh-токен', () => {
  const refresh = (refreshToken: unknown) => post('/api/auth/refresh', { refreshToken });

  it('зберігається в БД лише як хеш', async () => {
    const { body } = await register();
    const rows = await db.select().from(refreshTokens);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashRefreshToken(body.refreshToken));
    expect(JSON.stringify(rows)).not.toContain(body.refreshToken);
  });

  it('видає нову пару і робить старий токен непридатним', async () => {
    const { body: session } = await register();
    const res = await refresh(session.refreshToken);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'expiresIn', 'refreshToken']);
    expect(res.body.refreshToken).not.toBe(session.refreshToken);
    expect((await me(res.body.accessToken)).status).toBe(200);
  });

  it('повторне використання токена відкликає всю родину', async () => {
    const { body: session } = await register();
    const { body: rotated } = await refresh(session.refreshToken);

    expect((await refresh(session.refreshToken)).status).toBe(401);
    expect((await refresh(rotated.refreshToken)).status).toBe(401);
  });

  it('повторне використання не зачіпає інші входи користувача', async () => {
    const { body: first } = await register();
    const { body: second } = await login();
    await refresh(first.refreshToken);
    await refresh(first.refreshToken);

    expect((await refresh(second.refreshToken)).status).toBe(200);
  });

  it('з двох одночасних оновлень одним токеном проходить не більше одного', async () => {
    const { body: session } = await register();
    const results = await Promise.all([
      refresh(session.refreshToken),
      refresh(session.refreshToken),
    ]);

    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(results.filter((res) => res.status === 401)).toHaveLength(1);
  });

  it('401 для простроченого токена: межа виключна', async () => {
    const { body: session } = await register();
    const setExpiry = (value: Date) => db.update(refreshTokens).set({ expiresAt: value });

    await setExpiry(new Date(Date.now() - 1000));
    expect((await refresh(session.refreshToken)).status).toBe(401);

    await setExpiry(new Date(Date.now() + 60_000));
    expect((await refresh(session.refreshToken)).status).toBe(200);
  });

  it('401 для невідомого токена, 400 для некоректного тіла', async () => {
    expect((await refresh('unknown-token')).status).toBe(401);
    expect((await refresh('')).status).toBe(400);
    expect((await refresh(123)).status).toBe(400);
    expect((await post('/api/auth/refresh', {})).status).toBe(400);
  });
});

describe('вихід', () => {
  it('відкликає refresh-токен і всі його наступники', async () => {
    const { body: session } = await register();
    const { body: rotated } = await post('/api/auth/refresh', {
      refreshToken: session.refreshToken,
    });

    expect((await post('/api/auth/logout', { refreshToken: rotated.refreshToken })).status).toBe(
      204,
    );
    expect((await post('/api/auth/refresh', { refreshToken: rotated.refreshToken })).status).toBe(
      401,
    );
  });

  it('завжди відповідає 204, навіть для невідомого токена', async () => {
    expect((await post('/api/auth/logout', { refreshToken: 'unknown' })).status).toBe(204);
  });
});
