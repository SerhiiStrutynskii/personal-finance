import { describe, expect, it } from 'vitest';
import { budgetPeriod } from '../month.ts';
import { getAllowedExpenseDateRange, getPeriodState, isExpenseDateAllowed } from '../period.ts';

const KYIV = 'Europe/Kyiv';
// Жовтень 2026 за Києвом: [30.09 21:00 UTC, 31.10 22:00 UTC)
const october = budgetPeriod('2026-10', KYIV);
const state = (now: string) => getPeriodState(october.start, october.end, new Date(now));

describe('getPeriodState', () => {
  it('1-ше число 00:00 за Києвом — уже поточний період', () => {
    expect(state('2026-09-30T21:00:00Z')).toBe('current');
    expect(state('2026-09-30T20:59:59Z')).toBe('future');
  });

  it('31-ше 23:59 за Києвом — ще поточний; 1-ше наступного місяця — вже минулий', () => {
    expect(state('2026-10-31T21:59:59Z')).toBe('current');
    expect(state('2026-10-31T22:00:00Z')).toBe('past');
  });

  it('середина місяця, далеке минуле й майбутнє', () => {
    expect(state('2026-10-15T12:00:00Z')).toBe('current');
    expect(state('2027-01-01T00:00:00Z')).toBe('past');
    expect(state('2026-01-01T00:00:00Z')).toBe('future');
  });
});

describe('getAllowedExpenseDateRange', () => {
  it('від початку поточного місяця в поясі домогосподарства до цієї миті', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    expect(getAllowedExpenseDateRange(now, KYIV)).toEqual({
      start: new Date('2026-09-30T21:00:00Z'),
      end: now,
      minDate: '2026-10-01',
      maxDate: '2026-10-15',
    });
  });

  it('1-ше число 00:00 за Києвом — уже новий період', () => {
    const range = getAllowedExpenseDateRange(new Date('2026-10-31T22:00:00Z'), KYIV);
    expect(range).toMatchObject({
      start: new Date('2026-10-31T22:00:00Z'),
      minDate: '2026-11-01',
      maxDate: '2026-11-01',
    });
  });

  it('31-ше 23:59 за Києвом — ще жовтень', () => {
    const range = getAllowedExpenseDateRange(new Date('2026-10-31T21:59:00Z'), KYIV);
    expect(range).toMatchObject({ minDate: '2026-10-01', maxDate: '2026-10-31' });
  });

  it('межі залежать від часового поясу', () => {
    // 23:30 UTC 31 жовтня: у Києві вже листопад, у Нью-Йорку ще жовтень
    const now = new Date('2026-10-31T23:30:00Z');
    expect(getAllowedExpenseDateRange(now, KYIV).minDate).toBe('2026-11-01');
    expect(getAllowedExpenseDateRange(now, 'America/New_York')).toMatchObject({
      minDate: '2026-10-01',
      maxDate: '2026-10-31',
    });
  });
});

describe('isExpenseDateAllowed', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const allowed = (occurredAt: string) => isExpenseDateAllowed(new Date(occurredAt), now, KYIV);

  it('дозволяє поточний період до цієї миті включно', () => {
    expect(allowed('2026-09-30T21:00:00Z')).toBe(true); // 1 жовтня 00:00 за Києвом
    expect(allowed('2026-10-10T08:00:00Z')).toBe(true);
    expect(allowed('2026-10-15T12:00:00Z')).toBe(true);
  });

  it('минулий місяць недоступний', () => {
    expect(allowed('2026-09-30T20:59:59Z')).toBe(false); // 30 вересня 23:59:59 за Києвом
    expect(allowed('2026-09-15T12:00:00Z')).toBe(false);
  });

  it('майбутня дата в межах місяця недоступна', () => {
    expect(allowed('2026-10-15T12:00:01Z')).toBe(false);
    expect(allowed('2026-10-20T12:00:00Z')).toBe(false);
    expect(allowed('2026-11-01T12:00:00Z')).toBe(false);
  });
});
