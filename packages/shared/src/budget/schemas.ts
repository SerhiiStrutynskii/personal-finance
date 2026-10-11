import { z } from 'zod';
import { currencySchema } from '../money.ts';
import { idSchema } from '../schemas.ts';
import { monthSchema } from './month.ts';

export const budgetStatusSchema = z.enum(['draft', 'active', 'closed']);
export type BudgetStatus = z.infer<typeof budgetStatusSchema>;

export const categoryStatusSchema = z.enum(['over', 'surplus', 'neutral']);

/** Запланована сума в мінімальних одиницях валюти; нуль дозволено. */
export const plannedAmountSchema = z
  .number()
  .int()
  .nonnegative()
  .refine(Number.isSafeInteger, 'Сума завелика');

const lineNameSchema = z.string().trim().min(1).max(100);

export const budgetQuerySchema = z.object({ month: monthSchema });

export const createBudgetSchema = z.object({
  month: monthSchema,
  /** Місяць, з якого скопіювати статті доходів і витрат (без транзакцій). */
  copyFrom: monthSchema.optional(),
});
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

export const updateBudgetSchema = z.object({ status: budgetStatusSchema });
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

export const budgetLineParamsSchema = z.object({ id: idSchema, lineId: idSchema });

export const createIncomeLineSchema = z.object({
  name: lineNameSchema,
  plannedAmount: plannedAmountSchema,
});
export type CreateIncomeLineInput = z.infer<typeof createIncomeLineSchema>;

export const updateIncomeLineSchema = createIncomeLineSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Потрібне хоча б одне поле');
export type UpdateIncomeLineInput = z.infer<typeof updateIncomeLineSchema>;

export const createExpenseLineSchema = z.object({
  categoryId: idSchema,
  plannedAmount: plannedAmountSchema,
});
export type CreateExpenseLineInput = z.infer<typeof createExpenseLineSchema>;

export const updateExpenseLineSchema = z.object({ plannedAmount: plannedAmountSchema });
export type UpdateExpenseLineInput = z.infer<typeof updateExpenseLineSchema>;

/** Бюджет місяця разом із розрахунками. Статуси рахує бекенд; фронтенд лише показує їх. */
export const budgetViewSchema = z.object({
  id: idSchema,
  month: monthSchema,
  status: budgetStatusSchema,
  currency: currencySchema,
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
  incomeLines: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      planned: z.number().int(),
      received: z.number().int(),
      diff: z.number().int(),
    }),
  ),
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
  otherIncome: z.number().int(),
});
export type BudgetView = z.infer<typeof budgetViewSchema>;
