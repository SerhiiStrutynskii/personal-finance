import type { Db } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { conflict, isForeignKeyViolation, notFound } from '../../http/errors.ts';
import * as repo from './repo.ts';
import type { Account, CreateAccountInput, UpdateAccountInput } from './schema.ts';

const toDto = (row: repo.AccountRow): Account => ({
  id: row.id,
  name: row.name,
  type: row.type,
  currency: row.currency,
  createdAt: row.createdAt.toISOString(),
});

export async function listAccounts(db: Db, auth: AuthContext): Promise<Account[]> {
  return (await repo.listAccounts(db, auth.householdId)).map(toDto);
}

export async function getAccount(db: Db, auth: AuthContext, id: string): Promise<Account> {
  const row = await repo.findAccount(db, auth.householdId, id);
  if (!row) throw notFound('Рахунок');
  return toDto(row);
}

export async function createAccount(
  db: Db,
  auth: AuthContext,
  input: CreateAccountInput,
): Promise<Account> {
  return toDto(await repo.insertAccount(db, auth.householdId, input));
}

export async function updateAccount(
  db: Db,
  auth: AuthContext,
  id: string,
  input: UpdateAccountInput,
): Promise<Account> {
  const row = await repo.updateAccount(db, auth.householdId, id, input);
  if (!row) throw notFound('Рахунок');
  return toDto(row);
}

export async function deleteAccount(db: Db, auth: AuthContext, id: string): Promise<void> {
  try {
    if (!(await repo.deleteAccount(db, auth.householdId, id))) throw notFound('Рахунок');
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw conflict(
        'Рахунок використовується в транзакціях або джерелах доходу, тому його не можна видалити',
      );
    }
    throw error;
  }
}
