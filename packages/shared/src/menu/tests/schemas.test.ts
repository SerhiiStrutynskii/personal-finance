import { describe, expect, it } from 'vitest';
import {
  MAX_SERVINGS,
  createMealTypeSchema,
  createMenuEntrySchema,
  createMenuShoppingListSchema,
  menuEntrySchema,
  menuPeriodQuerySchema,
  menuShoppingQuerySchema,
  menuShoppingSchema,
  servingsSchema,
  updateMealTypeSchema,
  updateMenuEntrySchema,
} from '../schemas.ts';

const ok = (from: string, to: string) => menuPeriodQuerySchema.safeParse({ from, to }).success;

describe('menuPeriodQuerySchema', () => {
  it('приймає місяць, день і рівно 62 дні', () => {
    expect(ok('2026-10-01', '2026-11-01')).toBe(true);
    expect(ok('2026-10-26', '2026-10-27')).toBe(true);
    expect(ok('2026-10-01', '2026-12-02')).toBe(true);
  });

  it('відхиляє to ≤ from і період понад 62 дні', () => {
    expect(ok('2026-10-26', '2026-10-26')).toBe(false);
    expect(ok('2026-10-27', '2026-10-26')).toBe(false);
    expect(ok('2026-10-01', '2026-12-03')).toBe(false);
  });

  it('відхиляє невалідні й відсутні дати', () => {
    expect(ok('2026-02-30', '2026-03-01')).toBe(false);
    expect(ok('2026-10-01', '2026-13-01')).toBe(false);
    expect(ok('2026-10-01T00:00:00Z', '2026-11-01')).toBe(false);
    expect(menuPeriodQuerySchema.safeParse({ from: '2026-10-01' }).success).toBe(false);
  });
});

describe('servingsSchema', () => {
  it('ціле від 1 до 99', () => {
    expect(MAX_SERVINGS).toBe(99);
    for (const value of [1, 2, 99]) expect(servingsSchema.safeParse(value).success).toBe(true);
    for (const value of [0, 100, 1.5, -1, '2', null]) {
      expect(servingsSchema.safeParse(value).success).toBe(false);
    }
  });

  it('у новому записі за замовчуванням 1, у зміні — обов’язкове', () => {
    const entry = {
      date: '2026-10-26',
      mealTypeId: '00000000-0000-4000-8000-000000000001',
      dishId: '00000000-0000-4000-8000-000000000002',
    };
    expect(createMenuEntrySchema.parse(entry)).toMatchObject({ servings: 1 });
    expect(createMenuEntrySchema.safeParse({ ...entry, date: '2026-13-01' }).success).toBe(false);
    expect(updateMenuEntrySchema.safeParse({}).success).toBe(false);
  });
});

