import type { Db } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { badRequest, conflict, isForeignKeyViolation, notFound } from '../../http/errors.ts';
import { insertTransaction } from '../transactions/repo.ts';
import * as repo from './repo.ts';
import type {
  Account,
  AccountBalanceAdjustmentInput,
  CreateAccountInput,
  UpdateAccountInput,
} from './schema.ts';

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

/**
 * Створює рахунок. Початковий залишок записується службовою транзакцією balance_adjustment
 * з поточним моментом: вона змінює баланс, але не є ні прибутком, ні витратою.
 */
export async function createAccount(
  db: Db,
  auth: AuthContext,
  { openingBalance, ...input }: CreateAccountInput,
  now: Date = new Date(),
): Promise<Account> {
  const row = await db.transaction(async (tx) => {
    const created = await repo.insertAccount(tx, auth.householdId, input);
    if (openingBalance > 0) {
      await insertTransaction(tx, auth.householdId, auth.userId, {
        type: 'balance_adjustment',
        accountId: created.id,
        toAccountId: null,
        categoryId: null,
        occurrenceId: null,
        amountMinor: openingBalance,
        currency: created.currency,
        description: 'Початковий залишок',
        occurredAt: now,
      });
    }
    return created;
  });
  return toAccountDto(row, openingBalance);
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

/**
 * Коригування балансу поточним моментом: зберігається різниця між фактичним і обліковим балансом,
 * минулі записи не змінюються. Баланс кредитної картки — це борг, він звіряється на сторінці боргу.
 */
export async function adjustBalance(
  db: Db,
  auth: AuthContext,
  id: string,
  input: AccountBalanceAdjustmentInput,
  now: Date,
): Promise<Account> {
  const row = await repo.findAccount(db, auth.householdId, id);
  if (!row) throw notFound('Рахунок');
  if (row.type === 'credit_card') {
    throw badRequest('Баланс кредитної картки звіряється на сторінці її боргу');
  }
  if (row.isArchived) throw badRequest('Архівний рахунок не приймає нових транзакцій');

  const balances = await repo.accountBalances(db, auth.householdId);
  const difference = input.actualBalance - (balances.get(id) ?? 0);
  if (difference !== 0) {
    await insertTransaction(db, auth.householdId, auth.userId, {
      type: 'balance_adjustment',
      accountId: row.id,
      toAccountId: null,
      categoryId: null,
      occurrenceId: null,
      amountMinor: difference,
      currency: row.currency,
      description: input.note || 'Коригування балансу',
      occurredAt: now,
    });
  }
  return toAccountDto(row, input.actualBalance);
}

export async function deleteAccount(db: Db, auth: AuthContext, id: string): Promise<void> {
  try {
    // Рахунок, у якому є лише початковий залишок і коригування балансу, видаляється разом із ними.
    const deleted = await db.transaction(async (tx) => {
      await repo.deleteOpeningBalanceIfAlone(tx, auth.householdId, id);
      return repo.deleteAccount(tx, auth.householdId, id);
    });
    if (!deleted) throw notFound('Рахунок');
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw conflict(
        'Рахунок використовується в транзакціях, джерелах прибутку, боргах або цілях, тому його не можна видалити',
      );
    }
    throw error;
  }
}
