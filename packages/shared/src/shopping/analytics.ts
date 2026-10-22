import { MoneyRangeError } from '../money.ts';
import { QUANTITY_SCALE, lineTotal } from './calculations.ts';
import type { ProductUnit } from './schemas.ts';

/** Куплений рядок списку — одна покупка продукту. */
export interface Purchase {
  productId: string;
  name: string;
  unit: ProductUnit;
  quantityMilli: number;
  expectedUnitPrice: number | null;
  actualUnitPrice: number | null;
  /** ISO-момент покупки; за ним покупка належить місяцю. */
  boughtAt: string;
}

export interface ProductPurchases {
  productId: string;
  name: string;
  unit: ProductUnit;
  /** Куплена кількість у тисячних одиниці, лише покупки з фактичною ціною. */
  quantityMilli: number;
  spent: number;
  /** Середня ціна за одиницю: витрачено / кількість, округлено до копійки. */
  averageUnitPrice: number;
  /** Ціна останньої покупки місяця. */
  lastUnitPrice: number;
  /** Ціна попередньої покупки (у цьому місяці чи раніше); null — це перша покупка. */
  previousUnitPrice: number | null;
  purchaseCount: number;
}

export interface PurchasesSummary {
  /** Фактична сума покупок місяця. */
  spent: number;
  previousSpent: number;
  change: number;
  /** Очікувана сума покупок з обома цінами і відхилення від неї (додатне — переплата). */
  expectedOfPriced: number;
  deviation: number;
  purchaseCount: number;
  /** Покупки без фактичної ціни: у суми не входять. */
  unpricedCount: number;
  /** Продукти за спаданням витраченого. */
  products: ProductPurchases[];
}

function safeAdd(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new MoneyRangeError();
  return sum;
}

/** Ціна за одиницю із суми й кількості, «половина — вгору». */
export function averageUnitPrice(spent: number, quantityMilli: number): number {
  const scale = BigInt(QUANTITY_SCALE);
  const quantity = BigInt(quantityMilli);
  return Number((BigInt(spent) * scale * 2n + quantity) / (quantity * 2n));
}

const spentOf = (purchases: readonly Purchase[]) =>
  purchases.reduce(
    (sum, p) =>
      p.actualUnitPrice === null
        ? sum
        : safeAdd(sum, lineTotal(p.quantityMilli, p.actualUnitPrice)),
    0,
  );

/**
 * Підсумок покупок місяця за списками.
 * `lastPriceBefore` — ціна останньої покупки продукту до початку місяця, для зміни ціни.
 */
export function summarizePurchases(
  current: readonly Purchase[],
  previous: readonly Purchase[],
  lastPriceBefore: ReadonlyMap<string, number>,
): PurchasesSummary {
  const priced = current
    .filter((p): p is Purchase & { actualUnitPrice: number } => p.actualUnitPrice !== null)
    .sort((a, b) => a.boughtAt.localeCompare(b.boughtAt));

  let expectedOfPriced = 0;
  let deviation = 0;
  const byProduct = new Map<string, (Purchase & { actualUnitPrice: number })[]>();
  for (const purchase of priced) {
    if (purchase.expectedUnitPrice !== null) {
      const expected = lineTotal(purchase.quantityMilli, purchase.expectedUnitPrice);
      const actual = lineTotal(purchase.quantityMilli, purchase.actualUnitPrice);
      expectedOfPriced = safeAdd(expectedOfPriced, expected);
      deviation = safeAdd(deviation, actual - expected);
    }
    byProduct.set(purchase.productId, [...(byProduct.get(purchase.productId) ?? []), purchase]);
  }

  const products = [...byProduct.values()].map((rows): ProductPurchases => {
    const last = rows.at(-1)!;
    const quantityMilli = rows.reduce((sum, p) => safeAdd(sum, p.quantityMilli), 0);
    const spent = spentOf(rows);
    return {
      productId: last.productId,
      name: last.name,
      unit: last.unit,
      quantityMilli,
      spent,
      averageUnitPrice: averageUnitPrice(spent, quantityMilli),
      lastUnitPrice: last.actualUnitPrice,
      previousUnitPrice:
        rows.length > 1
          ? rows.at(-2)!.actualUnitPrice
          : (lastPriceBefore.get(last.productId) ?? null),
      purchaseCount: rows.length,
    };
  });
  products.sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name, 'uk'));

  const spent = spentOf(current);
  const previousSpent = spentOf(previous);
  return {
    spent,
    previousSpent,
    change: spent - previousSpent,
    expectedOfPriced,
    deviation,
    purchaseCount: current.length,
    unpricedCount: current.length - priced.length,
    products,
  };
}
