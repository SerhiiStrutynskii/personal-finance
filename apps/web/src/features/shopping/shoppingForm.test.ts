import type { Product, ShoppingListItem } from '@hf/shared';
import { describe, expect, it } from 'vitest';
import {
  deviationLabel,
  emptyAddItemValues,
  itemFormValues,
  matchProduct,
  parseQuantityField,
  quantityLabel,
  toAddItemInput,
  toItemInput,
} from './shoppingForm.ts';

const product = (override: Partial<Product> = {}): Product => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Молоко',
  unit: 'l',
  price: 4250,
  currency: 'UAH',
  isArchived: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...override,
});

const item = (override: Partial<ShoppingListItem> = {}): ShoppingListItem => ({
  id: '00000000-0000-4000-8000-000000000002',
  productId: '00000000-0000-4000-8000-000000000001',
  name: 'Сир',
  unit: 'kg',
  quantityMilli: 300,
  expectedUnitPrice: 32000,
  actualUnitPrice: null,
  expectedTotal: 9600,
  actualTotal: null,
  isBought: false,
  boughtAt: null,
  ...override,
});

describe('parseQuantityField', () => {
  it('розбирає кількість і пояснює помилки', () => {
    expect(parseQuantityField('1,5')).toBe(1500);
    expect(parseQuantityField(' ')).toBe('Вкажіть кількість');
    expect(parseQuantityField('0')).toBe('Кількість має бути більшою за нуль');
    expect(parseQuantityField('1,2345')).toBe('Некоректна кількість, приклад: 1,5');
  });
});

describe('quantityLabel', () => {
  it('показує кількість з одиницею', () => {
    expect(quantityLabel(item())).toBe('0,3 кг');
    expect(quantityLabel(item({ quantityMilli: 2000, unit: 'pcs' }))).toBe('2 шт');
  });
});

describe('matchProduct', () => {
  it('знаходить продукт без урахування регістру й пробілів', () => {
    expect(matchProduct(' МОЛОКО ', [product()])?.name).toBe('Молоко');
    expect(matchProduct('Кефір', [product()])).toBeUndefined();
    expect(matchProduct('', [product()])).toBeUndefined();
  });
});

describe('toAddItemInput', () => {
  it('наявний продукт додається за id, без одиниці й ціни', () => {
    const result = toAddItemInput(
      { ...emptyAddItemValues, name: 'молоко', quantity: '2', price: 'не ціна' },
      [product()],
      'UAH',
    );
    expect(result).toEqual({ input: { productId: product().id, quantityMilli: 2000 } });
  });

  it('новий продукт додається за назвою з одиницею й ціною', () => {
    const result = toAddItemInput(
      { name: ' Сир ', quantity: '0,3', unit: 'kg', price: '320' },
      [product()],
      'UAH',
    );
    expect(result).toEqual({
      input: { name: 'Сир', unit: 'kg', price: 32000, quantityMilli: 300 },
    });
  });

  it('показує всі помилки одразу', () => {
    expect(
      toAddItemInput({ name: '', quantity: '0', unit: 'pcs', price: '-1' }, [], 'UAH'),
    ).toEqual({
      errors: {
        name: 'Вкажіть назву до 100 символів',
        quantity: 'Кількість має бути більшою за нуль',
        price: 'Ціна має бути більшою за нуль',
      },
    });
  });
});

describe('itemFormValues / toItemInput', () => {
  it('заповнює форму рядка й розбирає її назад', () => {
    const values = itemFormValues(item(), 'UAH');
    expect(values).toEqual({ quantity: '0,3', expectedPrice: '320,00' });
    expect(toItemInput(values, 'UAH')).toEqual({
      input: { quantityMilli: 300, expectedUnitPrice: 32000 },
    });
  });

  it('порожня очікувана ціна стирає її', () => {
    expect(toItemInput({ quantity: '1', expectedPrice: '' }, 'UAH')).toEqual({
      input: { quantityMilli: 1000, expectedUnitPrice: null },
    });
    expect(toItemInput({ quantity: '', expectedPrice: '0' }, 'UAH')).toEqual({
      errors: { quantity: 'Вкажіть кількість', expectedPrice: 'Ціна має бути більшою за нуль' },
    });
  });
});

describe('deviationLabel', () => {
  it('позначає переплату плюсом, економію мінусом', () => {
    expect(deviationLabel(300, 'UAH')).toMatch(/^\+3,00\s\S+$/);
    expect(deviationLabel(-500, 'UAH')).toMatch(/^−5,00\s\S+$/);
    expect(deviationLabel(0, 'UAH')).toMatch(/^0,00\s\S+$/);
  });
});
