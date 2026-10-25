import { z } from 'zod';
import { currencySchema } from '../money.ts';
import { dateStringSchema } from '../incomes/schemas.ts';
import { addDays, isValidDateString } from '../incomes/recurrence.ts';
import { idSchema } from '../schemas.ts';
import { productUnitSchema, quantityMilliSchema } from '../shopping/schemas.ts';

export const mealTypeNameSchema = z.string().trim().min(1).max(100);
export const dishNameSchema = z.string().trim().min(1).max(100);

// --- Прийоми їжі ---

export const createMealTypeSchema = z.object({ name: mealTypeNameSchema });
export type CreateMealTypeInput = z.infer<typeof createMealTypeSchema>;

export const updateMealTypeSchema = z.object({ name: mealTypeNameSchema });
export type UpdateMealTypeInput = z.infer<typeof updateMealTypeSchema>;

/** Новий порядок: усі прийоми їжі домогосподарства, кожен один раз. */
export const reorderMealTypesSchema = z.object({
  ids: z
    .array(idSchema)
    .min(1)
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'Id не мають повторюватися'),
});
export type ReorderMealTypesInput = z.infer<typeof reorderMealTypesSchema>;

export const mealTypeSchema = z.object({
  id: idSchema,
  name: z.string(),
  position: z.number().int(),
});
export type MealType = z.infer<typeof mealTypeSchema>;

// --- Страви ---

/** Найбільше рядків у складі однієї страви. */
export const MAX_DISH_INGREDIENTS = 50;

export const dishIngredientInputSchema = z.object({
  productId: idSchema,
  /** Кількість на одну порцію в тисячних одиниці продукту: 0,15 кг = 150. */
  quantityMilli: quantityMilliSchema,
});
export type DishIngredientInput = z.infer<typeof dishIngredientInputSchema>;

const dishIngredientsSchema = z
  .array(dishIngredientInputSchema)
  .max(MAX_DISH_INGREDIENTS)
  .refine(
    (lines) => new Set(lines.map((line) => line.productId)).size === lines.length,
    'Продукт не може повторюватися в складі',
  );

export const createDishSchema = z.object({
  name: dishNameSchema,
  ingredients: dishIngredientsSchema.default([]),
});
export type CreateDishInput = z.infer<typeof createDishSchema>;

/** ingredients замінює склад страви цілком. */
export const updateDishSchema = z
  .object({ name: dishNameSchema, ingredients: dishIngredientsSchema })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Потрібне хоча б одне поле');
export type UpdateDishInput = z.infer<typeof updateDishSchema>;

const amountSchema = z.number().int();

export const dishSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  currency: currencySchema,
  /** Ціна порції за поточними цінами продуктів; продукти без ціни дають 0. */
  portionPrice: amountSchema,
  isPriceComplete: z.boolean(),
  unpricedCount: amountSchema,
  ingredientCount: amountSchema,
  createdAt: z.iso.datetime({ offset: true }),
});
export type DishSummary = z.infer<typeof dishSummarySchema>;

export const dishIngredientSchema = z.object({
  productId: idSchema,
  name: z.string(),
  unit: productUnitSchema,
  isArchived: z.boolean(),
  quantityMilli: amountSchema,
  /** Поточна ціна продукту за одиницю; null — невідома. */
  unitPrice: amountSchema.nullable(),
  /** Кількість × ціна, округлена до копійки; null — ціни немає. */
  lineTotal: amountSchema.nullable(),
});
export type DishIngredient = z.infer<typeof dishIngredientSchema>;

export const dishSchema = dishSummarySchema.extend({
  /** У тому порядку, у якому склад передано. */
  ingredients: z.array(dishIngredientSchema),
});
export type Dish = z.infer<typeof dishSchema>;

// --- Календар меню ---

/** Найбільше порцій однієї страви в одному прийомі їжі дня. */
export const MAX_SERVINGS = 99;
/** Найдовший період одного запиту календаря, у днях. */
export const MAX_MENU_PERIOD_DAYS = 62;

/** Кількість порцій — ціле число 1–99; дробових порцій немає. */
export const servingsSchema = z.number().int().min(1).max(MAX_SERVINGS);

// zod 4 запускає refine об'єкта й після помилок полів, тож межі перевіряються лише для валідних дат.
const validDates = ({ from, to }: { from: string; to: string }) =>
  isValidDateString(from) && isValidDateString(to);

/** Період [from, to): from включно, to виключно, не довше 62 днів. */
export const menuPeriodQuerySchema = z
  .object({ from: dateStringSchema, to: dateStringSchema })
  .refine((period) => !validDates(period) || period.to > period.from, {
    message: 'Кінець періоду має бути пізніше за початок',
    path: ['to'],
  })
  .refine(
    (period) => !validDates(period) || period.to <= addDays(period.from, MAX_MENU_PERIOD_DAYS),
    {
      message: `Період не може бути довшим за ${MAX_MENU_PERIOD_DAYS} дні`,
      path: ['to'],
    },
  );
export type MenuPeriodQuery = z.infer<typeof menuPeriodQuerySchema>;

export const createMenuEntrySchema = z.object({
  date: dateStringSchema,
  mealTypeId: idSchema,
  dishId: idSchema,
  servings: servingsSchema.default(1),
});
export type CreateMenuEntryInput = z.infer<typeof createMenuEntrySchema>;

export const updateMenuEntrySchema = z.object({ servings: servingsSchema });
export type UpdateMenuEntryInput = z.infer<typeof updateMenuEntrySchema>;

export const menuEntrySchema = z.object({
  id: idSchema,
  date: dateStringSchema,
  mealTypeId: idSchema,
  dishId: idSchema,
  dishName: z.string(),
  servings: servingsSchema,
  /** Поточна ціна порції страви; продукти без ціни дають 0. */
  portionPrice: amountSchema,
  /** portionPrice × servings. */
  cost: amountSchema,
  isPriceComplete: z.boolean(),
  unpricedCount: amountSchema,
});
export type MenuEntry = z.infer<typeof menuEntrySchema>;

export const menuDaySchema = z.object({
  date: dateStringSchema,
  cost: amountSchema,
  isPriceComplete: z.boolean(),
  entryCount: amountSchema,
});
export type MenuDay = z.infer<typeof menuDaySchema>;

export const menuPeriodSchema = z.object({
  from: dateStringSchema,
  to: dateStringSchema,
  currency: currencySchema,
  /** За датою, position прийому їжі й назвою страви. */
  entries: z.array(menuEntrySchema),
  /** Лише дні з записами, за датою. */
  days: z.array(menuDaySchema),
  total: z.object({
    cost: amountSchema,
    isPriceComplete: z.boolean(),
    incompleteEntryCount: amountSchema,
  }),
});
export type MenuPeriod = z.infer<typeof menuPeriodSchema>;
