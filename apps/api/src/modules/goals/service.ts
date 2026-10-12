import {
  GOAL_CURRENCY,
  budgetPeriod,
  comparePayoff,
  getDebtGoalProgress,
  getSavingsProgress,
  localDateKey,
  localMonthKey,
  shiftMonth,
  toAnnualRatePercent,
  toMonthlyRate,
  type CreateGoalInput,
  type Debt,
  type Goal,
  type GoalContributionInput,
  type GoalsList,
  type PayoffDebt,
  type PayoffPlanView,
  type PayoffStrategy,
  type UpdateGoalInput,
} from '@hf/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import {
  badRequest,
  conflict,
  isUniqueViolation,
  notFound,
  unprocessable,
} from '../../http/errors.ts';
import { accountBalances, findAccount, listAccounts } from '../accounts/repo.ts';
import { findHouseholdTimeZone } from '../budgets/repo.ts';
import { dayStart, getOverview, requirePaymentAccount } from '../debts/service.ts';
import { createTransaction } from '../transactions/service.ts';
import * as repo from './repo.ts';

const goalNotFound = () => notFound('Ціль');
const kindMismatch = (message: string) => unprocessable('GOAL_KIND_MISMATCH', message);
const accountTaken = () => conflict('На цьому рахунку вже є активна ціль');

/** Скільки попередніх повних місяців береться для середнього темпу накопичення. */
const PACE_MONTHS = 3;

interface GoalContext {
  today: string;
  currentMonth: string;
  timeZone: string;
  accountNames: Map<string, string>;
  balances: Map<string, number>;
  /** Баланси на початок поточного місяця й на три місяці раніше — для темпу накопичення. */
  balancesAtMonthStart: Map<string, number>;
  balancesBeforePace: Map<string, number>;
  debts: Map<string, Debt>;
  goalDebts: Map<string, string[]>;
}

async function timeZoneOf(db: DbOrTx, auth: AuthContext): Promise<string> {
  const timeZone = await findHouseholdTimeZone(db, auth.householdId);
  if (!timeZone) throw notFound('Домогосподарство');
  return timeZone;
}

/** Завантажує рахунки, баланси й борги, потрібні для розрахунків усіх цілей одразу. */
async function loadContext(
  db: Db,
  auth: AuthContext,
  rows: readonly repo.GoalRow[],
  now: Date,
): Promise<GoalContext> {
  const timeZone = await timeZoneOf(db, auth);
  const currentMonth = localMonthKey(now, timeZone);
  const monthStart = budgetPeriod(currentMonth, timeZone).start;
  const paceStart = budgetPeriod(shiftMonth(currentMonth, -PACE_MONTHS), timeZone).start;
  const debtGoalIds = rows.filter((row) => row.kind === 'debt_payoff').map((row) => row.id);

  const [accounts, balances, balancesAtMonthStart, balancesBeforePace, goalDebts, overview] =
    await Promise.all([
      listAccounts(db, auth.householdId),
      accountBalances(db, auth.householdId),
      accountBalances(db, auth.householdId, { before: monthStart }),
      accountBalances(db, auth.householdId, { before: paceStart }),
      repo.listGoalDebts(db, debtGoalIds),
      // Залишки, ставки й платежі боргів беруться з сервісу боргів.
      debtGoalIds.length > 0 ? getOverview(db, auth, undefined, now) : undefined,
    ]);

  return {
    today: localDateKey(now, timeZone),
    currentMonth,
    timeZone,
    accountNames: new Map(accounts.map((account) => [account.id, account.name])),
    balances,
    balancesAtMonthStart,
    balancesBeforePace,
    debts: new Map((overview?.debts ?? []).map((debt) => [debt.id, debt])),
    goalDebts,
  };
}

const toPayoffDebt = (debt: Debt): PayoffDebt => ({
  id: debt.id,
  balance: debt.balance,
  rate: toMonthlyRate(debt.interestRate, debt.ratePeriod),
  annualRatePercent: toAnnualRatePercent(debt.interestRate, debt.ratePeriod),
  monthlyPayment: debt.monthlyPayment,
  earlyRepaymentAllowed: debt.earlyRepaymentAllowed,
  firstPaymentMonth: debt.firstPaymentMonth,
});

/** Борги цілі, що ще існують: видалений борг із цілі зникає. */
function debtsOf(row: repo.GoalRow, context: GoalContext): Debt[] {
  return (context.goalDebts.get(row.id) ?? []).flatMap((debtId) => {
    const debt = context.debts.get(debtId);
    return debt ? [debt] : [];
  });
}

