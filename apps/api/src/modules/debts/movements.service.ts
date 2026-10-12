import { isEarlyPayment, suggestPaymentSplit, toMonthlyRate, type MonthPayment } from '@hf/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { badRequest, conflict, notFound, unprocessable } from '../../http/errors.ts';
import { ensureSystemCategory } from '../categories/repo.ts';
import { deleteTransaction, insertTransaction } from '../transactions/repo.ts';
import { createTransaction } from '../transactions/service.ts';
import * as repo from './repo.ts';
import type {
  CardPaymentInput,
  DebtAdjustmentInput,
  DebtChargeInput,
  DebtDetails,
  DebtPaymentInput,
  PaymentPreview,
} from './schema.ts';
import { dayStart, getDebt, requireDebt, requirePaymentAccount } from './service.ts';
import {
  balanceOf,
  loadDebtContext,
  monthPaymentOf,
  projectionOf,
  type DebtContext,
} from './view.ts';

const typeMismatch = (message: string) => unprocessable('DEBT_TYPE_MISMATCH', message);

/** Записи боргу й платежі з рахунку є лише в позик і розстрочок. */
export function assertLoan(row: repo.DebtRow) {
  if (row.type === 'credit_card') {
    throw typeMismatch('Кредитка гаситься переказом на картку, а не платежем по боргу');
  }
}

/**
 * Момент руху для календарної дати: сьогодні — поточний час, щоб записи йшли в порядку
 * внесення; інша дата — початок цього дня. Майбутня дата заборонена, як і для видатків.
 */
export function movementInstant(date: string, context: DebtContext, now: Date): Date {
  if (date > context.today) {
    throw unprocessable('EXPENSE_DATE_IN_FUTURE', 'Рух по боргу не можна внести на майбутню дату');
  }
  return date === context.today ? now : dayStart(date, context.timeZone);
}

/** Позика закривається сама, коли залишок стає нульовим, і відкривається знову з новим боргом. */
async function syncLoanStatus(tx: DbOrTx, auth: AuthContext, row: repo.DebtRow, now: Date) {
  const context = await loadDebtContext(tx, auth, [row], undefined, now);
  const status = balanceOf(row, context) === 0 ? 'closed' : 'active';
  if (status !== row.status) await repo.updateDebt(tx, auth.householdId, row.id, { status });
}

/** Платіж місяця, до якого належить дата руху. */
async function paymentOfMonth(
  db: DbOrTx,
  auth: AuthContext,
  row: repo.DebtRow,
  date: string,
  now: Date,
): Promise<{ context: DebtContext; payment: MonthPayment }> {
  const context = await loadDebtContext(db, auth, [row], date.slice(0, 7), now);
  return { context, payment: monthPaymentOf(row, context.viewed, context) };
}

function splitOf(
  row: repo.DebtRow,
  balance: number,
  input: Pick<DebtPaymentInput, 'amount' | 'principalPart' | 'interestPart'>,
) {
  const split =
    input.principalPart !== undefined && input.interestPart !== undefined
      ? { principalPart: input.principalPart, interestPart: input.interestPart }
      : suggestPaymentSplit(
          balance,
          toMonthlyRate(Number(row.interestRate), row.ratePeriod),
          input.amount,
        );
  if (split.principalPart > balance) {
    throw badRequest('Тіло платежу більше за залишок боргу');
  }
  return split;
}

