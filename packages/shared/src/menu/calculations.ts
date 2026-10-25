import { MoneyRangeError } from '../money.ts';
import { lineTotal } from '../shopping/calculations.ts';

export interface DishPortionLine {
  quantityMilli: number;
  /** Поточна ціна продукту за одиницю; null — ціна невідома. */
  unitPrice: number | null;
}

export interface DishPortionPrice {
  /** Сума цін рядків з відомою ціною. */
  price: number;
  /** false — у складі є продукт без ціни, тож ціна порції неповна. */
  isPriceComplete: boolean;
  unpricedCount: number;
}

/**
 * Ціна однієї порції за поточними цінами продуктів. Кожен рядок округлюється до копійки
 * окремо (як у списках покупок), тож ціна порції дорівнює сумі показаних цін рядків.
 * Рядок без ціни дає 0 і робить ціну неповною.
 */
export function dishPortionPrice(lines: readonly DishPortionLine[]): DishPortionPrice {
  let price = 0;
  let unpricedCount = 0;
  for (const line of lines) {
    if (line.unitPrice === null) {
      unpricedCount += 1;
      continue;
    }
    price += lineTotal(line.quantityMilli, line.unitPrice);
    if (!Number.isSafeInteger(price)) throw new MoneyRangeError();
  }
  return { price, isPriceComplete: unpricedCount === 0, unpricedCount };
}
