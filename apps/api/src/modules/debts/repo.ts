import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { debtEntries, debts, transactions } from '../../db/schema.ts';

export type DebtRow = typeof debts.$inferSelect;
export type DebtEntryRow = typeof debtEntries.$inferSelect;
export type DebtValues = Omit<
  typeof debts.$inferInsert,
  'id' | 'householdId' | 'createdAt' | 'updatedAt'
>;

const owned = (householdId: string, id: string) =>
  and(eq(debts.householdId, householdId), eq(debts.id, id));

export function listDebts(db: DbOrTx, householdId: string): Promise<DebtRow[]> {
  return db
    .select()
    .from(debts)
    .where(eq(debts.householdId, householdId))
    .orderBy(asc(debts.createdAt), asc(debts.id));
}

export async function findDebt(db: DbOrTx, householdId: string, id: string) {
  const [row] = await db.select().from(debts).where(owned(householdId, id));
  return row;
}

export async function findDebtByAccount(db: DbOrTx, householdId: string, accountId: string) {
  const [row] = await db
    .select()
    .from(debts)
    .where(and(eq(debts.householdId, householdId), eq(debts.accountId, accountId)));
  return row;
}

export async function insertDebt(db: DbOrTx, householdId: string, values: DebtValues) {
  const [row] = await db
    .insert(debts)
    .values({ ...values, householdId })
    .returning();
  return row!;
}

export async function updateDebt(
  db: DbOrTx,
  householdId: string,
  id: string,
  patch: Partial<DebtValues>,
) {
  const [row] = await db
    .update(debts)
    .set({ ...patch, updatedAt: new Date() })
    .where(owned(householdId, id))
    .returning();
  return row;
}

export async function deleteDebt(db: DbOrTx, householdId: string, id: string) {
  await db.delete(debts).where(owned(householdId, id));
}

const num = (value: string | number | null | undefined) => Number(value ?? 0);

export interface LoanAggregate {
  /** Усі нарахування, тіло платежів і звірки — для поточного залишку. */
  charges: number;
  principalPaid: number;
  adjustments: number;
  /** Те саме до початку періоду — для залишку на початок місяця. */
  chargesBefore: number;
  principalPaidBefore: number;
  adjustmentsBefore: number;
  /** Нарахування і звірки в періоді. */
  increaseInPeriod: number;
  /** Сума платежів у періоді. */
  paidInPeriod: number;
  entryCount: number;
}

/** Агрегати записів позик і розстрочок домогосподарства одним запитом. */
export async function loanAggregates(
  db: DbOrTx,
  householdId: string,
  period: { start: Date; end: Date },
): Promise<Map<string, LoanAggregate>> {
  const before = sql`occurred_at < ${period.start}`;
  const inPeriod = sql`occurred_at >= ${period.start} AND occurred_at < ${period.end}`;
  const result = await db.execute<Record<string, string | null>>(sql`
    SELECT debt_id,
      sum(amount) FILTER (WHERE kind = 'charge') AS charges,
      sum(principal_part) FILTER (WHERE kind = 'payment') AS principal_paid,
      sum(amount) FILTER (WHERE kind = 'adjustment') AS adjustments,
      sum(amount) FILTER (WHERE kind = 'charge' AND ${before}) AS charges_before,
      sum(principal_part) FILTER (WHERE kind = 'payment' AND ${before}) AS principal_paid_before,
      sum(amount) FILTER (WHERE kind = 'adjustment' AND ${before}) AS adjustments_before,
      sum(amount) FILTER (WHERE kind IN ('charge', 'adjustment') AND ${inPeriod}) AS increase_in_period,
      sum(amount) FILTER (WHERE kind = 'payment' AND ${inPeriod}) AS paid_in_period,
      count(*) AS entry_count
    FROM ${debtEntries}
    WHERE household_id = ${householdId}
    GROUP BY debt_id
  `);
  return new Map(
    result.rows.map((row) => [
      row.debt_id!,
      {
        charges: num(row.charges),
        principalPaid: num(row.principal_paid),
        adjustments: num(row.adjustments),
        chargesBefore: num(row.charges_before),
        principalPaidBefore: num(row.principal_paid_before),
        adjustmentsBefore: num(row.adjustments_before),
        increaseInPeriod: num(row.increase_in_period),
        paidInPeriod: num(row.paid_in_period),
        entryCount: num(row.entry_count),
      },
    ]),
  );
}

