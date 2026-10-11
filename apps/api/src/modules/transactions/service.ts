import type { Db } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { badRequest, notFound } from '../../http/errors.ts';
import { findAccountsByIds } from '../accounts/repo.ts';
import { findCategory } from '../categories/repo.ts';
import * as repo from './repo.ts';
import type { ListTransactionsQuery, Transaction, TransactionInput } from './schema.ts';

const toDto = (row: repo.TransactionRow): Transaction => ({
  id: row.id,
  type: row.type,
  accountId: row.accountId,
  toAccountId: row.toAccountId,
  categoryId: row.categoryId,
  amountMinor: row.amountMinor,
  currency: row.currency,
  description: row.description,
  occurredAt: row.occurredAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Перевіряє, що рахунки й категорія належать домогосподарству, а валюти узгоджені,
 * і повертає значення для запису.
 */
async function resolveValues(
  db: Db,
  auth: AuthContext,
  input: TransactionInput,
): Promise<repo.TransactionValues> {
  const accountIds =
    input.type === 'transfer' ? [input.accountId, input.toAccountId] : [input.accountId];
  const found = await findAccountsByIds(db, auth.householdId, accountIds);
  const accountsById = new Map(found.map((account) => [account.id, account]));

  const account = accountsById.get(input.accountId);
  if (!account) throw badRequest('Рахунок не знайдено');
  if (account.currency !== input.currency) {
    throw badRequest('Валюта транзакції має збігатися з валютою рахунку');
  }

  const base = {
    accountId: input.accountId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    description: input.description,
    occurredAt: new Date(input.occurredAt),
  };

  if (input.type === 'transfer') {
    const toAccount = accountsById.get(input.toAccountId);
    if (!toAccount) throw badRequest('Рахунок призначення не знайдено');
    if (toAccount.currency !== input.currency) {
      throw badRequest('Перекази між рахунками в різних валютах поки не підтримуються');
    }
    return { ...base, type: 'transfer', toAccountId: input.toAccountId, categoryId: null };
  }

  if (input.categoryId) {
    const category = await findCategory(db, auth.householdId, input.categoryId);
    if (!category) throw badRequest('Категорію не знайдено');
    if (category.kind !== input.type) {
      throw badRequest('Тип категорії не відповідає типу транзакції');
    }
  }
  return { ...base, type: input.type, toAccountId: null, categoryId: input.categoryId };
}

export async function listTransactions(db: Db, auth: AuthContext, query: ListTransactionsQuery) {
  const { items, total } = await repo.listTransactions(db, auth.householdId, query);
  return { items: items.map(toDto), total, limit: query.limit, offset: query.offset };
}

export async function getTransaction(db: Db, auth: AuthContext, id: string): Promise<Transaction> {
  const row = await repo.findTransaction(db, auth.householdId, id);
  if (!row) throw notFound('Транзакція');
  return toDto(row);
}

export async function createTransaction(
  db: Db,
  auth: AuthContext,
  input: TransactionInput,
): Promise<Transaction> {
  const values = await resolveValues(db, auth, input);
  return toDto(await repo.insertTransaction(db, auth.householdId, auth.userId, values));
}

export async function replaceTransaction(
  db: Db,
  auth: AuthContext,
  id: string,
  input: TransactionInput,
): Promise<Transaction> {
  const values = await resolveValues(db, auth, input);
  const row = await repo.replaceTransaction(db, auth.householdId, id, values);
  if (!row) throw notFound('Транзакція');
  return toDto(row);
}

export async function deleteTransaction(db: Db, auth: AuthContext, id: string): Promise<void> {
  if (!(await repo.deleteTransaction(db, auth.householdId, id))) throw notFound('Транзакція');
}
