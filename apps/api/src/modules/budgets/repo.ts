import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import {
  budgetExpenseLines,
  budgetIncomeLines,
  budgets,
  categories,
  households,
  transactions,
} from '../../db/schema.ts';
import type { BudgetStatus } from './schema.ts';

export type BudgetRow = typeof budgets.$inferSelect;
export type IncomeLineRow = typeof budgetIncomeLines.$inferSelect;
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

export function listIncomeLines(db: DbOrTx, budgetId: string) {
  return db
    .select()
    .from(budgetIncomeLines)
    .where(eq(budgetIncomeLines.budgetId, budgetId))
    .orderBy(asc(budgetIncomeLines.sortOrder), asc(budgetIncomeLines.id));
}

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

async function nextSortOrder(
  db: DbOrTx,
  table: typeof budgetIncomeLines | typeof budgetExpenseLines,
  budgetId: string,
) {
  const [row] = await db
    .select({ next: sql<number>`coalesce(max(${table.sortOrder}), -1) + 1`.mapWith(Number) })
    .from(table)
    .where(eq(table.budgetId, budgetId));
  return row?.next ?? 0;
}

export async function insertIncomeLine(
  db: DbOrTx,
  budgetId: string,
  values: { name: string; plannedAmount: number },
) {
  const sortOrder = await nextSortOrder(db, budgetIncomeLines, budgetId);
  const [row] = await db
    .insert(budgetIncomeLines)
    .values({ ...values, budgetId, sortOrder })
    .returning();
  return row!;
}

export async function updateIncomeLine(
  db: DbOrTx,
  budgetId: string,
  lineId: string,
  patch: { name?: string | undefined; plannedAmount?: number | undefined },
) {
  const [row] = await db
    .update(budgetIncomeLines)
    .set({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.plannedAmount !== undefined && { plannedAmount: patch.plannedAmount }),
    })
    .where(and(eq(budgetIncomeLines.budgetId, budgetId), eq(budgetIncomeLines.id, lineId)))
    .returning();
  return row;
}

export async function deleteIncomeLine(db: DbOrTx, budgetId: string, lineId: string) {
  const rows = await db
    .delete(budgetIncomeLines)
    .where(and(eq(budgetIncomeLines.budgetId, budgetId), eq(budgetIncomeLines.id, lineId)))
    .returning({ id: budgetIncomeLines.id });
  return rows.length > 0;
}

export async function insertExpenseLine(
  db: DbOrTx,
  budgetId: string,
  values: { categoryId: string; plannedAmount: number },
) {
  const sortOrder = await nextSortOrder(db, budgetExpenseLines, budgetId);
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

/** Копіює статті доходів і витрат з одного бюджету в інший; транзакції не чіпає. */
export async function copyLines(db: DbOrTx, fromBudgetId: string, toBudgetId: string) {
  const [incomeLines, expenseLines] = await Promise.all([
    listIncomeLines(db, fromBudgetId),
    listExpenseLines(db, fromBudgetId),
  ]);
  if (incomeLines.length > 0) {
    await db.insert(budgetIncomeLines).values(
      incomeLines.map(({ name, plannedAmount, sortOrder }) => ({
        budgetId: toBudgetId,
        name,
        plannedAmount,
        sortOrder,
      })),
    );
  }
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

/** Стаття доходу разом із періодом і валютою її бюджету, якщо він належить домогосподарству. */
export async function findIncomeLineWithBudget(db: DbOrTx, householdId: string, lineId: string) {
  const [row] = await db
    .select({
      id: budgetIncomeLines.id,
      periodStart: budgets.periodStart,
      periodEnd: budgets.periodEnd,
      currency: budgets.currency,
    })
    .from(budgetIncomeLines)
    .innerJoin(budgets, eq(budgets.id, budgetIncomeLines.budgetId))
    .where(and(eq(budgetIncomeLines.id, lineId), eq(budgets.householdId, householdId)));
  return row;
}

/**
 * Фактичні доходи й витрати домогосподарства за період [start, end) у валюті бюджету,
 * згруповані одним запитом. Перекази не враховуються.
 */
export function aggregateFacts(
  db: DbOrTx,
  householdId: string,
  period: { start: Date; end: Date },
  currency: string,
) {
  return db
    .select({
      type: transactions.type,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      incomeLineId: transactions.incomeLineId,
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
        inArray(transactions.type, ['income', 'expense']),
      ),
    )
    .groupBy(
      transactions.type,
      transactions.categoryId,
      categories.name,
      transactions.incomeLineId,
    );
}
