import { isExpenseDateAllowed } from '@hf/shared';
import type { Db } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { badRequest, expenseDateInFuture, notFound } from '../../http/errors.ts';
import { findAccountsByIds } from '../accounts/repo.ts';
import { findHouseholdTimeZone } from '../budgets/repo.ts';
import { findCategory } from '../categories/repo.ts';
import { findOccurrenceForLink } from '../incomes/repo.ts';
import * as repo from './repo.ts';
import type { ListTransactionsQuery, Transaction, TransactionInput } from './schema.ts';

export const toTransactionDto = (row: repo.TransactionRow): Transaction => ({
  id: row.id,
  type: row.type,
  accountId: row.accountId,
  toAccountId: row.toAccountId,
  categoryId: row.categoryId,
  occurrenceId: row.occurrenceId,
  debtId: row.debtId,
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
  if (found.some((item) => item.isArchived)) {
    throw badRequest('Архівний рахунок не приймає нових транзакцій');
  }
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
    return {
      ...base,
      type: 'transfer',
      toAccountId: input.toAccountId,
      categoryId: null,
      occurrenceId: null,
    };
  }

  if (input.categoryId) {
    const category = await findCategory(db, auth.householdId, input.categoryId);
    if (!category) throw badRequest('Категорію не знайдено');
    if (category.kind !== input.type) {
      throw badRequest('Тип категорії не відповідає типу транзакції');
    }
  }
  const occurrenceId = input.type === 'income' ? input.occurrenceId : null;
  if (occurrenceId) {
    const occurrence = await findOccurrenceForLink(db, auth.householdId, occurrenceId);
    if (!occurrence) throw badRequest('Надходження не знайдено');
    if (occurrence.currency !== input.currency) {
      throw badRequest('Валюта прибутку має збігатися з валютою джерела прибутку');
    }
  }
  return {
    ...base,
    type: input.type,
    toAccountId: null,
    categoryId: input.categoryId,
    occurrenceId,
  };
}

export async function listTransactions(db: Db, auth: AuthContext, query: ListTransactionsQuery) {
  const { items, total } = await repo.listTransactions(db, auth.householdId, query);
  return { items: items.map(toTransactionDto), total, limit: query.limit, offset: query.offset };
}

export async function getTransaction(db: Db, auth: AuthContext, id: string): Promise<Transaction> {
  const row = await repo.findTransaction(db, auth.householdId, id);
  if (!row) throw notFound('Транзакція');
  return toTransactionDto(row);
}

/**
 * Обмеження видатків, спільне для всього застосунку: видаток можна створити чи перенести на
 * будь-яку дату до сьогодні включно (за часовим поясом домогосподарства), зокрема в минулі
 * місяці, але не в майбутнє. Прибутків і переказів це не стосується.
 *
 * Повертає момент для запису: пізніший за «зараз» момент сьогоднішнього дня (годинник пристрою
 * випереджає серверний) записується поточним часом, щоб видаток не опинився в майбутньому.
 */
async function resolveExpenseInstant(
  db: Db,
  auth: AuthContext,
  occurredAt: Date,
  now: Date,
): Promise<Date> {
  const timeZone = await findHouseholdTimeZone(db, auth.householdId);
  if (!timeZone) throw notFound('Домогосподарство');
  if (!isExpenseDateAllowed(occurredAt, now, timeZone)) throw expenseDateInFuture();
  return occurredAt.getTime() > now.getTime() ? now : occurredAt;
}

/**
 * Платежі по боргах і службові зміни балансу пов'язані із записами боргів, тому змінюються
 * й видаляються лише через борги.
 */
function assertNotServiceTransaction(existing: repo.TransactionRow) {
  if (existing.type === 'debt_payment' || existing.type === 'balance_adjustment') {
    throw badRequest('Цей запис створено боргом; змініть або видаліть його на сторінці боргу');
  }
}

export async function createTransaction(
  db: Db,
  auth: AuthContext,
  input: TransactionInput,
  now: Date = new Date(),
): Promise<Transaction> {
  const values = await resolveValues(db, auth, input);
  if (values.type === 'expense') {
    values.occurredAt = await resolveExpenseInstant(db, auth, values.occurredAt, now);
  }
  return toTransactionDto(await repo.insertTransaction(db, auth.householdId, auth.userId, values));
}

export async function replaceTransaction(
  db: Db,
  auth: AuthContext,
  id: string,
  input: TransactionInput,
  now: Date = new Date(),
): Promise<Transaction> {
  const existing = await repo.findTransaction(db, auth.householdId, id);
  if (!existing) throw notFound('Транзакція');
  assertNotServiceTransaction(existing);

  const values = await resolveValues(db, auth, input);
  if (values.type === 'expense') {
    values.occurredAt = await resolveExpenseInstant(db, auth, values.occurredAt, now);
  }

  const row = await repo.replaceTransaction(db, auth.householdId, id, values);
  if (!row) throw notFound('Транзакція');
  return toTransactionDto(row);
}

export async function deleteTransaction(db: Db, auth: AuthContext, id: string): Promise<void> {
  const existing = await repo.findTransaction(db, auth.householdId, id);
  if (!existing) throw notFound('Транзакція');
  assertNotServiceTransaction(existing);
  await repo.deleteTransaction(db, auth.householdId, id);
}
