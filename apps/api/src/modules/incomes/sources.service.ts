import { DEFAULT_CURRENCY, localDateKey } from '@hf/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { badRequest, conflict, notFound } from '../../http/errors.ts';
import { findAccount } from '../accounts/repo.ts';
import { findHouseholdTimeZone } from '../budgets/repo.ts';
import { materializeHistory } from './occurrences.service.ts';
import * as repo from './repo.ts';
import {
  incomeSourceInputSchema,
  type IncomeSource,
  type IncomeSourceInput,
  type UpdateIncomeSourceInput,
} from './schema.ts';

const sourceNotFound = () => notFound('Джерело прибутку');

export const toSourceDto = (row: repo.SourceRow): IncomeSource => ({
  id: row.id,
  name: row.name,
  accountId: row.accountId,
  currency: row.currency,
  plannedAmount: row.plannedAmount,
  frequency: row.frequency,
  dayOfMonth: row.dayOfMonth,
  dayOfWeek: row.dayOfWeek,
  intervalMonths: row.intervalMonths,
  startDate: row.startDate,
  endDate: row.endDate,
  isActive: row.isActive,
});

/** Рахунок джерела має належати домогосподарству й бути в його валюті: мультивалютних прибутків немає. */
async function resolveAccountCurrency(db: DbOrTx, auth: AuthContext, accountId: string) {
  const account = await findAccount(db as Db, auth.householdId, accountId);
  if (!account) throw badRequest('Рахунок не знайдено');
  if (account.currency !== DEFAULT_CURRENCY) {
    throw badRequest(`Прибутки підтримуються лише у валюті ${DEFAULT_CURRENCY}`);
  }
  return account.currency;
}

export async function listSources(db: Db, auth: AuthContext): Promise<IncomeSource[]> {
  return (await repo.listSources(db, auth.householdId)).map(toSourceDto);
}

export async function createSource(
  db: Db,
  auth: AuthContext,
  input: IncomeSourceInput,
): Promise<IncomeSource> {
  const currency = await resolveAccountCurrency(db, auth, input.accountId);
  return toSourceDto(await repo.insertSource(db, auth.householdId, { ...input, currency }));
}

/** Поля, зміна яких впливає на майбутні надходження. */
const SCHEDULE_FIELDS = [
  'plannedAmount',
  'frequency',
  'dayOfMonth',
  'dayOfWeek',
  'intervalMonths',
  'startDate',
  'endDate',
] as const;

async function todayOf(db: DbOrTx, auth: AuthContext, now: Date): Promise<string> {
  const timeZone = await findHouseholdTimeZone(db, auth.householdId);
  if (!timeZone) throw sourceNotFound();
  return localDateKey(now, timeZone);
}

export async function updateSource(
  db: Db,
  auth: AuthContext,
  id: string,
  patch: UpdateIncomeSourceInput,
  now: Date = new Date(),
): Promise<IncomeSource> {
  const existing = await repo.findSource(db, auth.householdId, id);
  if (!existing) throw sourceNotFound();

  // Правило перевіряється цілим: після злиття змін із наявними полями.
  const merged = incomeSourceInputSchema.parse({
    ...toSourceDto(existing),
    ...patch,
  });
  const currency = await resolveAccountCurrency(db, auth, merged.accountId);
  const scheduleChanged = SCHEDULE_FIELDS.some((field) => merged[field] !== existing[field]);
  const today = await todayOf(db, auth, now);

  const row = await db.transaction(async (tx) => {
    if (!scheduleChanged) {
      return repo.updateSource(tx, auth.householdId, id, { ...merged, currency });
    }
    // Минулі надходження фіксуються за старим правилом; майбутні неотримані видаляються
    // і згенеруються заново вже за новим. Отримані й минулі не змінюються.
    await materializeHistory(tx, existing, today);
    await repo.deleteUnpaidOccurrencesFrom(tx, existing.id, today);
    return repo.updateSource(tx, auth.householdId, id, { ...merged, currency, ruleFrom: today });
  });
  if (!row) throw sourceNotFound();
  return toSourceDto(row);
}

/** Деактивоване джерело не дає нових надходжень; історія й отримані прибутки лишаються. */
export async function deactivateSource(
  db: Db,
  auth: AuthContext,
  id: string,
  now: Date = new Date(),
): Promise<IncomeSource> {
  const existing = await repo.findSource(db, auth.householdId, id);
  if (!existing) throw sourceNotFound();
  const today = await todayOf(db, auth, now);

  const row = await db.transaction(async (tx) => {
    await materializeHistory(tx, existing, today);
    await repo.deleteUnpaidOccurrencesFrom(tx, existing.id, today);
    return repo.updateSource(tx, auth.householdId, id, { isActive: false });
  });
  if (!row) throw sourceNotFound();
  return toSourceDto(row);
}

export async function deleteSource(db: Db, auth: AuthContext, id: string): Promise<void> {
  const existing = await repo.findSource(db, auth.householdId, id);
  if (!existing) throw sourceNotFound();
  if (await repo.sourceHasTransactions(db, existing.id)) {
    throw conflict('До джерела привʼязані отримані прибутки: його можна лише деактивувати');
  }
  await repo.deleteSource(db, auth.householdId, id);
}
