import { MoneyRangeError } from '../money.ts';
import { addDays } from '../incomes/recurrence.ts';
import { lineTotal } from '../shopping/calculations.ts';
import { compareProductNames } from '../shopping/names.ts';
import type { ProductUnit } from '../shopping/schemas.ts';
import type { MenuShoppingItem, MenuShoppingTotal } from './schemas.ts';

// Покупки за меню: які продукти й скільки потрібно для страв і продуктів періоду та орієнтовний бюджет на них.
// Рахується щоразу з поточного меню, складу страв і цін продуктів; ніде не зберігається.

export interface MenuShoppingEntryInput {
  dishId: string;
  servings: number;
}

export interface MenuShoppingIngredientInput {
  dishId: string;
  productId: string;
  name: string;
  unit: ProductUnit;
  isArchived: boolean;
  /** Кількість на одну порцію в тисячних одиниці. */
  quantityMilli: number;
  /** Поточна ціна продукту за одиницю; null — невідома. */
  priceMinor: number | null;
}

/** Продукт, доданий у запис меню напряму, з кількістю в тисячних одиниці. */
export interface MenuShoppingProductEntryInput {
  productId: string;
  name: string;
  unit: ProductUnit;
  isArchived: boolean;
  quantityMilli: number;
  /** Поточна ціна продукту за одиницю; null — невідома. */
  priceMinor: number | null;
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function toSafeNumber(value: bigint): number {
  if (value > MAX_SAFE) throw new MoneyRangeError();
  return Number(value);
}

/**
 * Перелік продуктів для записів меню: кількість продукту — сума «кількість на порцію × порції»
 * по всіх записах зі стравою (страва в кількох записах рахується кожного разу) плюс кількість
 * продукту, доданого напряму. Продукт і зі страви, і напряму — один рядок. Сума рядка рахується від
 * сумарної кількості з округленням «половина — вгору», як у списку покупок. Продукти, яких немає
 * в жодному записі, не потрапляють; порядок — за назвою продукту, далі за id.
 */
export function menuShoppingItems(
  entries: readonly MenuShoppingEntryInput[],
  ingredients: readonly MenuShoppingIngredientInput[],
  productEntries: readonly MenuShoppingProductEntryInput[] = [],
): MenuShoppingItem[] {
  const servingsByDish = new Map<string, bigint>();
  for (const entry of entries) {
    servingsByDish.set(
      entry.dishId,
      (servingsByDish.get(entry.dishId) ?? 0n) + BigInt(entry.servings),
    );
  }

  const byProduct = new Map<string, { line: MenuShoppingProductEntryInput; quantity: bigint }>();
  const add = (line: MenuShoppingProductEntryInput, quantity: bigint) => {
    const current = byProduct.get(line.productId);
    byProduct.set(line.productId, {
      line: current?.line ?? line,
      quantity: (current?.quantity ?? 0n) + quantity,
    });
  };
  for (const line of ingredients) {
    const servings = servingsByDish.get(line.dishId);
    if (servings === undefined) continue;
    add(line, BigInt(line.quantityMilli) * servings);
  }
  for (const entry of productEntries) add(entry, BigInt(entry.quantityMilli));

  return [...byProduct.values()]
    .map(({ line, quantity }): MenuShoppingItem => {
      const quantityMilli = toSafeNumber(quantity);
      return {
        productId: line.productId,
        name: line.name,
        unit: line.unit,
        isArchived: line.isArchived,
        quantityMilli,
        unitPrice: line.priceMinor,
        lineTotal: line.priceMinor === null ? null : lineTotal(quantityMilli, line.priceMinor),
      };
    })
    .sort(
      (a, b) =>
        compareProductNames(a.name, b.name) ||
        (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0),
    );
}

/**
 * Бюджет на продукти: сума рядків з ціною; продукти без ціни дають 0 і рахуються в unpricedCount
 * (кількість рядків переліку, тобто різних продуктів). Порожній перелік — нуль і повна ціна.
 */
export function menuShoppingTotal(
  items: readonly Pick<MenuShoppingItem, 'lineTotal'>[],
): MenuShoppingTotal {
  let cost = 0;
  let unpricedCount = 0;
  for (const item of items) {
    if (item.lineTotal === null) {
      unpricedCount += 1;
      continue;
    }
    cost += item.lineTotal;
    if (!Number.isSafeInteger(cost)) throw new MoneyRangeError();
  }
  return { cost, isPriceComplete: unpricedCount === 0, unpricedCount };
}

/** «2026-10-26» → «26.10.2026». */
const dottedDate = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;

/**
 * Назва списку покупок за замовчуванням для періоду [from, to): «Меню на 26.10.2026» для одного
 * дня, інакше «Меню 26.10.2026–01.11.2026» (останній день — to − 1).
 */
export function menuShoppingListName(from: string, to: string): string {
  const last = addDays(to, -1);
  return last === from
    ? `Меню на ${dottedDate(from)}`
    : `Меню ${dottedDate(from)}–${dottedDate(last)}`;
}
