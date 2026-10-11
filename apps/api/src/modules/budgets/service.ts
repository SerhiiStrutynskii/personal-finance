import {
  UNCATEGORIZED_NAME,
  budgetPeriod,
  calculateBudget,
  localMonthKey,
  type BudgetFacts,
} from '@hf/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import {
  badRequest,
  conflict,
  isForeignKeyViolation,
  isUniqueViolation,
  notFound,
} from '../../http/errors.ts';
import { findCategory } from '../categories/repo.ts';
import * as repo from './repo.ts';
import type {
  BudgetStatus,
  BudgetView,
  CreateBudgetInput,
  CreateExpenseLineInput,
  CreateIncomeLineInput,
  UpdateExpenseLineInput,
  UpdateIncomeLineInput,
} from './schema.ts';

const budgetNotFound = () => notFound('Бюджет');

async function householdTimeZone(db: DbOrTx, auth: AuthContext): Promise<string> {
  const timeZone = await repo.findHouseholdTimeZone(db, auth.householdId);
  if (!timeZone) throw budgetNotFound();
  return timeZone;
}

async function loadFacts(db: DbOrTx, budget: repo.BudgetRow): Promise<BudgetFacts> {
  const rows = await repo.aggregateFacts(
    db,
    budget.householdId,
    { start: budget.periodStart, end: budget.periodEnd },
    budget.currency,
  );
  for (const row of rows) {
    if (!Number.isSafeInteger(row.total)) throw new Error('Сума бюджету поза безпечним діапазоном');
  }
  return {
    spending: rows
      .filter((row) => row.type === 'expense')
      .map((row) => ({
        categoryId: row.categoryId,
        categoryName: row.categoryName ?? UNCATEGORIZED_NAME,
        spent: row.total,
      })),
    income: rows
      .filter((row) => row.type === 'income')
      .map((row) => ({ incomeLineId: row.incomeLineId, received: row.total })),
  };
}

async function buildView(
  db: DbOrTx,
  budget: repo.BudgetRow,
  timeZone: string,
  now: Date,
): Promise<BudgetView> {
  const [incomeLines, expenseLines, facts] = await Promise.all([
    repo.listIncomeLines(db, budget.id),
    repo.listExpenseLines(db, budget.id),
    loadFacts(db, budget),
  ]);

  const result = calculateBudget({
    incomeLines: incomeLines.map((line) => ({
      id: line.id,
      name: line.name,
      planned: line.plannedAmount,
    })),
    expenseLines: expenseLines.map((line) => ({
      id: line.id,
      categoryId: line.categoryId,
      categoryName: line.categoryName,
      planned: line.plannedAmount,
    })),
    ...facts,
    now,
    periodEnd: budget.periodEnd,
  });

  return {
    id: budget.id,
    month: localMonthKey(budget.periodStart, timeZone),
    status: budget.status,
    currency: budget.currency,
    periodStart: budget.periodStart.toISOString(),
    periodEnd: budget.periodEnd.toISOString(),
    ...result,
  };
}

async function viewById(db: Db, auth: AuthContext, id: string, now: Date): Promise<BudgetView> {
  const budget = await repo.findBudgetById(db, auth.householdId, id);
  if (!budget) throw budgetNotFound();
  return buildView(db, budget, await householdTimeZone(db, auth), now);
}

/** Бюджет, у якому можна змінювати статті: він має існувати в домогосподарстві й не бути закритим. */
async function editableBudget(db: Db, auth: AuthContext, id: string): Promise<repo.BudgetRow> {
  const budget = await repo.findBudgetById(db, auth.householdId, id);
  if (!budget) throw budgetNotFound();
  if (budget.status === 'closed') {
    throw conflict('Бюджет закрито: статті можна лише переглядати');
  }
  return budget;
}

export async function getBudgetByMonth(
  db: Db,
  auth: AuthContext,
  month: string,
  now: Date = new Date(),
): Promise<BudgetView> {
  const timeZone = await householdTimeZone(db, auth);
  const period = budgetPeriod(month, timeZone);
  const budget = await repo.findBudgetByPeriodStart(db, auth.householdId, period.start);
  if (!budget) throw budgetNotFound();
  return buildView(db, budget, timeZone, now);
}

