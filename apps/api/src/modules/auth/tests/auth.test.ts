import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { refreshTokens, users } from '../../../db/schema.ts';
import { setupTestApp } from '../../../test/harness.ts';
import {
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  PASSWORD_CHANGE_MAX_FAILURES,
  PASSWORD_CHANGE_WINDOW_MS,
} from '../rate-limiter.ts';
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

describe('зміна пароля', () => {
  const newPassword = 'new-staple-horse-battery';
  const wrongPassword = 'wrong-password-123';
  const refresh = (refreshToken: string) => post('/api/auth/refresh', { refreshToken });
  const changePassword = (accessToken: string, body: object) =>
    client(accessToken).post('/api/auth/password', body);
  const change = (accessToken: string, override: object = {}) =>
    changePassword(accessToken, {
      currentPassword: credentials.password,
      newPassword,
      ...override,
    });
  const passwordHashOf = async (email = credentials.email) => {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user!.passwordHash;
  };

  it('AC1: видає нову пару токенів; access-токен дійсний', async () => {
    const { body: session } = await register();
    const res = await change(session.accessToken);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'expiresIn', 'refreshToken']);
    expect(res.body.expiresIn).toBe(900);
    expect(res.body.refreshToken).not.toBe(session.refreshToken);
    expect((await me(res.body.accessToken)).status).toBe(200);
  });

  it('AC2: після зміни входить лише новий пароль; у БД — хеш argon2id', async () => {
    const { body: session } = await register();
    expect((await change(session.accessToken)).status).toBe(200);

    expect((await login()).status).toBe(401);
    expect((await login({ password: newPassword })).status).toBe(200);
    const hash = await passwordHashOf();
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain(newPassword);
  });

  it('AC3: невірний поточний пароль — 422, нічого не змінюється', async () => {
    const { body: session } = await register();
    const hashBefore = await passwordHashOf();

    const res = await change(session.accessToken, { currentPassword: wrongPassword });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CURRENT_PASSWORD_INVALID');
    expect(res.body.error.message).toBe('Поточний пароль невірний');

    expect(await passwordHashOf()).toBe(hashBefore);
    const tokens = await db.select().from(refreshTokens);
    expect(tokens.every((row) => row.revokedAt === null)).toBe(true);
    expect((await refresh(session.refreshToken)).status).toBe(200);
  });

  it.each([
    ['новий із 9 символів', { newPassword: '123456789' }, 400],
    ['новий із 10 символів', { newPassword: '1234567890' }, 200],
    ['новий із 128 символів', { newPassword: 'x'.repeat(128) }, 200],
    ['новий із 129 символів', { newPassword: 'x'.repeat(129) }, 400],
    ['порожній поточний', { currentPassword: '' }, 400],
    ['відсутній поточний', { currentPassword: undefined }, 400],
    ['відсутній новий', { newPassword: undefined }, 400],
    ['пароль не рядком', { newPassword: 12345678901 }, 400],
  ])('AC4: %s → %i', async (_name, override, status) => {
    const { body: session } = await register();
    const res = await change(session.accessToken, override);

    expect(res.status).toBe(status);
    if (status === 400) expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('AC5: новий пароль, що збігається з поточним, — 400 з path newPassword', async () => {
    const { body: session } = await register();
    const res = await change(session.accessToken, { newPassword: credentials.password });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).toContain('newPassword');
    expect(JSON.stringify(res.body)).toContain('Новий пароль має відрізнятися від поточного');
  });

  it('AC6: без access-токена або з недійсним — 401, пароль не змінено', async () => {
    const { body: session } = await register();
    const hashBefore = await passwordHashOf();
    const expired = await tokens.signAccessToken(
      session.user.id,
      new Date(Date.now() - (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000),
    );
    const body = { currentPassword: credentials.password, newPassword };

    expect((await post('/api/auth/password', body)).status).toBe(401);
    expect((await changePassword('not.a.jwt', body)).status).toBe(401);
    expect((await changePassword(expired, body)).status).toBe(401);
    expect(await passwordHashOf()).toBe(hashBefore);
    expect((await login()).status).toBe(200);
  });

  it(`AC7: після ${PASSWORD_CHANGE_MAX_FAILURES} невдач — 429 навіть із вірним паролем; з часом знімається`, async () => {
    const { body: session } = await register();
    for (let attempt = 0; attempt < PASSWORD_CHANGE_MAX_FAILURES; attempt++) {
      expect((await change(session.accessToken, { currentPassword: wrongPassword })).status).toBe(
        422,
      );
    }
    const hashBefore = await passwordHashOf();

    const blocked = await change(session.accessToken);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(await passwordHashOf()).toBe(hashBefore);

    clock.now += PASSWORD_CHANGE_WINDOW_MS;
    expect((await change(session.accessToken)).status).toBe(200);
  });

  it('AC8: успіх скидає лічильник; помилки валідації його не збільшують', async () => {
    const { body: session } = await register();
    let access = session.accessToken as string;
    let current = credentials.password;
    for (let round = 0; round < 2; round++) {
      for (let attempt = 0; attempt < PASSWORD_CHANGE_MAX_FAILURES - 1; attempt++) {
        expect((await change(access, { currentPassword: wrongPassword })).status).toBe(422);
      }
      // 400 не рахується: інакше наступна спроба була б п'ятою невдачею.
      expect(
        (await change(access, { currentPassword: current, newPassword: 'short' })).status,
      ).toBe(400);
      const next = `${newPassword}-${round}`;
      const res = await change(access, { currentPassword: current, newPassword: next });
      expect(res.status).toBe(200);
      access = res.body.accessToken;
      current = next;
    }
  });

  it('AC9: лічильник окремий для кожного користувача і не пов’язаний із входом', async () => {
    const { body: olena } = await register();
    const { body: ivan } = await register({ email: 'ivan@example.com' });
    for (let attempt = 0; attempt < PASSWORD_CHANGE_MAX_FAILURES; attempt++) {
      await change(olena.accessToken, { currentPassword: wrongPassword });
    }
    expect((await change(olena.accessToken)).status).toBe(429);

    expect((await change(ivan.accessToken)).status).toBe(200);
    expect((await login()).status).toBe(200);

    // і навпаки: заблокований вхід не блокує зміну пароля
    for (let attempt = 0; attempt < LOGIN_MAX_FAILURES; attempt++) {
      await login({ email: 'ivan@example.com', password: wrongPassword });
    }
    expect((await login({ email: 'ivan@example.com', password: newPassword })).status).toBe(429);
    const ivanChange = await change(ivan.accessToken, {
      currentPassword: newPassword,
      newPassword: 'third-password-value',
    });
    expect(ivanChange.status).toBe(200);
  });

  it('AC10: старі refresh-токени всіх пристроїв відкликано, новий діє', async () => {
    await register();
    const { body: device1 } = await login();
    const { body: device2 } = await login();

    const res = await change(device1.accessToken);
    expect(res.status).toBe(200);

    expect((await refresh(device1.refreshToken)).status).toBe(401);
    expect((await refresh(device2.refreshToken)).status).toBe(401);
    expect((await refresh(res.body.refreshToken)).status).toBe(200);
  });

  it('AC11: виданий раніше access-токен іншого пристрою діє до кінця свого строку', async () => {
    const { body: device1 } = await register();
    const userId = device1.user.id as string;
    const device2Access = await tokens.signAccessToken(userId);
    const device2AlmostExpired = await tokens.signAccessToken(
      userId,
      new Date(Date.now() - (ACCESS_TOKEN_TTL_SECONDS - 30) * 1000),
    );
    expect((await change(device1.accessToken)).status).toBe(200);

    expect((await me(device2Access)).status).toBe(200);
    expect((await me(device2AlmostExpired)).status).toBe(200);
    const expired = await tokens.signAccessToken(
      userId,
      new Date(Date.now() - (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000),
    );
    expect((await me(expired)).status).toBe(401);
  });

  it('AC12: не зачіпає токени й пароль іншого користувача, навіть з того самого домогосподарства', async () => {
    const { body: owner } = await register();
    const invite = await client(owner.accessToken).post('/api/household/invites', {});
    expect(invite.status).toBe(201);
    const memberCredentials = { email: 'ivan@example.com', password: 'member-password-1' };
    const { body: member } = await register({
      ...memberCredentials,
      name: 'Іван',
      inviteToken: invite.body.token,
    });
    expect(member.household.id).toBe(owner.household.id);
    const memberHash = await passwordHashOf(memberCredentials.email);

    // userId у тілі ігнорується: змінюється пароль лише власника access-токена
    const res = await change(owner.accessToken, { userId: member.user.id });
    expect(res.status).toBe(200);

    expect(await passwordHashOf(memberCredentials.email)).toBe(memberHash);
    expect((await login(memberCredentials)).status).toBe(200);
    expect((await refresh(member.refreshToken)).status).toBe(200);
    expect((await login({ password: newPassword })).status).toBe(200);
  });

  it('AC13: учасник домогосподарства змінює свій пароль', async () => {
    const { body: owner } = await register();
    const invite = await client(owner.accessToken).post('/api/household/invites', {});
    const { body: member } = await register({
      email: 'ivan@example.com',
      name: 'Іван',
      inviteToken: invite.body.token,
    });
    expect(member.household.role).toBe('member');

    const res = await change(member.accessToken);
    expect(res.status).toBe(200);
    expect((await login({ email: 'ivan@example.com', password: newPassword })).status).toBe(200);
  });

  it('AC14: тіла помилок не містять надісланих паролів', async () => {
    const { body: session } = await register();
    const secretCurrent = 'secret-current-value-1';
    const secretNew = 'secret-new-value-2';
    const bodies: string[] = [];

    const invalid = await change(session.accessToken, {
      currentPassword: secretCurrent,
      newPassword: 'short-pw',
    });
    expect(invalid.status).toBe(400);
    bodies.push(invalid.text);
    const same = await change(session.accessToken, {
      currentPassword: secretCurrent,
      newPassword: secretCurrent,
    });
    expect(same.status).toBe(400);
    bodies.push(same.text);
    for (let attempt = 0; attempt < PASSWORD_CHANGE_MAX_FAILURES; attempt++) {
      const wrong = await change(session.accessToken, {
        currentPassword: secretCurrent,
        newPassword: secretNew,
      });
      expect(wrong.status).toBe(422);
      bodies.push(wrong.text);
    }
    const blocked = await change(session.accessToken, {
      currentPassword: secretCurrent,
      newPassword: secretNew,
    });
    expect(blocked.status).toBe(429);
    bodies.push(blocked.text);

    for (const text of bodies) {
      expect(text).not.toContain(secretCurrent);
      expect(text).not.toContain(secretNew);
      expect(text).not.toContain('short-pw');
    }
  });

  it('AC14a: користувач без пароля отримує 422, пароль не встановлюється', async () => {
    const actor = await createActor();
    const res = await change(actor.accessToken, { currentPassword: 'anything-goes' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CURRENT_PASSWORD_INVALID');
    const [user] = await db.select().from(users).where(eq(users.id, actor.userId));
    expect(user!.passwordHash).toBeNull();
  });

  it('AC14b: з двох одночасних змін з тим самим поточним паролем успішна не більше одна', async () => {
    const { body: session } = await register();
    const results = await Promise.all([
      change(session.accessToken, { newPassword: 'first-new-password' }),
      change(session.accessToken, { newPassword: 'second-new-password' }),
    ]);
    const statuses = results.map((res) => res.status).sort();

    expect(statuses).toEqual([200, 422]);
    const winner = results.find((res) => res.status === 200)!;
    const winnerPassword = winner === results[0] ? 'first-new-password' : 'second-new-password';
    expect((await login({ password: winnerPassword })).status).toBe(200);
  });
});
