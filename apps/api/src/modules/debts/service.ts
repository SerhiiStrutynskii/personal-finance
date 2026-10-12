import {
  DEBT_CURRENCY,
  localDateKey,
  startOfLocalDay,
  summarizeDebts,
  toAnnualRatePercent,
} from '@hf/shared';
import { eq } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../db/client.ts';
import { accounts } from '../../db/schema.ts';
import type { AuthContext } from '../../http/auth.ts';
import {
  badRequest,
  conflict,
  isForeignKeyViolation,
  notFound,
  unprocessable,
} from '../../http/errors.ts';
import { deleteAccount, findAccount } from '../accounts/repo.ts';
import { insertTransaction } from '../transactions/repo.ts';
import { toTransactionDto } from '../transactions/service.ts';
import * as repo from './repo.ts';
import type {
  CreateDebtInput,
  Debt,
  DebtDetails,
  DebtEntry,
  DebtsOverview,
  UpdateDebtInput,
} from './schema.ts';
import { loadDebtContext, timeZoneOf, toDebtDto } from './view.ts';

export const debtNotFound = () => notFound('Борг');
export const currencyMismatch = () =>
  unprocessable('CURRENCY_MISMATCH', 'Валюта рахунку має збігатися з валютою боргу');

/** Скільки останніх транзакцій рахунку-картки показує сторінка боргу. */
const CARD_HISTORY_LIMIT = 200;

/** UTC-момент початку календарної дати в часовому поясі домогосподарства. */
export function dayStart(date: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return startOfLocalDay(year, month, day, timeZone);
}

export async function requireDebt(db: DbOrTx, auth: AuthContext, id: string) {
  const row = await repo.findDebt(db, auth.householdId, id);
  if (!row) throw debtNotFound();
  return row;
}

/** Рахунок домогосподарства у валюті боргу, з якого можна гасити борг. */
export async function requirePaymentAccount(db: DbOrTx, auth: AuthContext, accountId: string) {
  const account = await findAccount(db, auth.householdId, accountId);
  if (!account) throw notFound('Рахунок');
  if (account.currency !== DEBT_CURRENCY) throw currencyMismatch();
  return account;
}

export async function buildDebt(
  db: DbOrTx,
  auth: AuthContext,
  row: repo.DebtRow,
  now: Date,
  month?: string,
): Promise<Debt> {
  return toDebtDto(row, await loadDebtContext(db, auth, [row], month, now));
}

export async function getOverview(
  db: Db,
  auth: AuthContext,
  month: string | undefined,
  now: Date,
): Promise<DebtsOverview> {
  const rows = await repo.listDebts(db, auth.householdId);
  const context = await loadDebtContext(db, auth, rows, month, now);
  const debts = rows
    .map((row) => toDebtDto(row, context))
    // Активні — за датою найближчого платежу, закриті — у кінці.
    .sort(
      (a, b) =>
        a.status.localeCompare(b.status) ||
        a.month.dueDate.localeCompare(b.month.dueDate) ||
        a.name.localeCompare(b.name, 'uk'),
    );

  return {
    month: context.viewed.month,
    currency: DEBT_CURRENCY,
    today: context.today,
    summary: summarizeDebts(
      debts.map((debt) => ({
        type: debt.type,
        status: debt.status,
        balance: debt.balance,
        monthlyPayment: debt.monthlyPayment,
        annualRatePercent: toAnnualRatePercent(debt.interestRate, debt.ratePeriod),
        month: debt.month,
        payoffDate: debt.projection.payoffDate,
        cardAvailable: debt.card?.available ?? null,
      })),
    ),
    debts,
  };
}

export async function getDebt(
  db: Db,
  auth: AuthContext,
  id: string,
  month: string | undefined,
  now: Date,
): Promise<DebtDetails> {
  const row = await requireDebt(db, auth, id);
  const context = await loadDebtContext(db, auth, [row], month, now);

  let entries: DebtEntry[] = [];
  let transactions: DebtDetails['transactions'] = [];
  if (row.accountId) {
    const rows = await repo.listAccountTransactions(
      db,
      auth.householdId,
      row.accountId,
      CARD_HISTORY_LIMIT,
    );
    transactions = rows.map(toTransactionDto);
  } else {
    const rows = await repo.listEntries(db, auth.householdId, row.id);
    entries = rows.map(({ entry, accountId }) => ({
      id: entry.id,
      kind: entry.kind,
      amount: entry.amount,
      principalPart: entry.principalPart,
      interestPart: entry.interestPart,
      accountId,
      date: localDateKey(entry.occurredAt, context.timeZone),
      note: entry.note,
    }));
  }

  return {
    ...toDebtDto(row, context),
    viewedMonth: context.viewed.month,
    today: context.today,
    entries,
    transactions,
  };
}

