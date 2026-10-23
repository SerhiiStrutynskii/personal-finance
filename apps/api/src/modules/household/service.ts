import {
  INVITE_TTL_DAYS,
  MAX_ACTIVE_INVITES,
  type CreatedInvite,
  type Household,
  type InvitePreview,
  type UpdateHouseholdInput,
} from '@hf/shared';
import { createHash, randomBytes } from 'node:crypto';
import type { Db, DbOrTx } from '../../db/client.ts';
import { assertOwner, type AuthContext } from '../../http/auth.ts';
import { notFound, unprocessable } from '../../http/errors.ts';
import { insertHouseholdWithOwner } from '../auth/repo.ts';
import * as repo from './repo.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Назва порожнього домогосподарства, яке отримує користувач, що вийшов або якого вилучили. */
const OWN_HOUSEHOLD_NAME = 'Моє домогосподарство';

const hashInviteToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const inviteInvalid = () =>
  unprocessable(
    'INVITE_INVALID',
    'Запрошення недійсне: його відкликали, використали або строк минув',
  );

export async function getHousehold(db: Db, auth: AuthContext, now: Date): Promise<Household> {
  const [household, members, invites] = await Promise.all([
    repo.findHousehold(db, auth.householdId),
    repo.listMembers(db, auth.householdId),
    auth.role === 'owner' ? repo.listActiveInvites(db, auth.householdId, now) : [],
  ]);
  if (!household) throw notFound('Домогосподарство');
  return {
    id: household.id,
    name: household.name,
    role: auth.role,
    members: members.map((member) => ({ ...member, joinedAt: member.joinedAt.toISOString() })),
    invites: invites.map((invite) => ({
      ...invite,
      createdAt: invite.createdAt.toISOString(),
      expiresAt: invite.expiresAt.toISOString(),
    })),
  };
}

export async function updateHousehold(
  db: Db,
  auth: AuthContext,
  input: UpdateHouseholdInput,
  now: Date,
): Promise<Household> {
  assertOwner(auth);
  await repo.renameHousehold(db, auth.householdId, input.name);
  return getHousehold(db, auth, now);
}

/** Нове посилання-запрошення. Токен повертається один раз; у БД — лише його хеш. */
export async function createInvite(db: Db, auth: AuthContext, now: Date): Promise<CreatedInvite> {
  assertOwner(auth);
  if ((await repo.countActiveInvites(db, auth.householdId, now)) >= MAX_ACTIVE_INVITES) {
    throw unprocessable(
      'TOO_MANY_INVITES',
      `Активних запрошень може бути не більше ${MAX_ACTIVE_INVITES}. Відкличте непотрібні`,
    );
  }
  const token = randomBytes(32).toString('base64url');
  const row = await repo.insertInvite(db, {
    householdId: auth.householdId,
    tokenHash: hashInviteToken(token),
    createdBy: auth.userId,
    expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS),
  });
  const [creator] = (await repo.listMembers(db, auth.householdId)).filter(
    (member) => member.userId === auth.userId,
  );
  return {
    id: row.id,
    token,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    createdByName: creator?.name ?? null,
  };
}

export async function revokeInvite(
  db: Db,
  auth: AuthContext,
  id: string,
  now: Date,
): Promise<void> {
  assertOwner(auth);
  if (!(await repo.revokeInvite(db, auth.householdId, id, now))) throw notFound('Запрошення');
}

/**
 * Вилучає учасника. Він не втрачає акаунт: отримує власне порожнє домогосподарство, а доступ
 * до цього зникає з наступного запиту, бо членство перевіряється щоразу.
 */
export async function removeMember(db: Db, auth: AuthContext, userId: string): Promise<void> {
  assertOwner(auth);
  if (userId === auth.userId) {
    throw unprocessable('OWNER_CANNOT_LEAVE', 'Власник не може вилучити себе');
  }
  await db.transaction(async (tx) => {
    if (!(await repo.findMember(tx, auth.householdId, userId))) throw notFound('Учасник');
    await moveToOwnHousehold(tx, auth.householdId, userId);
  });
}

/** Учасник виходить із домогосподарства й отримує власне порожнє. */
export async function leaveHousehold(db: Db, auth: AuthContext): Promise<void> {
  if (auth.role === 'owner') {
    throw unprocessable(
      'OWNER_CANNOT_LEAVE',
      'Власник не може вийти з домогосподарства, яким керує',
    );
  }
  await db.transaction((tx) => moveToOwnHousehold(tx, auth.householdId, auth.userId));
}

async function moveToOwnHousehold(tx: DbOrTx, householdId: string, userId: string) {
  await repo.deleteMember(tx, householdId, userId);
  await insertHouseholdWithOwner(tx, OWN_HOUSEHOLD_NAME, userId);
}

/** Що показати на сторінці реєстрації за посиланням. Недійсне запрошення — 404. */
export async function previewInvite(db: Db, token: string, now: Date): Promise<InvitePreview> {
  const invite = await repo.findActiveInvite(db, hashInviteToken(token), now);
  if (!invite) throw notFound('Запрошення');
  return { householdName: invite.householdName, invitedBy: invite.invitedBy };
}

/** Приєднує щойно створеного користувача до домогосподарства із запрошення (у транзакції). */
export async function joinByInvite(tx: DbOrTx, token: string, userId: string, now: Date) {
  const invite = await repo.findActiveInvite(tx, hashInviteToken(token), now);
  if (!invite || !(await repo.acceptInvite(tx, invite.id, userId, now))) throw inviteInvalid();
  await repo.insertMember(tx, invite.householdId, userId);
  return { id: invite.householdId, name: invite.householdName, role: 'member' as const };
}
