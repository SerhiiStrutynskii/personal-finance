import { z } from 'zod';
import { monthSchema } from '../budget/month.ts';
import { dateStringSchema } from '../incomes/schemas.ts';
import { amountMinorSchema, currencySchema, positiveAmountMinorSchema } from '../money.ts';
import { idSchema } from '../schemas.ts';

export const goalKindSchema = z.enum(['savings', 'debt_payoff']);
export const goalStatusSchema = z.enum(['active', 'archived']);
export const payoffStrategySchema = z.enum(['avalanche', 'snowball']);

/** Цілі ведуться лише в гривні, як і борги. */
export const GOAL_CURRENCY = 'UAH';

const nonNegativeSchema = amountMinorSchema.nonnegative();
const nameSchema = z.string().trim().min(1).max(100);
const descriptionSchema = z.string().trim().max(1000).nullish();

const savingsFields = {
  name: nameSchema,
  description: descriptionSchema,
  /** Рахунок, баланс якого є прогресом цілі. */
  accountId: idSchema,
  targetAmount: positiveAmountMinorSchema,
  targetDate: dateStringSchema.nullish(),
  /** Плановий щомісячний внесок. */
  monthlyContribution: positiveAmountMinorSchema.nullish(),
};

const debtPayoffFields = {
  name: nameSchema,
  description: descriptionSchema,
  targetDate: dateStringSchema,
  /** Скільки понад мінімальні платежі користувач готовий платити щомісяця. */
  extraPayment: nonNegativeSchema,
  strategy: payoffStrategySchema,
};

export const createGoalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('savings'), ...savingsFields }),
  z.object({
    kind: z.literal('debt_payoff'),
    ...debtPayoffFields,
    extraPayment: nonNegativeSchema.default(0),
    strategy: payoffStrategySchema.default('avalanche'),
    /** Борги, які охоплює ціль; після створення не змінюються. */
    debtIds: z
      .array(idSchema)
      .min(1, 'Виберіть хоча б один борг')
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Борги не мають повторюватися'),
  }),
]);
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

/** Зміна цілі; які поля дозволені, залежить від її виду й перевіряється в сервісі. */
export const updateGoalSchema = z
  .object({ ...savingsFields, ...debtPayoffFields, targetDate: dateStringSchema.nullish() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Потрібне хоча б одне поле');
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

/** Поповнення цілі накопичення переказом з іншого рахунку. */
export const goalContributionSchema = z.object({
  fromAccountId: idSchema,
  amount: positiveAmountMinorSchema,
  date: dateStringSchema,
});
export type GoalContributionInput = z.infer<typeof goalContributionSchema>;

export const payoffPlanQuerySchema = z.object({
  extra: z.coerce.number().pipe(nonNegativeSchema).optional(),
  strategy: payoffStrategySchema.optional(),
});

// --- Відповіді ---

const goalBase = {
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  status: goalStatusSchema,
  currency: currencySchema,
  /** Частка виконання: 0,2 — це 20%; не більше 1. */
  progress: z.number(),
};

export const savingsGoalSchema = z.object({
  ...goalBase,
  kind: z.literal('savings'),
  targetDate: dateStringSchema.nullable(),
  accountId: idSchema,
  accountName: z.string(),
  targetAmount: positiveAmountMinorSchema,
  monthlyContribution: positiveAmountMinorSchema.nullable(),
  saved: nonNegativeSchema,
  remaining: nonNegativeSchema,
  requiredMonthly: nonNegativeSchema.nullable(),
  pace: positiveAmountMinorSchema.nullable(),
  projectedMonth: monthSchema.nullable(),
  state: z.enum(['achieved', 'no_deadline', 'overdue', 'on_track', 'behind']),
});
export type SavingsGoal = z.infer<typeof savingsGoalSchema>;

export const debtPayoffGoalSchema = z.object({
  ...goalBase,
  kind: z.literal('debt_payoff'),
  targetDate: dateStringSchema,
  debts: z.array(z.object({ id: idSchema, name: z.string(), balance: nonNegativeSchema })),
  startBalance: nonNegativeSchema,
  currentBalance: nonNegativeSchema,
  paid: nonNegativeSchema,
  extraPayment: nonNegativeSchema,
  strategy: payoffStrategySchema,
  minimumPayments: nonNegativeSchema,
  requiredMonthly: nonNegativeSchema.nullable(),
  debtFreeMonth: monthSchema.nullable(),
  state: z.enum(['achieved', 'overdue', 'on_track', 'behind']),
});
export type DebtPayoffGoal = z.infer<typeof debtPayoffGoalSchema>;

export const goalSchema = z.discriminatedUnion('kind', [savingsGoalSchema, debtPayoffGoalSchema]);
export type Goal = z.infer<typeof goalSchema>;

export const goalsListSchema = z.object({
  /** Сьогоднішня дата в часовому поясі домогосподарства. */
  today: dateStringSchema,
  goals: z.array(goalSchema),
});
export type GoalsList = z.infer<typeof goalsListSchema>;

const payoffOutcome = {
  months: z.number().int().nullable(),
  debtFreeMonth: monthSchema.nullable(),
  totalInterest: nonNegativeSchema.nullable(),
};

export const payoffPlanSchema = z.object({
  extra: nonNegativeSchema,
  strategy: payoffStrategySchema,
  plan: z.object({
    ...payoffOutcome,
    payoffOrder: z.array(z.object({ debtId: idSchema, name: z.string(), month: monthSchema })),
    timeline: z.array(z.object({ month: monthSchema, balance: nonNegativeSchema })),
  }),
  /** Лише мінімальні платежі. */
  baseline: z.object(payoffOutcome),
  interestSaved: amountMinorSchema.nullable(),
  monthsSaved: z.number().int().nullable(),
  /** Борги, що не отримують додаткових грошей: умови не передбачають дострокового погашення. */
  withoutExtra: z.array(z.object({ debtId: idSchema, name: z.string() })),
});
export type PayoffPlanView = z.infer<typeof payoffPlanSchema>;
