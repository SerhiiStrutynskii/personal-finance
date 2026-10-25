import type { Dish, Product } from '@hf/shared';
import { describe, expect, it } from 'vitest';
import {
  dishFormValues,
  emptyDishLine,
  ingredientCountLabel,
  previewDish,
  productOptions,
  toDishInput,
  unpricedLabel,
  type DishFormValues,
} from './dishForm.ts';

const product = (id: string, price: number | null, isArchived = false): Product => ({
  id,
  name: `Продукт ${id}`,
  unit: 'kg',
  price,
  currency: 'UAH',
  isArchived,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const ID = {
  buckwheat: '00000000-0000-4000-8000-000000000001',
  oil: '00000000-0000-4000-8000-000000000002',
  salt: '00000000-0000-4000-8000-000000000003',
  old: '00000000-0000-4000-8000-000000000004',
};
const PRODUCTS = [
  product(ID.buckwheat, 4000),
  product(ID.oil, 9000),
  product(ID.salt, null),
  product(ID.old, 1000, true),
];

function form(name: string, lines: [productId: string, quantity: string][]): DishFormValues {
  return {
    name,
    lines: lines.map(([productId, quantity]) => ({ ...emptyDishLine(), productId, quantity })),
  };
}

describe('toDishInput', () => {
  it('перетворює форму на тіло запиту: назва без пробілів, кількість у тисячних', () => {
    const result = toDishInput(
      form('  Гречка варена ', [
        [ID.buckwheat, '0,15'],
        [ID.oil, '0.01'],
      ]),
    );
    expect(result).toEqual({
      input: {
        name: 'Гречка варена',
        ingredients: [
          { productId: ID.buckwheat, quantityMilli: 150 },
          { productId: ID.oil, quantityMilli: 10 },
        ],
      },
    });
  });

  it('страва без складу коректна', () => {
    expect(toDishInput(form('Чай', []))).toEqual({ input: { name: 'Чай', ingredients: [] } });
  });

  it('повертає помилки назви й рядків за key', () => {
    const values = form(' ', [
      [ID.buckwheat, '0'],
      [ID.oil, 'абв'],
      [ID.salt, '0,1234'],
      ['', '1'],
      [ID.buckwheat, ''],
    ]);
    const result = toDishInput(values);
    expect('errors' in result).toBe(true);
    if (!('errors' in result)) return;
    const [zero, letters, precise, noProduct, duplicate] = values.lines.map(
      (line) => result.errors.lines[line.key],
    );
    expect(result.errors.name).toBe('Вкажіть назву до 100 символів');
    expect(zero).toEqual({ quantity: 'Кількість має бути більшою за нуль' });
    expect(letters).toEqual({ quantity: 'Некоректна кількість, приклад: 1,5' });
    expect(precise).toEqual({ quantity: 'Некоректна кількість, приклад: 1,5' });
    expect(noProduct).toEqual({ product: 'Виберіть продукт' });
    expect(duplicate).toEqual({
      product: 'Продукт уже є в складі',
      quantity: 'Вкажіть кількість',
    });
  });

  it('відхиляє назву понад 100 символів', () => {
    const result = toDishInput(form('я'.repeat(101), []));
    expect(result).toEqual({ errors: { name: 'Вкажіть назву до 100 символів', lines: {} } });
  });
});

describe('dishFormValues', () => {
  it('заповнює форму зі страви, кількість — з комою', () => {
    const dish = {
      name: 'Каша',
      ingredients: [{ productId: ID.buckwheat, quantityMilli: 150 }],
    } as Dish;
    const values = dishFormValues(dish);
    expect(values.name).toBe('Каша');
    expect(values.lines).toEqual([
      { key: expect.any(String), productId: ID.buckwheat, quantity: '0,15' },
    ]);
    expect(dishFormValues()).toEqual({ name: '', lines: [] });
  });
});

describe('previewDish', () => {
  it('рахує ціни рядків і порції наживо', () => {
    const preview = previewDish(
      form('Каша', [
        [ID.buckwheat, '0,15'],
        [ID.oil, '0,01'],
      ]),
      PRODUCTS,
    );
    expect(preview.lines.map((line) => line.total)).toEqual([600, 90]);
    expect(preview.portion).toEqual({ price: 690, isPriceComplete: true, unpricedCount: 0 });
  });

  it('продукт без ціни робить ціну неповною; незаповнені рядки не враховуються', () => {
    const preview = previewDish(
      form('Каша', [
        [ID.buckwheat, '0,333'],
        [ID.salt, '0,005'],
        ['', '1'],
        [ID.oil, 'абв'],
      ]),
      PRODUCTS,
    );
    expect(preview.lines.map((line) => line.total)).toEqual([1332, null, null, null]);
    expect(preview.portion).toEqual({ price: 1332, isPriceComplete: false, unpricedCount: 1 });
  });
});

describe('productOptions', () => {
  it('ховає архівні, крім уже вибраного в рядку, і блокує вибрані в інших рядках', () => {
    const values = form('Каша', [
      [ID.buckwheat, '1'],
      [ID.old, '1'],
    ]);
    const [first, second] = values.lines;
    const options = (key: string) =>
      productOptions(values, key, PRODUCTS).map(({ product, disabled }) => [product.id, disabled]);
    expect(options(first!.key)).toEqual([
      [ID.buckwheat, false],
      [ID.oil, false],
      [ID.salt, false],
    ]);
    expect(options(second!.key)).toEqual([
      [ID.buckwheat, true],
      [ID.oil, false],
      [ID.salt, false],
      [ID.old, false],
    ]);
  });
});

describe('підписи', () => {
  it('узгоджує число з іменником', () => {
    expect(unpricedLabel(1)).toBe('1 продукт без ціни');
    expect(unpricedLabel(2)).toBe('2 продукти без ціни');
    expect(unpricedLabel(5)).toBe('5 продуктів без ціни');
    expect(unpricedLabel(11)).toBe('11 продуктів без ціни');
    expect(unpricedLabel(22)).toBe('22 продукти без ціни');
    expect(ingredientCountLabel(0)).toBe('Склад не задано');
    expect(ingredientCountLabel(3)).toBe('3 продукти');
  });
});
