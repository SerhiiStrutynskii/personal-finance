import { randomUUID } from 'node:crypto';
import { MAX_ACTIVE_INVITES } from '@hf/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../../app.ts';
import { TEST_JWT_SECRET, setupTestApp, type Actor } from '../../../test/harness.ts';

const { app, db, client, createActor, setNow, lockHousehold, waitForLockWaiters } = setupTestApp();

let counter = 0;

/** Реєстрація за посиланням-запрошенням; повертає відповідь API. */
function registerWithInvite(inviteToken: string, target = app) {
  counter += 1;
  return request(target)
    .post('/api/auth/register')
    .send({
      email: `invited${counter}@example.com`,
      password: 'a-long-test-password',
      name: `Запрошений ${counter}`,
      inviteToken,
    });
}

async function createInvite(owner: Actor): Promise<string> {
  const res = await owner.post('/api/household/invites', {});
  expect(res.status).toBe(201);
  return res.body.token as string;
}

/** Власник із запрошеним учасником в одному домогосподарстві. */
async function ownerWithMember() {
  const owner = await createActor();
  const res = await registerWithInvite(await createInvite(owner));
  expect(res.status).toBe(201);
  const member = {
    userId: res.body.user.id as string,
    ...client(res.body.accessToken as string),
  };
  return { owner, member };
}

/** Ще один учасник домогосподарства власника. */
async function addMember(owner: Actor) {
  const res = await registerWithInvite(await createInvite(owner));
  expect(res.status).toBe(201);
  return { userId: res.body.user.id as string, ...client(res.body.accessToken as string) };
}

/** Ролі учасників домогосподарства: userId → role. */
async function rolesOf(actor: { get: Actor['get'] }) {
  const res = await actor.get('/api/household');
  expect(res.status).toBe(200);
  return Object.fromEntries(
    (res.body.members as { userId: string; role: string }[]).map((m) => [m.userId, m.role]),
  );
}

