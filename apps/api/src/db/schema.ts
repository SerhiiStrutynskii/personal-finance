import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid().primaryKey().defaultRandom();
const instant = () => timestamp({ withTimezone: true, mode: 'date' });
const createdAt = () => instant().notNull().defaultNow();

export const memberRole = pgEnum('member_role', ['owner', 'member']);
export const accountType = pgEnum('account_type', ['card', 'cash', 'deposit', 'credit_card']);
export const categoryKind = pgEnum('category_kind', ['income', 'expense']);
export const transactionType = pgEnum('transaction_type', [
  'income',
  'expense',
  'transfer',
  // Платіж по позиці чи розстрочці з рахунку; створюється лише разом із записом боргу.
  'debt_payment',
  // Службова зміна балансу рахунку (початковий борг кредитки, звірка); сума знакова.
  'balance_adjustment',
]);

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
  // У цьому поясі рахуються межі місяця бюджету, спільні для всіх членів домогосподарства.
  timeZone: text('time_zone').notNull().default('Europe/Kyiv'),
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
    // Кредитний ліміт у мінімальних одиницях; лише для кредитної картки.
    creditLimit: bigint('credit_limit', { mode: 'number' }),
    // Архівний рахунок лишається в історії, але нових транзакцій не приймає.
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.householdId),
    // Порівняння через text: значення, додане до enum міграцією, не можна вживати в тій самій транзакції.
    check(
      'accounts_credit_limit_valid',
      sql`((${t.type})::text = 'credit_card') = (${t.creditLimit} IS NOT NULL)
        AND (${t.creditLimit} IS NULL OR ${t.creditLimit} > 0)`,
    ),
  ],
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
    // Сума в мінімальних одиницях валюти (копійки), додатна; напрям задає type.
    // Виняток — balance_adjustment: сума знакова й додається до балансу як є.
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char({ length: 3 }).notNull().default('UAH'),
    description: text().notNull().default(''),
    occurredAt: instant().notNull(),
    // Надходження періодичного доходу, яке ця транзакція оплачує; тільки для доходів.
    occurrenceId: uuid('occurrence_id').references(() => incomeOccurrences.id, {
      onDelete: 'set null',
    }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [
    // Для агрегації витрат бюджету: домогосподарство, тип, період, категорія.
    index().on(t.householdId, t.type, t.occurredAt, t.categoryId),
    // Для балансу рахунку на дату.
    index().on(t.accountId, t.occurredAt),
    index().on(t.toAccountId),
    index().on(t.categoryId),
    index().on(t.occurrenceId),
    check(
      'transactions_occurrence_only_for_income',
      sql`${t.occurrenceId} IS NULL OR ${t.type} = 'income'`,
    ),
    check(
      'transactions_amount_valid',
      sql`${t.amountMinor} > 0 OR ((${t.type})::text = 'balance_adjustment' AND ${t.amountMinor} <> 0)`,
    ),
    check(
      'transactions_adjustment_shape',
      sql`(${t.type})::text <> 'balance_adjustment' OR ${t.categoryId} IS NULL`,
    ),
    check(
      'transactions_transfer_shape',
      sql`(${t.type} = 'transfer' AND ${t.toAccountId} IS NOT NULL AND ${t.toAccountId} <> ${t.accountId} AND ${t.categoryId} IS NULL)
        OR (${t.type} <> 'transfer' AND ${t.toAccountId} IS NULL)`,
    ),
  ],
);

export const budgets = pgTable(
  'budgets',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    // Перше число місяця 00:00 у часовому поясі домогосподарства; кінець — виключно.
    periodStart: instant().notNull(),
    periodEnd: instant().notNull(),
    currency: char({ length: 3 }).notNull().default('UAH'),
    createdAt: createdAt(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.householdId, t.periodStart),
    check('budgets_period_valid', sql`${t.periodEnd} > ${t.periodStart}`),
  ],
);

export const budgetExpenseLines = pgTable(
  'budget_expense_lines',
  {
    id: id(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    plannedAmount: bigint('planned_amount', { mode: 'number' }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    unique().on(t.budgetId, t.categoryId),
    check('budget_expense_lines_planned_non_negative', sql`${t.plannedAmount} >= 0`),
  ],
);

export const INCOME_FREQUENCIES = ['monthly', 'weekly', 'biweekly', 'every_n_months'] as const;
const calendarDate = (name: string) => date(name, { mode: 'string' });

export const incomeSources = pgTable(
  'income_sources',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    // Рахунок, на який зазвичай надходить дохід.
    accountId: uuid('account_id').references(() => accounts.id),
    name: text().notNull(),
    currency: char({ length: 3 }).notNull().default('UAH'),
    // Типова сума одного надходження.
    plannedAmount: bigint('planned_amount', { mode: 'number' }).notNull(),
    frequency: text({ enum: INCOME_FREQUENCIES }).notNull(),
    dayOfMonth: smallint('day_of_month'),
    dayOfWeek: smallint('day_of_week'),
    intervalMonths: smallint('interval_months'),
    startDate: calendarDate('start_date').notNull(),
    endDate: calendarDate('end_date'),
    // Дата останньої зміни правила: нові надходження генеруються лише від неї,
    // щоб змінене правило не переписувало історію.
    ruleFrom: calendarDate('rule_from'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.householdId),
    check('income_sources_planned_positive', sql`${t.plannedAmount} > 0`),
    check(
      'income_sources_frequency_valid',
      sql`${t.frequency} IN ('monthly', 'weekly', 'biweekly', 'every_n_months')`,
    ),
    check('income_sources_day_of_month_valid', sql`${t.dayOfMonth} BETWEEN 1 AND 31`),
    check('income_sources_day_of_week_valid', sql`${t.dayOfWeek} BETWEEN 1 AND 7`),
    check('income_sources_interval_valid', sql`${t.intervalMonths} >= 1`),
    check(
      'income_sources_dates_valid',
      sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`,
    ),
    // Кожна частота вимагає свої поля правила.
    check(
      'income_sources_rule_complete',
      sql`(${t.frequency} = 'monthly' AND ${t.dayOfMonth} IS NOT NULL)
        OR (${t.frequency} = 'every_n_months' AND ${t.dayOfMonth} IS NOT NULL AND ${t.intervalMonths} IS NOT NULL)
        OR (${t.frequency} IN ('weekly', 'biweekly') AND ${t.dayOfWeek} IS NOT NULL)`,
    ),
  ],
);

export const OCCURRENCE_STATUSES = ['expected', 'skipped'] as const;

export const incomeOccurrences = pgTable(
  'income_occurrences',
  {
    id: id(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => incomeSources.id, { onDelete: 'cascade' }),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    // Дата за правилом джерела. За нею генерація розпізнає вже створені надходження,
    // тому перенесення plannedDate не породжує дубль.
    scheduledDate: calendarDate('scheduled_date').notNull(),
    // Очікувана дата; користувач може змінити її для одного надходження.
    plannedDate: calendarDate('planned_date').notNull(),
    plannedAmount: bigint('planned_amount', { mode: 'number' }).notNull(),
    status: text({ enum: OCCURRENCE_STATUSES }).notNull().default('expected'),
  },
  (t) => [
    unique().on(t.sourceId, t.scheduledDate),
    unique().on(t.sourceId, t.plannedDate),
    index().on(t.householdId, t.plannedDate),
    check('income_occurrences_planned_positive', sql`${t.plannedAmount} > 0`),
    check('income_occurrences_status_valid', sql`${t.status} IN ('expected', 'skipped')`),
  ],
);
