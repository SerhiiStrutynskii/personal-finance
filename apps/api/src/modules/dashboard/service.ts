import {
  DEFAULT_CURRENCY,
  buildAttention,
  buildMonthPlan,
  buildUpcoming,
  categoryPathName,
  netWorthOf,
  summarizeDebtPayments,
  type Dashboard,
} from '@hf/shared';
import type { Db } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { listAccounts } from '../accounts/service.ts';
import { getMonthAnalytics } from '../analytics/service.ts';
import { listCategories } from '../categories/repo.ts';
import { getOverview } from '../debts/service.ts';
import { listGoals } from '../goals/service.ts';
import { getIncomes } from '../incomes/occurrences.service.ts';
import { listTransactions } from '../transactions/repo.ts';

const CURRENCY = DEFAULT_CURRENCY;
const GOALS_LIMIT = 3;
const RECENT_LIMIT = 5;
/** Скільки останніх транзакцій переглядається, щоб набрати потрібну кількість операцій. */
const RECENT_SCAN = 50;
// Перекази й службові зміни балансу — не операції, які цікаві на головній.
const RECENT_TYPES = new Set(['expense', 'income', 'debt_payment']);

/**
 * Зведення поточного місяця. Нічого не рахує саме: числа й статуси беруться із сервісів
 * рахунків, аналітики, прибутків, боргів і цілей.
 */
export async function getDashboard(db: Db, auth: AuthContext, now: Date): Promise<Dashboard> {
  const analytics = await getMonthAnalytics(db, auth, undefined, now);
  const { month, today } = analytics;
  const [accounts, debts, incomes, goals, categories, transactions] = await Promise.all([
    listAccounts(db, auth),
    getOverview(db, auth, month, now),
    getIncomes(db, auth, month, now),
    listGoals(db, auth, now),
    listCategories(db, auth.householdId),
    listTransactions(db, auth.householdId, { limit: RECENT_SCAN, offset: 0 }),
  ]);

  const accountsTotal = accounts
    .filter((account) => account.currency === CURRENCY)
    .reduce((sum, account) => sum + account.balance, 0);
  // Борг кредитки вже є від'ємним балансом її рахунку, тому віднімаються лише позики й розстрочки.
  const loanBalances = debts.debts
    .filter((debt) => debt.status === 'active' && debt.type !== 'credit_card')
    .map((debt) => debt.balance);

  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const byId = new Map(categories.map((category) => [category.id, category]));
  // Підкатегорія показується з групою: «Комунальні › Вода».
  const categoryNames = new Map(
    categories.map((category) => [
      category.id,
      categoryPathName(
        category.name,
        category.parentId ? byId.get(category.parentId)?.name : undefined,
      ),
    ]),
  );
  const income = incomes.summary.receivedTotal;
  const expenses = analytics.totalSpent;
  // Аналітика завжди дає прогноз для поточного місяця.
  const forecast = analytics.forecast!;

  return {
    month,
    today,
    currency: CURRENCY,
    setup: {
      hasAccounts: accounts.length > 0,
      hasTransactions: transactions.total > 0,
      hasBudget: analytics.budget !== null,
    },
    money: {
      netWorth: netWorthOf(accountsTotal, loanBalances),
      accountsTotal,
      debtTotal: debts.summary.totalBalance,
      accounts: accounts
        .filter((account) => !account.isArchived)
        .map(({ id, name, type, currency, balance }) => ({ id, name, type, currency, balance })),
    },
    monthSummary: {
      income,
      expenses,
      net: income - expenses,
      plannedExpenseTotal: forecast.plannedExpenseTotal,
      projected: forecast.projected,
      daysElapsed: forecast.daysElapsed,
      daysInMonth: forecast.daysInMonth,
    },
    plan: buildMonthPlan(incomes.summary.plannedTotal, forecast.plannedExpenseTotal),
    debtPayments: summarizeDebtPayments(debts.debts),
    attention: buildAttention({
      debts: debts.debts,
      occurrences: incomes.occurrences,
      overspent: analytics.budget?.overspent ?? [],
      goals: goals.goals,
    }),
    upcoming: buildUpcoming({ debts: debts.debts, occurrences: incomes.occurrences, today }),
    goals: goals.goals.filter((goal) => goal.status === 'active').slice(0, GOALS_LIMIT),
    recent: transactions.items
      .filter((transaction) => RECENT_TYPES.has(transaction.type))
      .slice(0, RECENT_LIMIT)
      .map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        description: transaction.description,
        categoryName: transaction.categoryId
          ? (categoryNames.get(transaction.categoryId) ?? null)
          : null,
        accountName: accountNames.get(transaction.accountId) ?? '—',
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        occurredAt: transaction.occurredAt.toISOString(),
      })),
  };
}
