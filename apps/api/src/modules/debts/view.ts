import {
  budgetPeriod,
  getCardLimitState,
  getDebtBalance,
  getMonthPayment,
  localDateKey,
  localMonthKey,
  missesMaturity,
  nextDueDate,
  projectPayoff,
  requiredPaymentForMaturity,
  toMonthlyRate,
  type MonthPayment,
} from '@hf/shared';
import type { DbOrTx } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { notFound } from '../../http/errors.ts';
import { accountBalances, findAccountsByIds, type AccountRow } from '../accounts/repo.ts';
import { findHouseholdTimeZone } from '../budgets/repo.ts';
import * as repo from './repo.ts';
import type { Debt, DebtProjection } from './schema.ts';

/** Дані одного місяця, потрібні для статусу платежу всіх боргів домогосподарства. */
interface MonthData {
  month: string;
  loans: Map<string, repo.LoanAggregate>;
  cards: Map<string, repo.CardAggregate>;
  /** Баланси рахунків на початок місяця. */
  balancesBefore: Map<string, number>;
}

export interface DebtContext {
  timeZone: string;
  today: string;
  currentMonth: string;
  /** Поточні баланси рахунків. */
  balances: Map<string, number>;
  accounts: Map<string, AccountRow>;
  viewed: MonthData;
  current: MonthData;
}

async function loadMonth(db: DbOrTx, householdId: string, month: string, timeZone: string) {
  const period = budgetPeriod(month, timeZone);
  const [loans, cards, balancesBefore] = await Promise.all([
    repo.loanAggregates(db, householdId, period),
    repo.cardAggregates(db, householdId, period),
    accountBalances(db, householdId, { before: period.start }),
  ]);
  return { month, loans, cards, balancesBefore };
}

export async function timeZoneOf(db: DbOrTx, auth: AuthContext): Promise<string> {
  const timeZone = await findHouseholdTimeZone(db, auth.householdId);
  if (!timeZone) throw notFound('Домогосподарство');
  return timeZone;
}

/** Завантажує все потрібне для розрахунків боргів кількома агрегатними запитами. */
export async function loadDebtContext(
  db: DbOrTx,
  auth: AuthContext,
  rows: readonly repo.DebtRow[],
  month: string | undefined,
  now: Date,
): Promise<DebtContext> {
  const timeZone = await timeZoneOf(db, auth);
  const today = localDateKey(now, timeZone);
  const currentMonth = localMonthKey(now, timeZone);
  const viewedMonth = month ?? currentMonth;
  const cardAccountIds = rows.flatMap((row) => (row.accountId ? [row.accountId] : []));

  const [balances, accountRows, current] = await Promise.all([
    accountBalances(db, auth.householdId),
    cardAccountIds.length > 0
      ? findAccountsByIds(db, auth.householdId, cardAccountIds)
      : Promise.resolve([]),
    loadMonth(db, auth.householdId, currentMonth, timeZone),
  ]);
  const viewed =
    viewedMonth === currentMonth
      ? current
      : await loadMonth(db, auth.householdId, viewedMonth, timeZone);

  return {
    timeZone,
    today,
    currentMonth,
    balances,
    accounts: new Map(accountRows.map((account) => [account.id, account])),
    viewed,
    current,
  };
}

const EMPTY_LOAN: repo.LoanAggregate = {
  charges: 0,
  principalPaid: 0,
  adjustments: 0,
  chargesBefore: 0,
  principalPaidBefore: 0,
  adjustmentsBefore: 0,
  increaseInPeriod: 0,
  paidInPeriod: 0,
  entryCount: 0,
};

/** Поточний залишок боргу; спосіб обліку вибирає getDebtBalance. */
export function balanceOf(row: repo.DebtRow, context: DebtContext): number {
  if (row.accountId) {
    return getDebtBalance(row, { accountBalance: context.balances.get(row.accountId) ?? 0 });
  }
  return getDebtBalance(row, context.current.loans.get(row.id) ?? EMPTY_LOAN);
}

/** Платіж боргу за місяць: залишок на початок місяця, збільшення боргу й сплачене в ньому. */
export function monthPaymentOf(
  row: repo.DebtRow,
  data: MonthData,
  context: DebtContext,
): MonthPayment {
  let balanceAtMonthStart: number;
  let increase: number;
  let paid: number;
  if (row.accountId) {
    const card = data.cards.get(row.accountId);
    balanceAtMonthStart = getDebtBalance(row, {
      accountBalance: data.balancesBefore.get(row.accountId) ?? 0,
    });
    increase = card?.increaseInPeriod ?? 0;
    paid = card?.paidInPeriod ?? 0;
  } else {
    const loan = data.loans.get(row.id) ?? EMPTY_LOAN;
    balanceAtMonthStart = getDebtBalance(row, {
      charges: loan.chargesBefore,
      principalPaid: loan.principalPaidBefore,
      adjustments: loan.adjustmentsBefore,
    });
    increase = loan.increaseInPeriod;
    paid = loan.paidInPeriod;
  }
  return getMonthPayment({
    month: data.month,
    paymentDay: row.paymentDay,
    startDate: row.startDate,
    monthlyPayment: row.monthlyPayment,
    balanceAtMonthStart,
    chargesInMonth: increase,
    paid,
    today: context.today,
  });
}

/** Прогноз погашення від найближчого ще не внесеного платежу. */
export function projectionOf(
  row: repo.DebtRow,
  balance: number,
  currentPayment: MonthPayment,
  context: DebtContext,
  monthlyPayment: number = row.monthlyPayment,
): DebtProjection {
  const rate = toMonthlyRate(Number(row.interestRate), row.ratePeriod);
  const schedule = {
    balance,
    rate,
    firstDueDate: nextDueDate(context.currentMonth, row.paymentDay, currentPayment),
    paymentDay: row.paymentDay,
  };
  const projection = projectPayoff({ ...schedule, monthlyPayment });
  const late = missesMaturity(projection, row.maturityDate, balance);
  return {
    ...projection,
    maturityWarning: late
      ? {
          requiredPayment: requiredPaymentForMaturity({
            ...schedule,
            maturityDate: row.maturityDate!,
          }),
        }
      : null,
    assumesNoNewPurchases: row.type === 'credit_card',
  };
}

export function toDebtDto(row: repo.DebtRow, context: DebtContext): Debt {
  const balance = balanceOf(row, context);
  const account = row.accountId ? context.accounts.get(row.accountId) : undefined;
  const cardBalance = row.accountId ? (context.balances.get(row.accountId) ?? 0) : 0;
  const currentPayment = monthPaymentOf(row, context.current, context);

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    status: row.status,
    accountId: row.accountId,
    currency: row.currency,
    initialAmount: row.initialAmount,
    startDate: row.startDate,
    maturityDate: row.maturityDate,
    interestRate: Number(row.interestRate),
    ratePeriod: row.ratePeriod,
    monthlyPayment: row.monthlyPayment,
    paymentDay: row.paymentDay,
    earlyRepaymentAllowed: row.earlyRepaymentAllowed,
    defaultAccountId: row.defaultAccountId,
    balance,
    card: account?.creditLimit
      ? { creditLimit: account.creditLimit, ...getCardLimitState(account.creditLimit, cardBalance) }
      : null,
    month:
      context.viewed === context.current
        ? currentPayment
        : monthPaymentOf(row, context.viewed, context),
    projection: projectionOf(row, balance, currentPayment, context),
  };
}
