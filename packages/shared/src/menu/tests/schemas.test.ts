import { describe, expect, it } from 'vitest';
import {
  MAX_SERVINGS,
  createMenuEntrySchema,
  menuPeriodQuerySchema,
  servingsSchema,
  updateMenuEntrySchema,
} from '../schemas.ts';

const ok = (from: string, to: string) => menuPeriodQuerySchema.safeParse({ from, to }).success;

describe('menuPeriodQuerySchema', () => {
  it('приймає місяць, день і рівно 62 дні', () => {
    expect(ok('2026-10-01', '2026-11-01')).toBe(true);
    expect(ok('2026-10-26', '2026-10-27')).toBe(true);
    expect(ok('2026-10-01', '2026-12-02')).toBe(true);
  });

  it('відхиляє to ≤ from і період понад 62 дні', () => {
    expect(ok('2026-10-26', '2026-10-26')).toBe(false);
    expect(ok('2026-10-27', '2026-10-26')).toBe(false);
    expect(ok('2026-10-01', '2026-12-03')).toBe(false);
  });

  it('відхиляє невалідні й відсутні дати', () => {
    expect(ok('2026-02-30', '2026-03-01')).toBe(false);
    expect(ok('2026-10-01', '2026-13-01')).toBe(false);
    expect(ok('2026-10-01T00:00:00Z', '2026-11-01')).toBe(false);
    expect(menuPeriodQuerySchema.safeParse({ from: '2026-10-01' }).success).toBe(false);
  });
});

describe('servingsSchema', () => {
  it('ціле від 1 до 99', () => {
    expect(MAX_SERVINGS).toBe(99);
    for (const value of [1, 2, 99]) expect(servingsSchema.safeParse(value).success).toBe(true);
    for (const value of [0, 100, 1.5, -1, '2', null]) {
      expect(servingsSchema.safeParse(value).success).toBe(false);
    }
  });

  it('у новому записі за замовчуванням 1, у зміні — обов’язкове', () => {
    const entry = {
      date: '2026-10-26',
      mealTypeId: '00000000-0000-4000-8000-000000000001',
      dishId: '00000000-0000-4000-8000-000000000002',
    };
    expect(createMenuEntrySchema.parse(entry).servings).toBe(1);
    expect(createMenuEntrySchema.safeParse({ ...entry, date: '2026-13-01' }).success).toBe(false);
    expect(updateMenuEntrySchema.safeParse({}).success).toBe(false);
  });
});
