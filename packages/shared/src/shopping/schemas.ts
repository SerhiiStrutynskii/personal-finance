import { z } from 'zod';
import { currencySchema, positiveAmountMinorSchema } from '../money.ts';
import { idSchema } from '../schemas.ts';

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
  .object({ name: productNameSchema, unit: productUnitSchema, price: unitPriceSchema })
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
  createdAt: z.iso.datetime({ offset: true }),
});
export type Product = z.infer<typeof productSchema>;
