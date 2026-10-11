import {
  UNCATEGORIZED_NAME,
  budgetPeriod,
  calculateBudget,
  getPeriodState,
  localMonthKey,
} from '@hf/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import {
  badRequest,
  budgetPeriodClosed,
  conflict,
  isForeignKeyViolation,
  isUniqueViolation,
  notFound,
} from '../../http/errors.ts';
import { findCategory } from '../categories/repo.ts';
import { getIncomes } from '../incomes/occurrences.service.ts';
import * as repo from './repo.ts';
import type {
  BudgetView,
  CreateBudgetInput,
  CreateExpenseLineInput,
  UpdateExpenseLineInput,
} from './schema.ts';

const budgetNotFound = () => notFound('Бюджет');

async function householdTimeZone(db: DbOrTx, auth: AuthContext): Promise<string> {
  const timeZone = await repo.findHouseholdTimeZone(db, auth.householdId);
  if (!timeZone) throw budgetNotFound();
  return timeZone;
}

async function loadSpending(db: DbOrTx, budget: repo.BudgetRow) {
  const rows = await repo.aggregateSpending(
    db,
    budget.householdId,
    { start: budget.periodStart, end: budget.periodEnd },
    budget.currency,
  );
  return rows.map((row) => {
    if (!Number.isSafeInteger(row.total)) throw new Error('Сума бюджету поза безпечним діапазоном');
    return {
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? UNCATEGORIZED_NAME,
      spent: row.total,
    };
  });
}

async function buildView(
  db: Db,
  auth: AuthContext,
  budget: repo.BudgetRow,
  timeZone: string,
  now: Date,
): Promise<BudgetView> {
  const month = localMonthKey(budget.periodStart, timeZone);
  // Запланований і фактичний дохід місяця бюджет бере з фічі доходів.
  const [expenseLines, spending, incomes] = await Promise.all([
    repo.listExpenseLines(db, budget.id),
    loadSpending(db, budget),
    getIncomes(db, auth, month, now),
  ]);

  const result = calculateBudget({
    plannedIncome: incomes.summary.plannedTotal,
    receivedIncome: incomes.summary.receivedTotal,
    expenseLines: expenseLines.map((line) => ({
      id: line.id,
      categoryId: line.categoryId,
      categoryName: line.categoryName,
      planned: line.plannedAmount,
    })),
    spending,
    now,
    periodEnd: budget.periodEnd,
  });

  const periodState = getPeriodState(budget.periodStart, budget.periodEnd, now);
  return {
    id: budget.id,
    month,
    currency: budget.currency,
    periodState,
    canAddExpense: periodState === 'current',
    canEditLimits: periodState !== 'past',
    periodStart: budget.periodStart.toISOString(),
    periodEnd: budget.periodEnd.toISOString(),
    ...result,
    incomes: {
      occurrences: incomes.occurrences.map((occurrence) => ({
        name: occurrence.name,
        plannedDate: occurrence.plannedDate,
        plannedAmount: occurrence.plannedAmount,
        actualAmount: occurrence.actualAmount,
        status: occurrence.status,
      })),
      oneTimeTotal: incomes.summary.oneTimeTotal,
    },
  };
}

async function viewById(db: Db, auth: AuthContext, id: string, now: Date): Promise<BudgetView> {
  const budget = await repo.findBudgetById(db, auth.householdId, id);
  if (!budget) throw budgetNotFound();
  return buildView(db, auth, budget, await householdTimeZone(db, auth), now);
}

/** Бюджет, ліміти якого можна змінювати: він існує в домогосподарстві й ще не минув. */
async function editableBudget(
  db: Db,
  auth: AuthContext,
  id: string,
  now: Date,
): Promise<repo.BudgetRow> {
  const budget = await repo.findBudgetById(db, auth.householdId, id);
  if (!budget) throw budgetNotFound();
  if (getPeriodState(budget.periodStart, budget.periodEnd, now) === 'past') {
    throw conflict('Місяць минув: ліміти цього бюджету можна лише переглядати');
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
  return buildView(db, auth, budget, timeZone, now);
}

export async function createBudget(
  db: Db,
  auth: AuthContext,
  input: CreateBudgetInput,
  now: Date = new Date(),
): Promise<BudgetView> {
  const timeZone = await householdTimeZone(db, auth);
  const period = budgetPeriod(input.month, timeZone);
  if (getPeriodState(period.start, period.end, now) === 'past') throw budgetPeriodClosed();

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
    return await buildView(db, auth, budget, timeZone, now);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Бюджет на цей місяць уже існує');
    throw error;
  }
}

// --- Статті витрат ---

export async function addExpenseLine(
  db: Db,
  auth: AuthContext,
  budgetId: string,
  input: CreateExpenseLineInput,
  now: Date = new Date(),
): Promise<BudgetView> {
  const budget = await editableBudget(db, auth, budgetId, now);
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
  const budget = await editableBudget(db, auth, budgetId, now);
  if (!(await repo.updateExpenseLine(db, budget.id, lineId, input))) {
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
  const budget = await editableBudget(db, auth, budgetId, now);
  if (!(await repo.deleteExpenseLine(db, budget.id, lineId))) throw notFound('Стаття витрат');
  return viewById(db, auth, budget.id, now);
}
