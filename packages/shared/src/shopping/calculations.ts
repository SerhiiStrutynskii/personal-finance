import { MoneyRangeError } from '../money.ts';

/**
 * Кількість зберігається цілим числом тисячних одиниці (1,5 кг = 1500), щоб у розрахунках
 * не було float — за тим самим правилом, що й гроші.
 */
export const QUANTITY_SCALE = 1000;

/** Найбільша кількість у рядку: мільйон одиниць. */
export const MAX_QUANTITY_MILLI = 1_000_000 * QUANTITY_SCALE;

export class QuantityParseError extends Error {
  constructor(input: string) {
    super(`Некоректна кількість: "${input}"`);
    this.name = 'QuantityParseError';
  }
}

/** Розбирає "1,5" чи "0.25" у тисячні без float; більше трьох знаків після коми — помилка. */
export function parseQuantity(input: string): number {
  const normalized = input.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(normalized);
  if (!match) throw new QuantityParseError(input);
  const [, whole = '', fraction = ''] = match;
  const milli = BigInt(whole) * BigInt(QUANTITY_SCALE) + BigInt(fraction.padEnd(3, '0'));
  if (milli > BigInt(MAX_QUANTITY_MILLI)) throw new QuantityParseError(input);
  return Number(milli);
}

/** Кількість для показу: 1500 → "1,5", 2000 → "2". */
export function formatQuantity(quantityMilli: number): string {
  const whole = Math.trunc(quantityMilli / QUANTITY_SCALE);
  const fraction = String(quantityMilli % QUANTITY_SCALE)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole},${fraction}` : String(whole);
}

/**
 * Сума рядка: кількість × ціна за одиницю, округлена до копійки за правилом «половина — вгору».
 * Рахується в BigInt, бо добуток може перевищити безпечне ціле число ще до ділення.
 */
export function lineTotal(quantityMilli: number, unitPriceMinor: number): number {
  const scale = BigInt(QUANTITY_SCALE);
  const product = BigInt(quantityMilli) * BigInt(unitPriceMinor);
  const total = (product + scale / 2n) / scale;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new MoneyRangeError();
  return Number(total);
}

export interface ShoppingLineInput {
  quantityMilli: number;
  expectedUnitPrice: number | null;
  actualUnitPrice: number | null;
  isBought: boolean;
}

export interface ShoppingTotals {
  itemCount: number;
  boughtCount: number;
  /** Очікувана сума всього списку за рядками з відомою очікуваною ціною. */
  expected: number;
  /** Фактична сума куплених рядків. */
  actual: number;
  /** Скільки ще очікується за некупленими рядками. */
  remaining: number;
  /** Фактична сума куплених мінус їхня очікувана; лише рядки з обома цінами. */
  deviation: number;
  /** Рядки без очікуваної ціни: їх немає в очікуваних сумах. */
  unpricedCount: number;
}

export function shoppingTotals(lines: readonly ShoppingLineInput[]): ShoppingTotals {
  const totals: ShoppingTotals = {
    itemCount: lines.length,
    boughtCount: 0,
    expected: 0,
    actual: 0,
    remaining: 0,
    deviation: 0,
    unpricedCount: 0,
  };
  const add = (sum: number, value: number) => {
    const result = sum + value;
    if (!Number.isSafeInteger(result)) throw new MoneyRangeError();
    return result;
  };

  for (const line of lines) {
    const expected =
      line.expectedUnitPrice === null
        ? null
        : lineTotal(line.quantityMilli, line.expectedUnitPrice);
    const actual =
      line.actualUnitPrice === null ? null : lineTotal(line.quantityMilli, line.actualUnitPrice);

    if (expected === null) totals.unpricedCount += 1;
    else totals.expected = add(totals.expected, expected);

    if (line.isBought) {
      totals.boughtCount += 1;
      if (actual !== null) totals.actual = add(totals.actual, actual);
      if (actual !== null && expected !== null) {
        totals.deviation = add(totals.deviation, actual - expected);
      }
    } else if (expected !== null) {
      totals.remaining = add(totals.remaining, expected);
    }
  }
  return totals;
}