function toDto(row: repo.GoalRow, context: GoalContext): Goal {
  const base = {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    currency: row.currency,
  };

  if (row.kind === 'savings') {
    const accountId = row.accountId!;
    const atMonthStart = context.balancesAtMonthStart.get(accountId) ?? 0;
    const beforePace = context.balancesBeforePace.get(accountId) ?? 0;
    return {
      ...base,
      kind: 'savings',
      targetDate: row.targetDate,
      accountId,
      accountName: context.accountNames.get(accountId) ?? '—',
      targetAmount: row.targetAmount!,
      monthlyContribution: row.monthlyContribution,
      ...getSavingsProgress({
        targetAmount: row.targetAmount!,
        balance: context.balances.get(accountId) ?? 0,
        targetDate: row.targetDate,
        monthlyContribution: row.monthlyContribution,
        recentAverage: Math.round((atMonthStart - beforePace) / PACE_MONTHS),
        today: context.today,
      }),
    };
  }

  const debts = debtsOf(row, context);
  return {
    ...base,
    kind: 'debt_payoff',
    targetDate: row.targetDate!,
    debts: debts.map((debt) => ({ id: debt.id, name: debt.name, balance: debt.balance })),
    startBalance: row.startBalance!,
    extraPayment: row.extraPayment!,
    strategy: row.strategy!,
    ...getDebtGoalProgress({
      debts: debts.map(toPayoffDebt),
      startBalance: row.startBalance!,
      targetDate: row.targetDate!,
      extraPayment: row.extraPayment!,
      strategy: row.strategy!,
      today: context.today,
    }),
  };
}

async function requireGoal(db: DbOrTx, auth: AuthContext, id: string) {
  const row = await repo.findGoal(db, auth.householdId, id);
  if (!row) throw goalNotFound();
  return row;
}

async function buildGoal(db: Db, auth: AuthContext, row: repo.GoalRow, now: Date): Promise<Goal> {
  return toDto(row, await loadContext(db, auth, [row], now));
}

export async function listGoals(db: Db, auth: AuthContext, now: Date): Promise<GoalsList> {
  const rows = await repo.listGoals(db, auth.householdId);
  const context = await loadContext(db, auth, rows, now);
  return { today: context.today, goals: rows.map((row) => toDto(row, context)) };
}

export async function getGoal(db: Db, auth: AuthContext, id: string, now: Date): Promise<Goal> {
  return buildGoal(db, auth, await requireGoal(db, auth, id), now);
}

/** Рахунок цілі накопичення: свій, у гривні, не кредитна картка й не архівний. */
async function assertSavingsAccount(db: DbOrTx, auth: AuthContext, accountId: string) {
  const account = await findAccount(db, auth.householdId, accountId);
  if (!account) throw notFound('Рахунок');
  if (account.currency !== GOAL_CURRENCY) {
    throw unprocessable('CURRENCY_MISMATCH', 'Цілі ведуться лише на рахунках у гривні');
  }
  if (account.type === 'credit_card') {
    throw badRequest('На кредитній картці накопичувати не можна');
  }
  if (account.isArchived) throw badRequest('Архівний рахунок не можна привʼязати до цілі');
}

export async function createGoal(
  db: Db,
  auth: AuthContext,
  input: CreateGoalInput,
  now: Date,
): Promise<Goal> {
  const shared = { name: input.name, description: input.description || null };

  if (input.kind === 'savings') {
    await assertSavingsAccount(db, auth, input.accountId);
    try {
      const row = await repo.insertGoal(db, auth.householdId, {
        ...shared,
        kind: 'savings',
        accountId: input.accountId,
        targetAmount: input.targetAmount,
        targetDate: input.targetDate ?? null,
        monthlyContribution: input.monthlyContribution ?? null,
      });
      return await buildGoal(db, auth, row, now);
    } catch (error) {
      if (isUniqueViolation(error)) throw accountTaken();
      throw error;
    }
  }

  const overview = await getOverview(db, auth, undefined, now);
  const debts = input.debtIds.map((debtId) => overview.debts.find((debt) => debt.id === debtId));
  if (debts.some((debt) => !debt)) throw notFound('Борг');
  // Стартовий залишок фіксується, щоб прогрес рахувався від моменту створення цілі.
  const startBalance = debts.reduce((sum, debt) => sum + debt!.balance, 0);

  const row = await db.transaction(async (tx) => {
    const created = await repo.insertGoal(tx, auth.householdId, {
      ...shared,
      kind: 'debt_payoff',
      targetDate: input.targetDate,
      startBalance,
      extraPayment: input.extraPayment,
      strategy: input.strategy,
    });
    await repo.insertGoalDebts(tx, created.id, input.debtIds);
    return created;
  });
  return buildGoal(db, auth, row, now);
}

const SAVINGS_ONLY = ['accountId', 'targetAmount', 'monthlyContribution'] as const;
const DEBT_PAYOFF_ONLY = ['extraPayment', 'strategy'] as const;

