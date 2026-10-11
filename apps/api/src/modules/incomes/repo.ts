import { and, asc, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { incomeOccurrences, incomeSources, transactions } from '../../db/schema.ts';

export type SourceRow = typeof incomeSources.$inferSelect;
export type SourceValues = Pick<
  SourceRow,
  | 'name'
  | 'accountId'
  | 'currency'
  | 'plannedAmount'
  | 'frequency'
  | 'dayOfMonth'
  | 'dayOfWeek'
  | 'intervalMonths'
  | 'startDate'
  | 'endDate'
>;

const ownedSource = (householdId: string, id: string) =>
  and(eq(incomeSources.householdId, householdId), eq(incomeSources.id, id));

export function listSources(db: DbOrTx, householdId: string) {
  return db
    .select()
    .from(incomeSources)
    .where(eq(incomeSources.householdId, householdId))
    .orderBy(asc(incomeSources.createdAt), asc(incomeSources.id));
}

export async function findSource(db: DbOrTx, householdId: string, id: string) {
  const [row] = await db.select().from(incomeSources).where(ownedSource(householdId, id));
  return row;
}

export async function insertSource(db: DbOrTx, householdId: string, values: SourceValues) {
  const [row] = await db
    .insert(incomeSources)
    .values({ ...values, householdId })
    .returning();
  return row!;
}

export async function updateSource(
  db: DbOrTx,
  householdId: string,
  id: string,
  values: Partial<SourceValues> & { isActive?: boolean },
) {
  const [row] = await db
    .update(incomeSources)
    .set({ ...values, updatedAt: new Date() })
    .where(ownedSource(householdId, id))
    .returning();
  return row;
}

export async function deleteSource(db: DbOrTx, householdId: string, id: string) {
  const rows = await db
    .delete(incomeSources)
    .where(ownedSource(householdId, id))
    .returning({ id: incomeSources.id });
  return rows.length > 0;
}

/** Чи є хоч одна транзакція, прив'язана до надходжень джерела. */
export async function sourceHasTransactions(db: DbOrTx, sourceId: string): Promise<boolean> {
  const [row] = await db
    .select({ found: sql<number>`1` })
    .from(transactions)
    .innerJoin(incomeOccurrences, eq(incomeOccurrences.id, transactions.occurrenceId))
    .where(eq(incomeOccurrences.sourceId, sourceId))
    .limit(1);
  return row !== undefined;
}
