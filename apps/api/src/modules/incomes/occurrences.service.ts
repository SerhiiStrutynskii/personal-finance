import {
  DEFAULT_CURRENCY,
  budgetPeriod,
  generateOccurrenceDates,
  getOccurrenceStatus,
  localDateKey,
  shiftMonth,
  startOfLocalDay,
  summarizeIncomes,
  type Transaction,
} from '@hf/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { badRequest, conflict, isUniqueViolation, notFound } from '../../http/errors.ts';
import { findHouseholdTimeZone } from '../budgets/repo.ts';
import { createTransaction } from '../transactions/service.ts';
import * as repo from './repo.ts';
import type {
  IncomesView,
  OneTimeIncomeInput,
  ReceiveOccurrenceInput,
  UpdateOccurrenceInput,
} from './schema.ts';

const occurrenceNotFound = () => notFound('Надходження');

/** Надходження не генеруються далі ніж на рік уперед. */
const horizonAfter = (today: string) => `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;

async function timeZoneOf(db: DbOrTx, auth: AuthContext): Promise<string> {
  const timeZone = await findHouseholdTimeZone(db, auth.householdId);
  if (!timeZone) throw notFound('Домогосподарство');
  return timeZone;
}

/** Дати надходжень джерела в [from, to) за його поточним правилом, не раніші за зміну правила. */
function datesFor(source: repo.SourceRow, from: string, to: string): string[] {
  const dates = generateOccurrenceDates(source, from, to);
  return source.ruleFrom ? dates.filter((date) => date >= source.ruleFrom!) : dates;
}

const toOccurrenceRows = (source: repo.SourceRow, dates: string[]) =>
  dates.map((date) => ({
    sourceId: source.id,
    householdId: source.householdId,
    scheduledDate: date,
    plannedDate: date,
    plannedAmount: source.plannedAmount,
  }));

/**
 * Лінива генерація: створює надходження активних джерел у [from, to), яких ще немає.
 * Повторний виклик нічого не дублює.
 */
export async function ensureOccurrences(
  db: DbOrTx,
  householdId: string,
  from: string,
  to: string,
  today: string,
): Promise<void> {
  const horizon = horizonAfter(today);
  const upper = to < horizon ? to : horizon;
  const sources = await repo.listActiveSources(db, householdId);
  await repo.insertOccurrences(
    db,
    sources.flatMap((source) => toOccurrenceRows(source, datesFor(source, from, upper))),
  );
}

/**
 * Перед зміною правила чи деактивацією фіксує всі минулі надходження джерела за чинним
 * правилом, щоб історія не залежала від того, чи відкривали ті місяці раніше.
 */
export async function materializeHistory(
  db: DbOrTx,
  source: repo.SourceRow,
  today: string,
): Promise<void> {
  if (!source.isActive) return;
  await repo.insertOccurrences(
    db,
    toOccurrenceRows(source, datesFor(source, source.startDate, today)),
  );
}

type OccurrenceWithActuals = NonNullable<Awaited<ReturnType<typeof repo.findOccurrence>>>;

function toOccurrenceDto(
  row: OccurrenceWithActuals,
  today: string,
  timeZone: string,
): IncomesView['occurrences'][number] {
  const status = getOccurrenceStatus(row, row.actualAmount, today);
  return {
    id: row.id,
    sourceId: row.sourceId,
    name: row.name,
    accountId: row.accountId,
    plannedDate: row.plannedDate,
    plannedAmount: row.plannedAmount,
    actualDate: row.lastPaidAt ? localDateKey(new Date(row.lastPaidAt), timeZone) : null,
    actualAmount: row.actualAmount,
    status,
    ...(status === 'received' && { diff: row.actualAmount - row.plannedAmount }),
  };
}

export async function getIncomes(
  db: Db,
  auth: AuthContext,
  month: string,
  now: Date = new Date(),
): Promise<IncomesView> {
  const timeZone = await timeZoneOf(db, auth);
  const today = localDateKey(now, timeZone);
  const from = `${month}-01`;
  const to = `${shiftMonth(month, 1)}-01`;
  // Надходження належать до місяця за plannedDate, транзакції — за моментом occurredAt.
  const period = budgetPeriod(month, timeZone);
  const currency = DEFAULT_CURRENCY;

  await ensureOccurrences(db, auth.householdId, from, to, today);

  const [rows, totals, oneTime] = await Promise.all([
    repo.listOccurrences(db, auth.householdId, from, to),
    repo.incomeTotals(db, auth.householdId, period, currency),
    repo.listOneTimeIncomes(db, auth.householdId, period, currency),
  ]);
  const occurrences = rows.map((row) => toOccurrenceDto(row, today, timeZone));

  return {
    month,
    currency,
    today,
    summary: summarizeIncomes(occurrences, totals),
    occurrences,
    oneTime: oneTime.map((transaction) => ({
      transactionId: transaction.id,
      name: transaction.description,
      date: localDateKey(transaction.occurredAt, timeZone),
      amount: transaction.amountMinor,
      status: 'received' as const,
    })),
  };
}

export async function updateOccurrence(
  db: Db,
  auth: AuthContext,
  id: string,
  patch: UpdateOccurrenceInput,
  now: Date = new Date(),
): Promise<IncomesView['occurrences'][number]> {
  try {
    if (!(await repo.updateOccurrence(db, auth.householdId, id, patch))) throw occurrenceNotFound();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('У цього джерела вже є надходження на цю дату');
    }
    throw error;
  }
  const timeZone = await timeZoneOf(db, auth);
  const row = await repo.findOccurrence(db, auth.householdId, id);
  if (!row) throw occurrenceNotFound();
  return toOccurrenceDto(row, localDateKey(now, timeZone), timeZone);
}

/**
 * Момент транзакції для календарної дати: сьогоднішня дата отримує поточний час,
 * інша — початок цього дня в часовому поясі домогосподарства.
 */
function instantForDate(date: string, timeZone: string, now: Date): Date {
  if (date === localDateKey(now, timeZone)) return now;
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return startOfLocalDay(year, month, day, timeZone);
}

/** Позначає надходження отриманим: створює прив'язану до нього транзакцію доходу. */
export async function receiveOccurrence(
  db: Db,
  auth: AuthContext,
  id: string,
  input: ReceiveOccurrenceInput,
  now: Date = new Date(),
): Promise<Transaction> {
  const occurrence = await repo.findOccurrence(db, auth.householdId, id);
  if (!occurrence) throw occurrenceNotFound();

  const accountId = input.accountId ?? occurrence.accountId;
  if (!accountId) throw badRequest('Вкажіть рахунок, на який надійшов дохід');
  const timeZone = await timeZoneOf(db, auth);
  const date = input.date ?? localDateKey(now, timeZone);

  const transaction = await createTransaction(db, auth, {
    type: 'income',
    accountId,
    categoryId: null,
    incomeLineId: null,
    occurrenceId: occurrence.id,
    amountMinor: input.amount ?? occurrence.plannedAmount,
    currency: occurrence.currency,
    description: occurrence.name,
    occurredAt: instantForDate(date, timeZone, now).toISOString(),
  });

  // Гроші прийшли за надходженням, яке вважали пропущеним, — воно знову очікуване.
  if (occurrence.status === 'skipped') {
    await repo.updateOccurrence(db, auth.householdId, id, { status: 'expected' });
  }
  return transaction;
}

/** Разовий дохід — звичайна транзакція доходу без прив'язки до надходження. */
export async function createOneTimeIncome(
  db: Db,
  auth: AuthContext,
  input: OneTimeIncomeInput,
  now: Date = new Date(),
): Promise<Transaction> {
  const timeZone = await timeZoneOf(db, auth);
  return createTransaction(db, auth, {
    type: 'income',
    accountId: input.accountId,
    categoryId: input.categoryId ?? null,
    incomeLineId: null,
    occurrenceId: null,
    amountMinor: input.amount,
    currency: DEFAULT_CURRENCY,
    description: input.name,
    occurredAt: instantForDate(input.date, timeZone, now).toISOString(),
  });
}
