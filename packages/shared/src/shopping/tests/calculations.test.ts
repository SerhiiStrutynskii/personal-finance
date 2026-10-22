import { describe, expect, it } from 'vitest';
import { MoneyRangeError } from '../../money.ts';
import {
  MAX_QUANTITY_MILLI,
  QuantityParseError,
  formatQuantity,
  lineTotal,
  parseQuantity,
  shoppingTotals,
  type ShoppingLineInput,
} from '../calculations.ts';

describe('parseQuantity / formatQuantity', () => {
  it('розбирає кількість у тисячні без float', () => {
    expect(parseQuantity('1')).toBe(1000);
    expect(parseQuantity('1,5')).toBe(1500);
    expect(parseQuantity('0.333')).toBe(333);
    expect(parseQuantity(' 2 ')).toBe(2000);
    expect(parseQuantity('1 000')).toBe(1_000_000);
  });

  it('відхиляє зайві знаки, від’ємні й нечислові значення', () => {
    for (const input of ['', '1,2345', '-1', 'abc', '1,', ',5', '1e3']) {
      expect(() => parseQuantity(input)).toThrow(QuantityParseError);
    }
    expect(() => parseQuantity('1000001')).toThrow(QuantityParseError);
    expect(parseQuantity('1000000')).toBe(MAX_QUANTITY_MILLI);
  });

  it('показує кількість без зайвих нулів', () => {
    expect(formatQuantity(1000)).toBe('1');
    expect(formatQuantity(1500)).toBe('1,5');
    expect(formatQuantity(333)).toBe('0,333');
    expect(formatQuantity(1)).toBe('0,001');
    expect(formatQuantity(12_050)).toBe('12,05');
  });
});

describe('lineTotal', () => {
  it('множить кількість на ціну й округлює до копійки, половина — вгору', () => {
    expect(lineTotal(2000, 4250)).toBe(8500);
    // 0,333 кг × 89,90 грн = 29,9367 грн
    expect(lineTotal(333, 8990)).toBe(2994);
    // 0,5 × 0,01 грн = 0,005 грн → 0,01
    expect(lineTotal(500, 1)).toBe(1);
    // 0,001 кг × 4,99 грн = 0,00499 грн → 0
    expect(lineTotal(1, 499)).toBe(0);
    expect(lineTotal(1, 500)).toBe(1);
  });

  it('рахує великі добутки точно й не виходить за безпечне ціле', () => {
    expect(lineTotal(MAX_QUANTITY_MILLI, 1_000_000_00)).toBe(100_000_000_000_000);
    expect(() => lineTotal(MAX_QUANTITY_MILLI, Number.MAX_SAFE_INTEGER)).toThrow(MoneyRangeError);
  });
});

describe('shoppingTotals', () => {
  const line = (override: Partial<ShoppingLineInput> = {}): ShoppingLineInput => ({
    quantityMilli: 1000,
    expectedUnitPrice: 1000,
    actualUnitPrice: null,
    isBought: false,
    ...override,
  });

  it('порожній список — нулі', () => {
    expect(shoppingTotals([])).toEqual({
      itemCount: 0,
      boughtCount: 0,
      expected: 0,
      actual: 0,
      remaining: 0,
      deviation: 0,
      unpricedCount: 0,
    });
  });

  it('рахує очікувану, фактичну, залишок і відхилення', () => {
    const totals = shoppingTotals([
      // куплено дорожче: очікували 2 × 10, заплатили 2 × 12
      line({ quantityMilli: 2000, actualUnitPrice: 1200, isBought: true }),
      // куплено дешевше
      line({ expectedUnitPrice: 5000, actualUnitPrice: 4500, isBought: true }),
      // ще не куплено
      line({ quantityMilli: 1500, expectedUnitPrice: 2000 }),
    ]);
    expect(totals).toEqual({
      itemCount: 3,
      boughtCount: 2,
      expected: 2000 + 5000 + 3000,
      actual: 2400 + 4500,
      remaining: 3000,
      deviation: 400 - 500,
      unpricedCount: 0,
    });
  });

  it('рядки без цін не потрапляють у суми й відхилення', () => {
    const totals = shoppingTotals([
      // ціни немає ні в довіднику, ні з чека
      line({ expectedUnitPrice: null, isBought: true }),
      // очікуваної ціни не було, фактична є
      line({ expectedUnitPrice: null, actualUnitPrice: 3000, isBought: true }),
      // некуплений без ціни
      line({ expectedUnitPrice: null }),
      // фактичну ціну введено, але позначку знято — це ще не покупка
      line({ actualUnitPrice: 900 }),
    ]);
    expect(totals).toMatchObject({
      boughtCount: 2,
      expected: 1000,
      actual: 3000,
      remaining: 1000,
      deviation: 0,
      unpricedCount: 3,
    });
  });
});
