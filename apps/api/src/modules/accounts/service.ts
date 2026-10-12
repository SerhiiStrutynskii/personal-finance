import type { Db } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { badRequest, conflict, isForeignKeyViolation, notFound } from '../../http/errors.ts';
import * as repo from './repo.ts';
import type { Account, CreateAccountInput, UpdateAccountInput } from './schema.ts';

export const toAccountDto = (row: repo.AccountRow, balance: number): Account => ({
  id: row.id,
  name: row.name,
  type: row.type,
  currency: row.currency,
  balance,
  creditLimit: row.creditLimit,
  isArchived: row.isArchived,
  createdAt: row.createdAt.toISOString(),
});

async function withBalance(db: Db, auth: AuthContext, row: repo.AccountRow): Promise<Account> {
  const balances = await repo.accountBalances(db, auth.householdId);
  return toAccountDto(row, balances.get(row.id) ?? 0);
}

export async function listAccounts(db: Db, auth: AuthContext): Promise<Account[]> {
  const [rows, balances] = await Promise.all([
    repo.listAccounts(db, auth.householdId),
    repo.accountBalances(db, auth.householdId),
  ]);
  return rows.map((row) => toAccountDto(row, balances.get(row.id) ?? 0));
}

export async function getAccount(db: Db, auth: AuthContext, id: string): Promise<Account> {
  const row = await repo.findAccount(db, auth.householdId, id);
  if (!row) throw notFound('Рахунок');
  return withBalance(db, auth, row);
}

export async function createAccount(
  db: Db,
  auth: AuthContext,
  input: CreateAccountInput,
): Promise<Account> {
  return toAccountDto(await repo.insertAccount(db, auth.householdId, input), 0);
}

export async function updateAccount(
  db: Db,
  auth: AuthContext,
  id: string,
  input: UpdateAccountInput,
): Promise<Account> {
  const existing = await repo.findAccount(db, auth.householdId, id);
  if (!existing) throw notFound('Рахунок');
  if (input.type !== undefined && existing.type === 'credit_card') {
    throw badRequest('Тип рахунку кредитної картки змінити не можна');
  }
  const row = await repo.updateAccount(db, auth.householdId, id, input);
  if (!row) throw notFound('Рахунок');
  return withBalance(db, auth, row);
}

export async function deleteAccount(db: Db, auth: AuthContext, id: string): Promise<void> {
  try {
    if (!(await repo.deleteAccount(db, auth.householdId, id))) throw notFound('Рахунок');
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw conflict(
        'Рахунок використовується в транзакціях, джерелах доходу або боргах, тому його не можна видалити',
      );
    }
    throw error;
  }
}
