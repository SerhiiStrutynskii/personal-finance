import { and, asc, eq, gte, isNull, lt, notExists, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { incomeOccurrences, incomeSources, transactions } from '../../db/schema.ts';
import type { UpdateOccurrenceInput } from './schema.ts';

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
  values: Partial<SourceValues> & { isActive?: boolean; ruleFrom?: string },
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

// --- Надходження ---

export type OccurrenceRow = typeof incomeOccurrences.$inferSelect;

export function listActiveSources(db: DbOrTx, householdId: string) {
  return db
    .select()
    .from(incomeSources)
    .where(and(eq(incomeSources.householdId, householdId), eq(incomeSources.isActive, true)));
}

/** Створює надходження, яких ще немає; наявні (зокрема перенесені) не чіпає. */
export async function insertOccurrences(
  db: DbOrTx,
  rows: Pick<
    OccurrenceRow,
    'sourceId' | 'householdId' | 'scheduledDate' | 'plannedDate' | 'plannedAmount'
  >[],
) {
  if (rows.length > 0) await db.insert(incomeOccurrences).values(rows).onConflictDoNothing();
}

/** Видаляє ще не отримані надходження джерела з plannedDate від вказаної дати включно. */
export async function deleteUnpaidOccurrencesFrom(db: DbOrTx, sourceId: string, from: string) {
  await db.delete(incomeOccurrences).where(
    and(
      eq(incomeOccurrences.sourceId, sourceId),
      eq(incomeOccurrences.status, 'expected'),
      gte(incomeOccurrences.plannedDate, from),
      notExists(
        db
          .select({ found: sql`1` })
          .from(transactions)
          .where(eq(transactions.occurrenceId, incomeOccurrences.id)),
      ),
    ),
  );
}

function occurrencesWithActuals(db: DbOrTx) {
  // Фактичні сума й дата рахуються з прив'язаних транзакцій одним запитом.
  return db
    .select({
      id: incomeOccurrences.id,
      sourceId: incomeOccurrences.sourceId,
      name: incomeSources.name,
      accountId: incomeSources.accountId,
      currency: incomeSources.currency,
      plannedDate: incomeOccurrences.plannedDate,
      plannedAmount: incomeOccurrences.plannedAmount,
      status: incomeOccurrences.status,
      actualAmount: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)`.mapWith(Number),
      lastPaidAt: sql<string | null>`max(${transactions.occurredAt})`,
    })
    .from(incomeOccurrences)
    .innerJoin(incomeSources, eq(incomeSources.id, incomeOccurrences.sourceId))
    .leftJoin(transactions, eq(transactions.occurrenceId, incomeOccurrences.id))
    .groupBy(incomeOccurrences.id, incomeSources.id);
}

/** Надходження домогосподарства з plannedDate у [from, to). */
export function listOccurrences(db: DbOrTx, householdId: string, from: string, to: string) {
  return occurrencesWithActuals(db)
    .where(
      and(
        eq(incomeOccurrences.householdId, householdId),
        gte(incomeOccurrences.plannedDate, from),
        lt(incomeOccurrences.plannedDate, to),
      ),
    )
    .orderBy(
      asc(incomeOccurrences.plannedDate),
      asc(incomeSources.name),
      asc(incomeOccurrences.id),
    );
}

export async function findOccurrence(db: DbOrTx, householdId: string, id: string) {
  const [row] = await occurrencesWithActuals(db).where(
    and(eq(incomeOccurrences.householdId, householdId), eq(incomeOccurrences.id, id)),
  );
  return row;
}

export async function updateOccurrence(
  db: DbOrTx,
  householdId: string,
  id: string,
  patch: UpdateOccurrenceInput,
) {
  const [row] = await db
    .update(incomeOccurrences)
    .set({
      ...(patch.plannedDate !== undefined && { plannedDate: patch.plannedDate }),
      ...(patch.plannedAmount !== undefined && { plannedAmount: patch.plannedAmount }),
      ...(patch.status !== undefined && { status: patch.status }),
    })
    .where(and(eq(incomeOccurrences.householdId, householdId), eq(incomeOccurrences.id, id)))
    .returning();
  return row;
}

/** Надходження з валютою його джерела — для перевірки прив'язки транзакції. */
export async function findOccurrenceForLink(db: DbOrTx, householdId: string, id: string) {
  const [row] = await db
    .select({ id: incomeOccurrences.id, currency: incomeSources.currency })
    .from(incomeOccurrences)
    .innerJoin(incomeSources, eq(incomeSources.id, incomeOccurrences.sourceId))
    .where(and(eq(incomeOccurrences.householdId, householdId), eq(incomeOccurrences.id, id)));
  return row;
}

const incomeInPeriod = (
  householdId: string,
  period: { start: Date; end: Date },
  currency: string,
) =>
  and(
    eq(transactions.householdId, householdId),
    eq(transactions.type, 'income'),
    eq(transactions.currency, currency),
    gte(transactions.occurredAt, period.start),
    lt(transactions.occurredAt, period.end),
  );

/** Отримані за період доходи: окремо прив'язані до надходжень і разові. */
export async function incomeTotals(
  db: DbOrTx,
  householdId: string,
  period: { start: Date; end: Date },
  currency: string,
) {
  const [row] = await db
    .select({
      receivedRecurring:
        sql<number>`coalesce(sum(${transactions.amountMinor}) filter (where ${transactions.occurrenceId} is not null), 0)`.mapWith(
          Number,
        ),
      oneTimeTotal:
        sql<number>`coalesce(sum(${transactions.amountMinor}) filter (where ${transactions.occurrenceId} is null), 0)`.mapWith(
          Number,
        ),
    })
    .from(transactions)
    .where(incomeInPeriod(householdId, period, currency));
  return row ?? { receivedRecurring: 0, oneTimeTotal: 0 };
}

/** Разові доходи за період: доходи без прив'язки до надходження. */
export function listOneTimeIncomes(
  db: DbOrTx,
  householdId: string,
  period: { start: Date; end: Date },
  currency: string,
) {
  return db
    .select({
      id: transactions.id,
      description: transactions.description,
      occurredAt: transactions.occurredAt,
      amountMinor: transactions.amountMinor,
    })
    .from(transactions)
    .where(and(incomeInPeriod(householdId, period, currency), isNull(transactions.occurrenceId)))
    .orderBy(asc(transactions.occurredAt), asc(transactions.id));
}
