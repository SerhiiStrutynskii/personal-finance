import { z } from 'zod';
import { currencySchema } from '../money.ts';
import { dateStringSchema, occurrenceStatusSchema } from '../incomes/schemas.ts';
import { idSchema } from '../schemas.ts';
import { monthSchema } from './month.ts';

export const categoryStatusSchema = z.enum(['over', 'surplus', 'neutral']);

/** Запланована сума в мінімальних одиницях валюти; нуль дозволено. */
export const plannedAmountSchema = z
  .number()
  .int()
  .nonnegative()
  .refine(Number.isSafeInteger, 'Сума завелика');

export const budgetQuerySchema = z.object({ month: monthSchema });

export const createBudgetSchema = z.object({
  month: monthSchema,
  /** Місяць, з якого скопіювати ліміти витрат (без транзакцій). */
  copyFrom: monthSchema.optional(),
});
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

export const budgetLineParamsSchema = z.object({ id: idSchema, lineId: idSchema });

export const createExpenseLineSchema = z.object({
  categoryId: idSchema,
  plannedAmount: plannedAmountSchema,
});
export type CreateExpenseLineInput = z.infer<typeof createExpenseLineSchema>;

export const updateExpenseLineSchema = z
  .object({
    plannedAmount: plannedAmountSchema,
    /** Позиція рядка в списку лімітів. */
    sortOrder: z.number().int().min(0).max(10_000),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Потрібне хоча б одне поле');
export type UpdateExpenseLineInput = z.infer<typeof updateExpenseLineSchema>;

/** Бюджет місяця разом із розрахунками. Статуси рахує бекенд; фронтенд лише показує їх. */
export const budgetViewSchema = z.object({
  id: idSchema,
  month: monthSchema,
  currency: currencySchema,
  /** Стан періоду відносно поточного моменту: минулий, поточний чи майбутній місяць. */
  periodState: z.enum(['past', 'current', 'future']),
  /** Видатки додаються лише в поточному періоді. Підказка для інтерфейсу; перевіряє API. */
  canAddExpense: z.boolean(),
  /** Ліміти змінюються в поточному й майбутніх періодах. */
  canEditLimits: z.boolean(),
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  summary: z.object({
    plannedIncomeTotal: z.number().int(),
    receivedIncomeTotal: z.number().int(),
    plannedExpenseTotal: z.number().int(),
    spentTotal: z.number().int(),
    plannedBalance: z.number().int(),
    actualBalance: z.number().int(),
  }),
  /** Доходи місяця з фічі доходів — лише для перегляду. */
  incomes: z.object({
    occurrences: z.array(
      z.object({
        name: z.string(),
        plannedDate: dateStringSchema,
        plannedAmount: z.number().int(),
        actualAmount: z.number().int(),
        status: occurrenceStatusSchema,
      }),
    ),
    oneTimeTotal: z.number().int(),
  }),
  expenseLines: z.array(
    z.object({
      id: idSchema,
      categoryId: idSchema,
      categoryName: z.string(),
      planned: z.number().int(),
      spent: z.number().int(),
      remaining: z.number().int(),
      /** Частка використаного ліміту; null, коли ліміт 0, а витрати є. */
      usage: z.number().nullable(),
      status: categoryStatusSchema,
    }),
  ),
  unplannedExpenses: z.array(
    z.object({
      /** null — витрати без категорії. */
      categoryId: idSchema.nullable(),
      categoryName: z.string(),
      spent: z.number().int(),
      status: categoryStatusSchema,
    }),
  ),
});
export type BudgetView = z.infer<typeof budgetViewSchema>;
