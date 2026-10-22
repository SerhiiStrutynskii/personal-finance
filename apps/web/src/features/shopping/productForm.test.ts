import { describe, expect, it } from 'vitest';
import {
  formatUnitPrice,
  parseUnitPrice,
  productFormValues,
  toProductInput,
} from './productForm.ts';

describe('parseUnitPrice', () => {
  it('порожнє поле — ціна невідома', () => {
    expect(parseUnitPrice('', 'UAH')).toBeNull();
    expect(parseUnitPrice('   ', 'UAH')).toBeNull();
  });

  it('розбирає ціну в копійки', () => {
    expect(parseUnitPrice('42,50', 'UAH')).toBe(4250);
    expect(parseUnitPrice('42.5', 'UAH')).toBe(4250);
    expect(parseUnitPrice('0,01', 'UAH')).toBe(1);
  });

  it('відхиляє нуль, відʼємні й некоректні значення', () => {
    expect(parseUnitPrice('0', 'UAH')).toBe('Ціна має бути більшою за нуль');
    expect(parseUnitPrice('-5', 'UAH')).toBe('Ціна має бути більшою за нуль');
    expect(parseUnitPrice('abc', 'UAH')).toBe('Некоректна ціна, приклад: 42,50');
  });
});

describe('toProductInput', () => {
  it('збирає дані для API', () => {
    expect(toProductInput({ name: ' Молоко ', unit: 'l', price: '42,50' }, 'UAH')).toEqual({
      input: { name: 'Молоко', unit: 'l', price: 4250 },
    });
    expect(toProductInput({ name: 'Хліб', unit: 'pcs', price: '' }, 'UAH')).toEqual({
      input: { name: 'Хліб', unit: 'pcs', price: null },
    });
  });

  it('повертає помилки полів', () => {
    expect(toProductInput({ name: ' ', unit: 'pcs', price: '' }, 'UAH')).toEqual({
      errors: { name: 'Вкажіть назву до 100 символів' },
    });
    expect(toProductInput({ name: ' ', unit: 'pcs', price: 'x' }, 'UAH')).toEqual({
      errors: { name: 'Вкажіть назву до 100 символів', price: 'Некоректна ціна, приклад: 42,50' },
    });
  });
});

describe('productFormValues і formatUnitPrice', () => {
  const product = {
    id: '00000000-0000-4000-8000-000000000000',
    name: 'Сир',
    unit: 'kg' as const,
    price: 38990,
    currency: 'UAH',
    createdAt: '2026-10-01T00:00:00Z',
  };

  it('заповнює форму наявним продуктом', () => {
    expect(productFormValues(product)).toEqual({ name: 'Сир', unit: 'kg', price: '389,90' });
    expect(productFormValues()).toEqual({ name: '', unit: 'pcs', price: '' });
  });

  it('показує ціну за одиницю', () => {
    expect(formatUnitPrice(product)).toMatch(/^389,90\s\S+ \/ кг$/);
    expect(formatUnitPrice({ ...product, price: null })).toBe('—');
  });
});
