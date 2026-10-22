import type { ShoppingPeriod } from '@hf/shared';
import { describe, expect, it } from 'vitest';
import { topProductSlices } from './shoppingChart.ts';

const period = (spents: number[]): ShoppingPeriod => {
  const total = spents.reduce((sum, spent) => sum + spent, 0);
  return {
    month: '2026-10',
    currency: 'UAH',
    months: ['2026-10'],
    total,
    averagePerMonth: total,
    purchaseCount: spents.length,
    unpricedCount: 0,
    points: [{ month: '2026-10', spent: total, purchaseCount: spents.length }],
    products: spents.map((spent, index) => ({
      productId: `p${index}`,
      name: `Продукт ${index + 1}`,
      unit: 'pcs',
      quantityMilli: 1000,
      spent,
      share: spent / total,
      averagePerMonth: spent,
      averageUnitPrice: spent,
      minUnitPrice: spent,
      maxUnitPrice: spent,
      purchaseCount: 1,
      byMonth: [{ month: '2026-10', spent, quantityMilli: 1000 }],
    })),
  };
};

describe('topProductSlices', () => {
  it('до ліміту — кожен продукт окремим сектором', () => {
    expect(topProductSlices(period([300, 100]), 10).map((s) => s.name)).toEqual([
      'Продукт 1',
      'Продукт 2',
    ]);
  });

  it('решту після ліміту збирає в «Інші продукти»', () => {
    const slices = topProductSlices(period([500, 300, 100, 60, 40]), 3);
    expect(slices.map((s) => [s.name, s.spent])).toEqual([
      ['Продукт 1', 500],
      ['Продукт 2', 300],
      ['Продукт 3', 100],
      ['Інші продукти (2)', 100],
    ]);
    expect(slices.at(-1)?.share).toBeCloseTo(0.1);
  });

  it('порожній період — без секторів', () => {
    expect(topProductSlices(period([]))).toEqual([]);
  });
});