describe('запрошення', () => {
  it('за посиланням новий користувач стає учасником домогосподарства власника', async () => {
    const owner = await createActor();
    const token = await createInvite(owner);

    const listed = await owner.get('/api/household');
    expect(listed.body.invites).toHaveLength(1);
    expect(listed.body.invites[0]).not.toHaveProperty('token');

    const preview = await request(app).get(`/api/auth/invites/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({ householdName: expect.any(String), invitedBy: 'Тест 1' });

    const res = await registerWithInvite(token);
    expect(res.status).toBe(201);
    expect(res.body.household).toEqual({
      id: owner.householdId,
      name: preview.body.householdName,
      role: 'member',
    });

    const household = await owner.get('/api/household');
    expect(household.body.members.map((m: { role: string }) => m.role)).toEqual([
      'owner',
      'member',
    ]);
    expect(household.body.invites).toEqual([]);
  });

  it('посилання одноразове', async () => {
    const owner = await createActor();
    const token = await createInvite(owner);
    expect((await registerWithInvite(token)).status).toBe(201);

    expect((await request(app).get(`/api/auth/invites/${token}`)).status).toBe(404);
    const again = await registerWithInvite(token);
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe('INVITE_INVALID');
  });

  it('невдала реєстрація за недійсним посиланням не створює користувача', async () => {
    const res = await registerWithInvite('not-a-real-token');
    expect(res.status).toBe(422);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: `invited${counter}@example.com`, password: 'a-long-test-password' });
    expect(login.status).toBe(401);
  });

  it('відкликане й прострочене запрошення не діє', async () => {
    const owner = await createActor();
    const revoked = await createInvite(owner);
    const { id } = (await owner.get('/api/household')).body.invites[0];
    expect((await owner.delete(`/api/household/invites/${id}`)).status).toBe(204);
    expect((await registerWithInvite(revoked)).status).toBe(422);

    const expired = await createInvite(owner);
    setNow(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString());
    expect((await request(app).get(`/api/auth/invites/${expired}`)).status).toBe(404);
    expect((await registerWithInvite(expired)).status).toBe(422);
  });

  it('кількість активних запрошень обмежена', async () => {
    const owner = await createActor();
    for (let i = 0; i < MAX_ACTIVE_INVITES; i += 1) await createInvite(owner);
    const res = await owner.post('/api/household/invites', {});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TOO_MANY_INVITES');
  });

  it('за запрошенням можна зареєструватися, навіть коли реєстрацію закрито', async () => {
    const closedApp = createApp({
      db,
      corsOrigin: 'http://localhost',
      jwtSecret: TEST_JWT_SECRET,
      registrationEnabled: false,
    });
    const owner = await createActor();
    expect((await registerWithInvite(await createInvite(owner), closedApp)).status).toBe(201);
    expect((await registerWithInvite('', closedApp)).status).toBe(403);
  });

  it('чуже запрошення не можна відкликати', async () => {
    const owner = await createActor();
    await createInvite(owner);
    const { id } = (await owner.get('/api/household')).body.invites[0];
    const stranger = await createActor();
    expect((await stranger.delete(`/api/household/invites/${id}`)).status).toBe(404);
  });
});

describe('права учасника', () => {
  it('бачить дані домогосподарства й веде витрати та покупки', async () => {
    const { owner, member } = await ownerWithMember();
    const { body: card } = await owner.post('/api/accounts', { name: 'Картка', type: 'card' });

    const accounts = await member.get('/api/accounts');
    expect(accounts.body.items.map((a: { id: string }) => a.id)).toEqual([card.id]);

    const expense = await member.post('/api/transactions', {
      type: 'expense',
      accountId: card.id,
      amountMinor: 12_000,
      occurredAt: '2026-03-01T12:00:00+02:00',
    });
    expect(expense.status).toBe(201);
    expect((await member.post('/api/products', { name: 'Хліб' })).status).toBe(201);
    expect((await member.post('/api/shopping-lists', { name: 'На вихідні' })).status).toBe(201);
  });

  it('не змінює рахунки, категорії, бюджет, борги й цілі', async () => {
    const { owner, member } = await ownerWithMember();
    const { body: card } = await owner.post('/api/accounts', { name: 'Картка', type: 'card' });

    const attempts = [
      member.post('/api/accounts', { name: 'Готівка', type: 'cash' }),
      member.patch(`/api/accounts/${card.id}`, { name: 'Інша' }),
      member.delete(`/api/accounts/${card.id}`),
      member.post('/api/categories', { name: 'Кава', kind: 'expense' }),
      member.post('/api/budgets', { month: '2026-03' }),
      // перевірка прав іде раніше за пошук запису
      member.delete(`/api/debts/${randomUUID()}`),
      member.delete(`/api/goals/${randomUUID()}`),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OWNER_ONLY');
    }
    expect((await owner.get(`/api/accounts/${card.id}`)).body.name).toBe('Картка');
  });

  it('не бачить запрошень і не керує учасниками', async () => {
    const { owner, member } = await ownerWithMember();
    await createInvite(owner);

    const household = await member.get('/api/household');
    expect(household.body.role).toBe('member');
    expect(household.body.members).toHaveLength(2);
    expect(household.body.invites).toEqual([]);

    expect((await member.post('/api/household/invites', {})).status).toBe(403);
    expect((await member.patch('/api/household', { name: 'Моя' })).status).toBe(403);
    expect((await member.delete(`/api/household/members/${owner.userId}`)).status).toBe(403);
  });
});

describe('учасники', () => {
  it('власник перейменовує домогосподарство', async () => {
    const owner = await createActor();
    const res = await owner.patch('/api/household', { name: '  Родина  ' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Родина');
  });

  it('вилучений учасник одразу втрачає доступ і отримує власне порожнє домогосподарство', async () => {
    const { owner, member } = await ownerWithMember();
    await owner.post('/api/accounts', { name: 'Картка', type: 'card' });

    expect((await owner.delete(`/api/household/members/${member.userId}`)).status).toBe(204);

    const me = await member.get('/api/auth/me');
    expect(me.body.household.role).toBe('owner');
    expect(me.body.household.id).not.toBe(owner.householdId);
    expect((await member.get('/api/accounts')).body.items).toEqual([]);
    expect((await owner.get('/api/household')).body.members).toHaveLength(1);
  });

  it('учасник може вийти сам, власник — ні', async () => {
    const { owner, member } = await ownerWithMember();
    expect((await member.post('/api/household/leave', {})).status).toBe(204);
    expect((await owner.get('/api/household')).body.members).toHaveLength(1);

    const res = await owner.post('/api/household/leave', {});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OWNER_CANNOT_LEAVE');
    expect((await owner.delete(`/api/household/members/${owner.userId}`)).status).toBe(422);
  });

  it('учасника чужого домогосподарства вилучити не можна', async () => {
    const { member } = await ownerWithMember();
    const stranger = await createActor();
    expect((await stranger.delete(`/api/household/members/${member.userId}`)).status).toBe(404);
  });
});

describe('передача ролі власника', () => {
  it('AC1: власник передає роль учаснику; власник лишається один', async () => {
    const { owner, member } = await ownerWithMember();
    await createInvite(owner);

    const res = await owner.post('/api/household/owner', { userId: member.userId });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(owner.householdId);
    expect(res.body.role).toBe('member');
    expect(res.body.invites).toEqual([]);
    const roles = Object.fromEntries(
      (res.body.members as { userId: string; role: string }[]).map((m) => [m.userId, m.role]),
    );
    expect(roles).toEqual({ [owner.userId]: 'member', [member.userId]: 'owner' });
  });

  it('AC2: роль змінюється з наступного запиту тими самими токенами', async () => {
    const { owner, member } = await ownerWithMember();
    expect((await owner.post('/api/household/owner', { userId: member.userId })).status).toBe(200);

    const ownerMe = await owner.get('/api/auth/me');
    const memberMe = await member.get('/api/auth/me');
    expect(ownerMe.status).toBe(200);
    expect(memberMe.status).toBe(200);
    expect(ownerMe.body.household).toMatchObject({ id: owner.householdId, role: 'member' });
    expect(memberMe.body.household).toMatchObject({ id: owner.householdId, role: 'owner' });
  });

  it('AC3: колишній власник втрачає права власника, новий — отримує', async () => {
    const { owner, member } = await ownerWithMember();
    expect((await owner.post('/api/household/owner', { userId: member.userId })).status).toBe(200);

    const denied = [
      owner.post('/api/accounts', { name: 'Готівка', type: 'cash' }),
      owner.patch('/api/household', { name: 'Моя' }),
      owner.post('/api/household/invites', {}),
      owner.post('/api/household/owner', { userId: member.userId }),
    ];
    for (const res of await Promise.all(denied)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OWNER_ONLY');
    }

    expect((await member.post('/api/accounts', { name: 'Готівка', type: 'cash' })).status).toBe(
      201,
    );
    expect((await member.patch('/api/household', { name: 'Нова назва' })).status).toBe(200);
    expect((await member.post('/api/household/invites', {})).status).toBe(201);
  });

  it('AC4: дані й запрошення колишнього власника лишаються', async () => {
    const { owner, member } = await ownerWithMember();
    const { body: card } = await owner.post('/api/accounts', { name: 'Картка', type: 'card' });
    const expense = await owner.post('/api/transactions', {
      type: 'expense',
      accountId: card.id,
      amountMinor: 4_200,
      occurredAt: '2026-03-01T12:00:00+02:00',
    });
    expect(expense.status).toBe(201);
    const inviteToken = await createInvite(owner);

    expect((await owner.post('/api/household/owner', { userId: member.userId })).status).toBe(200);

    for (const actor of [owner, member]) {
      expect(
        (await actor.get('/api/accounts')).body.items.map((a: { id: string }) => a.id),
      ).toEqual([card.id]);
      expect((await actor.get(`/api/transactions/${expense.body.id}`)).status).toBe(200);
    }
    const household = await member.get('/api/household');
    expect(household.body.invites).toHaveLength(1);
    const ownerName = (await owner.get('/api/auth/me')).body.user.name;
    expect(household.body.invites[0].createdByName).toBe(ownerName);

    const joined = await registerWithInvite(inviteToken);
    expect(joined.status).toBe(201);
    expect(joined.body.household).toMatchObject({ id: owner.householdId, role: 'member' });
  });

  it('AC5: колишній власник може вийти, новий — ні; новий може вилучити колишнього', async () => {
    const { owner, member } = await ownerWithMember();
    expect((await owner.post('/api/household/owner', { userId: member.userId })).status).toBe(200);

    const stay = await member.post('/api/household/leave', {});
    expect(stay.status).toBe(422);
    expect(stay.body.error.code).toBe('OWNER_CANNOT_LEAVE');
    expect((await owner.post('/api/household/leave', {})).status).toBe(204);
    expect((await owner.get('/api/auth/me')).body.household.id).not.toBe(owner.householdId);

    const { owner: other, member: otherMember } = await ownerWithMember();
    expect((await other.post('/api/household/owner', { userId: otherMember.userId })).status).toBe(
      200,
    );
    expect((await otherMember.delete(`/api/household/members/${other.userId}`)).status).toBe(204);
    expect(Object.keys(await rolesOf(otherMember))).toEqual([otherMember.userId]);
  });

  it('AC6: учасник не може передати роль', async () => {
    const { owner, member } = await ownerWithMember();
    const res = await member.post('/api/household/owner', { userId: member.userId });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('OWNER_ONLY');
    const other = await member.post('/api/household/owner', { userId: owner.userId });
    expect(other.status).toBe(403);
    expect(await rolesOf(owner)).toEqual({ [owner.userId]: 'owner', [member.userId]: 'member' });
  });

  it('AC7: передача собі — 422 ALREADY_OWNER', async () => {
    const { owner, member } = await ownerWithMember();
    const res = await owner.post('/api/household/owner', { userId: owner.userId });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ALREADY_OWNER');
    expect(await rolesOf(owner)).toEqual({ [owner.userId]: 'owner', [member.userId]: 'member' });
  });

  it('AC8: користувач іншого домогосподарства або неіснуючий — 404', async () => {
    const { owner, member } = await ownerWithMember();
    const stranger = await createActor();

    for (const userId of [stranger.userId, randomUUID()]) {
      const res = await owner.post('/api/household/owner', { userId });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    // і навпаки: чужий власник не може «передати» роль нашому учаснику
    expect((await stranger.post('/api/household/owner', { userId: member.userId })).status).toBe(
      404,
    );
    expect(await rolesOf(owner)).toEqual({ [owner.userId]: 'owner', [member.userId]: 'member' });
    expect(await rolesOf(stranger)).toEqual({ [stranger.userId]: 'owner' });
  });

  it('AC8: невалідне тіло — 400 навіть для учасника; без токена — 401', async () => {
    const { owner, member } = await ownerWithMember();
    for (const actor of [owner, member]) {
      for (const body of [{}, { userId: 'not-a-uuid' }, { userId: 42 }]) {
        const res = await actor.post('/api/household/owner', body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    }
    const anonymous = await request(app)
      .post('/api/household/owner')
      .send({ userId: member.userId });
    expect(anonymous.status).toBe(401);
    expect(await rolesOf(owner)).toEqual({ [owner.userId]: 'owner', [member.userId]: 'member' });
  });

  it('AC9: з двох одночасних передач проходить рівно одна', async () => {
    const { owner, member: first } = await ownerWithMember();
    const second = await addMember(owner);

    // Тест тримає домогосподарство, доки обидва запити не стануть у чергу на блокування.
    const lock = await lockHousehold(owner.householdId);
    const requests = [first, second].map((target) =>
      owner.post('/api/household/owner', { userId: target.userId }).then((res) => res),
    );
    await waitForLockWaiters(2);
    await lock.release();
    const responses = await Promise.all(requests);

    expect(responses.map((res) => res.status).sort()).toEqual([200, 403]);
    const failed = responses.find((res) => res.status === 403)!;
    expect(failed.body.error.code).toBe('OWNER_ONLY');
    const winner = responses[0]!.status === 200 ? first : second;
    const loser = winner === first ? second : first;
    expect(await rolesOf(winner)).toEqual({
      [owner.userId]: 'member',
      [winner.userId]: 'owner',
      [loser.userId]: 'member',
    });
  });

  it('передача й вихід отримувача одночасно не лишають домогосподарство без власника', async () => {
    const { owner, member } = await ownerWithMember();

    const lock = await lockHousehold(owner.householdId);
    const leave = member.post('/api/household/leave', {}).then((res) => res);
    await waitForLockWaiters(1);
    const transfer = owner
      .post('/api/household/owner', { userId: member.userId })
      .then((res) => res);
    await waitForLockWaiters(2);
    await lock.release();

    // Вихід став у чергу першим: отримувача вже немає.
    expect((await leave).status).toBe(204);
    expect((await transfer).status).toBe(404);
    expect(await rolesOf(owner)).toEqual({ [owner.userId]: 'owner' });
  });

  it('AC10: новий власник передає роль назад', async () => {
    const { owner, member } = await ownerWithMember();
    expect((await owner.post('/api/household/owner', { userId: member.userId })).status).toBe(200);

    const back = await member.post('/api/household/owner', { userId: owner.userId });
    expect(back.status).toBe(200);
    expect(back.body.role).toBe('member');
    expect(await rolesOf(owner)).toEqual({ [owner.userId]: 'owner', [member.userId]: 'member' });
    expect((await owner.get('/api/auth/me')).body.household.role).toBe('owner');
    expect((await owner.post('/api/accounts', { name: 'Картка', type: 'card' })).status).toBe(201);
  });
});
