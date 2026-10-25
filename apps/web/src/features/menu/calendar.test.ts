import type { MealType, MenuEntry } from '@hf/shared';
import { describe, expect, it } from 'vitest';
import {
  dateForMonth,
  dayRange,
  dayTitle,
  dayTitleWithYear,
  groupDay,
  incompleteDishesLabel,
  monthGrid,
  monthRange,
  parseServingsField,
  selectedDate,
  servingsLabel,
} from './calendar.ts';

describe('monthGrid', () => {
  it('жовтень 2026 починається в четвер: три порожні клітинки, 5 тижнів', () => {
    const weeks = monthGrid('2026-10');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(weeks[4]).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      null,
    ]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });

  it('лютий 2027 (28 днів) починається в понеділок: рівно 4 тижні без порожніх', () => {
    const weeks = monthGrid('2027-02');
    expect(weeks).toHaveLength(4);
    expect(weeks[0]![0]).toBe('2027-02-01');
    expect(weeks[3]![6]).toBe('2027-02-28');
    expect(weeks.flat()).not.toContain(null);
  });

  it('місяць, що починається в неділю (березень 2026): 6 порожніх, 6 тижнів', () => {
    const weeks = monthGrid('2026-03');
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-03-01']);
    expect(weeks[5]).toEqual(['2026-03-30', '2026-03-31', null, null, null, null, null]);
  });

  it('кожен тиждень — 7 клітинок, і високосний лютий має 29 днів', () => {
    const weeks = monthGrid('2028-02');
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean).at(-1)).toBe('2028-02-29');
  });
});

describe('періоди', () => {
  it('місяць — від першого числа до першого числа наступного, зокрема через рік', () => {
    expect(monthRange('2026-10')).toEqual({ from: '2026-10-01', to: '2026-11-01' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });

  it('день — від дати до наступної', () => {
    expect(dayRange('2026-10-26')).toEqual({ from: '2026-10-26', to: '2026-10-27' });
    expect(dayRange('2026-12-31')).toEqual({ from: '2026-12-31', to: '2027-01-01' });
  });
});

describe('вибраний день', () => {
  it('дата з адреси, якщо валідна, інакше сьогодні', () => {
    expect(selectedDate('2026-11-03', '2026-10-25')).toBe('2026-11-03');
    expect(selectedDate(null, '2026-10-25')).toBe('2026-10-25');
    expect(selectedDate('2026-02-30', '2026-10-25')).toBe('2026-10-25');
    expect(selectedDate('abc', '2026-10-25')).toBe('2026-10-25');
  });

  it('після перемикання місяця — сьогодні в поточному місяці, інакше перше число', () => {
    expect(dateForMonth('2026-10', '2026-10-25')).toBe('2026-10-25');
    expect(dateForMonth('2026-11', '2026-10-25')).toBe('2026-11-01');
    expect(dateForMonth('2025-10', '2026-10-25')).toBe('2025-10-01');
  });
});

describe('groupDay', () => {
  const meal = (id: string, position: number): MealType => ({ id, name: id, position });
  const entry = (id: string, mealTypeId: string): MenuEntry => ({
    id,
    date: '2026-10-26',
    mealTypeId,
    dishId: id,
    dishName: id,
    servings: 1,
    portionPrice: 0,
    cost: 0,
    isPriceComplete: true,
    unpricedCount: 0,
  });

  it('прийоми їжі за position, записи — у своїх прийомах, порожні теж є', () => {
    const groups = groupDay(
      [entry('a', 'lunch'), entry('b', 'breakfast'), entry('c', 'lunch')],
      [meal('lunch', 2), meal('dinner', 5), meal('breakfast', 0)],
    );
    expect(groups.map((g) => [g.mealType.id, g.entries.map((e) => e.id)])).toEqual([
      ['breakfast', ['b']],
      ['lunch', ['a', 'c']],
      ['dinner', []],
    ]);
  });
});

describe('підписи', () => {
  it('servingsLabel узгоджує слово з числом', () => {
    expect(servingsLabel(1)).toBe('1 порція');
    expect(servingsLabel(2)).toBe('2 порції');
    expect(servingsLabel(4)).toBe('4 порції');
    expect(servingsLabel(5)).toBe('5 порцій');
    expect(servingsLabel(11)).toBe('11 порцій');
    expect(servingsLabel(12)).toBe('12 порцій');
    expect(servingsLabel(21)).toBe('21 порція');
    expect(servingsLabel(22)).toBe('22 порції');
    expect(servingsLabel(99)).toBe('99 порцій');
  });

  it('incompleteDishesLabel', () => {
    expect(incompleteDishesLabel(1)).toBe('1 страва з неповною ціною');
    expect(incompleteDishesLabel(3)).toBe('3 страви з неповною ціною');
    expect(incompleteDishesLabel(5)).toBe('5 страв з неповною ціною');
  });

  it('дата з днем тижня, з роком і без', () => {
    expect(dayTitle('2026-10-26')).toBe('понеділок, 26 жовтня');
    expect(dayTitleWithYear('2026-10-26')).toBe('понеділок, 26 жовтня 2026');
  });
});

describe('parseServingsField', () => {
  it('ціле від 1 до 99', () => {
    expect(parseServingsField('1')).toBe(1);
    expect(parseServingsField(' 99 ')).toBe(99);
  });

  it('інакше — текст помилки', () => {
    for (const text of ['0', '100', '1,5', '1.5', 'абв', '', '-1', '2e1']) {
      expect(parseServingsField(text)).toBe('Вкажіть ціле число порцій від 1 до 99');
    }
  });
});
