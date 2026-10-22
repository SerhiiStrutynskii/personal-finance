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

/** Покупка з місяцем у часовому поясі домогосподарства. */
export interface MonthlyPurchase extends Purchase {
  month: string;
}

export interface ProductPeriodRow {
  productId: string;
  name: string;
  unit: ProductUnit;
  quantityMilli: number;
  spent: number;
  /** Частка від усіх покупок періоду (0,25 = 25%). */
  share: number;
  /** Витрачено в середньому на місяць періоду, зокрема місяці без покупок. */
  averagePerMonth: number;
  averageUnitPrice: number;
  minUnitPrice: number;
  maxUnitPrice: number;
  purchaseCount: number;
  /** Помісячно для кожного місяця періоду; без покупок — нулі. */
  byMonth: { month: string; spent: number; quantityMilli: number }[];
}

export interface PurchasesPeriod {
  months: string[];
  total: number;
  averagePerMonth: number;
  purchaseCount: number;
  /** Покупки без фактичної ціни: у суми не входять. */
  unpricedCount: number;
  points: { month: string; spent: number; purchaseCount: number }[];
  /** Усі продукти періоду за спаданням витраченого. */
  products: ProductPeriodRow[];
}

/** Ціле ділення з округленням «половина — вгору» для невід'ємних сум. */
const divideRounded = (amount: number, by: number) =>
  Number((BigInt(amount) * 2n + BigInt(by)) / (BigInt(by) * 2n));

/** Покупки за кілька місяців: по місяцях, по продуктах і кожен продукт помісячно. */
export function summarizePeriod(
  purchases: readonly MonthlyPurchase[],
  months: readonly string[],
): PurchasesPeriod {
  const inPeriod = new Set(months);
  const rows = purchases.filter((p) => inPeriod.has(p.month));
  const priced = rows.filter(
    (p): p is MonthlyPurchase & { actualUnitPrice: number } => p.actualUnitPrice !== null,
  );

  const points = months.map((month) => {
    const ofMonth = priced.filter((p) => p.month === month);
    return { month, spent: spentOf(ofMonth), purchaseCount: ofMonth.length };
  });
  const total = points.reduce((sum, point) => safeAdd(sum, point.spent), 0);

  const byProduct = new Map<string, (MonthlyPurchase & { actualUnitPrice: number })[]>();
  for (const purchase of priced) {
    byProduct.set(purchase.productId, [...(byProduct.get(purchase.productId) ?? []), purchase]);
  }
  const products = [...byProduct.values()].map((list): ProductPeriodRow => {
    const latest = [...list].sort((a, b) => a.boughtAt.localeCompare(b.boughtAt)).at(-1)!;
    const quantityMilli = list.reduce((sum, p) => safeAdd(sum, p.quantityMilli), 0);
    const spent = spentOf(list);
    const prices = list.map((p) => p.actualUnitPrice);
    return {
      productId: latest.productId,
      name: latest.name,
      unit: latest.unit,
      quantityMilli,
      spent,
      share: total === 0 ? 0 : spent / total,
      averagePerMonth: divideRounded(spent, months.length),
      averageUnitPrice: averageUnitPrice(spent, quantityMilli),
      minUnitPrice: Math.min(...prices),
      maxUnitPrice: Math.max(...prices),
      purchaseCount: list.length,
      byMonth: months.map((month) => {
        const ofMonth = list.filter((p) => p.month === month);
        return {
          month,
          spent: spentOf(ofMonth),
          quantityMilli: ofMonth.reduce((sum, p) => safeAdd(sum, p.quantityMilli), 0),
        };
      }),
    };
  });
  products.sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name, 'uk'));

  return {
    months: [...months],
    total,
    averagePerMonth: months.length === 0 ? 0 : divideRounded(total, months.length),
    purchaseCount: rows.length,
    unpricedCount: rows.length - priced.length,
    points,
    products,
  };
}
