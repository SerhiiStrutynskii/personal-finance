import { describe, expect, it } from 'vitest';
import { averageUnitPrice, summarizePurchases, type Purchase } from '../analytics.ts';

const BREAD = 'bread';
const CHEESE = 'cheese';

const purchase = (override: Partial<Purchase> = {}): Purchase => ({
  productId: BREAD,
  name: 'Хліб',
  unit: 'pcs',
  quantityMilli: 1000,
  expectedUnitPrice: 3200,
  actualUnitPrice: 3200,
  boughtAt: '2026-10-05T10:00:00.000Z',
  ...override,
});

describe('averageUnitPrice', () => {
  it('ділить суму на кількість з округленням «половина — вгору»', () => {
    expect(averageUnitPrice(6700, 2000)).toBe(3350);
    // 100 коп. за 3 шт = 33,33…
    expect(averageUnitPrice(100, 3000)).toBe(33);
    // 0,005 грн за одиницю → 0,01
    expect(averageUnitPrice(1, 2000)).toBe(1);
    // 136,47 грн за 0,35 кг = 389,914… грн/кг
    expect(averageUnitPrice(13647, 350)).toBe(38991);
  });
});

describe('summarizePurchases', () => {
  it('порожній місяць — нулі', () => {
    expect(summarizePurchases([], [], new Map())).toEqual({
      spent: 0,
      previousSpent: 0,
      change: 0,
      expectedOfPriced: 0,
      deviation: 0,
      purchaseCount: 0,
      unpricedCount: 0,
      products: [],
    });
  });

  it('рахує витрачене, зміну до минулого місяця й відхилення від очікуваних цін', () => {
    const summary = summarizePurchases(
      [
        purchase({ quantityMilli: 2000, actualUnitPrice: 3500 }),
        purchase({
          productId: CHEESE,
          name: 'Сир',
          unit: 'kg',
          quantityMilli: 350,
          expectedUnitPrice: 40000,
          actualUnitPrice: 38990,
        }),
        // очікуваної ціни не було — у відхилення не входить
        purchase({
          expectedUnitPrice: null,
          actualUnitPrice: 3000,
          boughtAt: '2026-10-01T00:00:00Z',
        }),
        // фактичної ціни немає — у суми не входить
        purchase({ actualUnitPrice: null }),
      ],
      [purchase({ actualUnitPrice: 5000 })],
      new Map(),
    );
    expect(summary).toMatchObject({
      spent: 7000 + 13647 + 3000,
      previousSpent: 5000,
      change: 7000 + 13647 + 3000 - 5000,
      expectedOfPriced: 6400 + 14000,
      deviation: 600 - 353,
      purchaseCount: 4,
      unpricedCount: 1,
    });
  });

  it('групує покупки за продуктом, сортує за витраченим і порівнює ціну з попередньою покупкою', () => {
    const { products } = summarizePurchases(
      [
        purchase({ boughtAt: '2026-10-20T10:00:00Z', actualUnitPrice: 3500, quantityMilli: 1000 }),
        purchase({ boughtAt: '2026-10-03T10:00:00Z', actualUnitPrice: 3200, quantityMilli: 1000 }),
        purchase({
          productId: CHEESE,
          name: 'Сир',
          unit: 'kg',
          quantityMilli: 500,
          actualUnitPrice: 40000,
        }),
      ],
      [],
      new Map([[CHEESE, 39000]]),
    );
    expect(products).toEqual([
      {
        productId: CHEESE,
        name: 'Сир',
        unit: 'kg',
        quantityMilli: 500,
        spent: 20000,
        averageUnitPrice: 40000,
        lastUnitPrice: 40000,
        // попередня покупка — до цього місяця
        previousUnitPrice: 39000,
        purchaseCount: 1,
      },
      {
        productId: BREAD,
        name: 'Хліб',
        unit: 'pcs',
        quantityMilli: 2000,
        spent: 6700,
        averageUnitPrice: 3350,
        // остання покупка місяця порівнюється з попередньою в тому ж місяці
        lastUnitPrice: 3500,
        previousUnitPrice: 3200,
        purchaseCount: 2,
      },
    ]);
  });

  it('перша покупка продукту не має попередньої ціни', () => {
    const { products } = summarizePurchases([purchase()], [], new Map());
    expect(products[0]?.previousUnitPrice).toBeNull();
  });
});
