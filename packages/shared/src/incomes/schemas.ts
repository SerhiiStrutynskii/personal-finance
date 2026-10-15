import { z } from 'zod';
import { monthSchema } from '../budget/month.ts';
import { currencySchema, positiveAmountMinorSchema } from '../money.ts';
import { idSchema } from '../schemas.ts';
import { isValidDateString } from './recurrence.ts';

/** Календарна дата YYYY-MM-DD у часовому поясі домогосподарства. */
export const dateStringSchema = z.string().refine(isValidDateString, 'Очікується дата YYYY-MM-DD');

export const incomeFrequencySchema = z.enum(['monthly', 'weekly', 'biweekly', 'every_n_months']);

const sourceFields = {
  name: z.string().trim().min(1).max(100),
  /** Рахунок, на який зазвичай надходить прибуток; від нього береться валюта джерела. */
  accountId: idSchema,
  /** Типова сума одного надходження. */
  plannedAmount: positiveAmountMinorSchema,
  frequency: incomeFrequencySchema,
  dayOfMonth: z.number().int().min(1).max(31).nullish(),
  dayOfWeek: z.number().int().min(1).max(7).nullish(),
  intervalMonths: z.number().int().min(1).max(120).nullish(),
  startDate: dateStringSchema,
  endDate: dateStringSchema.nullish(),
};

/**
 * Джерело періодичного прибутку. Кожна частота вимагає свої поля правила;
 * поля, що до неї не стосуються, відкидаються.
 */
export const incomeSourceInputSchema = z
  .object(sourceFields)
  .superRefine((value, ctx) => {
    const require = (field: 'dayOfMonth' | 'dayOfWeek' | 'intervalMonths', message: string) => {
      if (value[field] == null) ctx.addIssue({ code: 'custom', path: [field], message });
    };
    if (value.frequency === 'monthly' || value.frequency === 'every_n_months') {
      require('dayOfMonth', 'Вкажіть день місяця');
    } else {
      require('dayOfWeek', 'Вкажіть день тижня');
    }
    if (value.frequency === 'every_n_months')
      require('intervalMonths', 'Вкажіть інтервал у місяцях');
    if (value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'Дата завершення не може бути раніше за дату початку',
      });
    }
  })
  .transform((value) => {
    const byMonth = value.frequency === 'monthly' || value.frequency === 'every_n_months';
    return {
      ...value,
      dayOfMonth: byMonth ? (value.dayOfMonth ?? null) : null,
      dayOfWeek: byMonth ? null : (value.dayOfWeek ?? null),
      intervalMonths: value.frequency === 'every_n_months' ? (value.intervalMonths ?? null) : null,
      endDate: value.endDate ?? null,
    };
  });
export type IncomeSourceInput = z.infer<typeof incomeSourceInputSchema>;

/** Часткова зміна джерела; узгодженість правила перевіряється після злиття з наявними полями. */
export const updateIncomeSourceSchema = z
  .object(sourceFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Потрібне хоча б одне поле');
export type UpdateIncomeSourceInput = z.infer<typeof updateIncomeSourceSchema>;

export const incomeSourceSchema = z.object({
  id: idSchema,
  name: z.string(),
  accountId: idSchema.nullable(),
  currency: currencySchema,
  plannedAmount: positiveAmountMinorSchema,
  frequency: incomeFrequencySchema,
  dayOfMonth: z.number().int().nullable(),
  dayOfWeek: z.number().int().nullable(),
  intervalMonths: z.number().int().nullable(),
  startDate: dateStringSchema,
  endDate: dateStringSchema.nullable(),
  isActive: z.boolean(),
});
export type IncomeSource = z.infer<typeof incomeSourceSchema>;

// --- Надходження ---

export const occurrenceStatusSchema = z.enum([
  'received',
  'partial',
  'pending',
  'overdue',
  'skipped',
]);

export const updateOccurrenceSchema = z
  .object({
    plannedDate: dateStringSchema,
    plannedAmount: positiveAmountMinorSchema,
    status: z.enum(['expected', 'skipped']),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Потрібне хоча б одне поле');
export type UpdateOccurrenceInput = z.infer<typeof updateOccurrenceSchema>;

/** Позначає надходження отриманим; без полів — запланована сума, сьогодні, рахунок джерела. */
export const receiveOccurrenceSchema = z.object({
  amount: positiveAmountMinorSchema.optional(),
  date: dateStringSchema.optional(),
  accountId: idSchema.optional(),
});
export type ReceiveOccurrenceInput = z.infer<typeof receiveOccurrenceSchema>;

export const oneTimeIncomeSchema = z.object({
  amount: positiveAmountMinorSchema,
  date: dateStringSchema,
  accountId: idSchema,
  name: z.string().trim().min(1).max(100),
  categoryId: idSchema.nullish(),
});
export type OneTimeIncomeInput = z.infer<typeof oneTimeIncomeSchema>;

export const incomesQuerySchema = z.object({ month: monthSchema });

/** Прибутки місяця: підсумок, регулярні надходження й разові прибутки. Статуси рахує бекенд. */
export const incomesViewSchema = z.object({
  month: monthSchema,
  currency: currencySchema,
  /** Поточна дата в часовому поясі домогосподарства, за якою пораховано статуси. */
  today: dateStringSchema,
  summary: z.object({
    plannedTotal: z.number().int(),
    receivedTotal: z.number().int(),
    receivedRecurring: z.number().int(),
    oneTimeTotal: z.number().int(),
    expectedRemaining: z.number().int(),
    counts: z.object({
      received: z.number().int(),
      partial: z.number().int(),
      pending: z.number().int(),
      overdue: z.number().int(),
      skipped: z.number().int(),
    }),
  }),
  occurrences: z.array(
    z.object({
      id: idSchema,
      sourceId: idSchema,
      name: z.string(),
      accountId: idSchema.nullable(),
      plannedDate: dateStringSchema,
      plannedAmount: z.number().int(),
      actualDate: dateStringSchema.nullable(),
      actualAmount: z.number().int(),
      status: occurrenceStatusSchema,
      /** Отримано мінус заплановано; лише для отриманих надходжень. */
      diff: z.number().int().optional(),
    }),
  ),
  oneTime: z.array(
    z.object({
      transactionId: idSchema,
      name: z.string(),
      date: dateStringSchema,
      amount: z.number().int(),
      status: z.literal('received'),
    }),
  ),
});
export type IncomesView = z.infer<typeof incomesViewSchema>;
