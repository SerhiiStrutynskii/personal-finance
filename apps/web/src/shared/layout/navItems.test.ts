import { describe, expect, it } from 'vitest';
import { currentNavItem, navItems } from './navItems.ts';

describe('currentNavItem', () => {
  it('знаходить розділ за шляхом, зокрема для вкладених сторінок', () => {
    expect(currentNavItem('/')?.title).toBe('Головна');
    expect(currentNavItem('/debts/42')?.title).toBe('Борги');
    expect(currentNavItem('/menu')?.title).toBe('Меню');
    expect(currentNavItem('/menu/shopping')?.title).toBe('Меню');
    expect(currentNavItem('/menu/dictionaries')?.title).toBe('Меню');
    expect(currentNavItem('/menu/lists')?.title).toBe('Меню');
    expect(currentNavItem('/menu/lists/42')?.title).toBe('Меню');
    expect(currentNavItem('/menu/products')?.title).toBe('Меню');
  });

  it('не плутає схожі префікси й невідомі сторінки', () => {
    expect(currentNavItem('/goalsx')).toBeUndefined();
    expect(currentNavItem('/unknown')).toBeUndefined();
  });

  it('окремого пункту «Покупки» немає: покупки — таб модуля «Меню»', () => {
    const titles = navItems.map((item) => item.title);
    expect(titles).not.toContain('Покупки');
    expect(navItems.some((item) => item.route.startsWith('/shopping'))).toBe(false);
    expect(titles[titles.indexOf('Цілі') + 1]).toBe('Меню');
    expect(navItems.find((item) => item.title === 'Меню')?.route).toBe('/menu');
  });
});
