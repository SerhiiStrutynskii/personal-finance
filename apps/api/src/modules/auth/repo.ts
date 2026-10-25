import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { householdMembers, households, refreshTokens, users } from '../../db/schema.ts';
import { insertDefaultMealTypes } from '../menu/mealTypes.repo.ts';

export type UserRow = typeof users.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;

export async function findUserByEmail(db: DbOrTx, email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email));
  return row;
}

export async function findUserById(db: DbOrTx, id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

/*
 * Порядок блокувань в auth: спершу рядок users, потім рядки refresh_tokens. Зміна пароля бере
 * рядок користувача FOR UPDATE, вхід і оновлення токена — FOR SHARE: між собою вони не
 * заважають, а зі зміною пароля йдуть по черзі, тож токен, виданий одночасно зі зміною, або
 * відкликається нею, або не видається зовсім.
 */

/** Блокує рядок користувача до кінця транзакції: одночасні зміни пароля йдуть по черзі. */
export async function findUserByIdForUpdate(db: DbOrTx, id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).for('update');
  return row;
}

/** Спільне блокування рядка користувача: чекає на зміну пароля, що вже йде, і не дає почати нову. */
export async function findUserByIdForShare(db: DbOrTx, id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).for('share');
  return row;
}

export async function updatePasswordHash(db: DbOrTx, userId: string, passwordHash: string) {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function insertUser(
  db: DbOrTx,
  values: { email: string; name: string; passwordHash: string },
) {
  const [row] = await db.insert(users).values(values).returning();
  return row!;
}

/** Нове домогосподарство з власником і типовими прийомами їжі для меню. */
export async function insertHouseholdWithOwner(db: DbOrTx, name: string, userId: string) {
  const [household] = await db.insert(households).values({ name }).returning();
  await db.insert(householdMembers).values({ householdId: household!.id, userId, role: 'owner' });
  await insertDefaultMealTypes(db, household!.id);
  return household!;
}

/** Домогосподарство користувача. Поки запрошень немає, воно одне; береться найраніше членство. */
export async function findMembership(db: DbOrTx, userId: string) {
  const [row] = await db
    .select({ id: households.id, name: households.name, role: householdMembers.role })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId))
    .orderBy(asc(householdMembers.createdAt))
    .limit(1);
  return row;
}

export async function insertRefreshToken(
  db: DbOrTx,
  values: { userId: string; tokenHash: string; familyId: string; expiresAt: Date },
) {
  await db.insert(refreshTokens).values(values);
}

/** Блокує рядок до кінця транзакції, щоб два одночасні оновлення не пройшли з одним токеном. */
export async function findRefreshTokenForUpdate(db: DbOrTx, tokenHash: string) {
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .for('update');
  return row;
}

export async function revokeRefreshToken(db: DbOrTx, id: string, now: Date) {
  await db.update(refreshTokens).set({ revokedAt: now }).where(eq(refreshTokens.id, id));
}

export async function revokeFamily(db: DbOrTx, familyId: string, now: Date) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

export async function findRefreshToken(db: DbOrTx, tokenHash: string) {
  const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
  return row;
}

/** Відкликає всі ще дійсні refresh-токени користувача: усі його входи, у всіх родинах. */
export async function revokeAllForUser(db: DbOrTx, userId: string, now: Date) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
