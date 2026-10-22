import { z } from 'zod';
import { currencySchema, positiveAmountMinorSchema } from '../money.ts';
import { idSchema } from '../schemas.ts';
import { MAX_QUANTITY_MILLI } from './calculations.ts';

/**
 * Одиниці, у яких рахується кількість продукту. Грамів і мілілітрів немає: ціна за грам
 * у копійках здебільшого не ціла, тож 300 г — це 0,3 кг.
 */
export const PRODUCT_UNITS = ['pcs', 'kg', 'l', 'pack'] as const;
export const productUnitSchema = z.enum(PRODUCT_UNITS);
export type ProductUnit = z.infer<typeof productUnitSchema>;

const productNameSchema = z.string().trim().min(1).max(100);
/** Ціна за одиницю в мінімальних одиницях; null — ціна ще невідома. */
const unitPriceSchema = positiveAmountMinorSchema.nullable();

export const createProductSchema = z.object({
  name: productNameSchema,
  unit: productUnitSchema.default('pcs'),
  price: unitPriceSchema.default(null),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: productNameSchema,
    unit: productUnitSchema,
    price: unitPriceSchema,
    /** Архівний продукт зникає з довідника й підказок, але лишається в історії покупок. */
    isArchived: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Потрібне хоча б одне поле');
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productSchema = z.object({
  id: idSchema,
  name: z.string(),
  unit: productUnitSchema,
  /** Остання відома ціна за одиницю; з неї береться очікувана ціна в списку покупок. */
  price: unitPriceSchema,
  currency: currencySchema,
  isArchived: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Product = z.infer<typeof productSchema>;

export const productsQuerySchema = z.object({
  /** true — разом з архівними продуктами. */
  archived: z.stringbool().default(false),
});

// --- Списки покупок ---

/** Кількість у тисячних одиниці: 1,5 кг = 1500. */
export const quantityMilliSchema = z.number().int().positive().max(MAX_QUANTITY_MILLI);

const listNameSchema = z.string().trim().min(1).max(100);

export const createShoppingListSchema = z.object({ name: listNameSchema });
export type CreateShoppingListInput = z.infer<typeof createShoppingListSchema>;

export const updateShoppingListSchema = z.object({ name: listNameSchema });
export type UpdateShoppingListInput = z.infer<typeof updateShoppingListSchema>;

/**
 * Рядок додається з наявного продукту (productId) або за назвою: продукт із такою назвою
 * береться з довідника, а якщо його немає — створюється з одиницею й ціною.
 */
export const addShoppingListItemSchema = z.union([
  z.strictObject({
    productId: idSchema,
    quantityMilli: quantityMilliSchema.default(1000),
  }),
  z.strictObject({
    name: productNameSchema,
    unit: productUnitSchema.default('pcs'),
    price: unitPriceSchema.default(null),
    quantityMilli: quantityMilliSchema.default(1000),
  }),
]);
export type AddShoppingListItemInput = z.infer<typeof addShoppingListItemSchema>;

export const updateShoppingListItemSchema = z
  .object({
    quantityMilli: quantityMilliSchema,
    expectedUnitPrice: unitPriceSchema,
    actualUnitPrice: unitPriceSchema,
    isBought: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Потрібне хоча б одне поле');
export type UpdateShoppingListItemInput = z.infer<typeof updateShoppingListItemSchema>;

export const shoppingListItemParamsSchema = z.object({ id: idSchema, itemId: idSchema });

export const shoppingTotalsSchema = z.object({
  itemCount: z.number().int(),
  boughtCount: z.number().int(),
  expected: z.number().int(),
  actual: z.number().int(),
  remaining: z.number().int(),
  deviation: z.number().int(),
  unpricedCount: z.number().int(),
});

export const shoppingListItemSchema = z.object({
  id: idSchema,
  productId: idSchema,
  name: z.string(),
  unit: productUnitSchema,
  quantityMilli: z.number().int(),
  /** Знімок ціни з довідника в момент додавання; правка довідника його не змінює. */
  expectedUnitPrice: unitPriceSchema,
  actualUnitPrice: unitPriceSchema,
  /** Суми рядка: кількість × ціна, округлені до копійки; null — ціни немає. */
  expectedTotal: z.number().int().nullable(),
  actualTotal: z.number().int().nullable(),
  isBought: z.boolean(),
  boughtAt: z.iso.datetime({ offset: true }).nullable(),
});
export type ShoppingListItem = z.infer<typeof shoppingListItemSchema>;

export const shoppingListSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  currency: currencySchema,
  totals: shoppingTotalsSchema,
  createdAt: z.iso.datetime({ offset: true }),
});
export type ShoppingListSummary = z.infer<typeof shoppingListSummarySchema>;

export const shoppingListSchema = shoppingListSummarySchema.extend({
  /** Спершу некуплені, потім куплені; всередині — в порядку додавання. */
  items: z.array(shoppingListItemSchema),
});
export type ShoppingList = z.infer<typeof shoppingListSchema>;