describe('menuShoppingQuerySchema', () => {
  it('той самий період, що й у календарі', () => {
    expect(
      menuShoppingQuerySchema.safeParse({ from: '2026-10-26', to: '2026-11-02' }).success,
    ).toBe(true);
    for (const query of [
      { from: '2026-10-26', to: '2026-10-26' },
      { from: '2026-10-01', to: '2026-12-03' },
      { from: '2026-02-30', to: '2026-03-02' },
      { to: '2026-11-02' },
    ]) {
      expect(menuShoppingQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});

describe('createMenuShoppingListSchema', () => {
  const week = { from: '2026-10-26', to: '2026-11-02' };

  it('назва необов’язкова; передана — обрізається', () => {
    expect(createMenuShoppingListSchema.parse(week)).toEqual(week);
    expect(createMenuShoppingListSchema.parse({ ...week, name: '  На дачу ' }).name).toBe(
      'На дачу',
    );
  });

  it('відхиляє порожню чи задовгу назву й невалідний період', () => {
    for (const body of [
      { ...week, name: '' },
      { ...week, name: '   ' },
      { ...week, name: 'а'.repeat(101) },
      { from: '2026-10-26', to: '2026-10-25' },
      { from: '2026-10-01', to: '2026-12-03' },
      { from: '2026-10-26' },
      {},
    ]) {
      expect(createMenuShoppingListSchema.safeParse(body).success).toBe(false);
    }
    expect(createMenuShoppingListSchema.safeParse({ ...week, name: 'а'.repeat(100) }).success).toBe(
      true,
    );
  });
});

describe('menuShoppingSchema', () => {
  it('приймає перелік з продуктом без ціни', () => {
    const result = menuShoppingSchema.safeParse({
      from: '2026-10-26',
      to: '2026-11-02',
      currency: 'UAH',
      entryCount: 1,
      items: [
        {
          productId: '00000000-0000-4000-8000-000000000001',
          name: 'Сіль',
          unit: 'kg',
          isArchived: false,
          quantityMilli: 5,
          unitPrice: null,
          lineTotal: null,
        },
      ],
      total: { cost: 0, isPriceComplete: false, unpricedCount: 1 },
    });
    expect(result.success).toBe(true);
  });
});

describe('createMenuEntrySchema — страва або продукт', () => {
  const base = {
    date: '2026-10-26',
    mealTypeId: '00000000-0000-4000-8000-000000000001',
  };
  const dishId = '00000000-0000-4000-8000-000000000002';
  const productId = '00000000-0000-4000-8000-000000000003';
  const ok = (body: unknown) => createMenuEntrySchema.safeParse(body).success;

  it('приймає продукт з кількістю в тисячних одиниці', () => {
    expect(createMenuEntrySchema.parse({ ...base, productId, quantityMilli: 500 })).toEqual({
      ...base,
      productId,
      quantityMilli: 500,
    });
    expect(ok({ ...base, productId, quantityMilli: 1 })).toBe(true);
    expect(ok({ ...base, productId, quantityMilli: 1_000_000_000 })).toBe(true);
  });

  it('відхиляє dishId і productId разом, жоден з них і порції для продукту', () => {
    expect(ok({ ...base, dishId, productId, quantityMilli: 500 })).toBe(false);
    expect(ok({ ...base, dishId, productId, servings: 1 })).toBe(false);
    expect(ok({ ...base, dishId, productId })).toBe(false);
    expect(ok({ ...base })).toBe(false);
    expect(ok({ ...base, quantityMilli: 500 })).toBe(false);
    expect(ok({ ...base, productId, servings: 2 })).toBe(false);
    expect(ok({ ...base, productId })).toBe(false);
    expect(ok({ ...base, dishId, quantityMilli: 500 })).toBe(false);
  });

  it('кількість продукту — ціле від 1 до 1 000 000 000', () => {
    for (const quantityMilli of [0, -1, 1.5, 1_000_000_001, '500', null]) {
      expect(ok({ ...base, productId, quantityMilli })).toBe(false);
    }
    expect(ok({ ...base, productId: 'not-a-uuid', quantityMilli: 500 })).toBe(false);
  });
});

describe('updateMenuEntrySchema', () => {
  const ok = (body: unknown) => updateMenuEntrySchema.safeParse(body).success;

  it('рівно одне з полів: servings або quantityMilli', () => {
    expect(ok({ servings: 2 })).toBe(true);
    expect(ok({ quantityMilli: 1500 })).toBe(true);
    expect(ok({ servings: 2, quantityMilli: 1500 })).toBe(false);
    expect(ok({})).toBe(false);
  });

  it('відхиляє недопустиму кількість', () => {
    for (const quantityMilli of [0, -5, 0.5, 1_000_000_001]) {
      expect(ok({ quantityMilli })).toBe(false);
    }
  });
});

describe('menuEntrySchema', () => {
  const common = {
    id: '00000000-0000-4000-8000-000000000009',
    date: '2026-10-26',
    mealTypeId: '00000000-0000-4000-8000-000000000001',
    cost: 0,
    isPriceComplete: false,
    unpricedCount: 1,
  };

  it('розрізняє страву й продукт за kind', () => {
    const product = {
      ...common,
      kind: 'product',
      name: 'Молоко',
      productId: '00000000-0000-4000-8000-000000000003',
      unit: 'l',
      isArchived: false,
      quantityMilli: 500,
      unitPrice: null,
    };
    expect(menuEntrySchema.safeParse(product).success).toBe(true);
    const dish = {
      ...common,
      kind: 'dish',
      name: 'Каша',
      dishId: '00000000-0000-4000-8000-000000000002',
      servings: 2,
      portionPrice: 0,
    };
    expect(menuEntrySchema.safeParse(dish).success).toBe(true);
    expect(menuEntrySchema.safeParse({ ...dish, kind: 'product' }).success).toBe(false);
    expect(menuEntrySchema.safeParse({ ...product, kind: 'other' }).success).toBe(false);
  });
});

describe('createMealTypeSchema', () => {
  const afterId = '00000000-0000-4000-8000-000000000001';

  it('afterId необов’язковий', () => {
    expect(createMealTypeSchema.parse({ name: ' Перекус ' })).toEqual({ name: 'Перекус' });
    expect(createMealTypeSchema.parse({ name: 'Сніданок 2', afterId })).toEqual({
      name: 'Сніданок 2',
      afterId,
    });
  });

  it('відхиляє afterId, що не є uuid', () => {
    for (const value of ['abc', '', 1, null]) {
      expect(createMealTypeSchema.safeParse({ name: 'Перекус', afterId: value }).success).toBe(
        false,
      );
    }
  });

  it('зміна назви не приймає afterId', () => {
    expect(updateMealTypeSchema.parse({ name: 'Обід', afterId })).toEqual({ name: 'Обід' });
  });
});
