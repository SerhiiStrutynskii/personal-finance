import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { goalDebts, goals } from '../../db/schema.ts';

export type GoalRow = typeof goals.$inferSelect;
export type GoalValues = Omit<
  typeof goals.$inferInsert,
  'id' | 'householdId' | 'createdAt' | 'updatedAt'
>;

const owned = (householdId: string, id: string) =>
  and(eq(goals.householdId, householdId), eq(goals.id, id));

export function listGoals(db: DbOrTx, householdId: string): Promise<GoalRow[]> {
  return (
    db
      .select()
      .from(goals)
      .where(eq(goals.householdId, householdId))
      // активні перед архівними
      .orderBy(asc(goals.status), asc(goals.createdAt), asc(goals.id))
  );
}

export async function findGoal(db: DbOrTx, householdId: string, id: string) {
  const [row] = await db.select().from(goals).where(owned(householdId, id));
  return row;
}

export async function insertGoal(db: DbOrTx, householdId: string, values: GoalValues) {
  const [row] = await db
    .insert(goals)
    .values({ ...values, householdId })
    .returning();
  return row!;
}

export async function updateGoal(
  db: DbOrTx,
  householdId: string,
  id: string,
  patch: Partial<GoalValues>,
) {
  const [row] = await db
    .update(goals)
    .set({ ...patch, updatedAt: new Date() })
    .where(owned(householdId, id))
    .returning();
  return row;
}

export async function deleteGoal(db: DbOrTx, householdId: string, id: string) {
  await db.delete(goals).where(owned(householdId, id));
}

export async function insertGoalDebts(db: DbOrTx, goalId: string, debtIds: readonly string[]) {
  await db.insert(goalDebts).values(debtIds.map((debtId) => ({ goalId, debtId })));
}

/** Борги цілей: goalId → список debtId. */
export async function listGoalDebts(
  db: DbOrTx,
  goalIds: readonly string[],
): Promise<Map<string, string[]>> {
  const byGoal = new Map<string, string[]>();
  if (goalIds.length === 0) return byGoal;
  const rows = await db
    .select()
    .from(goalDebts)
    .where(inArray(goalDebts.goalId, [...goalIds]));
  for (const row of rows) {
    byGoal.set(row.goalId, [...(byGoal.get(row.goalId) ?? []), row.debtId]);
  }
  return byGoal;
}
