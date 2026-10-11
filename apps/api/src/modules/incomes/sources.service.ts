import { DEFAULT_CURRENCY } from '@hf/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { badRequest, conflict, notFound } from '../../http/errors.ts';
import { findAccount } from '../accounts/repo.ts';
import * as repo from './repo.ts';
import {
  incomeSourceInputSchema,
  type IncomeSource,
  type IncomeSourceInput,
  type UpdateIncomeSourceInput,
} from './schema.ts';

const sourceNotFound = () => notFound('Джерело доходу');

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

/** Рахунок джерела має належати домогосподарству й бути в його валюті: мультивалютних доходів немає. */
async function resolveAccountCurrency(db: DbOrTx, auth: AuthContext, accountId: string) {
  const account = await findAccount(db as Db, auth.householdId, accountId);
  if (!account) throw badRequest('Рахунок не знайдено');
  if (account.currency !== DEFAULT_CURRENCY) {
    throw badRequest(`Доходи підтримуються лише у валюті ${DEFAULT_CURRENCY}`);
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

export async function updateSource(
  db: Db,
  auth: AuthContext,
  id: string,
  patch: UpdateIncomeSourceInput,
): Promise<IncomeSource> {
  const existing = await repo.findSource(db, auth.householdId, id);
  if (!existing) throw sourceNotFound();

  // Правило перевіряється цілим: після злиття змін із наявними полями.
  const merged = incomeSourceInputSchema.parse({
    ...toSourceDto(existing),
    ...patch,
  });
  const currency = await resolveAccountCurrency(db, auth, merged.accountId);

  const row = await repo.updateSource(db, auth.householdId, id, { ...merged, currency });
  if (!row) throw sourceNotFound();
  return toSourceDto(row);
}

export async function deactivateSource(
  db: Db,
  auth: AuthContext,
  id: string,
): Promise<IncomeSource> {
  const row = await repo.updateSource(db, auth.householdId, id, { isActive: false });
  if (!row) throw sourceNotFound();
  return toSourceDto(row);
}

export async function deleteSource(db: Db, auth: AuthContext, id: string): Promise<void> {
  const existing = await repo.findSource(db, auth.householdId, id);
  if (!existing) throw sourceNotFound();
  if (await repo.sourceHasTransactions(db, existing.id)) {
    throw conflict('До джерела привʼязані отримані доходи: його можна лише деактивувати');
  }
  await repo.deleteSource(db, auth.householdId, id);
}
