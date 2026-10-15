import type { Category } from '@hf/shared';
import { describe, expect, it } from 'vitest';
import { limitableCategories } from './limitable.ts';

const category = (id: string, parentId: string | null = null): Category => ({
  id,
  name: id,
  kind: 'expense',
  systemKey: null,
  parentId,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const utilities = category('utilities');
const water = category('water', 'utilities');
const gas = category('gas', 'utilities');
const food = category('food');
const all = [utilities, water, gas, food];
const ids = (items: Category[]) => items.map((item) => item.id);

describe('limitableCategories', () => {
  it('без лімітів доступні всі категорії', () => {
    expect(ids(limitableCategories(all, new Set()))).toEqual(['utilities', 'water', 'gas', 'food']);
  });

  it('ліміт на групу закриває її підкатегорії', () => {
    expect(ids(limitableCategories(all, new Set(['utilities'])))).toEqual(['food']);
  });

  it('ліміт на підкатегорію закриває групу, але не сусідні підкатегорії', () => {
    expect(ids(limitableCategories(all, new Set(['water'])))).toEqual(['gas', 'food']);
  });
});