export async function addPayment(
  db: Db,
  auth: AuthContext,
  id: string,
  input: DebtPaymentInput,
  now: Date,
): Promise<DebtDetails> {
  const row = await requireDebt(db, auth, id);
  assertLoan(row);
  const account = await requirePaymentAccount(db, auth, input.accountId);
  if (account.isArchived) throw badRequest('Архівний рахунок не приймає нових транзакцій');
  if (input.date < row.startDate) throw badRequest('Платіж не може бути раніше за початок боргу');

  const { context, payment } = await paymentOfMonth(db, auth, row, input.date, now);
  const occurredAt = movementInstant(input.date, context, now);
  const balance = balanceOf(row, context);
  if (balance === 0) throw conflict('Борг уже погашено');
  const split = splitOf(row, balance, input);

  // Платіж фіксує факт, тому заборонене дострокове погашення не блокується, а підтверджується.
  const early = isEarlyPayment(payment.required, payment.paid, input.amount);
  if (early && !row.earlyRepaymentAllowed && !input.confirmEarly) {
    throw unprocessable(
      'EARLY_REPAYMENT_NOT_ALLOWED',
      'Умови боргу не передбачають дострокового погашення — підтвердьте платіж',
    );
  }

  // Транзакція рахунку й запис боргу створюються разом.
  await db.transaction(async (tx) => {
    const category = await ensureSystemCategory(tx, auth.householdId, 'debt_repayment');
    const transaction = await insertTransaction(tx, auth.householdId, auth.userId, {
      type: 'debt_payment',
      accountId: account.id,
      toAccountId: null,
      categoryId: category.id,
      occurrenceId: null,
      debtId: row.id,
      amountMinor: input.amount,
      currency: row.currency,
      description: row.name,
      occurredAt,
    });
    await repo.insertEntry(tx, {
      debtId: row.id,
      householdId: auth.householdId,
      kind: 'payment',
      amount: input.amount,
      ...split,
      transactionId: transaction.id,
      occurredAt,
    });
    await syncLoanStatus(tx, auth, row, now);
  });
  return getDebt(db, auth, id, undefined, now);
}

export async function addCharge(
  db: Db,
  auth: AuthContext,
  id: string,
  input: DebtChargeInput,
  now: Date,
): Promise<DebtDetails> {
  const row = await requireDebt(db, auth, id);
  assertLoan(row);
  if (input.date < row.startDate) {
    throw badRequest('Нарахування не може бути раніше за початок боргу');
  }
  const context = await loadDebtContext(db, auth, [row], undefined, now);
  const occurredAt = movementInstant(input.date, context, now);

  await db.transaction(async (tx) => {
    await repo.insertEntry(tx, {
      debtId: row.id,
      householdId: auth.householdId,
      kind: 'charge',
      amount: input.amount,
      occurredAt,
      note: input.note || null,
    });
    await syncLoanStatus(tx, auth, row, now);
  });
  return getDebt(db, auth, id, undefined, now);
}

/** Звірка з банком поточною датою: зберігається різниця між фактичним і обліковим залишком. */
export async function addAdjustment(
  db: Db,
  auth: AuthContext,
  id: string,
  input: DebtAdjustmentInput,
  now: Date,
): Promise<DebtDetails> {
  const row = await requireDebt(db, auth, id);
  const context = await loadDebtContext(db, auth, [row], undefined, now);
  const difference = input.actualBalance - balanceOf(row, context);

  if (difference !== 0) {
    await db.transaction(async (tx) => {
      if (row.accountId) {
        // Борг кредитки — від'ємний баланс рахунку, тому він має стати рівним -actualBalance.
        const accountBalance = context.balances.get(row.accountId) ?? 0;
        await insertTransaction(tx, auth.householdId, auth.userId, {
          type: 'balance_adjustment',
          accountId: row.accountId,
          toAccountId: null,
          categoryId: null,
          occurrenceId: null,
          amountMinor: -input.actualBalance - accountBalance,
          currency: row.currency,
          description: input.note || 'Звірка залишку',
          occurredAt: now,
        });
      } else {
        await repo.insertEntry(tx, {
          debtId: row.id,
          householdId: auth.householdId,
          kind: 'adjustment',
          amount: difference,
          occurredAt: now,
          note: input.note || null,
        });
        await syncLoanStatus(tx, auth, row, now);
      }
    });
  }
  return getDebt(db, auth, id, undefined, now);
}

/** Видаляє запис позики; платіж — разом із транзакцією рахунку, тож баланс рахунку відновлюється. */
export async function deleteEntry(
  db: Db,
  auth: AuthContext,
  id: string,
  entryId: string,
  now: Date,
): Promise<void> {
  const row = await requireDebt(db, auth, id);
  assertLoan(row);
  const entry = await repo.findEntry(db, auth.householdId, id, entryId);
  if (!entry) throw notFound('Запис боргу');

  await db.transaction(async (tx) => {
    if (entry.transactionId) {
      // Запис видаляється каскадом разом із транзакцією.
      await deleteTransaction(tx, auth.householdId, entry.transactionId);
    } else {
      await repo.deleteEntry(tx, auth.householdId, entry.id);
    }
    await syncLoanStatus(tx, auth, row, now);
  });
}

