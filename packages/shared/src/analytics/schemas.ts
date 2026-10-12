import { z } from 'zod';
import { monthSchema } from '../budget/month.ts';
import { dateStringSchema } from '../incomes/schemas.ts';
import { amountMinorSchema, currencySchema } from '../money.ts';
import { idSchema } from '../schemas.ts';

const nonNegativeSchema = amountMinorSchema.nonnegative();

export const analyticsMonthQuerySchema = z.object({ month: monthSchema.optional() });

/** Довжина динаміки в місяцях. */
export const TREND_LENGTHS = [6, 12] as const;
export type TrendLength = (typeof TREND_LENGTHS)[number];

export const analyticsTrendQuerySchema = z.object({
  month: monthSchema.optional(),
  months: z.coerce
    .number()
    .refine((value): value is TrendLength => TREND_LENGTHS.includes(value as TrendLength), {
      message: 'Динаміка доступна за 6 або 12 місяців',
    })
    .default(6),
});

const categoryRowSchema = z.object({
  /** null — витрати без категорії. */
  categoryId: idSchema.nullable(),
  categoryName: z.string(),
});

export const analyticsMonthSchema = z.object({
  month: monthSchema,
  currency: currencySchema,
  /** Сьогоднішня дата в часовому поясі домогосподарства. */
  today: dateStringSchema,
  isCurrentMonth: z.boolean(),
  totalSpent: nonNegativeSchema,
  previousTotalSpent: nonNegativeSchema,
  change: amountMinorSchema,
  categories: z.array(
    categoryRowSchema.extend({
      spent: nonNegativeSchema,
      share: z.number(),
      previousSpent: nonNegativeSchema,
      change: amountMinorSchema,
    }),
  ),
  /** Перевитрати за бюджетом місяця; null, якщо бюджету немає. */
  budget: z
    .object({
      overspent: z.array(
        categoryRowSchema.extend({
          planned: nonNegativeSchema,
          spent: nonNegativeSchema,
          overBy: nonNegativeSchema,
        }),
      ),
    })
    .nullable(),
  /** Прогноз витрат до кінця місяця за поточним темпом; null для минулих місяців. */
  forecast: z
    .object({
      daysElapsed: z.number().int(),
      daysInMonth: z.number().int(),
      spent: nonNegativeSchema,
      projected: nonNegativeSchema,
      /** Сума лімітів бюджету; null, якщо бюджету немає. */
      plannedExpenseTotal: nonNegativeSchema.nullable(),
      /** Категорії з лімітом бюджету. */
      categories: z.array(
        categoryRowSchema.extend({
          planned: nonNegativeSchema,
          spent: nonNegativeSchema,
          projected: nonNegativeSchema,
          projectedOverBy: nonNegativeSchema,
        }),
      ),
    })
    .nullable(),
});
export type AnalyticsMonth = z.infer<typeof analyticsMonthSchema>;

export const analyticsTrendSchema = z.object({
  month: monthSchema,
  months: z.number().int(),
  currency: currencySchema,
  points: z.array(
    z.object({
      month: monthSchema,
      income: nonNegativeSchema,
      expenses: nonNegativeSchema,
      net: amountMinorSchema,
      savingsRate: z.number().nullable(),
      netWorth: amountMinorSchema,
      debtPayments: nonNegativeSchema,
      debtLoad: z.number().nullable(),
    }),
  ),
  /** Планове боргове навантаження обраного місяця. */
  plannedDebtLoad: z.object({
    monthlyPayments: nonNegativeSchema,
    plannedIncome: nonNegativeSchema,
    ratio: z.number().nullable(),
  }),
});
export type AnalyticsTrend = z.infer<typeof analyticsTrendSchema>;
