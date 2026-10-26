import { productNameKey } from '@hf/shared';
import { and, asc, eq, max } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { mealTypes } from '../../db/schema.ts';

export type MealTypeRow = typeof mealTypes.$inferSelect;

/** Типові прийоми їжі нового домогосподарства, у цьому порядку. */
export const DEFAULT_MEAL_TYPES = ['Сніданок', 'Обід', 'Вечеря'] as const;

const owned = (householdId: string, id: string) =>
  and(eq(mealTypes.householdId, householdId), eq(mealTypes.id, id));

/** Прийоми їжі за порядком. lock блокує рядки до кінця транзакції (для зміни порядку). */
export function listMealTypes(
  db: DbOrTx,
  householdId: string,
  lock = false,
): Promise<MealTypeRow[]> {
  const query = db
    .select()
    .from(mealTypes)
    .where(eq(mealTypes.householdId, householdId))
    .orderBy(asc(mealTypes.position), asc(mealTypes.id));
  return lock ? query.for('update') : query;
}

export async function findMealType(db: DbOrTx, householdId: string, id: string) {
  const [row] = await db.select().from(mealTypes).where(owned(householdId, id));
  return row;
}

/** Позиція для нового прийому в кінці списку: max(position) + 1, у порожньому довіднику 0. */
export async function nextMealTypePosition(db: DbOrTx, householdId: string): Promise<number> {
  const [last] = await db
    .select({ position: max(mealTypes.position) })
    .from(mealTypes)
    .where(eq(mealTypes.householdId, householdId));
  return (last?.position ?? -1) + 1;
}

export async function insertMealType(
  db: DbOrTx,
  householdId: string,
  name: string,
  position: number,
) {
  const [row] = await db
    .insert(mealTypes)
    .values({ householdId, name, nameKey: productNameKey(name), position })
    .returning();
  return row!;
}

export async function renameMealType(db: DbOrTx, householdId: string, id: string, name: string) {
  const [row] = await db
    .update(mealTypes)
    .set({ name, nameKey: productNameKey(name), updatedAt: new Date() })
    .where(owned(householdId, id))
    .returning();
  return row;
}

export async function deleteMealType(db: DbOrTx, householdId: string, id: string) {
  const rows = await db
    .delete(mealTypes)
    .where(owned(householdId, id))
    .returning({ id: mealTypes.id });
  return rows.length > 0;
}

/** Позиції 0..n-1 у порядку ids. Викликається в транзакції після перевірки набору id. */
export async function reorderMealTypes(db: DbOrTx, householdId: string, ids: readonly string[]) {
  const now = new Date();
  for (const [position, id] of ids.entries()) {
    await db.update(mealTypes).set({ position, updatedAt: now }).where(owned(householdId, id));
  }
}

export async function insertDefaultMealTypes(db: DbOrTx, householdId: string) {
  await db.insert(mealTypes).values(
    DEFAULT_MEAL_TYPES.map((name, position) => ({
      householdId,
      name,
      nameKey: productNameKey(name),
      position,
    })),
  );
}