/** Розбивка платежу на сьогодні, ознака дострокового погашення й прогноз після нього. */
export async function previewPayment(
  db: Db,
  auth: AuthContext,
  id: string,
  amount: number,
  now: Date,
): Promise<PaymentPreview> {
  const row = await requireDebt(db, auth, id);
  assertLoan(row);
  const context = await loadDebtContext(db, auth, [row], undefined, now);
  const balance = balanceOf(row, context);
  const payment = monthPaymentOf(row, context.current, context);
  const split = suggestPaymentSplit(
    balance,
    toMonthlyRate(Number(row.interestRate), row.ratePeriod),
    amount,
  );
  // Зайве понад борг у тіло не йде: прогноз рахується від нульового залишку.
  const balanceAfter = Math.max(0, balance - split.principalPart);
  const isEarly = isEarlyPayment(payment.required, payment.paid, amount);

  const before = projectionOf(row, balance, payment, context);
  const after = projectionOf(
    row,
    balanceAfter,
    { ...payment, paid: payment.paid + amount },
    context,
  );
  return {
    amount,
    ...split,
    isEarly,
    requiresConfirmation: isEarly && !row.earlyRepaymentAllowed,
    balanceAfter,
    projection: after,
    interestSaved:
      before.totalInterest !== null && after.totalInterest !== null
        ? before.totalInterest - after.totalInterest - split.interestPart
        : null,
  };
}

// --- Кредитки ---

/** Погашення переказом і відсотки з картки є лише в кредитної картки. */
function assertCard(row: repo.DebtRow): string {
  if (!row.accountId) throw typeMismatch('Ця дія доступна лише для кредитної картки');
  return row.accountId;
}

/**
 * Погашення кредитки — переказ з іншого рахунку на рахунок-картку. Тонка обгортка над
 * створенням переказу, щоб екран боргів не знав про внутрішню модель рахунків.
 */
export async function addCardPayment(
  db: Db,
  auth: AuthContext,
  id: string,
  input: CardPaymentInput,
  now: Date,
): Promise<DebtDetails> {
  const row = await requireDebt(db, auth, id);
  const cardAccountId = assertCard(row);
  if (input.fromAccountId === cardAccountId) {
    throw unprocessable('SAME_ACCOUNT', 'Кредитку не можна гасити з неї самої');
  }
  await requirePaymentAccount(db, auth, input.fromAccountId);
  const context = await loadDebtContext(db, auth, [row], undefined, now);
  const occurredAt = movementInstant(input.date, context, now);

  await createTransaction(
    db,
    auth,
    {
      type: 'transfer',
      accountId: input.fromAccountId,
      toAccountId: cardAccountId,
      amountMinor: input.amount,
      currency: row.currency,
      description: `Погашення: ${row.name}`,
      occurredAt: occurredAt.toISOString(),
    },
    now,
  );
  return getDebt(db, auth, id, undefined, now);
}

/** Відсотки й комісії банку по кредитці — видаток з картки в системній категорії. */
export async function addCardFee(
  db: Db,
  auth: AuthContext,
  id: string,
  input: DebtChargeInput,
  now: Date,
): Promise<DebtDetails> {
  const row = await requireDebt(db, auth, id);
  const cardAccountId = assertCard(row);
  const context = await loadDebtContext(db, auth, [row], undefined, now);
  const occurredAt = movementInstant(input.date, context, now);
  const category = await ensureSystemCategory(db, auth.householdId, 'interest_fees');

  await createTransaction(
    db,
    auth,
    {
      type: 'expense',
      accountId: cardAccountId,
      categoryId: category.id,
      amountMinor: input.amount,
      currency: row.currency,
      description: input.note || category.name,
      occurredAt: occurredAt.toISOString(),
    },
    now,
  );
  return getDebt(db, auth, id, undefined, now);
}
