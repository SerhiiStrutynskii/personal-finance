import { z } from 'zod';
import { monthPeriod, type Period } from '../dates.ts';

/** Календарний місяць бюджету у форматі YYYY-MM. */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Очікується місяць у форматі YYYY-MM');

function parseMonth(month: string): { year: number; month: number } {
  const [year, monthNumber] = monthSchema.parse(month).split('-').map(Number) as [number, number];
  return { year, month: monthNumber };
}

/** Період місяця [початок, кінець) у вказаному часовому поясі. */
export function budgetPeriod(month: string, timeZone: string): Period {
  const parsed = parseMonth(month);
  return monthPeriod(parsed.year, parsed.month, timeZone);
}

/** Сусідній місяць: shiftMonth('2026-01', -1) = '2025-12'. */
export function shiftMonth(month: string, delta: number): string {
  const parsed = parseMonth(month);
  const index = parsed.year * 12 + (parsed.month - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, '0')}-${String(index - year * 12 + 1).padStart(2, '0')}`;
}
