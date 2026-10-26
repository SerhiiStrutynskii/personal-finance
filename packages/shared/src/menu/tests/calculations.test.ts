import { describe, expect, it } from 'vitest';
import { MoneyRangeError } from '../../money.ts';
import {
  dishPortionPrice,
  menuCostTotal,
  menuEntryCost,
  menuProductEntryCost,
} from '../calculations.ts';

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

describe('menuEntryCost', () => {
  it('ціна порції × порції', () => {
    expect(menuEntryCost(690, 1)).toBe(690);
    expect(menuEntryCost(690, 2)).toBe(1380);
    expect(menuEntryCost(1250, 3)).toBe(3750);
    expect(menuEntryCost(0, 99)).toBe(0);
  });

  it('кидає MoneyRangeError понад безпечне ціле', () => {
    expect(menuEntryCost(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => menuEntryCost(Number.MAX_SAFE_INTEGER, 2)).toThrow(MoneyRangeError);
    expect(() => menuEntryCost(Math.floor(Number.MAX_SAFE_INTEGER / 99) + 1, 99)).toThrow(
      MoneyRangeError,
    );
  });
});

describe('menuProductEntryCost', () => {
  it('кількість × ціна з округленням «половина — вгору»', () => {
    // 0,333 кг × 10,01 грн = 3,33333 → 3,33 грн.
    expect(menuProductEntryCost(333, 1001)).toEqual({
      cost: 333,
      isPriceComplete: true,
      unpricedCount: 0,
    });
    // 0,5 л × 42,00 = 21,00; 10 шт × 6,50 = 65,00.
    expect(menuProductEntryCost(500, 4200).cost).toBe(2100);
    expect(menuProductEntryCost(10_000, 650).cost).toBe(6500);
  });

  it('граничне округлення: рівно половина копійки — вгору, менше — вниз', () => {
    // 0,005 × 1,00 = 0,5 коп. → 1 коп.
    expect(menuProductEntryCost(5, 100).cost).toBe(1);
    // 0,004 × 1,00 = 0,4 коп. → 0.
    expect(menuProductEntryCost(4, 100).cost).toBe(0);
    // 0,001 × 0,01 = 0,00001 коп. → 0, але ціна відома.
    expect(menuProductEntryCost(1, 1)).toEqual({
      cost: 0,
      isPriceComplete: true,
      unpricedCount: 0,
    });
  });

  it('без ціни — 0, ціна неповна, один продукт без ціни', () => {
    expect(menuProductEntryCost(500, null)).toEqual({
      cost: 0,
      isPriceComplete: false,
      unpricedCount: 1,
    });
  });

  it('найбільша кількість без втрати точності; понад безпечне ціле — MoneyRangeError', () => {
    expect(menuProductEntryCost(1_000_000_000, 100).cost).toBe(100_000_000);
    expect(() => menuProductEntryCost(1_000_000_000, Number.MAX_SAFE_INTEGER)).toThrow(
      MoneyRangeError,
    );
  });

  it('вартість дня зі страви й продукту — сума записів', () => {
    const entries = [
      { cost: menuEntryCost(690, 2), isPriceComplete: true },
      menuProductEntryCost(333, 1001),
      menuProductEntryCost(500, null),
    ];
    expect(menuCostTotal(entries)).toEqual({
      cost: 1380 + 333,
      isPriceComplete: false,
      incompleteEntryCount: 1,
    });
  });
});

describe('menuCostTotal', () => {
  it('порожній список — нуль і повна ціна', () => {
    expect(menuCostTotal([])).toEqual({ cost: 0, isPriceComplete: true, incompleteEntryCount: 0 });
  });

  it('сумує вартість записів: 690 × 2 + 1 250 × 3 = 5 130, з іншим днем 500 — 5 630', () => {
    const day = [
      { cost: menuEntryCost(690, 2), isPriceComplete: true },
      { cost: menuEntryCost(1250, 3), isPriceComplete: true },
    ];
    expect(menuCostTotal(day)).toEqual({
      cost: 5130,
      isPriceComplete: true,
      incompleteEntryCount: 0,
    });
    expect(menuCostTotal([...day, { cost: 500, isPriceComplete: true }]).cost).toBe(5630);
  });

  it('неповна ціна хоча б одного запису робить підсумок неповним і рахує такі записи', () => {
    expect(
      menuCostTotal([
        { cost: 500, isPriceComplete: false },
        { cost: 100, isPriceComplete: true },
        { cost: 0, isPriceComplete: false },
      ]),
    ).toEqual({ cost: 600, isPriceComplete: false, incompleteEntryCount: 2 });
  });

  it('кидає MoneyRangeError, коли сума виходить за безпечне ціле', () => {
    expect(() =>
      menuCostTotal([
        { cost: Number.MAX_SAFE_INTEGER, isPriceComplete: true },
        { cost: 1, isPriceComplete: true },
      ]),
    ).toThrow(MoneyRangeError);
  });
});
