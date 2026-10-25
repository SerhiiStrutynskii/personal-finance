import { describe, expect, it } from 'vitest';
import { currentNavItem, navItems } from './navItems.ts';

describe('currentNavItem', () => {
  it('знаходить розділ за шляхом, зокрема для вкладених сторінок', () => {
    expect(currentNavItem('/')?.title).toBe('Головна');
    expect(currentNavItem('/shopping')?.title).toBe('Покупки');
    expect(currentNavItem('/shopping/products')?.title).toBe('Покупки');
    expect(currentNavItem('/debts/42')?.title).toBe('Борги');
    expect(currentNavItem('/menu')?.title).toBe('Меню');
    expect(currentNavItem('/menu/shopping')?.title).toBe('Меню');
  });

  it('не плутає схожі префікси й невідомі сторінки', () => {
    expect(currentNavItem('/goalsx')).toBeUndefined();
    expect(currentNavItem('/unknown')).toBeUndefined();
  });

  it('«Меню» йде одразу після «Покупки»', () => {
    const titles = navItems.map((item) => item.title);
    expect(titles[titles.indexOf('Покупки') + 1]).toBe('Меню');
    expect(navItems.find((item) => item.title === 'Меню')?.route).toBe('/menu');
  });
});
