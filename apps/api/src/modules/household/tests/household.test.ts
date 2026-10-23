import { randomUUID } from 'node:crypto';
import { MAX_ACTIVE_INVITES } from '@hf/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../../app.ts';
import { TEST_JWT_SECRET, setupTestApp, type Actor } from '../../../test/harness.ts';

const { app, db, client, createActor, setNow } = setupTestApp();

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