/** Рахунок, з якого зазвичай гаситься борг: свій, у валюті боргу й не сама картка. */
async function assertDefaultAccount(
  db: DbOrTx,
  auth: AuthContext,
  defaultAccountId: string | null,
  cardAccountId: string | null,
) {
  if (!defaultAccountId) return;
  if (defaultAccountId === cardAccountId) {
    throw badRequest('Кредитку не можна гасити з неї самої');
  }
  await requirePaymentAccount(db, auth, defaultAccountId);
}

/** Рахунок-картка боргу: новий або наявний рахунок, що стає кредитною карткою. */
async function resolveCardAccount(
  tx: DbOrTx,
  auth: AuthContext,
  input: CreateDebtInput,
): Promise<string> {
  const card = { type: 'credit_card' as const, creditLimit: input.creditLimit };
  if (!input.existingAccountId) {
    const [created] = await tx
      .insert(accounts)
      .values({
        ...card,
        householdId: auth.householdId,
        name: input.name,
        currency: input.currency,
      })
      .returning({ id: accounts.id });
    return created!.id;
  }

  const account = await findAccount(tx, auth.householdId, input.existingAccountId);
  if (!account) throw notFound('Рахунок');
  if (account.isArchived) throw badRequest('Архівний рахунок не можна прив’язати до боргу');
  if (account.currency !== input.currency) throw currencyMismatch();
  if (account.type === 'credit_card') throw conflict('Рахунок уже прив’язано до боргу');
  await tx.update(accounts).set(card).where(eq(accounts.id, account.id));
  return account.id;
}

export async function createDebt(
  db: Db,
  auth: AuthContext,
  input: CreateDebtInput,
  now: Date,
): Promise<Debt> {
  const timeZone = await timeZoneOf(db, auth);
  if (input.startDate > localDateKey(now, timeZone)) {
    throw badRequest('Дата початку боргу не може бути в майбутньому');
  }

  // Рахунок-картка, борг і початковий баланс створюються разом або не створюються зовсім.
  const row = await db.transaction(async (tx) => {
    const accountId =
      input.type === 'credit_card' ? await resolveCardAccount(tx, auth, input) : null;
    await assertDefaultAccount(tx, auth, input.defaultAccountId, accountId);

    const created = await repo.insertDebt(tx, auth.householdId, {
      name: input.name,
      description: input.description,
      type: input.type,
      accountId,
      currency: input.currency,
      initialAmount: input.initialAmount,
      startDate: input.startDate,
      maturityDate: input.maturityDate,
      interestRate: String(input.interestRate),
      ratePeriod: input.ratePeriod,
      monthlyPayment: input.monthlyPayment,
      paymentDay: input.paymentDay,
      earlyRepaymentAllowed: input.earlyRepaymentAllowed,
      defaultAccountId: input.defaultAccountId,
    });

    if (accountId && input.initialAmount > 0) {
      // Борг кредитки — від'ємний баланс рахунку, тому початкова сума записується зі знаком мінус.
      await insertTransaction(tx, auth.householdId, auth.userId, {
        type: 'balance_adjustment',
        accountId,
        toAccountId: null,
        categoryId: null,
        occurrenceId: null,
        amountMinor: -input.initialAmount,
        currency: input.currency,
        description: 'Початковий борг',
        occurredAt: dayStart(input.startDate, timeZone),
      });
    }
    return created;
  });
  return buildDebt(db, auth, row, now);
}

