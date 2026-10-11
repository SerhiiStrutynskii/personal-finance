import { z } from 'zod';
import { DEFAULT_CURRENCY, currencySchema, positiveAmountMinorSchema } from './money.ts';

export const idSchema = z.uuid();
export const idParamsSchema = z.object({ id: idSchema });

const nameSchema = z.string().trim().min(1).max(100);
const instantSchema = z.iso.datetime({ offset: true });

// --- Account ---

export const accountTypeSchema = z.enum(['card', 'cash', 'deposit']);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const createAccountSchema = z.object({
  name: nameSchema,
  type: accountTypeSchema,
  currency: currencySchema.default(DEFAULT_CURRENCY),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

// Валюту рахунку змінити не можна: від неї залежать уже записані транзакції.
export const updateAccountSchema = z
  .object({ name: nameSchema, type: accountTypeSchema })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Потрібне хоча б одне поле');
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const accountSchema = z.object({
  id: idSchema,
  name: z.string(),
  type: accountTypeSchema,
  currency: currencySchema,
  createdAt: instantSchema,
});
export type Account = z.infer<typeof accountSchema>;

// --- Category ---

export const categoryKindSchema = z.enum(['income', 'expense']);
export type CategoryKind = z.infer<typeof categoryKindSchema>;

export const createCategorySchema = z.object({ name: nameSchema, kind: categoryKindSchema });
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({ name: nameSchema });
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const categorySchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: categoryKindSchema,
  createdAt: instantSchema,
});
export type Category = z.infer<typeof categorySchema>;

// --- Transaction ---

export const transactionTypeSchema = z.enum(['income', 'expense', 'transfer']);
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
    type: z.enum(['income', 'expense']),
    ...transactionBase,
    categoryId: idSchema.nullable().default(null),
  }),
  z
    .object({ type: z.literal('transfer'), ...transactionBase, toAccountId: idSchema })
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
  from: instantSchema.optional(),
  to: instantSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

export const transactionSchema = z.object({
  id: idSchema,
  type: transactionTypeSchema,
  accountId: idSchema,
  toAccountId: idSchema.nullable(),
  categoryId: idSchema.nullable(),
  amountMinor: positiveAmountMinorSchema,
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
});
export type RegisterInput = z.infer<typeof registerSchema>;

// Під час входу довжину пароля не перевіряємо за правилами реєстрації: лише розумні межі.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

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
