import { z } from 'zod';
import { monthSchema } from './budget/month.ts';
import {
  DEFAULT_CURRENCY,
  amountMinorSchema,
  currencySchema,
  positiveAmountMinorSchema,
} from './money.ts';

export const idSchema = z.uuid();
export const idParamsSchema = z.object({ id: idSchema });

const nameSchema = z.string().trim().min(1).max(100);
const instantSchema = z.iso.datetime({ offset: true });

// --- Account ---

export const accountTypeSchema = z.enum(['card', 'cash', 'deposit', 'credit_card']);
export type AccountType = z.infer<typeof accountTypeSchema>;

/** Типи, які можна задати напряму; рахунок кредитної картки створюється лише разом із боргом. */
export const plainAccountTypeSchema = z.enum(['card', 'cash', 'deposit']);
export type PlainAccountType = z.infer<typeof plainAccountTypeSchema>;

export const createAccountSchema = z.object({
  name: nameSchema,
  type: plainAccountTypeSchema,
  currency: currencySchema.default(DEFAULT_CURRENCY),
  /** Гроші на рахунку в момент створення, у мінімальних одиницях; записуються службовою транзакцією. */
  openingBalance: amountMinorSchema.nonnegative().default(0),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

// Валюту рахунку змінити не можна: від неї залежать уже записані транзакції.
export const updateAccountSchema = z
  .object({ name: nameSchema, type: plainAccountTypeSchema })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Потрібне хоча б одне поле');
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

/**
 * Коригування балансу: фактичний баланс рахунку на зараз, у мінімальних одиницях; може бути
 * від'ємним. Різниця з обліковим балансом записується службовою транзакцією.
 */
export const accountBalanceAdjustmentSchema = z.object({
  actualBalance: amountMinorSchema,
  note: z.string().trim().max(500).nullish(),
});
export type AccountBalanceAdjustmentInput = z.infer<typeof accountBalanceAdjustmentSchema>;

export const accountSchema = z.object({
  id: idSchema,
  name: z.string(),
  type: accountTypeSchema,
  currency: currencySchema,
  /**
   * Баланс із транзакцій рахунку. Для кредитної картки від'ємний баланс — це борг,
   * додатний — власні кошти.
   */
  balance: amountMinorSchema,
  /** Кредитний ліміт; лише для кредитної картки. */
  creditLimit: positiveAmountMinorSchema.nullable(),
  /** Архівний рахунок не приймає нових транзакцій. */
  isArchived: z.boolean(),
  createdAt: instantSchema,
});
export type Account = z.infer<typeof accountSchema>;

// --- Category ---

export const categoryKindSchema = z.enum(['income', 'expense']);
export type CategoryKind = z.infer<typeof categoryKindSchema>;

export const createCategorySchema = z.object({
  name: nameSchema,
  kind: categoryKindSchema,
  /** Батьківська категорія; null — категорія верхнього рівня. Рівнів лише два. */
  parentId: idSchema.nullable().default(null),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/** Перейменування та/або перенесення: parentId = null робить категорію верхнього рівня. */
export const updateCategorySchema = z
  .object({ name: nameSchema, parentId: idSchema.nullable() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Потрібне хоча б одне поле');
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/** Системні категорії витрат: їх створює застосунок, змінити чи видалити їх не можна. */
export const systemCategoryKeySchema = z.enum(['debt_repayment', 'interest_fees']);
export type SystemCategoryKey = z.infer<typeof systemCategoryKeySchema>;

export const SYSTEM_CATEGORY_NAMES: Record<SystemCategoryKey, string> = {
  debt_repayment: 'Погашення боргів',
  interest_fees: 'Відсотки та комісії',
};

export const categorySchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: categoryKindSchema,
  /** Ключ системної категорії; null для звичайних. */
  systemKey: systemCategoryKeySchema.nullable(),
  /** Батьківська категорія; null — категорія верхнього рівня. */
  parentId: idSchema.nullable(),
  createdAt: instantSchema,
});
export type Category = z.infer<typeof categorySchema>;

/** Повна назва категорії для списків і звітів: «Комунальні › Вода». */
export function categoryPathName(name: string, parentName: string | null | undefined): string {
  return parentName ? `${parentName} › ${name}` : name;
}

// --- Transaction ---

export const transactionTypeSchema = z.enum([
  'income',
  'expense',
  'transfer',
  // Службові типи; створюються лише через борги, а не через /api/transactions.
  'debt_payment',
  'balance_adjustment',
]);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

const transactionBase = {
  accountId: idSchema,
  amountMinor: positiveAmountMinorSchema,
  currency: currencySchema.default(DEFAULT_CURRENCY),
  description: z.string().trim().max(500).default(''),
  occurredAt: instantSchema,
};

export const transactionInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('expense'),
    ...transactionBase,
    categoryId: idSchema.nullable().default(null),
    // Надходження є лише в прибутків: будь-яке значення, крім null, — помилка.
    occurrenceId: z.null().optional(),
  }),
  z.object({
    type: z.literal('income'),
    ...transactionBase,
    categoryId: idSchema.nullable().default(null),
    /** Надходження періодичного прибутку, яке оплачує ця транзакція. */
    occurrenceId: idSchema.nullable().default(null),
  }),
  z
    .object({
      type: z.literal('transfer'),
      ...transactionBase,
      toAccountId: idSchema,
      occurrenceId: z.null().optional(),
    })
    .refine((value) => value.accountId !== value.toAccountId, {
      path: ['toAccountId'],
      message: 'Переказ має бути між різними рахунками',
    }),
]);
export type TransactionInput = z.infer<typeof transactionInputSchema>;

