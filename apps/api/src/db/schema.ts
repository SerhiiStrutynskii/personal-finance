import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid().primaryKey().defaultRandom();
const instant = () => timestamp({ withTimezone: true, mode: 'date' });
const createdAt = () => instant().notNull().defaultNow();

export const SYSTEM_CATEGORY_KEYS = ['debt_repayment', 'interest_fees'] as const;

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

// Запрошення до домогосподарства за посиланням: одноразове, з терміном дії.
export const householdInvites = pgTable(
  'household_invites',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    // SHA-256 від токена з посилання; сам токен ніде не зберігається
    tokenHash: text('token_hash').notNull().unique(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: instant().notNull(),
    acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
    acceptedAt: instant(),
    revokedAt: instant(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.householdId)],
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
    // Системна категорія (погашення боргів, відсотки й комісії): її не можна змінити чи видалити.
    systemKey: text('system_key', { enum: SYSTEM_CATEGORY_KEYS }),
    // Підкатегорія: батько — категорія верхнього рівня того самого типу. Глибина й тип
    // перевіряються в сервісі; батька з підкатегоріями видалити не можна.
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
    createdAt: createdAt(),
  },
  (t) => [
    // Назва унікальна серед «сусідів»: «Інше» може бути і в «Комунальних», і в «Транспорті».
    unique('categories_household_kind_parent_name_unique')
      .on(t.householdId, t.kind, t.parentId, t.name)
      .nullsNotDistinct(),
    unique().on(t.householdId, t.systemKey),
    check('categories_parent_not_self', sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
  ],
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
    // Надходження періодичного прибутку, яке ця транзакція оплачує; тільки для прибутків.
    occurrenceId: uuid('occurrence_id').references(() => incomeOccurrences.id, {
      onDelete: 'set null',
    }),
    // Борг, який гасить ця транзакція; заповнений тільки для debt_payment.
    debtId: uuid('debt_id').references(() => debts.id),
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
      'transactions_debt_only_for_payment',
      sql`((${t.type})::text = 'debt_payment') = (${t.debtId} IS NOT NULL)`,
    ),
    index().on(t.debtId),
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
    // Рахунок, на який зазвичай надходить прибуток.
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

export const DEBT_TYPES = ['credit_card', 'installment', 'mfo_loan', 'bank_loan'] as const;
export const RATE_PERIODS = ['year', 'month', 'day'] as const;
export const DEBT_STATUSES = ['active', 'closed'] as const;

