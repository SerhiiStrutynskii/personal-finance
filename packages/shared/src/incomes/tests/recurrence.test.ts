import { describe, expect, it } from 'vitest';
import {
  addDays,
  generateOccurrenceDates,
  isValidDateString,
  isoWeekday,
  previewOccurrenceDates,
  type RecurrenceRule,
} from '../recurrence.ts';

const monthly = (dayOfMonth: number, override: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: 'monthly',
  dayOfMonth,
  startDate: '2026-01-01',
  ...override,
});

describe('monthly', () => {
  it('31-го: останній день у коротших місяцях', () => {
    expect(generateOccurrenceDates(monthly(31), '2026-09-01', '2026-12-01')).toEqual([
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
    ]);
    expect(generateOccurrenceDates(monthly(31), '2026-02-01', '2026-03-01')).toEqual([
      '2026-02-28',
    ]);
    // високосний рік
    expect(generateOccurrenceDates(monthly(31), '2028-02-01', '2028-03-01')).toEqual([
      '2028-02-29',
    ]);
    expect(generateOccurrenceDates(monthly(30), '2027-02-01', '2027-03-01')).toEqual([
      '2027-02-28',
    ]);
  });

  it('період — півінтервал: from включно, to виключно', () => {
    const rule = monthly(5);
    expect(generateOccurrenceDates(rule, '2026-10-05', '2026-11-05')).toEqual(['2026-10-05']);
    expect(generateOccurrenceDates(rule, '2026-10-06', '2026-11-05')).toEqual([]);
    expect(generateOccurrenceDates(rule, '2026-10-01', '2026-10-05')).toEqual([]);
  });

  it('перехід через рік', () => {
    expect(generateOccurrenceDates(monthly(5), '2026-11-01', '2027-03-01')).toEqual([
      '2026-11-05',
      '2026-12-05',
      '2027-01-05',
      '2027-02-05',
    ]);
  });
});

describe('початок і кінець джерела посеред періоду', () => {
  it('перше надходження не раніше за startDate', () => {
    const rule = monthly(5, { startDate: '2026-10-10' });
    expect(generateOccurrenceDates(rule, '2026-10-01', '2026-11-01')).toEqual([]);
    expect(generateOccurrenceDates(rule, '2026-10-01', '2026-12-01')).toEqual(['2026-11-05']);
    // startDate рівно в день надходження — воно входить
    expect(
      generateOccurrenceDates(monthly(5, { startDate: '2026-10-05' }), '2026-10-01', '2026-11-01'),
    ).toEqual(['2026-10-05']);
  });

  it('endDate включно', () => {
    const until = (endDate: string) =>
      generateOccurrenceDates(monthly(5, { endDate }), '2026-10-01', '2027-01-01');
    expect(until('2026-11-05')).toEqual(['2026-10-05', '2026-11-05']);
    expect(until('2026-11-04')).toEqual(['2026-10-05']);
    expect(until('2026-09-30')).toEqual([]);
  });

  it('період до початку або після кінця джерела порожній', () => {
    const rule = monthly(5, { startDate: '2026-06-01', endDate: '2026-08-31' });
    expect(generateOccurrenceDates(rule, '2026-01-01', '2026-06-01')).toEqual([]);
    expect(generateOccurrenceDates(rule, '2026-09-01', '2027-01-01')).toEqual([]);
    expect(generateOccurrenceDates(rule, '2026-01-01', '2027-01-01')).toEqual([
      '2026-06-05',
      '2026-07-05',
      '2026-08-05',
    ]);
  });

  it('порожній або перевернутий період нічого не дає', () => {
    expect(generateOccurrenceDates(monthly(5), '2026-10-05', '2026-10-05')).toEqual([]);
    expect(generateOccurrenceDates(monthly(5), '2026-11-01', '2026-10-01')).toEqual([]);
  });
});

