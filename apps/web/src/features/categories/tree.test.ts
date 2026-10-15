import type { Category } from '@hf/shared';
import { describe, expect, it } from 'vitest';
import { categoryLabel, categoryOptions, categoryTree, parentCandidates } from './tree.ts';

let counter = 0;
const category = (name: string, override: Partial<Category> = {}): Category => ({
  id: `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  name,
  kind: 'expense',
  systemKey: null,
  parentId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...override,
});

const utilities = category('Комунальні');
const water = category('Вода', { parentId: utilities.id });
const gas = category('Газ', { parentId: utilities.id });
const food = category('Продукти');
const fees = category('Відсотки та комісії', { systemKey: 'interest_fees' });
const salary = category('Зарплата', { kind: 'income' });
const all = [gas, food, water, utilities, fees, salary];

describe('categoryTree', () => {
  it('групи за назвою, під кожною — її підкатегорії за назвою', () => {
    const expense = all.filter((item) => item.kind === 'expense');
    expect(categoryTree(expense)).toEqual([
      { category: fees, children: [] },
      { category: utilities, children: [water, gas] },
      { category: food, children: [] },
    ]);
  });

  it('підкатегорія без батька в списку стає верхнім рівнем', () => {
    expect(categoryTree([water])).toEqual([{ category: water, children: [] }]);
  });
});

describe('categoryLabel і categoryOptions', () => {
  it('повна назва підкатегорії містить батька', () => {
    expect(categoryLabel(water, all)).toBe('Комунальні › Вода');
    expect(categoryLabel(food, all)).toBe('Продукти');
  });

  it('у списку вибору підкатегорії йдуть одразу під своєю групою', () => {
    expect(categoryOptions([food, gas, utilities, water]).map((option) => option.label)).toEqual([
      'Комунальні',
      'Комунальні › Вода',
      'Комунальні › Газ',
      'Продукти',
    ]);
  });
});

describe('parentCandidates', () => {
  it('лише звичайні категорії верхнього рівня того самого типу, крім самої категорії', () => {
    expect(parentCandidates(all, 'expense')).toEqual([utilities, food]);
    expect(parentCandidates(all, 'expense', food.id)).toEqual([utilities]);
    expect(parentCandidates(all, 'income')).toEqual([salary]);
  });
});
