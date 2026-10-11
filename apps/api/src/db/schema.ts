import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid().primaryKey().defaultRandom();
const instant = () => timestamp({ withTimezone: true, mode: 'date' });
const createdAt = () => instant().notNull().defaultNow();

export const memberRole = pgEnum('member_role', ['owner', 'member']);
export const accountType = pgEnum('account_type', ['card', 'cash', 'deposit']);
export const categoryKind = pgEnum('category_kind', ['income', 'expense']);
export const transactionType = pgEnum('transaction_type', ['income', 'expense', 'transfer']);

export const users = pgTable('users', {
  id: id(),
  email: text().notNull().unique(),
  name: text().notNull(),
  // argon2id; порожній, якщо користувач ще не має пароля
  passwordHash: text('password_hash'),
  timeZone: text('time_zone').notNull().default('Europe/Kyiv'),
  createdAt: createdAt(),
});

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // SHA-256 від токена; сам токен ніде не зберігається
    tokenHash: text('token_hash').notNull().unique(),
    // Ланцюжок ротацій одного входу: повторне використання старого токена відкликає всю родину
    familyId: uuid('family_id').notNull(),
    expiresAt: instant().notNull(),
    revokedAt: instant(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId), index().on(t.familyId)],
);

export const households = pgTable('households', {
  id: id(),
  name: text().notNull(),
  createdAt: createdAt(),
});

export const householdMembers = pgTable(
  'household_members',
  {
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole().notNull().default('member'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] }), index().on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    type: accountType().notNull(),
    currency: char({ length: 3 }).notNull().default('UAH'),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.householdId)],
);

export const categories = pgTable(
  'categories',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    kind: categoryKind().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.householdId, t.kind, t.name)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    type: transactionType().notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    // Рахунок призначення; заповнений тільки для переказів.
    toAccountId: uuid('to_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'restrict' }),
    // Сума в мінімальних одиницях валюти (копійки), завжди додатна; напрям задає type.
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char({ length: 3 }).notNull().default('UAH'),
    description: text().notNull().default(''),
    occurredAt: instant().notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.householdId, t.occurredAt),
    index().on(t.accountId),
    index().on(t.toAccountId),
    index().on(t.categoryId),
    check('transactions_amount_positive', sql`${t.amountMinor} > 0`),
    check(
      'transactions_transfer_shape',
      sql`(${t.type} = 'transfer' AND ${t.toAccountId} IS NOT NULL AND ${t.toAccountId} <> ${t.accountId} AND ${t.categoryId} IS NULL)
        OR (${t.type} <> 'transfer' AND ${t.toAccountId} IS NULL)`,
    ),
  ],
);
