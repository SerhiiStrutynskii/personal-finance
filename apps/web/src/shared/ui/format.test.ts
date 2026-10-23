import { describe, expect, it } from 'vitest';
import { formatShortDate } from './format.ts';

describe('formatShortDate', () => {
  const now = new Date('2026-10-23T12:00:00Z');

  it('показує день і місяць у часовому поясі користувача', () => {
    expect(formatShortDate('2026-10-05T10:00:00Z', 'Europe/Kyiv', now)).toBe('05.10');
    // 31 жовтня 23:30 UTC у Києві вже 1 листопада.
    expect(formatShortDate('2026-10-31T23:30:00Z', 'Europe/Kyiv', now)).toBe('01.11');
  });

  it('додає рік, якщо він не поточний', () => {
    expect(formatShortDate('2025-12-30T10:00:00Z', 'Europe/Kyiv', now)).toBe('30.12.2025');
  });
});
