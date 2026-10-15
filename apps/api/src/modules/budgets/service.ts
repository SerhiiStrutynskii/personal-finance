import {
  UNCATEGORIZED_NAME,
  budgetPeriod,
  categoryPathName,
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
import { ensureSystemCategory, findCategory, listChildren } from '../categories/repo.ts';
import { sumActiveLoanPayments } from '../debts/repo.ts';
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
      categoryName: row.categoryName
        ? categoryPathName(row.categoryName, row.parentName)
        : UNCATEGORIZED_NAME,
      parentId: row.parentId,
      ...(row.categoryName && row.parentName && { shortName: row.categoryName }),
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
  // Запланований і фактичний прибуток місяця бюджет бере з фічі прибутків.
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
      categoryName: categoryPathName(line.categoryName, line.parentName),
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

/**
 * Новий бюджет одразу має ліміт «Погашення боргів» на суму щомісячних платежів активних
 * позик і розстрочок. Кредитки сюди не входять: їхні покупки вже є витратами своїх категорій.
 */
async function addDebtRepaymentLimit(
  tx: DbOrTx,
  auth: AuthContext,
  budgetId: string,
  month: string,
) {
  const plannedAmount = await sumActiveLoanPayments(tx, auth.householdId, month);
  if (plannedAmount === 0) return;
  const category = await ensureSystemCategory(tx, auth.householdId, 'debt_repayment');
  await repo.insertExpenseLine(tx, budgetId, { categoryId: category.id, plannedAmount });
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
      if (source) {
        await repo.copyLines(tx, source.id, created.id);
      } else {
        await addDebtRepaymentLimit(tx, auth, created.id, input.month);
      }
      return created;
    });
    return await buildView(db, auth, budget, timeZone, now);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Бюджет на цей місяць уже існує');
    throw error;
  }
}

// --- Статті витрат ---

/**
 * Ліміт ставиться або на групу (рахує всі її підкатегорії), або на окремі підкатегорії, але не
 * на обидва рівні в одному бюджеті: інакше витрату підкатегорії порахувало б двічі.
 */
async function assertNoGroupOverlap(
  db: Db,
  auth: AuthContext,
  budgetId: string,
  category: { id: string; parentId: string | null },
) {
  const lines = await repo.listExpenseLines(db, budgetId);
  const planned = new Set(lines.map((line) => line.categoryId));
  if (category.parentId && planned.has(category.parentId)) {
    throw conflict('Ліміт уже задано на всю групу; ліміт на її підкатегорію не можна додати');
  }
  const children = await listChildren(db, auth.householdId, category.id);
  if (children.some((child) => planned.has(child.id))) {
    throw conflict('На підкатегорії цієї групи вже є ліміти; приберіть їх, щоб задати ліміт групі');
  }
}

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
  await assertNoGroupOverlap(db, auth, budget.id, category);

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