export async function updateDebt(
  db: Db,
  auth: AuthContext,
  id: string,
  input: UpdateDebtInput,
  now: Date,
): Promise<Debt> {
  const existing = await requireDebt(db, auth, id);
  const isCard = existing.type === 'credit_card';

  const maturityDate =
    input.maturityDate === undefined ? existing.maturityDate : input.maturityDate;
  if (!isCard && !maturityDate) throw badRequest('Вкажіть дату, до якої виданий борг');
  if (maturityDate && maturityDate <= existing.startDate) {
    throw badRequest('Строк має бути пізніше за дату початку');
  }
  if (input.creditLimit !== undefined && (isCard ? input.creditLimit === null : true)) {
    throw badRequest(
      isCard ? 'Кредитний ліміт обов’язковий' : 'Кредитний ліміт є лише в кредитної картки',
    );
  }
  if (isCard && input.earlyRepaymentAllowed === false) {
    throw badRequest('Кредитку можна гасити достроково завжди');
  }
  if (input.defaultAccountId) {
    await assertDefaultAccount(db, auth, input.defaultAccountId, existing.accountId);
  }

  const row = await db.transaction(async (tx) => {
    if (isCard && input.creditLimit) {
      await tx
        .update(accounts)
        .set({ creditLimit: input.creditLimit })
        .where(eq(accounts.id, existing.accountId!));
    }
    const updated = await repo.updateDebt(tx, auth.householdId, id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description || null }),
      ...(input.maturityDate !== undefined && { maturityDate }),
      ...(input.interestRate !== undefined && { interestRate: String(input.interestRate) }),
      ...(input.ratePeriod !== undefined && { ratePeriod: input.ratePeriod }),
      ...(input.monthlyPayment !== undefined && { monthlyPayment: input.monthlyPayment }),
      ...(input.paymentDay !== undefined && { paymentDay: input.paymentDay }),
      ...(input.earlyRepaymentAllowed !== undefined && {
        earlyRepaymentAllowed: input.earlyRepaymentAllowed,
      }),
      ...(input.defaultAccountId !== undefined && {
        defaultAccountId: input.defaultAccountId ?? null,
      }),
    });
    if (!updated) throw debtNotFound();
    return updated;
  });
  return buildDebt(db, auth, row, now);
}

/** Закриває погашений борг; у кредитки разом із цим архівується рахунок-картка. */
export async function closeDebt(db: Db, auth: AuthContext, id: string, now: Date): Promise<Debt> {
  const existing = await requireDebt(db, auth, id);
  const { balance } = await buildDebt(db, auth, existing, now);
  if (balance > 0) throw conflict('Борг ще не погашено, тому його не можна закрити');

  const row = await db.transaction(async (tx) => {
    if (existing.accountId) {
      await tx
        .update(accounts)
        .set({ isArchived: true })
        .where(eq(accounts.id, existing.accountId));
    }
    return repo.updateDebt(tx, auth.householdId, id, { status: 'closed' });
  });
  return buildDebt(db, auth, row!, now);
}

/**
 * Видаляє борг разом з його рухами.
 * Позика: зникають записи боргу й транзакції платежів, тож баланси рахунків відновлюються.
 * Кредитка без рухів: зникає й рахунок-картка з початковим балансом.
 * Кредитка з рухами: видаляється лише борг — рахунок стає звичайною карткою, а його покупки,
 * перекази й баланс лишаються, щоб витрати й бюджети минулих місяців не змінилися.
 */
export async function deleteDebt(db: Db, auth: AuthContext, id: string): Promise<void> {
  const existing = await requireDebt(db, auth, id);
  const { accountId } = existing;

  if (!accountId) {
    await db.transaction(async (tx) => {
      // Записи платежів видаляються каскадом разом із транзакціями, решта — разом із боргом.
      await repo.deletePaymentTransactions(tx, auth.householdId, id);
      await repo.deleteDebt(tx, auth.householdId, id);
    });
    return;
  }

  // Єдина транзакція, яка не вважається рухом, — початковий баланс, створений разом із боргом.
  const history = await repo.listAccountTransactions(db, auth.householdId, accountId, 2);
  const onlyInitial =
    history.length === 1 &&
    history[0]!.type === 'balance_adjustment' &&
    history[0]!.amountMinor === -existing.initialAmount;

  if (history.length > 0 && !onlyInitial) {
    await db.transaction(async (tx) => {
      await repo.deleteDebt(tx, auth.householdId, id);
      await tx
        .update(accounts)
        .set({ type: 'card', creditLimit: null })
        .where(eq(accounts.id, accountId));
    });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      await repo.deleteAccountTransactions(tx, auth.householdId, accountId);
      await repo.deleteDebt(tx, auth.householdId, id);
      await deleteAccount(tx, auth.householdId, accountId);
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw conflict(
        'Рахунок-картка використовується в інших записах, тому борг не можна видалити',
      );
    }
    throw error;
  }
}