describe('weekly і biweekly', () => {
  // 1 жовтня 2026 — четвер
  const weekly = (override: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
    frequency: 'weekly',
    dayOfWeek: 5,
    startDate: '2026-10-01',
    ...override,
  });

  it('weekly: щотижня у вказаний день, починаючи з першого такого дня від startDate', () => {
    expect(isoWeekday('2026-10-01')).toBe(4);
    expect(generateOccurrenceDates(weekly(), '2026-10-01', '2026-11-01')).toEqual([
      '2026-10-02',
      '2026-10-09',
      '2026-10-16',
      '2026-10-23',
      '2026-10-30',
    ]);
  });

  it('weekly: startDate у потрібний день тижня входить', () => {
    expect(generateOccurrenceDates(weekly({ dayOfWeek: 4 }), '2026-10-01', '2026-10-15')).toEqual([
      '2026-10-01',
      '2026-10-08',
    ]);
  });

  it('biweekly: кожні 14 днів від першого надходження, і в далекому періоді теж', () => {
    const rule = weekly({ frequency: 'biweekly' });
    expect(generateOccurrenceDates(rule, '2026-10-01', '2026-11-15')).toEqual([
      '2026-10-02',
      '2026-10-16',
      '2026-10-30',
      '2026-11-13',
    ]);
    // крок зберігається, навіть якщо період починається посеред циклу
    expect(generateOccurrenceDates(rule, '2026-10-03', '2026-10-31')).toEqual([
      '2026-10-16',
      '2026-10-30',
    ]);
    expect(generateOccurrenceDates(rule, '2027-10-01', '2027-10-31')).toEqual([
      '2027-10-01',
      '2027-10-15',
      '2027-10-29',
    ]);
  });

  it('endDate включно', () => {
    expect(
      generateOccurrenceDates(weekly({ endDate: '2026-10-16' }), '2026-10-01', '2026-11-01'),
    ).toEqual(['2026-10-02', '2026-10-09', '2026-10-16']);
    expect(
      generateOccurrenceDates(weekly({ endDate: '2026-10-15' }), '2026-10-01', '2026-11-01'),
    ).toEqual(['2026-10-02', '2026-10-09']);
  });

  it('неділя — день 7', () => {
    expect(generateOccurrenceDates(weekly({ dayOfWeek: 7 }), '2026-10-01', '2026-10-12')).toEqual([
      '2026-10-04',
      '2026-10-11',
    ]);
  });
});

describe('every_n_months', () => {
  const quarterly = (override: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
    frequency: 'every_n_months',
    intervalMonths: 3,
    dayOfMonth: 15,
    startDate: '2026-01-01',
    ...override,
  });

  it('з інтервалом 3: кожен третій місяць від місяця startDate', () => {
    expect(generateOccurrenceDates(quarterly(), '2026-01-01', '2027-02-01')).toEqual([
      '2026-01-15',
      '2026-04-15',
      '2026-07-15',
      '2026-10-15',
      '2027-01-15',
    ]);
  });

  it('період посеред циклу не збиває крок', () => {
    expect(generateOccurrenceDates(quarterly(), '2026-05-01', '2026-12-01')).toEqual([
      '2026-07-15',
      '2026-10-15',
    ]);
    expect(generateOccurrenceDates(quarterly(), '2026-08-01', '2026-10-01')).toEqual([]);
  });

  it('якщо дата в місяці startDate вже минула, перше надходження — через інтервал', () => {
    expect(
      generateOccurrenceDates(quarterly({ startDate: '2026-01-20' }), '2026-01-01', '2026-08-01'),
    ).toEqual(['2026-04-15', '2026-07-15']);
  });

  it('31-ше число з інтервалом 3 теж обрізається до кінця місяця', () => {
    expect(
      generateOccurrenceDates(
        quarterly({ dayOfMonth: 31, startDate: '2026-02-01' }),
        '2026-02-01',
        '2026-12-01',
      ),
    ).toEqual(['2026-02-28', '2026-05-31', '2026-08-31', '2026-11-30']);
  });
});

describe('допоміжні функції', () => {
  it('previewOccurrenceDates повертає найближчі дати від вказаної включно', () => {
    expect(previewOccurrenceDates(monthly(5), '2026-10-05', 3)).toEqual([
      '2026-10-05',
      '2026-11-05',
      '2026-12-05',
    ]);
    expect(previewOccurrenceDates(monthly(5), '2026-10-06', 3)).toEqual([
      '2026-11-05',
      '2026-12-05',
      '2027-01-05',
    ]);
    expect(previewOccurrenceDates(monthly(5, { endDate: '2026-11-30' }), '2026-10-06', 3)).toEqual([
      '2026-11-05',
    ]);
  });

  it('isValidDateString приймає лише справжні дати', () => {
    expect(isValidDateString('2026-10-05')).toBe(true);
    expect(isValidDateString('2028-02-29')).toBe(true);
    for (const value of [
      '2026-02-30',
      '2026-13-01',
      '2026-1-5',
      '05.10.2026',
      '',
      '2026-10-05T00:00',
    ]) {
      expect(isValidDateString(value)).toBe(false);
    }
  });

  it('addDays переходить через межі місяців і років', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
