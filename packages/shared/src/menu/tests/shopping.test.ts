import { describe, expect, it } from 'vitest';
import { MoneyRangeError } from '../../money.ts';
import {
  menuShoppingItems,
  menuShoppingListName,
  menuShoppingTotal,
  type MenuShoppingIngredientInput,
} from '../shopping.ts';

const BUCKWHEAT = '00000000-0000-4000-8000-000000000001';
const OIL = '00000000-0000-4000-8000-000000000002';
const SALT = '00000000-0000-4000-8000-000000000003';
const APPLE = '00000000-0000-4000-8000-000000000004';

const line = (
  dishId: string,
  productId: string,
  name: string,
  quantityMilli: number,
  priceMinor: number | null,
  extra: Partial<MenuShoppingIngredientInput> = {},
): MenuShoppingIngredientInput => ({
  dishId,
  productId,
  name,
  unit: 'kg',
  isArchived: false,
  quantityMilli,
  priceMinor,
  ...extra,
});

describe('menuShoppingItems', () => {
  it('сумує кількість × порції по записах: гречка 2+2+1 порції → 0,75 кг і 50 мл олії', () => {
    const ingredients = [
      line('porridge', BUCKWHEAT, 'Гречка', 150, 4000),
      line('porridge', OIL, 'Олія', 10, 9000, { unit: 'l' }),
    ];
    const entries = [
      { dishId: 'porridge', servings: 2 },
      { dishId: 'porridge', servings: 2 },
      { dishId: 'porridge', servings: 1 },
    ];
    const items = menuShoppingItems(entries, ingredients);
    expect(items).toEqual([
      {
        productId: BUCKWHEAT,
        name: 'Гречка',
        unit: 'kg',
        isArchived: false,
        quantityMilli: 750,
        unitPrice: 4000,
        lineTotal: 3000,
      },
      {
        productId: OIL,
        name: 'Олія',
        unit: 'l',
        isArchived: false,
        quantityMilli: 50,
        unitPrice: 9000,
        lineTotal: 450,
      },
    ]);
    expect(menuShoppingTotal(items)).toEqual({
      cost: 3450,
      isPriceComplete: true,
      unpricedCount: 0,
    });
  });

  it('продукт з кількох страв — один рядок; порядок за українським алфавітом, далі за id', () => {
    const items = menuShoppingItems(
      [
        { dishId: 'a', servings: 1 },
        { dishId: 'b', servings: 3 },
      ],
      [
        line('a', SALT, 'Сіль', 5, 2000),
        line('a', BUCKWHEAT, 'Гречка', 100, 4000),
        line('b', BUCKWHEAT, 'Гречка', 50, 4000),
        line('b', APPLE, 'їжак', 1000, 100),
        line('b', OIL, 'Гречка', 1000, 100),
      ],
    );
    expect(items.map((item) => [item.name, item.quantityMilli])).toEqual([
      ['Гречка', 250],
      ['Гречка', 3000],
      ['їжак', 3000],
      ['Сіль', 5],
    ]);
    expect(items[0]!.productId).toBe(BUCKWHEAT);
    expect(items[1]!.productId).toBe(OIL);
  });

  it('AC4: округлення від сумарної кількості — 3 × 0,001 кг × 5 грн = 0,02 грн, а не 0,03', () => {
    const items = menuShoppingItems(
      [1, 2, 3].map(() => ({ dishId: 'a', servings: 1 })),
      [line('a', SALT, 'Сіль', 1, 500)],
    );
    expect(items[0]).toMatchObject({ quantityMilli: 3, lineTotal: 2 });
    // Для порівняння: окремий рядок 0,001 × 500 = 0,5 → 1 копійка.
    expect(
      menuShoppingItems([{ dishId: 'a', servings: 1 }], [line('a', SALT, 'Сіль', 1, 500)])[0],
    ).toMatchObject({ quantityMilli: 1, lineTotal: 1 });
  });

  it('продукт без ціни: ціна й сума null; у бюджеті 0, рахується один раз на продукт', () => {
    const items = menuShoppingItems(
      [
        { dishId: 'a', servings: 1 },
        { dishId: 'b', servings: 2 },
      ],
      [
        line('a', SALT, 'Сіль', 5, null),
        line('b', SALT, 'Сіль', 5, null),
        line('b', BUCKWHEAT, 'Гречка', 100, 4000),
      ],
    );
    expect(items[1]).toMatchObject({
      name: 'Сіль',
      quantityMilli: 15,
      unitPrice: null,
      lineTotal: null,
    });
    expect(menuShoppingTotal(items)).toEqual({
      cost: 800,
      isPriceComplete: false,
      unpricedCount: 1,
    });
  });

  it('страви без записів і записи без складу нічого не додають', () => {
    const items = menuShoppingItems(
      [{ dishId: 'empty', servings: 4 }],
      [line('other', BUCKWHEAT, 'Гречка', 100, 4000)],
    );
    expect(items).toEqual([]);
    expect(menuShoppingTotal(items)).toEqual({ cost: 0, isPriceComplete: true, unpricedCount: 0 });
  });

  it('порожній вхід — порожній перелік і нульовий бюджет з повною ціною', () => {
    expect(menuShoppingItems([], [])).toEqual([]);
    expect(menuShoppingTotal([])).toEqual({ cost: 0, isPriceComplete: true, unpricedCount: 0 });
  });

  it('зберігає прапорець архівного продукту', () => {
    const [item] = menuShoppingItems(
      [{ dishId: 'a', servings: 1 }],
      [line('a', SALT, 'Сіль', 5, null, { isArchived: true, unit: 'pack' })],
    );
    expect(item).toMatchObject({ isArchived: true, unit: 'pack' });
  });

  it('кидає MoneyRangeError, коли кількість, сума рядка чи бюджет виходить за безпечне ціле', () => {
    const huge = Number.MAX_SAFE_INTEGER;
    expect(() =>
      menuShoppingItems(
        [
          { dishId: 'a', servings: 2 },
          { dishId: 'a', servings: 1 },
        ],
        [line('a', SALT, 'Сіль', Math.floor(huge / 2), null)],
      ),
    ).toThrow(MoneyRangeError);
    expect(() =>
      menuShoppingItems(
        [{ dishId: 'a', servings: 1 }],
        [line('a', SALT, 'Сіль', 1_000_000_000, huge)],
      ),
    ).toThrow(MoneyRangeError);
    expect(() => menuShoppingTotal([{ lineTotal: huge }, { lineTotal: 1 }])).toThrow(
      MoneyRangeError,
    );
    // Рівно на межі — ще можна.
    expect(menuShoppingTotal([{ lineTotal: huge - 1 }, { lineTotal: 1 }]).cost).toBe(huge);
  });
});

describe('menuShoppingListName', () => {
  it('один день — «Меню на …», інакше період з останнім днем to − 1', () => {
    expect(menuShoppingListName('2026-10-26', '2026-10-27')).toBe('Меню на 26.10.2026');
    expect(menuShoppingListName('2026-10-26', '2026-11-02')).toBe('Меню 26.10.2026–01.11.2026');
    expect(menuShoppingListName('2026-12-28', '2027-01-04')).toBe('Меню 28.12.2026–03.01.2027');
    expect(menuShoppingListName('2026-10-01', '2026-11-01')).toBe('Меню 01.10.2026–31.10.2026');
  });
});
