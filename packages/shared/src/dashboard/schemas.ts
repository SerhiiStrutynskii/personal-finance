import { z } from 'zod';
import { monthSchema } from '../budget/month.ts';
import { planStateSchema } from '../budget/schemas.ts';
import { goalSchema } from '../goals/schemas.ts';
import { dateStringSchema } from '../incomes/schemas.ts';
import { amountMinorSchema, currencySchema } from '../money.ts';
import { accountTypeSchema, idSchema, transactionTypeSchema } from '../schemas.ts';

const nonNegativeSchema = amountMinorSchema.nonnegative();

export const attentionKindSchema = z.enum([
  'debt_overdue',
  'income_overdue',
  'budget_over',
  'goal_overdue',
  'debt_due_soon',
  'goal_behind',
]);

export const dashboardSchema = z.object({
  month: monthSchema,
  /** Сьогоднішня дата в часовому поясі домогосподарства. */
  today: dateStringSchema,
  currency: currencySchema,
  /** Що вже зроблено — для кроків нового користувача. */
  setup: z.object({
    hasAccounts: z.boolean(),
    hasTransactions: z.boolean(),
    hasBudget: z.boolean(),
  }),
  money: z.object({
    netWorth: amountMinorSchema,
    accountsTotal: amountMinorSchema,
    debtTotal: nonNegativeSchema,
    /** Неархівні рахунки в усіх валютах. */
    accounts: z.array(
      z.object({
        id: idSchema,
        name: z.string(),
        type: accountTypeSchema,
        currency: currencySchema,
        balance: amountMinorSchema,
      }),
    ),
  }),
  monthSummary: z.object({
    income: nonNegativeSchema,
    expenses: nonNegativeSchema,
    net: amountMinorSchema,
    /** Сума лімітів бюджету; null, якщо бюджету на місяць немає. */
    plannedExpenseTotal: nonNegativeSchema.nullable(),
    /** Прогноз витрат на кінець місяця за поточним темпом. */
    projected: nonNegativeSchema,
    daysElapsed: z.number().int(),
    daysInMonth: z.number().int(),
  }),
  /** План місяця: очікувані прибутки проти суми лімітів бюджету. */
  plan: z.object({
    plannedIncome: nonNegativeSchema,
    /** Сума лімітів; null, якщо бюджету на місяць немає. */
    plannedExpenses: nonNegativeSchema.nullable(),
    /** Прибутки мінус витрати; null без бюджету. */
    balance: amountMinorSchema.nullable(),
    state: planStateSchema.nullable(),
  }),
  /** Обов'язкові платежі по активних боргах за місяць. */
  debtPayments: z.object({
    required: nonNegativeSchema,
    paid: nonNegativeSchema,
    remaining: nonNegativeSchema,
  }),
  attention: z.array(
    z.object({
      kind: attentionKindSchema,
      id: idSchema.nullable(),
      name: z.string(),
      amount: nonNegativeSchema.nullable(),
      date: dateStringSchema.nullable(),
    }),
  ),
  upcoming: z.array(
    z.object({
      kind: z.enum(['debt_payment', 'income']),
      id: idSchema,
      name: z.string(),
      amount: nonNegativeSchema,
      date: dateStringSchema,
    }),
  ),
  /** Не більше трьох активних цілей. */
  goals: z.array(goalSchema),
  /** Останні витрати, прибутки й платежі по боргах. */
  recent: z.array(
    z.object({
      id: idSchema,
      type: transactionTypeSchema,
      description: z.string(),
      categoryName: z.string().nullable(),
      accountName: z.string(),
      amountMinor: amountMinorSchema,
      currency: currencySchema,
      occurredAt: z.iso.datetime({ offset: true }),
    }),
  ),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
