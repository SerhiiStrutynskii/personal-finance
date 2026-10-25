import { describe, expect, it } from 'vitest';
import { MoneyRangeError } from '../../money.ts';
import { dishPortionPrice } from '../calculations.ts';

describe('dishPortionPrice', () => {
  it('додає суми рядків: 0,15 кг × 40 грн + 0,01 л × 90 грн = 6,90 грн', () => {
    expect(
      dishPortionPrice([
        { quantityMilli: 150, unitPrice: 4000 },
        { quantityMilli: 10, unitPrice: 9000 },
      ]),
    ).toEqual({ price: 690, isPriceComplete: true, unpricedCount: 0 });
  });

  it('порожній склад — нуль і повна ціна', () => {
    expect(dishPortionPrice([])).toEqual({ price: 0, isPriceComplete: true, unpricedCount: 0 });
  });

  it('рядок без ціни дає 0 і робить ціну неповною', () => {
    expect(
      dishPortionPrice([
        { quantityMilli: 200, unitPrice: 2500 },
        { quantityMilli: 1000, unitPrice: null },
        { quantityMilli: 500, unitPrice: null },
      ]),
    ).toEqual({ price: 500, isPriceComplete: false, unpricedCount: 2 });
  });

  it('лише рядки без ціни — нуль і неповна ціна', () => {
    expect(dishPortionPrice([{ quantityMilli: 1, unitPrice: null }])).toEqual({
      price: 0,
      isPriceComplete: false,
      unpricedCount: 1,
    });
  });

  it('округлює кожен рядок окремо, половина — вгору', () => {
    // 0,333 × 1501 = 499,833 → 500
    expect(dishPortionPrice([{ quantityMilli: 333, unitPrice: 1501 }]).price).toBe(500);
    // 0,001 × 500 = 0,5 → 1; 0,001 × 499 = 0,499 → 0
    expect(dishPortionPrice([{ quantityMilli: 1, unitPrice: 500 }]).price).toBe(1);
    expect(dishPortionPrice([{ quantityMilli: 1, unitPrice: 499 }]).price).toBe(0);
    // Два рядки по 0,5 копійки дають 2, а не округлену суму 1.
    expect(
      dishPortionPrice([
        { quantityMilli: 1, unitPrice: 500 },
        { quantityMilli: 1, unitPrice: 500 },
      ]).price,
    ).toBe(2);
  });

  it('кидає MoneyRangeError, коли рядок чи сума виходить за безпечне ціле', () => {
    expect(() =>
      dishPortionPrice([{ quantityMilli: 1_000_000_000, unitPrice: Number.MAX_SAFE_INTEGER }]),
    ).toThrow(MoneyRangeError);

    const half = Math.ceil(Number.MAX_SAFE_INTEGER / 2) + 1;
    expect(() =>
      dishPortionPrice([
        { quantityMilli: 1000, unitPrice: half },
        { quantityMilli: 1000, unitPrice: half },
      ]),
    ).toThrow(MoneyRangeError);
    expect(
      dishPortionPrice([{ quantityMilli: 1000, unitPrice: Number.MAX_SAFE_INTEGER }]).price,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
});