export const debts = pgTable(
  'debts',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    description: text(),
    type: text({ enum: DEBT_TYPES }).notNull(),
    // Рахунок-картка; лише для кредитної картки, один борг на рахунок.
    accountId: uuid('account_id')
      .unique()
      .references(() => accounts.id),
    currency: char({ length: 3 }).notNull().default('UAH'),
    // Сума боргу на startDate.
    initialAmount: bigint('initial_amount', { mode: 'number' }).notNull(),
    startDate: calendarDate('start_date').notNull(),
    maturityDate: calendarDate('maturity_date'),
    // Ставка у відсотках так, як її вказав користувач; період — у ratePeriod.
    interestRate: numeric('interest_rate', { precision: 9, scale: 4 }).notNull(),
    ratePeriod: text('rate_period', { enum: RATE_PERIODS }).notNull(),
    monthlyPayment: bigint('monthly_payment', { mode: 'number' }).notNull(),
    paymentDay: smallint('payment_day').notNull(),
    // Місяць першого платежу (YYYY-MM); до нього платити нічого.
    firstPaymentMonth: char('first_payment_month', { length: 7 }),
    earlyRepaymentAllowed: boolean('early_repayment_allowed').notNull().default(true),
    // Рахунок, з якого зазвичай гаситься борг.
    defaultAccountId: uuid('default_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    status: text({ enum: DEBT_STATUSES }).notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.householdId),
    check(
      'debts_type_valid',
      sql`${t.type} IN ('credit_card', 'installment', 'mfo_loan', 'bank_loan')`,
    ),
    check('debts_rate_period_valid', sql`${t.ratePeriod} IN ('year', 'month', 'day')`),
    check('debts_status_valid', sql`${t.status} IN ('active', 'closed')`),
    check('debts_initial_amount_non_negative', sql`${t.initialAmount} >= 0`),
    check('debts_interest_rate_non_negative', sql`${t.interestRate} >= 0`),
    check('debts_monthly_payment_positive', sql`${t.monthlyPayment} > 0`),
    check('debts_payment_day_valid', sql`${t.paymentDay} BETWEEN 1 AND 31`),
    check(
      'debts_first_payment_month_valid',
      sql`${t.firstPaymentMonth} IS NULL OR ${t.firstPaymentMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      'debts_card_has_account',
      sql`(${t.type} = 'credit_card') = (${t.accountId} IS NOT NULL)`,
    ),
    check(
      'debts_maturity_required',
      sql`${t.type} = 'credit_card' OR ${t.maturityDate} IS NOT NULL`,
    ),
    check(
      'debts_maturity_after_start',
      sql`${t.maturityDate} IS NULL OR ${t.maturityDate} > ${t.startDate}`,
    ),
    check(
      'debts_card_early_repayment',
      sql`${t.type} <> 'credit_card' OR ${t.earlyRepaymentAllowed}`,
    ),
    check(
      'debts_default_account_differs',
      sql`${t.defaultAccountId} IS NULL OR ${t.defaultAccountId} IS DISTINCT FROM ${t.accountId}`,
    ),
  ],
);

export const DEBT_ENTRY_KINDS = ['payment', 'charge', 'adjustment'] as const;

// Рухи позик і розстрочок; у кредитки їх немає — її рухи це транзакції рахунку-картки.
export const debtEntries = pgTable(
  'debt_entries',
  {
    id: id(),
    debtId: uuid('debt_id')
      .notNull()
      .references(() => debts.id, { onDelete: 'cascade' }),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    kind: text({ enum: DEBT_ENTRY_KINDS }).notNull(),
    // payment і charge — додатна сума; adjustment — знакова різниця звірки.
    amount: bigint({ mode: 'number' }).notNull(),
    principalPart: bigint('principal_part', { mode: 'number' }),
    interestPart: bigint('interest_part', { mode: 'number' }),
    // Транзакція рахунку, якою внесено платіж; видаляється разом із записом.
    transactionId: uuid('transaction_id')
      .unique()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    occurredAt: instant().notNull(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.debtId, t.occurredAt),
    check('debt_entries_kind_valid', sql`${t.kind} IN ('payment', 'charge', 'adjustment')`),
    check('debt_entries_amount_valid', sql`${t.kind} = 'adjustment' OR ${t.amount} > 0`),
    check(
      'debt_entries_payment_shape',
      sql`${t.kind} <> 'payment' OR (${t.transactionId} IS NOT NULL
        AND ${t.principalPart} >= 0 AND ${t.interestPart} >= 0
        AND ${t.principalPart} + ${t.interestPart} = ${t.amount})`,
    ),
  ],
);

export const GOAL_KINDS = ['savings', 'debt_payoff'] as const;
export const GOAL_STATUSES = ['active', 'archived'] as const;
export const PAYOFF_STRATEGIES = ['avalanche', 'snowball'] as const;

export const goals = pgTable(
  'goals',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    kind: text({ enum: GOAL_KINDS }).notNull(),
    name: text().notNull(),
    description: text(),
    currency: char({ length: 3 }).notNull().default('UAH'),
    // Необов'язкова для накопичення, обов'язкова для виходу з боргів.
    targetDate: calendarDate('target_date'),
    status: text({ enum: GOAL_STATUSES }).notNull().default('active'),
    // Накопичення: рахунок, баланс якого є прогресом цілі.
    accountId: uuid('account_id').references(() => accounts.id),
    targetAmount: bigint('target_amount', { mode: 'number' }),
    monthlyContribution: bigint('monthly_contribution', { mode: 'number' }),
    // Вихід із боргів: сумарний залишок боргів цілі на момент створення.
    startBalance: bigint('start_balance', { mode: 'number' }),
    // Скільки понад мінімальні платежі користувач готовий платити щомісяця.
    extraPayment: bigint('extra_payment', { mode: 'number' }),
    strategy: text({ enum: PAYOFF_STRATEGIES }),
    createdAt: createdAt(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.householdId),
    // Один рахунок — одна активна ціль накопичення.
    uniqueIndex('goals_active_account_unique')
      .on(t.accountId)
      .where(sql`${t.status} = 'active'`),
    check('goals_kind_valid', sql`${t.kind} IN ('savings', 'debt_payoff')`),
    check('goals_status_valid', sql`${t.status} IN ('active', 'archived')`),
    check('goals_strategy_valid', sql`${t.strategy} IN ('avalanche', 'snowball')`),
    check('goals_target_amount_positive', sql`${t.targetAmount} > 0`),
    check('goals_monthly_contribution_positive', sql`${t.monthlyContribution} > 0`),
    check('goals_start_balance_non_negative', sql`${t.startBalance} >= 0`),
    check('goals_extra_payment_non_negative', sql`${t.extraPayment} >= 0`),
    check(
      'goals_savings_shape',
      sql`(${t.kind} = 'savings') = (${t.accountId} IS NOT NULL AND ${t.targetAmount} IS NOT NULL)`,
    ),
    check(
      'goals_savings_only_fields',
      sql`${t.kind} <> 'savings' OR (${t.startBalance} IS NULL AND ${t.extraPayment} IS NULL AND ${t.strategy} IS NULL)`,
    ),
    check(
      'goals_debt_payoff_shape',
      sql`${t.kind} <> 'debt_payoff' OR (${t.targetDate} IS NOT NULL AND ${t.startBalance} IS NOT NULL
        AND ${t.extraPayment} IS NOT NULL AND ${t.strategy} IS NOT NULL AND ${t.monthlyContribution} IS NULL)`,
    ),
  ],
);

// Борги, які охоплює ціль виходу з боргів; видалений борг зникає з цілі.
export const goalDebts = pgTable(
  'goal_debts',
  {
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    debtId: uuid('debt_id')
      .notNull()
      .references(() => debts.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.goalId, t.debtId] }), index().on(t.debtId)],
);

export const PRODUCT_UNITS = ['pcs', 'kg', 'l', 'pack'] as const;

// Довідник продуктів домогосподарства для списків покупок.
export const products = pgTable(
  'products',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    // Назва в нижньому регістрі для унікальності. Рахується в застосунку: у базі з collation C
    // lower() не змінює кирилицю.
    nameKey: text('name_key').notNull(),
    unit: text({ enum: PRODUCT_UNITS }).notNull().default('pcs'),
    // Остання відома ціна за одиницю в копійках; NULL — ціна ще невідома.
    priceMinor: bigint('price_minor', { mode: 'number' }),
    currency: char({ length: 3 }).notNull().default('UAH'),
    // Продукт з історії покупок не видаляється, а ховається з довідника.
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [
    // «Молоко» і «молоко» — той самий продукт.
    unique('products_household_name_unique').on(t.householdId, t.nameKey),
    check('products_unit_valid', sql`${t.unit} IN ('pcs', 'kg', 'l', 'pack')`),
    check('products_price_positive', sql`${t.priceMinor} > 0`),
  ],
);

// Список покупок; спільний для всіх учасників домогосподарства. Транзакцій не створює.
export const shoppingLists = pgTable(
  'shopping_lists',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    currency: char({ length: 3 }).notNull().default('UAH'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [index().on(t.householdId, t.createdAt)],
);

// Рядок списку. Куплені рядки — історія цін і покупок для аналітики.
export const shoppingListItems = pgTable(
  'shopping_list_items',
  {
    id: id(),
    listId: uuid('list_id')
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    // Продукт з історією покупок видалити не можна, лише заархівувати.
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    // Кількість у тисячних одиниці продукту: 1,5 кг = 1500.
    quantityMilli: integer('quantity_milli').notNull(),
    // Знімок ціни довідника в момент додавання, у копійках за одиницю.
    expectedUnitPriceMinor: bigint('expected_unit_price_minor', { mode: 'number' }),
    actualUnitPriceMinor: bigint('actual_unit_price_minor', { mode: 'number' }),
    isBought: boolean('is_bought').notNull().default(false),
    // Момент покупки; за ним аналітика відносить покупку до місяця.
    boughtAt: instant(),
    position: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // Один продукт у списку один раз: повторне додавання збільшує кількість.
    unique('shopping_list_items_product_unique').on(t.listId, t.productId),
    index().on(t.productId),
    check('shopping_list_items_quantity_positive', sql`${t.quantityMilli} > 0`),
    check(
      'shopping_list_items_prices_positive',
      sql`${t.expectedUnitPriceMinor} > 0 AND ${t.actualUnitPriceMinor} > 0`,
    ),
    check('shopping_list_items_bought_at', sql`${t.isBought} = (${t.boughtAt} IS NOT NULL)`),
  ],
);

// Прийом їжі (сніданок, обід…) — довідник домогосподарства для меню.
export const mealTypes = pgTable(
  'meal_types',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    // Назва в нижньому регістрі для унікальності, як у продуктів.
    nameKey: text('name_key').notNull(),
    // Порядок у довіднику; важливе лише відносне значення.
    position: integer().notNull(),
    createdAt: createdAt(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [
    unique('meal_types_household_name_unique').on(t.householdId, t.nameKey),
    index().on(t.householdId, t.position),
  ],
);

// Страва зі складом однієї порції. Ціна порції не зберігається: рахується з цін продуктів.
export const dishes = pgTable(
  'dishes',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    nameKey: text('name_key').notNull(),
    createdAt: createdAt(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [unique('dishes_household_name_unique').on(t.householdId, t.nameKey)],
);

// Продукт у складі однієї порції страви.
export const dishIngredients = pgTable(
  'dish_ingredients',
  {
    id: id(),
    dishId: uuid('dish_id')
      .notNull()
      .references(() => dishes.id, { onDelete: 'cascade' }),
    // Продукт зі складу страви видалити не можна, лише заархівувати.
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    // Кількість у тисячних одиниці продукту, як у shopping_list_items.
    quantityMilli: integer('quantity_milli').notNull(),
    position: integer().notNull(),
  },
  (t) => [
    unique('dish_ingredients_product_unique').on(t.dishId, t.productId),
    index().on(t.productId),
    check('dish_ingredients_quantity_positive', sql`${t.quantityMilli} > 0`),
  ],
);

// Запис меню — страва з порціями або продукт з кількістю в прийомі їжі одного дня. Дата —
// календарна дата домогосподарства, без часу. Ціна не зберігається: вартість рахується з
// поточних цін продуктів. Страву, продукт чи прийом їжі з записами в меню видалити не можна
// (no action → 23503 → 409); перевірка no action іде в кінці оператора, тому каскадне видалення
// домогосподарства не падає.
export const menuEntries = pgTable(
  'menu_entries',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    date: calendarDate('date').notNull(),
    mealTypeId: uuid('meal_type_id')
      .notNull()
      .references(() => mealTypes.id),
    // Страва з порціями — або продукт з кількістю (рівно одне, див. menu_entries_kind).
    dishId: uuid('dish_id').references(() => dishes.id),
    servings: integer(),
    productId: uuid('product_id').references(() => products.id),
    // Кількість продукту в тисячних одиниці, як у shopping_list_items.
    quantityMilli: integer('quantity_milli'),
    createdAt: createdAt(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [
    unique('menu_entries_dish_unique').on(t.householdId, t.date, t.mealTypeId, t.dishId),
    unique('menu_entries_product_unique').on(t.householdId, t.date, t.mealTypeId, t.productId),
    index().on(t.householdId, t.date),
    index().on(t.dishId),
    index().on(t.productId),
    index().on(t.mealTypeId),
    check('menu_entries_servings_range', sql`${t.servings} between 1 and 99`),
    check('menu_entries_quantity_range', sql`${t.quantityMilli} between 1 and 1000000000`),
    check(
      'menu_entries_kind',
      sql`(${t.dishId} IS NOT NULL AND ${t.servings} IS NOT NULL AND ${t.productId} IS NULL AND ${t.quantityMilli} IS NULL) OR (${t.dishId} IS NULL AND ${t.servings} IS NULL AND ${t.productId} IS NOT NULL AND ${t.quantityMilli} IS NOT NULL)`,
    ),
  ],
);

// Іменований шаблон меню дня: копія записів дня на момент збереження. Застосування замінює
// записи цільового дня позиціями шаблону; день не пам'ятає, з якого шаблону його заповнили.
export const menuDayTemplates = pgTable(
  'menu_day_templates',
  {
    id: id(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    // Назва в нижньому регістрі для унікальності, як у страв.
    nameKey: text('name_key').notNull(),
    createdAt: createdAt(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [unique('menu_day_templates_household_name_unique').on(t.householdId, t.nameKey)],
);

// Позиція шаблону — страва з порціями або продукт з кількістю в прийомі їжі. Ціни й назви не
// зберігаються. Видалення страви чи прийому їжі прибирає їхні позиції з шаблонів (cascade);
// продукт із позицією шаблону видалити не можна (no action → 409), лише заархівувати.
export const menuDayTemplateItems = pgTable(
  'menu_day_template_items',
  {
    id: id(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => menuDayTemplates.id, { onDelete: 'cascade' }),
    mealTypeId: uuid('meal_type_id')
      .notNull()
      .references(() => mealTypes.id, { onDelete: 'cascade' }),
    dishId: uuid('dish_id').references(() => dishes.id, { onDelete: 'cascade' }),
    servings: integer(),
    productId: uuid('product_id').references(() => products.id),
    quantityMilli: integer('quantity_milli'),
  },
  (t) => [
    unique('menu_day_template_items_dish_unique').on(t.templateId, t.mealTypeId, t.dishId),
    unique('menu_day_template_items_product_unique').on(t.templateId, t.mealTypeId, t.productId),
    index().on(t.templateId),
    index().on(t.dishId),
    index().on(t.productId),
    index().on(t.mealTypeId),
    check('menu_day_template_items_servings_range', sql`${t.servings} between 1 and 99`),
    check(
      'menu_day_template_items_quantity_range',
      sql`${t.quantityMilli} between 1 and 1000000000`,
    ),
    check(
      'menu_day_template_items_kind',
      sql`(${t.dishId} IS NOT NULL AND ${t.servings} IS NOT NULL AND ${t.productId} IS NULL AND ${t.quantityMilli} IS NULL) OR (${t.dishId} IS NULL AND ${t.servings} IS NULL AND ${t.productId} IS NOT NULL AND ${t.quantityMilli} IS NOT NULL)`,
    ),
  ],
);