export async function createBudget(
  db: Db,
  auth: AuthContext,
  input: CreateBudgetInput,
  now: Date = new Date(),
): Promise<BudgetView> {
  const timeZone = await householdTimeZone(db, auth);
  const period = budgetPeriod(input.month, timeZone);

  let source: repo.BudgetRow | undefined;
  if (input.copyFrom) {
    const sourcePeriod = budgetPeriod(input.copyFrom, timeZone);
    source = await repo.findBudgetByPeriodStart(db, auth.householdId, sourcePeriod.start);
    if (!source) throw notFound('Бюджет місяця, з якого треба скопіювати статті');
  }

  try {
    const budget = await db.transaction(async (tx) => {
      const created = await repo.insertBudget(tx, {
        householdId: auth.householdId,
        periodStart: period.start,
        periodEnd: period.end,
      });
      if (source) await repo.copyLines(tx, source.id, created.id);
      return created;
    });
    return await buildView(db, budget, timeZone, now);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Бюджет на цей місяць уже існує');
    throw error;
  }
}

export async function updateBudgetStatus(
  db: Db,
  auth: AuthContext,
  id: string,
  status: BudgetStatus,
  now: Date = new Date(),
): Promise<BudgetView> {
  const budget = await repo.updateBudgetStatus(db, auth.householdId, id, status);
  if (!budget) throw budgetNotFound();
  return buildView(db, budget, await householdTimeZone(db, auth), now);
}

// --- Статті доходів ---

export async function addIncomeLine(
  db: Db,
  auth: AuthContext,
  budgetId: string,
  input: CreateIncomeLineInput,
  now: Date = new Date(),
): Promise<BudgetView> {
  const budget = await editableBudget(db, auth, budgetId);
  await repo.insertIncomeLine(db, budget.id, input);
  return viewById(db, auth, budget.id, now);
}

export async function updateIncomeLine(
  db: Db,
  auth: AuthContext,
  budgetId: string,
  lineId: string,
  input: UpdateIncomeLineInput,
  now: Date = new Date(),
): Promise<BudgetView> {
  const budget = await editableBudget(db, auth, budgetId);
  if (!(await repo.updateIncomeLine(db, budget.id, lineId, input))) {
    throw notFound('Стаття доходу');
  }
  return viewById(db, auth, budget.id, now);
}

/** Транзакції статті лишаються й переходять в «Інші доходи» (зовнішній ключ обнуляється). */
export async function deleteIncomeLine(
  db: Db,
  auth: AuthContext,
  budgetId: string,
  lineId: string,
  now: Date = new Date(),
): Promise<BudgetView> {
  const budget = await editableBudget(db, auth, budgetId);
  if (!(await repo.deleteIncomeLine(db, budget.id, lineId))) throw notFound('Стаття доходу');
  return viewById(db, auth, budget.id, now);
}

// --- Статті витрат ---

export async function addExpenseLine(
  db: Db,
  auth: AuthContext,
  budgetId: string,
  input: CreateExpenseLineInput,
  now: Date = new Date(),
): Promise<BudgetView> {
  const budget = await editableBudget(db, auth, budgetId);
  const category = await findCategory(db, auth.householdId, input.categoryId);
  if (!category) throw badRequest('Категорію не знайдено');
  if (category.kind !== 'expense') throw badRequest('Ліміт можна задати лише для категорії витрат');

  try {
    await repo.insertExpenseLine(db, budget.id, input);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Ліміт для цієї категорії вже задано');
    // Категорію могли видалити між перевіркою і записом.
    if (isForeignKeyViolation(error)) throw badRequest('Категорію не знайдено');
    throw error;
  }
  return viewById(db, auth, budget.id, now);
}

export async function updateExpenseLine(
  db: Db,
  auth: AuthContext,
  budgetId: string,
  lineId: string,
  input: UpdateExpenseLineInput,
  now: Date = new Date(),
): Promise<BudgetView> {
  const budget = await editableBudget(db, auth, budgetId);
  if (!(await repo.updateExpenseLine(db, budget.id, lineId, input.plannedAmount))) {
    throw notFound('Стаття витрат');
  }
  return viewById(db, auth, budget.id, now);
}

export async function deleteExpenseLine(
  db: Db,
  auth: AuthContext,
  budgetId: string,
  lineId: string,
  now: Date = new Date(),
): Promise<BudgetView> {
  const budget = await editableBudget(db, auth, budgetId);
  if (!(await repo.deleteExpenseLine(db, budget.id, lineId))) throw notFound('Стаття витрат');
  return viewById(db, auth, budget.id, now);
}