export async function updateGoal(
  db: Db,
  auth: AuthContext,
  id: string,
  input: UpdateGoalInput,
  now: Date,
): Promise<Goal> {
  const existing = await requireGoal(db, auth, id);
  const isSavings = existing.kind === 'savings';
  const foreign = (isSavings ? DEBT_PAYOFF_ONLY : SAVINGS_ONLY).filter(
    (field) => input[field] !== undefined,
  );
  if (foreign.length > 0) {
    throw badRequest(`Ці поля не стосуються цілі цього виду: ${foreign.join(', ')}`);
  }
  if (!isSavings && input.targetDate === null) {
    throw badRequest('Для цілі виходу з боргів дата обовʼязкова');
  }
  if (input.accountId && input.accountId !== existing.accountId) {
    await assertSavingsAccount(db, auth, input.accountId);
  }

  try {
    const row = await repo.updateGoal(db, auth.householdId, id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description || null }),
      ...(input.targetDate !== undefined && { targetDate: input.targetDate }),
      ...(input.accountId !== undefined && { accountId: input.accountId }),
      ...(input.targetAmount !== undefined && { targetAmount: input.targetAmount }),
      ...(input.monthlyContribution !== undefined && {
        monthlyContribution: input.monthlyContribution ?? null,
      }),
      ...(input.extraPayment !== undefined && { extraPayment: input.extraPayment }),
      ...(input.strategy !== undefined && { strategy: input.strategy }),
    });
    if (!row) throw goalNotFound();
    return await buildGoal(db, auth, row, now);
  } catch (error) {
    if (isUniqueViolation(error)) throw accountTaken();
    throw error;
  }
}

/** Архівна ціль лишається в списку окремо й звільняє рахунок для нової цілі. */
export async function archiveGoal(db: Db, auth: AuthContext, id: string, now: Date): Promise<Goal> {
  await requireGoal(db, auth, id);
  const row = await repo.updateGoal(db, auth.householdId, id, { status: 'archived' });
  return buildGoal(db, auth, row!, now);
}

/** Видаляє лише ціль: рахунок, перекази й борги лишаються. */
export async function deleteGoal(db: Db, auth: AuthContext, id: string): Promise<void> {
  await requireGoal(db, auth, id);
  await repo.deleteGoal(db, auth.householdId, id);
}

/** Поповнення цілі накопичення — переказ з іншого рахунку на рахунок цілі. */
export async function contribute(
  db: Db,
  auth: AuthContext,
  id: string,
  input: GoalContributionInput,
  now: Date,
): Promise<Goal> {
  const row = await requireGoal(db, auth, id);
  if (row.kind !== 'savings') throw kindMismatch('Поповнити можна лише ціль накопичення');
  if (row.status !== 'active') throw conflict('Архівну ціль поповнити не можна');
  if (input.fromAccountId === row.accountId) {
    throw unprocessable('SAME_ACCOUNT', 'Поповнити ціль можна лише з іншого рахунку');
  }
  await requirePaymentAccount(db, auth, input.fromAccountId);

  const timeZone = await timeZoneOf(db, auth);
  const today = localDateKey(now, timeZone);
  if (input.date > today) {
    throw unprocessable('EXPENSE_DATE_IN_FUTURE', 'Поповнення не можна внести на майбутню дату');
  }
  await createTransaction(
    db,
    auth,
    {
      type: 'transfer',
      accountId: input.fromAccountId,
      toAccountId: row.accountId!,
      amountMinor: input.amount,
      currency: row.currency,
      description: `Ціль: ${row.name}`,
      // Сьогоднішнє поповнення отримує поточний час, щоб записи йшли в порядку внесення.
      occurredAt: (input.date === today ? now : dayStart(input.date, timeZone)).toISOString(),
    },
    now,
  );
  return buildGoal(db, auth, row, now);
}

/** План погашення боргів цілі; без параметрів — за додатковим платежем і стратегією цілі. */
export async function getPayoffPlan(
  db: Db,
  auth: AuthContext,
  id: string,
  options: { extra?: number | undefined; strategy?: PayoffStrategy | undefined },
  now: Date,
): Promise<PayoffPlanView> {
  const row = await requireGoal(db, auth, id);
  if (row.kind !== 'debt_payoff') {
    throw kindMismatch('План погашення є лише в цілі виходу з боргів');
  }
  const context = await loadContext(db, auth, [row], now);
  const debts = debtsOf(row, context);
  const names = new Map(debts.map((debt) => [debt.id, debt.name]));
  const extra = options.extra ?? row.extraPayment!;
  const strategy = options.strategy ?? row.strategy!;

  const { plan, baseline, interestSaved, monthsSaved } = comparePayoff({
    debts: debts.map(toPayoffDebt),
    extra,
    strategy,
    firstMonth: context.currentMonth,
  });
  return {
    extra,
    strategy,
    plan: {
      ...plan,
      payoffOrder: plan.payoffOrder.map((item) => ({
        ...item,
        name: names.get(item.debtId) ?? '—',
      })),
    },
    baseline,
    interestSaved,
    monthsSaved,
    withoutExtra: debts
      .filter((debt) => debt.balance > 0 && !debt.earlyRepaymentAllowed)
      .map((debt) => ({ debtId: debt.id, name: debt.name })),
  };
}
