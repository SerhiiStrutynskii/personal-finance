import { describe, expect, it } from 'vitest';
import {
  parseTemplateName,
  replaceWarning,
  templateItemCountLabel,
  templateOptionLabel,
} from './templates.ts';

describe('templateItemCountLabel', () => {
  it('форма слова за числом', () => {
    expect(templateItemCountLabel(1)).toBe('1 позиція');
    expect(templateItemCountLabel(2)).toBe('2 позиції');
    expect(templateItemCountLabel(4)).toBe('4 позиції');
    expect(templateItemCountLabel(5)).toBe('5 позицій');
    expect(templateItemCountLabel(11)).toBe('11 позицій');
    expect(templateItemCountLabel(21)).toBe('21 позиція');
    expect(templateItemCountLabel(0)).toBe('0 позицій');
  });

  it('пункт вибору — назва й кількість', () => {
    expect(templateOptionLabel({ name: 'Будній день', itemCount: 3 })).toBe(
      'Будній день · 3 позиції',
    );
  });
});

describe('replaceWarning', () => {
  it('у порожньому дні попередження немає', () => {
    expect(replaceWarning(0)).toBeUndefined();
  });

  it('у непорожньому — кількість записів, що зникнуть', () => {
    expect(replaceWarning(1)).toBe('Меню дня буде замінено: 1 запис зникне');
    expect(replaceWarning(3)).toBe('Меню дня буде замінено: 3 записи зникнуть');
    expect(replaceWarning(5)).toBe('Меню дня буде замінено: 5 записів зникнуть');
    expect(replaceWarning(21)).toBe('Меню дня буде замінено: 21 запис зникне');
  });
});

describe('parseTemplateName', () => {
  it('обрізає пробіли, 1–100 символів', () => {
    expect(parseTemplateName('  Будній день ')).toEqual({ name: 'Будній день' });
    expect(parseTemplateName('я'.repeat(100))).toEqual({ name: 'я'.repeat(100) });
    for (const raw of ['', '   ', 'я'.repeat(101)]) {
      expect(parseTemplateName(raw)).toEqual({ error: 'Вкажіть назву до 100 символів' });
    }
  });
});
