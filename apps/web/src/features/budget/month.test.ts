import { describe, expect, it } from 'vitest';
import { defaultEntryDate, monthLabel } from './month.ts';

describe('monthLabel', () => {
  it('називає місяць з великої літери без «р.»', () => {
    expect(monthLabel('2026-10')).toBe('Жовтень 2026');
    expect(monthLabel('2027-01')).toBe('Січень 2027');
  });
});

describe('defaultEntryDate', () => {
  const now = new Date('2026-10-11T10:00:00Z');

  it('для поточного місяця — сьогодні в поясі користувача', () => {
    expect(defaultEntryDate('2026-10', now, 'Europe/Kyiv')).toBe('2026-10-11');
  });

  it('для іншого місяця — його перше число', () => {
    expect(defaultEntryDate('2026-09', now, 'Europe/Kyiv')).toBe('2026-09-01');
    expect(defaultEntryDate('2026-11', now, 'Europe/Kyiv')).toBe('2026-11-01');
  });

  it('«поточний місяць» визначається в поясі користувача', () => {
    // 31 жовтня 23:30 UTC — у Києві вже 1 листопада
    const late = new Date('2026-10-31T23:30:00Z');
    expect(defaultEntryDate('2026-11', late, 'Europe/Kyiv')).toBe('2026-11-01');
    expect(defaultEntryDate('2026-10', late, 'Europe/Kyiv')).toBe('2026-10-01');
  });
});
