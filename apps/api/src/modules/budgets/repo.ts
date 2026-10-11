import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import {
  budgetExpenseLines,
  budgets,
  categories,
  households,
  transactions,
} from '../../db/schema.ts';
import type { BudgetStatus } from './schema.ts';

export type BudgetRow = typeof budgets.$inferSelect;
export type ExpenseLineRow = typeof budgetExpenseLines.$inferSelect;

export async function findHouseholdTimeZone(db: DbOrTx, householdId: string) {
  const [row] = await db
    .select({ timeZone: households.timeZone })
    .from(households)
    .where(eq(households.id, householdId));
  return row?.timeZone;
}

export async function findBudgetByPeriodStart(db: DbOrTx, householdId: string, periodStart: Date) {
  const [row] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.householdId, householdId), eq(budgets.periodStart, periodStart)));
  return row;
}

export async function findBudgetById(db: DbOrTx, householdId: string, id: string) {
  const [row] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.householdId, householdId), eq(budgets.id, id)));
  return row;
}

export async function insertBudget(
  db: DbOrTx,
  values: { householdId: string; periodStart: Date; periodEnd: Date },
) {
  const [row] = await db.insert(budgets).values(values).returning();
  return row!;
}

export async function updateBudgetStatus(
  db: DbOrTx,
  householdId: string,
  id: string,
  status: BudgetStatus,
) {
  const [row] = await db
    .update(budgets)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(budgets.householdId, householdId), eq(budgets.id, id)))
    .returning();
  return row;
}

// --- Статті ---

export function listExpenseLines(db: DbOrTx, budgetId: string) {
  return db
    .select({
      id: budgetExpenseLines.id,
      categoryId: budgetExpenseLines.categoryId,
      categoryName: categories.name,
      plannedAmount: budgetExpenseLines.plannedAmount,
      sortOrder: budgetExpenseLines.sortOrder,
    })
    .from(budgetExpenseLines)
    .innerJoin(categories, eq(categories.id, budgetExpenseLines.categoryId))
    .where(eq(budgetExpenseLines.budgetId, budgetId))
    .orderBy(asc(budgetExpenseLines.sortOrder), asc(budgetExpenseLines.id));
}

async function nextSortOrder(db: DbOrTx, budgetId: string) {
  const [row] = await db
    .select({
      next: sql<number>`coalesce(max(${budgetExpenseLines.sortOrder}), -1) + 1`.mapWith(Number),
    })
    .from(budgetExpenseLines)
    .where(eq(budgetExpenseLines.budgetId, budgetId));
  return row?.next ?? 0;
}

export async function insertExpenseLine(
  db: DbOrTx,
  budgetId: string,
  values: { categoryId: string; plannedAmount: number },
) {
  const sortOrder = await nextSortOrder(db, budgetId);
  const [row] = await db
    .insert(budgetExpenseLines)
    .values({ ...values, budgetId, sortOrder })
    .returning();
  return row!;
}

export async function updateExpenseLine(
  db: DbOrTx,
  budgetId: string,
  lineId: string,
  plannedAmount: number,
) {
  const [row] = await db
    .update(budgetExpenseLines)
    .set({ plannedAmount })
    .where(and(eq(budgetExpenseLines.budgetId, budgetId), eq(budgetExpenseLines.id, lineId)))
    .returning();
  return row;
}

export async function deleteExpenseLine(db: DbOrTx, budgetId: string, lineId: string) {
  const rows = await db
    .delete(budgetExpenseLines)
    .where(and(eq(budgetExpenseLines.budgetId, budgetId), eq(budgetExpenseLines.id, lineId)))
    .returning({ id: budgetExpenseLines.id });
  return rows.length > 0;
}

/** Копіює ліміти витрат з одного бюджету в інший; транзакції не чіпає. */
export async function copyLines(db: DbOrTx, fromBudgetId: string, toBudgetId: string) {
  const expenseLines = await listExpenseLines(db, fromBudgetId);
  if (expenseLines.length > 0) {
    await db.insert(budgetExpenseLines).values(
      expenseLines.map(({ categoryId, plannedAmount, sortOrder }) => ({
        budgetId: toBudgetId,
        categoryId,
        plannedAmount,
        sortOrder,
      })),
    );
  }
}

/**
 * Фактичні витрати домогосподарства за період [start, end) у валюті бюджету,
 * згруповані за категоріями одним запитом.
 */
export function aggregateSpending(
  db: DbOrTx,
  householdId: string,
  period: { start: Date; end: Date },
  currency: string,
) {
  return db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      total: sql<number>`sum(${transactions.amountMinor})`.mapWith(Number),
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        gte(transactions.occurredAt, period.start),
        lt(transactions.occurredAt, period.end),
        eq(transactions.currency, currency),
        eq(transactions.type, 'expense'),
      ),
    )
    .groupBy(transactions.categoryId, categories.name);
}
