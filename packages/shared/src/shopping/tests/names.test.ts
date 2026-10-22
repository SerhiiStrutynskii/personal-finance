import { describe, expect, it } from 'vitest';
import { compareProductNames, productNameKey } from '../names.ts';

describe('productNameKey', () => {
  it('ігнорує регістр і пробіли по краях, зокрема для кирилиці', () => {
    expect(productNameKey(' МОЛОКО ')).toBe('молоко');
    expect(productNameKey('Їжак ҐЄІ')).toBe('їжак ґєі');
    expect(productNameKey('Молоко')).toBe(productNameKey('молоко'));
  });

  it('розрізняє різні назви', () => {
    expect(productNameKey('Молоко 2,5%')).not.toBe(productNameKey('Молоко 3,2%'));
  });
});

describe('compareProductNames', () => {
  it('сортує за українським алфавітом без урахування регістру', () => {
    const names = ['яблука', 'Хліб', 'ґрунт', 'Гречка', 'банани', 'їжа', 'Ірис'];
    expect([...names].sort(compareProductNames)).toEqual([
      'банани',
      'Гречка',
      'ґрунт',
      'Ірис',
      'їжа',
      'Хліб',
      'яблука',
    ]);
  });
});