export interface CardAggregate {
  /** Перекази на картку в періоді — погашення. */
  paidInPeriod: number;
  /** Покупки, відсотки й комісії з картки та збільшення боргу звіркою в періоді. */
  increaseInPeriod: number;
}

/** Рухи рахунків-карток домогосподарства в періоді одним запитом. */
export async function cardAggregates(
  db: DbOrTx,
  householdId: string,
  period: { start: Date; end: Date },
): Promise<Map<string, CardAggregate>> {
  const result = await db.execute<Record<string, string | null>>(sql`
    SELECT d.account_id,
      sum(t.amount_minor) FILTER (
        WHERE t.type = 'transfer' AND t.to_account_id = d.account_id
      ) AS paid,
      sum(abs(t.amount_minor)) FILTER (
        WHERE t.account_id = d.account_id
          AND (t.type = 'expense' OR (t.type = 'balance_adjustment' AND t.amount_minor < 0))
      ) AS increase
    FROM ${debts} d
    JOIN ${transactions} t
      ON (t.account_id = d.account_id OR t.to_account_id = d.account_id)
     AND t.household_id = d.household_id
     AND t.occurred_at >= ${period.start} AND t.occurred_at < ${period.end}
    WHERE d.household_id = ${householdId} AND d.account_id IS NOT NULL
    GROUP BY d.account_id
  `);
  return new Map(
    result.rows.map((row) => [
      row.account_id!,
      { paidInPeriod: num(row.paid), increaseInPeriod: num(row.increase) },
    ]),
  );
}

// --- Записи позик ---

export function listEntries(db: DbOrTx, householdId: string, debtId: string) {
  return db
    .select({ entry: debtEntries, accountId: transactions.accountId })
    .from(debtEntries)
    .leftJoin(transactions, eq(transactions.id, debtEntries.transactionId))
    .where(and(eq(debtEntries.householdId, householdId), eq(debtEntries.debtId, debtId)))
    .orderBy(desc(debtEntries.occurredAt), desc(debtEntries.createdAt));
}

export async function findEntry(db: DbOrTx, householdId: string, debtId: string, id: string) {
  const [row] = await db
    .select()
    .from(debtEntries)
    .where(
      and(
        eq(debtEntries.householdId, householdId),
        eq(debtEntries.debtId, debtId),
        eq(debtEntries.id, id),
      ),
    );
  return row;
}

export async function insertEntry(
  db: DbOrTx,
  values: Omit<typeof debtEntries.$inferInsert, 'id' | 'createdAt'>,
) {
  const [row] = await db.insert(debtEntries).values(values).returning();
  return row!;
}

export async function deleteEntry(db: DbOrTx, householdId: string, id: string) {
  await db
    .delete(debtEntries)
    .where(and(eq(debtEntries.householdId, householdId), eq(debtEntries.id, id)));
}

// --- Транзакції рахунку-картки ---

const ofAccount = (householdId: string, accountId: string) =>
  and(
    eq(transactions.householdId, householdId),
    or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId)),
  );

/** Останні транзакції рахунку: покупки, погашення, відсотки, звірки. */
export function listAccountTransactions(
  db: DbOrTx,
  householdId: string,
  accountId: string,
  limit: number,
) {
  return db
    .select()
    .from(transactions)
    .where(ofAccount(householdId, accountId))
    .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt))
    .limit(limit);
}

export async function deleteAccountTransactions(
  db: DbOrTx,
  householdId: string,
  accountId: string,
) {
  await db.delete(transactions).where(ofAccount(householdId, accountId));
}
