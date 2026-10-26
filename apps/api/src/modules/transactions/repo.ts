import type { Period } from '@hf/shared';
import { and, asc, count, desc, eq, gte, lt, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '../../db/client.ts';
import { accounts, categories, transactions } from '../../db/schema.ts';
import type { ListTransactionsQuery } from './schema.ts';

export type TransactionRow = typeof transactions.$inferSelect;

/** Поля, які задає сервіс після перевірок; householdId завжди передається окремо. */
export type TransactionValues = Pick<
  TransactionRow,
  | 'type'
  | 'accountId'
  | 'toAccountId'
  | 'categoryId'
  | 'occurrenceId'
  | 'amountMinor'
  | 'currency'
  | 'description'
  | 'occurredAt'
> & { debtId?: string | null };

const owned = (householdId: string, id: string) =>
  and(eq(transactions.householdId, householdId), eq(transactions.id, id));

export async function listTransactions(
  db: DbOrTx,
  householdId: string,
  query: ListTransactionsQuery,
) {
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
    query.occurrenceId ? eq(transactions.occurrenceId, query.occurrenceId) : undefined,
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

/** Батьківська категорія — для повної назви підкатегорії в експорті. */
const parentCategories = alias(categories, 'parent_categories');

export type ExpenseExportRow = Awaited<ReturnType<typeof listExpensesForExport>>[number];

/**
 * Усі витрати домогосподарства за період [start, end), без пагінації, від старіших до новіших.
 * Умова household_id стоїть і в join-ах, щоб чужі назви не потрапили навіть за битих посилань.
 */
export function listExpensesForExport(db: DbOrTx, householdId: string, period: Period) {
  return db
    .select({
      occurredAt: transactions.occurredAt,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      description: transactions.description,
      accountName: accounts.name,
      categoryName: categories.name,
      parentCategoryName: parentCategories.name,
    })
    .from(transactions)
    .innerJoin(
      accounts,
      and(eq(accounts.id, transactions.accountId), eq(accounts.householdId, householdId)),
    )
    .leftJoin(
      categories,
      and(eq(categories.id, transactions.categoryId), eq(categories.householdId, householdId)),
    )
    .leftJoin(
      parentCategories,
      and(
        eq(parentCategories.id, categories.parentId),
        eq(parentCategories.householdId, householdId),
      ),
    )
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, 'expense'),
        gte(transactions.occurredAt, period.start),
        lt(transactions.occurredAt, period.end),
      ),
    )
    .orderBy(asc(transactions.occurredAt), asc(transactions.id));
}

export async function findTransaction(db: DbOrTx, householdId: string, id: string) {
  const [row] = await db.select().from(transactions).where(owned(householdId, id));
  return row;
}

export async function insertTransaction(
  db: DbOrTx,
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
  db: DbOrTx,
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

export async function deleteTransaction(
  db: DbOrTx,
  householdId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(transactions)
    .where(owned(householdId, id))
    .returning({ id: transactions.id });
  return rows.length > 0;
}
