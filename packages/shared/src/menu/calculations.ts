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

/** Вартість запису меню: ціна порції × порції. Множення без втрати точності через BigInt. */
export function menuEntryCost(portionPrice: number, servings: number): number {
  const cost = BigInt(portionPrice) * BigInt(servings);
  if (cost > BigInt(Number.MAX_SAFE_INTEGER) || cost < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new MoneyRangeError();
  }
  return Number(cost);
}

export interface MenuProductEntryCost {
  /** Кількість × ціна, округлена до копійки «половина — вгору»; без ціни — 0. */
  cost: number;
  /** false — ціна продукту невідома. */
  isPriceComplete: boolean;
  unpricedCount: number;
}

/**
 * Вартість продукту, доданого в меню напряму: кількість (тисячні одиниці) × поточна ціна за
 * одиницю з округленням до копійки, як рядок списку покупок. Без ціни — 0 і неповна ціна.
 */
export function menuProductEntryCost(
  quantityMilli: number,
  unitPrice: number | null,
): MenuProductEntryCost {
  if (unitPrice === null) return { cost: 0, isPriceComplete: false, unpricedCount: 1 };
  return { cost: lineTotal(quantityMilli, unitPrice), isPriceComplete: true, unpricedCount: 0 };
}

export interface MenuCostTotal {
  cost: number;
  /** false — хоча б в одному записі ціна страви неповна. */
  isPriceComplete: boolean;
  incompleteEntryCount: number;
}

/** Підсумок вартості записів (дня чи періоду). Порожній список — нуль і повна ціна. */
export function menuCostTotal(
  entries: readonly { cost: number; isPriceComplete: boolean }[],
): MenuCostTotal {
  let cost = 0;
  let incompleteEntryCount = 0;
  for (const entry of entries) {
    cost += entry.cost;
    if (!Number.isSafeInteger(cost)) throw new MoneyRangeError();
    if (!entry.isPriceComplete) incompleteEntryCount += 1;
  }
  return { cost, isPriceComplete: incompleteEntryCount === 0, incompleteEntryCount };
}
