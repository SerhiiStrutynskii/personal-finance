import { describe, expect, it } from 'vitest';
import {
  parsePeriodKind,
  periodLabel,
  periodRange,
  shiftPeriod,
  unpricedProductsText,
  weekRange,
} from './period.ts';

describe('parsePeriodKind', () => {
  it('день, тиждень і місяць; невідоме чи відсутнє — тиждень', () => {
    expect(parsePeriodKind('day')).toBe('day');
    expect(parsePeriodKind('week')).toBe('week');
    expect(parsePeriodKind('month')).toBe('month');
    for (const param of [null, undefined, '', 'year', 'DAY']) {
      expect(parsePeriodKind(param)).toBe('week');
    }
  });
});

describe('weekRange', () => {
  it('понеділок — початок тижня, to — наступний понеділок', () => {
    expect(weekRange('2026-10-26')).toEqual({ from: '2026-10-26', to: '2026-11-02' });
    expect(weekRange('2026-10-29')).toEqual({ from: '2026-10-26', to: '2026-11-02' });
  });

  it('неділя належить тижню, що почався в понеділок перед нею', () => {
    expect(weekRange('2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-02' });
  });

  it('тиждень через межу місяця й року', () => {
    expect(weekRange('2026-12-31')).toEqual({ from: '2026-12-28', to: '2027-01-04' });
    expect(weekRange('2027-01-03')).toEqual({ from: '2026-12-28', to: '2027-01-04' });
  });
});

describe('periodRange', () => {
  it('день, тиждень і календарний місяць', () => {
    expect(periodRange('day', '2026-10-31')).toEqual({ from: '2026-10-31', to: '2026-11-01' });
    expect(periodRange('week', '2026-10-31')).toEqual({ from: '2026-10-26', to: '2026-11-02' });
    expect(periodRange('month', '2026-10-31')).toEqual({ from: '2026-10-01', to: '2026-11-01' });
    expect(periodRange('month', '2026-12-15')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });
});

describe('shiftPeriod', () => {
  it('день: сусідній день, зокрема через межу року', () => {
    expect(shiftPeriod('day', '2026-10-26', 1)).toBe('2026-10-27');
    expect(shiftPeriod('day', '2027-01-01', -1)).toBe('2026-12-31');
  });

  it('тиждень: понеділок сусіднього тижня з будь-якого дня', () => {
    expect(shiftPeriod('week', '2026-10-29', 1)).toBe('2026-11-02');
    expect(shiftPeriod('week', '2026-11-01', -1)).toBe('2026-10-19');
    expect(shiftPeriod('week', '2026-12-30', 1)).toBe('2027-01-04');
  });

  it('місяць: перше число сусіднього місяця', () => {
    expect(shiftPeriod('month', '2026-10-26', 1)).toBe('2026-11-01');
    expect(shiftPeriod('month', '2026-01-31', -1)).toBe('2025-12-01');
    expect(shiftPeriod('month', '2026-12-05', 1)).toBe('2027-01-01');
  });
});

describe('periodLabel', () => {
  it('день — з днем тижня й роком', () => {
    expect(periodLabel('day', '2026-10-26')).toBe('понеділок, 26 жовтня 2026');
  });

  it('тиждень — пн–нд з роком; рік у кожній даті, якщо роки різні', () => {
    expect(periodLabel('week', '2026-10-28')).toBe('26 жовтня – 1 листопада 2026');
    expect(periodLabel('week', '2026-10-05')).toBe('5 жовтня – 11 жовтня 2026');
    expect(periodLabel('week', '2027-01-02')).toBe('28 грудня 2026 – 3 січня 2027');
  });

  it('місяць — назва місяця з роком', () => {
    expect(periodLabel('month', '2026-10-26')).toBe('жовтень 2026');
    expect(periodLabel('month', '2027-01-01')).toBe('січень 2027');
  });
});

describe('unpricedProductsText', () => {
  it('правильна форма слова', () => {
    expect(unpricedProductsText(1)).toBe('Без ціни: 1 продукт — пораховано як 0');
    expect(unpricedProductsText(2)).toBe('Без ціни: 2 продукти — пораховано як 0');
    expect(unpricedProductsText(5)).toBe('Без ціни: 5 продуктів — пораховано як 0');
    expect(unpricedProductsText(11)).toBe('Без ціни: 11 продуктів — пораховано як 0');
    expect(unpricedProductsText(21)).toBe('Без ціни: 21 продукт — пораховано як 0');
  });
});
