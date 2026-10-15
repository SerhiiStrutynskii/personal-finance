import {
  DEFAULT_CURRENCY,
  UNCATEGORIZED_NAME,
  breakdownByCategory,
  budgetPeriod,
  buildTrend,
  debtLoad,
  forecastSpending,
  localDateKey,
  localMonthKey,
  monthProgress,
  monthsEndingAt,
  shiftMonth,
  type AnalyticsMonth,
  type AnalyticsTrend,
  type BudgetView,
  type LoanHistory,
  type TrendLength,
} from '@hf/shared';
import type { Db } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { AppError, badRequest, notFound } from '../../http/errors.ts';
import { aggregateSpending, findHouseholdTimeZone } from '../budgets/repo.ts';
import { getBudgetByMonth } from '../budgets/service.ts';
import { listDebts } from '../debts/repo.ts';
import { getOverview } from '../debts/service.ts';
import { getIncomes } from '../incomes/occurrences.service.ts';
import * as repo from './repo.ts';

// Аналітика, як і бюджет, доходи й борги, рахується в одній валюті: суми різних валют не складаються.
const CURRENCY = DEFAULT_CURRENCY;

/** Часовий пояс, сьогоднішня дата й запитаний місяць; майбутній місяць не аналізується. */
async function resolveMonth(db: Db, auth: AuthContext, month: string | undefined, now: Date) {
  const timeZone = await findHouseholdTimeZone(db, auth.householdId);
  if (!timeZone) throw notFound('Домогосподарство');
  const currentMonth = localMonthKey(now, timeZone);
  const resolved = month ?? currentMonth;
  if (resolved > currentMonth) throw badRequest('Аналітика майбутніх місяців недоступна');
  return { timeZone, today: localDateKey(now, timeZone), currentMonth, month: resolved };
}

async function spendingOf(db: Db, auth: AuthContext, month: string, timeZone: string) {
  const rows = await aggregateSpending(
    db,
    auth.householdId,
    budgetPeriod(month, timeZone),
    CURRENCY,
  );
  return rows.map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName ?? UNCATEGORIZED_NAME,
    parentId: row.parentId,
    parentName: row.parentName,
    spent: row.total,
  }));
}

/** Бюджет місяця або null, якщо його ще не створено. */
async function budgetOf(db: Db, auth: AuthContext, month: string, now: Date) {
  try {
    return await getBudgetByMonth(db, auth, month, now);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return null;
    throw error;
  }
}

/** Перевитрати беруться з бюджету: рядки зі статусом over і незаплановані витрати. */
function overspentOf(budget: BudgetView): NonNullable<AnalyticsMonth['budget']>['overspent'] {
  return [
    ...budget.expenseLines
      .filter((line) => line.status === 'over')
      .map((line) => ({
        categoryId: line.categoryId,
        categoryName: line.categoryName,
        planned: line.planned,
        spent: line.spent,
        overBy: line.spent - line.planned,
      })),
    ...budget.unplannedExpenses.map((line) => ({
      categoryId: line.categoryId,
      categoryName: line.categoryName,
      planned: 0,
      spent: line.spent,
      overBy: line.spent,
    })),
  ].sort((a, b) => b.overBy - a.overBy);
}

export async function getMonthAnalytics(
  db: Db,
  auth: AuthContext,
  requestedMonth: string | undefined,
  now: Date,
): Promise<AnalyticsMonth> {
  const { timeZone, today, currentMonth, month } = await resolveMonth(
    db,
    auth,
    requestedMonth,
    now,
  );
  const [current, previous, budget] = await Promise.all([
    spendingOf(db, auth, month, timeZone),
    spendingOf(db, auth, shiftMonth(month, -1), timeZone),
    budgetOf(db, auth, month, now),
  ]);
  const breakdown = breakdownByCategory(current, previous);
  const isCurrentMonth = month === currentMonth;
  const { daysElapsed, daysInMonth } = monthProgress(month, today);
  const project = (spent: number) => forecastSpending(spent, daysElapsed, daysInMonth);

  return {
    month,
    currency: CURRENCY,
    today,
    isCurrentMonth,
    ...breakdown,
    budget: budget && { overspent: overspentOf(budget) },
    forecast: isCurrentMonth
      ? {
          daysElapsed,
          daysInMonth,
          spent: breakdown.totalSpent,
          projected: project(breakdown.totalSpent),
          plannedExpenseTotal: budget?.summary.plannedExpenseTotal ?? null,
          categories: (budget?.expenseLines ?? []).map((line) => {
            const projected = project(line.spent);
            return {
              categoryId: line.categoryId,
              categoryName: line.categoryName,
              planned: line.planned,
              spent: line.spent,
              projected,
              projectedOverBy: Math.max(0, projected - line.planned),
            };
          }),
        }
      : null,
  };
}

const NO_MOVEMENTS = { charges: 0, principalPaid: 0, adjustments: 0 };

/** Позики й розстрочки з рухами по місяцях — для залишку на кінець кожного місяця. */
async function loanHistories(
  db: Db,
  auth: AuthContext,
  period: { start: Date; end: Date },
  timeZone: string,
): Promise<LoanHistory[]> {
  const [debts, movements] = await Promise.all([
    listDebts(db, auth.householdId),
    repo.loanMovements(db, auth.householdId, period, timeZone),
  ]);
  // Борг кредитки вже є від'ємним балансом її рахунку, тому тут лише позики й розстрочки.
  return debts
    .filter((debt) => debt.type !== 'credit_card' && debt.currency === CURRENCY)
    .map((debt) => {
      const own = movements.filter((movement) => movement.debtId === debt.id);
      return {
        initialAmount: debt.initialAmount,
        startDate: debt.startDate,
        before: own.find((movement) => movement.month === null) ?? NO_MOVEMENTS,
        monthly: own.flatMap((movement) =>
          movement.month === null ? [] : [{ ...movement, month: movement.month }],
        ),
      };
    });
}

export async function getTrendAnalytics(
  db: Db,
  auth: AuthContext,
  requestedMonth: string | undefined,
  length: TrendLength,
  now: Date,
): Promise<AnalyticsTrend> {
  const { timeZone, month } = await resolveMonth(db, auth, requestedMonth, now);
  const months = monthsEndingAt(month, length);
  const period = {
    start: budgetPeriod(months[0]!, timeZone).start,
    end: budgetPeriod(month, timeZone).end,
  };

  const [facts, accountsBefore, loans, debts, incomes] = await Promise.all([
    repo.monthlyFacts(db, auth.householdId, period, timeZone, CURRENCY),
    repo.accountsTotalBefore(db, auth.householdId, period.start, CURRENCY),
    loanHistories(db, auth, period, timeZone),
    getOverview(db, auth, month, now),
    getIncomes(db, auth, month, now),
  ]);
  const monthlyPayments = debts.summary.totalMonthlyPayments;
  const plannedIncome = incomes.summary.plannedTotal;

  return {
    month,
    months: length,
    currency: CURRENCY,
    points: buildTrend({ months, facts, accountsBefore, loans }),
    plannedDebtLoad: {
      monthlyPayments,
      plannedIncome,
      ratio: debtLoad(monthlyPayments, plannedIncome),
    },
  };
}