// Період — півінтервал: from включно, to виключно.
export const listTransactionsQuerySchema = z.object({
  type: transactionTypeSchema.optional(),
  accountId: idSchema.optional(),
  categoryId: idSchema.optional(),
  occurrenceId: idSchema.optional(),
  from: instantSchema.optional(),
  to: instantSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

/** Експорт витрат місяця в CSV: GET /api/transactions/export.csv?month=YYYY-MM. */
export const exportExpensesQuerySchema = z.object({ month: monthSchema });
export type ExportExpensesQuery = z.infer<typeof exportExpensesQuerySchema>;

export const transactionSchema = z.object({
  id: idSchema,
  type: transactionTypeSchema,
  accountId: idSchema,
  toAccountId: idSchema.nullable(),
  categoryId: idSchema.nullable(),
  occurrenceId: idSchema.nullable(),
  /** Борг, який гасить транзакція; лише для debt_payment. */
  debtId: idSchema.nullable(),
  /** Додатна; знакова лише для balance_adjustment. */
  amountMinor: amountMinorSchema,
  currency: currencySchema,
  description: z.string(),
  occurredAt: instantSchema,
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type Transaction = z.infer<typeof transactionSchema>;

// --- Auth ---

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  householdName: nameSchema.default('Моє домогосподарство'),
  /** Токен із посилання-запрошення: користувач приєднується до чужого домогосподарства. */
  inviteToken: z.string().min(1).max(200).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

// Під час входу довжину пароля не перевіряємо за правилами реєстрації: лише розумні межі.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Зміна пароля. Поточний пароль перевіряється лише на розумні межі (його могли встановити за
 * іншими правилами), новий — за правилами реєстрації.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: 'Новий пароль має відрізнятися від поточного',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(1).max(200) });
export type RefreshInput = z.infer<typeof refreshSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Час життя access-токена в секундах. */
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const memberRoleSchema = z.enum(['owner', 'member']);
export type MemberRole = z.infer<typeof memberRoleSchema>;

export const currentUserSchema = z.object({
  user: z.object({ id: idSchema, email: z.string(), name: z.string(), timeZone: z.string() }),
  household: z.object({ id: idSchema, name: z.string(), role: memberRoleSchema }),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const authSessionSchema = currentUserSchema.extend(authTokensSchema.shape);
export type AuthSession = z.infer<typeof authSessionSchema>;

// Домогосподарство: учасники й запрошення.

export const householdMemberSchema = z.object({
  userId: idSchema,
  name: z.string(),
  email: z.string(),
  role: memberRoleSchema,
  joinedAt: z.string(),
});
export type HouseholdMember = z.infer<typeof householdMemberSchema>;

export const householdInviteSchema = z.object({
  id: idSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
  createdByName: z.string().nullable(),
});
export type HouseholdInvite = z.infer<typeof householdInviteSchema>;

export const householdSchema = z.object({
  id: idSchema,
  name: z.string(),
  role: memberRoleSchema,
  members: z.array(householdMemberSchema),
  /** Активні запрошення; бачить лише власник, учаснику — порожній список. */
  invites: z.array(householdInviteSchema),
});
export type Household = z.infer<typeof householdSchema>;

export const updateHouseholdSchema = z.object({ name: nameSchema });
export type UpdateHouseholdInput = z.infer<typeof updateHouseholdSchema>;

/** Нове запрошення; токен повертається лише тут, у БД зберігається його хеш. */
export const createdInviteSchema = householdInviteSchema.extend({ token: z.string() });
export type CreatedInvite = z.infer<typeof createdInviteSchema>;

/** Відкриті дані запрошення для сторінки реєстрації. */
export const invitePreviewSchema = z.object({
  householdName: z.string(),
  invitedBy: z.string().nullable(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

/** Скільки діє посилання-запрошення. */
export const INVITE_TTL_DAYS = 7;
/** Скільки активних запрошень може мати домогосподарство одночасно. */
export const MAX_ACTIVE_INVITES = 10;
