import { describe, expect, it } from 'vitest';
import { MENU_TABS, legacyShoppingPath, menuTab } from './tabs.ts';

describe('menuTab', () => {
  it('«Планування раціону» — календар і довідники', () => {
    expect(menuTab('/menu')).toBe('planning');
    expect(menuTab('/menu/')).toBe('planning');
    expect(menuTab('/menu/dictionaries')).toBe('planning');
  });

  it('«Покупки» — списки, список, продукти й покупки за меню', () => {
    expect(menuTab('/menu/lists')).toBe('shopping');
    expect(menuTab('/menu/lists/42')).toBe('shopping');
    expect(menuTab('/menu/products')).toBe('shopping');
    expect(menuTab('/menu/shopping')).toBe('shopping');
  });

  it('поза модулем і схожі префікси — без табу', () => {
    expect(menuTab('/')).toBeUndefined();
    expect(menuTab('/shopping')).toBeUndefined();
    expect(menuTab('/menux')).toBeUndefined();
    expect(menuTab('/menu/print/2026-10-26')).toBeUndefined();
    expect(menuTab('/menu/unknown')).toBeUndefined();
  });

  it('два таби: календар і списки покупок', () => {
    expect(MENU_TABS.map((tab) => [tab.title, tab.route])).toEqual([
      ['Планування раціону', '/menu'],
      ['Покупки', '/menu/lists'],
    ]);
  });
});

describe('legacyShoppingPath', () => {
  it('старі адреси покупок ведуть у таб «Покупки» модуля «Меню»', () => {
    expect(legacyShoppingPath('/shopping')).toBe('/menu/lists');
    expect(legacyShoppingPath('/shopping/')).toBe('/menu/lists');
    expect(legacyShoppingPath('/shopping/products')).toBe('/menu/products');
    expect(legacyShoppingPath('/shopping/abc')).toBe('/menu/lists/abc');
    expect(legacyShoppingPath('/shopping/abc/print')).toBe('/menu/lists/abc/print');
  });

  it('переносить query і хеш', () => {
    expect(legacyShoppingPath('/shopping/products', '?archived=1', '#top')).toBe(
      '/menu/products?archived=1#top',
    );
  });

  it('невідомі адреси — undefined', () => {
    expect(legacyShoppingPath('/shopping/abc/edit')).toBeUndefined();
    expect(legacyShoppingPath('/shopping/abc/print/x')).toBeUndefined();
    expect(legacyShoppingPath('/menu/lists')).toBeUndefined();
  });
});
