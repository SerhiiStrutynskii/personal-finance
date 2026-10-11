import { and, count, desc, eq, gte, lt, or } from 'drizzle-orm';
import type { Db } from '../../db/client.ts';
import { transactions } from '../../db/schema.ts';
import type { ListTransactionsQuery } from './schema.ts';

export type TransactionRow = typeof transactions.$inferSelect;

/** Поля, які задає сервіс після перевірок; householdId завжди передається окремо. */
export type TransactionValues = Pick<
  TransactionRow,
  | 'type'
  | 'accountId'
  | 'toAccountId'
  | 'categoryId'
  | 'amountMinor'
  | 'currency'
  | 'description'
  | 'occurredAt'
>;

const owned = (householdId: string, id: string) =>
  and(eq(transactions.householdId, householdId), eq(transactions.id, id));

export async function listTransactions(db: Db, householdId: string, query: ListTransactionsQuery) {
  const where = and(
    eq(transactions.householdId, householdId),
    query.type ? eq(transactions.type, query.type) : undefined,
    // Переказ стосується обох рахунків.
    query.accountId
      ? or(
          eq(transactions.accountId, query.accountId),
          eq(transactions.toAccountId, query.accountId),
        )
      : undefined,
    query.categoryId ? eq(transactions.categoryId, query.categoryId) : undefined,
    query.from ? gte(transactions.occurredAt, new Date(query.from)) : undefined,
    query.to ? lt(transactions.occurredAt, new Date(query.to)) : undefined,
  );

  const [items, [totals]] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(where)
      .orderBy(desc(transactions.occurredAt), desc(transactions.id))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(transactions).where(where),
  ]);
  return { items, total: totals?.total ?? 0 };
}

export async function findTransaction(db: Db, householdId: string, id: string) {
  const [row] = await db.select().from(transactions).where(owned(householdId, id));
  return row;
}

export async function insertTransaction(
  db: Db,
  householdId: string,
  createdBy: string,
  values: TransactionValues,
) {
  const [row] = await db
    .insert(transactions)
    .values({ ...values, householdId, createdBy })
    .returning();
  return row!;
}

export async function replaceTransaction(
  db: Db,
  householdId: string,
  id: string,
  values: TransactionValues,
) {
  const [row] = await db
    .update(transactions)
    .set({ ...values, updatedAt: new Date() })
    .where(owned(householdId, id))
    .returning();
  return row;
}

export async function deleteTransaction(db: Db, householdId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(transactions)
    .where(owned(householdId, id))
    .returning({ id: transactions.id });
  return rows.length > 0;
}
