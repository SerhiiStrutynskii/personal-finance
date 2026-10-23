import { describe, expect, it } from 'vitest';
import { currentNavItem } from './navItems.ts';

describe('currentNavItem', () => {
  it('знаходить розділ за шляхом, зокрема для вкладених сторінок', () => {
    expect(currentNavItem('/')?.title).toBe('Головна');
    expect(currentNavItem('/shopping')?.title).toBe('Покупки');
    expect(currentNavItem('/shopping/products')?.title).toBe('Покупки');
    expect(currentNavItem('/debts/42')?.title).toBe('Борги');
  });

  it('не плутає схожі префікси й невідомі сторінки', () => {
    expect(currentNavItem('/goalsx')).toBeUndefined();
    expect(currentNavItem('/unknown')).toBeUndefined();
  });
});
