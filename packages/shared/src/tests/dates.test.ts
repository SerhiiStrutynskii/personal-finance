import { describe, expect, it } from 'vitest';
import {
  isInPeriod,
  isValidTimeZone,
  localDateKey,
  localMonthKey,
  monthPeriod,
  startOfLocalDay,
} from '../dates.ts';

const KYIV = 'Europe/Kyiv';

describe('localDateKey / localMonthKey', () => {
  it('відносить вечір за UTC до наступного дня в Києві', () => {
    const instant = new Date('2026-01-31T22:30:00Z'); // 00:30 1 лютого за Києвом
    expect(localDateKey(instant, KYIV)).toBe('2026-02-01');
    expect(localMonthKey(instant, KYIV)).toBe('2026-02');
    expect(localDateKey(instant, 'UTC')).toBe('2026-01-31');
    expect(localMonthKey(instant, 'America/New_York')).toBe('2026-01');
  });

  it('північ належить новому дню', () => {
    expect(localDateKey(new Date('2026-06-14T21:00:00Z'), KYIV)).toBe('2026-06-15');
    expect(localDateKey(new Date('2026-06-14T20:59:59Z'), KYIV)).toBe('2026-06-14');
  });
});

describe('startOfLocalDay', () => {
  it('враховує зимовий і літній час', () => {
    expect(startOfLocalDay(2026, 1, 15, KYIV).toISOString()).toBe('2026-01-14T22:00:00.000Z');
    expect(startOfLocalDay(2026, 7, 15, KYIV).toISOString()).toBe('2026-07-14T21:00:00.000Z');
  });

  it('коректний у дні переходу на літній і зимовий час', () => {
    // 29.03.2026 о 03:00 годинники переводять уперед, 25.10.2026 о 04:00 — назад.
    expect(startOfLocalDay(2026, 3, 29, KYIV).toISOString()).toBe('2026-03-28T22:00:00.000Z');
    expect(startOfLocalDay(2026, 3, 30, KYIV).toISOString()).toBe('2026-03-29T21:00:00.000Z');
    expect(startOfLocalDay(2026, 10, 25, KYIV).toISOString()).toBe('2026-10-24T21:00:00.000Z');
    expect(startOfLocalDay(2026, 10, 26, KYIV).toISOString()).toBe('2026-10-25T22:00:00.000Z');
  });

  it('працює для поясів на захід від UTC', () => {
    expect(startOfLocalDay(2026, 1, 1, 'America/New_York').toISOString()).toBe(
      '2026-01-01T05:00:00.000Z',
    );
  });
});

describe('monthPeriod', () => {
  it('повертає півінтервал місяця в поясі користувача', () => {
    const period = monthPeriod(2026, 2, KYIV);
    expect(period.start.toISOString()).toBe('2026-01-31T22:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-02-28T22:00:00.000Z');
  });

  it('грудень закінчується початком наступного року', () => {
    const period = monthPeriod(2026, 12, KYIV);
    expect(period.end.toISOString()).toBe('2026-12-31T22:00:00.000Z');
  });

  it('місяць із переходом DST має коректні межі', () => {
    const march = monthPeriod(2026, 3, KYIV);
    expect(march.start.toISOString()).toBe('2026-02-28T22:00:00.000Z');
    expect(march.end.toISOString()).toBe('2026-03-31T21:00:00.000Z');
  });

  it('сусідні місяці стикуються без проміжків і перетинів', () => {
    for (let month = 1; month < 12; month++) {
      expect(monthPeriod(2026, month, KYIV).end).toEqual(monthPeriod(2026, month + 1, KYIV).start);
    }
  });

  it('узгоджений із localMonthKey на межах', () => {
    const { start, end } = monthPeriod(2026, 3, KYIV);
    expect(localMonthKey(start, KYIV)).toBe('2026-03');
    expect(localMonthKey(new Date(start.getTime() - 1), KYIV)).toBe('2026-02');
    expect(localMonthKey(new Date(end.getTime() - 1), KYIV)).toBe('2026-03');
    expect(localMonthKey(end, KYIV)).toBe('2026-04');
  });
});

describe('isInPeriod', () => {
  const period = monthPeriod(2026, 2, KYIV);

  it('початок включно, кінець виключно', () => {
    expect(isInPeriod(period.start, period)).toBe(true);
    expect(isInPeriod(new Date(period.start.getTime() - 1), period)).toBe(false);
    expect(isInPeriod(new Date(period.end.getTime() - 1), period)).toBe(true);
    expect(isInPeriod(period.end, period)).toBe(false);
  });
});

describe('isValidTimeZone', () => {
  it('розрізняє справжні й вигадані пояси', () => {
    expect(isValidTimeZone('Europe/Kyiv')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
