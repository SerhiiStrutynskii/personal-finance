import type { MemberRole } from '@hf/shared';
import { and, asc, count, desc, eq, gt, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { householdInvites, householdMembers, households, users } from '../../db/schema.ts';

export async function findHousehold(db: DbOrTx, householdId: string) {
  const [row] = await db.select().from(households).where(eq(households.id, householdId));
  return row;
}

export async function renameHousehold(db: DbOrTx, householdId: string, name: string) {
  await db.update(households).set({ name }).where(eq(households.id, householdId));
}

export async function listMembers(db: DbOrTx, householdId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: householdMembers.role,
      joinedAt: householdMembers.createdAt,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, householdId))
    .orderBy(asc(householdMembers.createdAt));
}

export async function findMember(db: DbOrTx, householdId: string, userId: string) {
  const [row] = await db
    .select()
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)));
  return row;
}

/**
 * Блокує рядок домогосподарства до кінця транзакції: зміни ролей і членства в одному
 * домогосподарстві виконуються по черзі.
 */
export async function lockHousehold(tx: DbOrTx, householdId: string) {
  await tx
    .select({ id: households.id })
    .from(households)
    .where(eq(households.id, householdId))
    .for('update');
}

/** Змінює роль учасника; false — такого учасника в домогосподарстві немає. */
export async function setMemberRole(
  db: DbOrTx,
  householdId: string,
  userId: string,
  role: MemberRole,
) {
  const rows = await db
    .update(householdMembers)
    .set({ role })
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
    .returning({ userId: householdMembers.userId });
  return rows.length > 0;
}

export async function insertMember(db: DbOrTx, householdId: string, userId: string) {
  await db.insert(householdMembers).values({ householdId, userId, role: 'member' });
}

export async function deleteMember(db: DbOrTx, householdId: string, userId: string) {
  await db
    .delete(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)));
}

const isActive = (now: Date) =>
  and(
    isNull(householdInvites.acceptedAt),
    isNull(householdInvites.revokedAt),
    gt(householdInvites.expiresAt, now),
  );

export async function listActiveInvites(db: DbOrTx, householdId: string, now: Date) {
  return db
    .select({
      id: householdInvites.id,
      createdAt: householdInvites.createdAt,
      expiresAt: householdInvites.expiresAt,
      createdByName: users.name,
    })
    .from(householdInvites)
    .leftJoin(users, eq(users.id, householdInvites.createdBy))
    .where(and(eq(householdInvites.householdId, householdId), isActive(now)))
    .orderBy(desc(householdInvites.createdAt));
}

export async function countActiveInvites(db: DbOrTx, householdId: string, now: Date) {
  const [row] = await db
    .select({ value: count() })
    .from(householdInvites)
    .where(and(eq(householdInvites.householdId, householdId), isActive(now)));
  return row?.value ?? 0;
}

export async function insertInvite(
  db: DbOrTx,
  values: { householdId: string; tokenHash: string; createdBy: string; expiresAt: Date },
) {
  const [row] = await db.insert(householdInvites).values(values).returning();
  return row!;
}

/** Відкликає активне запрошення свого домогосподарства; false — такого немає. */
export async function revokeInvite(db: DbOrTx, householdId: string, id: string, now: Date) {
  const rows = await db
    .update(householdInvites)
    .set({ revokedAt: now })
    .where(
      and(
        eq(householdInvites.id, id),
        eq(householdInvites.householdId, householdId),
        isActive(now),
      ),
    )
    .returning({ id: householdInvites.id });
  return rows.length > 0;
}

/** Активне запрошення за хешем токена разом із назвою домогосподарства. */
export async function findActiveInvite(db: DbOrTx, tokenHash: string, now: Date) {
  const [row] = await db
    .select({
      id: householdInvites.id,
      householdId: householdInvites.householdId,
      householdName: households.name,
      invitedBy: users.name,
    })
    .from(householdInvites)
    .innerJoin(households, eq(households.id, householdInvites.householdId))
    .leftJoin(users, eq(users.id, householdInvites.createdBy))
    .where(and(eq(householdInvites.tokenHash, tokenHash), isActive(now)));
  return row;
}

/**
 * Позначає запрошення використаним. Умова на активність у самому UPDATE: з двох одночасних
 * реєстрацій за одним посиланням пройде лише одна.
 */
export async function acceptInvite(db: DbOrTx, id: string, userId: string, now: Date) {
  const rows = await db
    .update(householdInvites)
    .set({ acceptedAt: now, acceptedBy: userId })
    .where(and(eq(householdInvites.id, id), isActive(now)))
    .returning({ id: householdInvites.id });
  return rows.length > 0;
}
