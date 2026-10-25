import {
  DEFAULT_CURRENCY,
  dishPortionPrice,
  lineTotal,
  type DishIngredient,
  type DishSummary,
} from '@hf/shared';
import type { DishRow, IngredientWithProduct } from './dishes.repo.ts';

// Ціна страви за поточними цінами продуктів — спільна для довідника страв і календаря меню,
// щоб ціна порції рахувалася в одному місці.

export const toIngredientDto = (row: IngredientWithProduct): DishIngredient => ({
  productId: row.productId,
  name: row.name,
  unit: row.unit,
  isArchived: row.isArchived,
  quantityMilli: row.quantityMilli,
  unitPrice: row.priceMinor,
  lineTotal: row.priceMinor === null ? null : lineTotal(row.quantityMilli, row.priceMinor),
});

export function toSummary(row: DishRow, lines: readonly DishIngredient[]): DishSummary {
  const { price, isPriceComplete, unpricedCount } = dishPortionPrice(lines);
  return {
    id: row.id,
    name: row.name,
    currency: DEFAULT_CURRENCY,
    portionPrice: price,
    isPriceComplete,
    unpricedCount,
    ingredientCount: lines.length,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Зведення страв (без сортування) з цінами порцій. */
export function toSummaries(
  rows: readonly DishRow[],
  ingredients: readonly IngredientWithProduct[],
): DishSummary[] {
  const byDish = new Map<string, DishIngredient[]>();
  for (const line of ingredients) {
    const lines = byDish.get(line.dishId) ?? [];
    lines.push(toIngredientDto(line));
    byDish.set(line.dishId, lines);
  }
  return rows.map((row) => toSummary(row, byDish.get(row.id) ?? []));
}
