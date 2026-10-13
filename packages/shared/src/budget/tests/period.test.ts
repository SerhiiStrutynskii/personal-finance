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
  it('верхня межа — ця мить; нижньої немає', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    expect(getAllowedExpenseDateRange(now, KYIV)).toEqual({ end: now, maxDate: '2026-10-15' });
  });

  it('сьогоднішня дата залежить від часового поясу', () => {
    // 23:30 UTC 31 жовтня: у Києві вже 1 листопада, у Нью-Йорку ще 31 жовтня
    const now = new Date('2026-10-31T23:30:00Z');
    expect(getAllowedExpenseDateRange(now, KYIV).maxDate).toBe('2026-11-01');
    expect(getAllowedExpenseDateRange(now, 'America/New_York').maxDate).toBe('2026-10-31');
  });
});

describe('isExpenseDateAllowed', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const allowed = (occurredAt: string, timeZone = KYIV) =>
    isExpenseDateAllowed(new Date(occurredAt), now, timeZone);

  it('дозволяє поточний місяць до цієї миті включно', () => {
    expect(allowed('2026-10-10T08:00:00Z')).toBe(true);
    expect(allowed('2026-10-15T12:00:00Z')).toBe(true);
  });

  it('дозволяє минулі місяці й роки', () => {
    expect(allowed('2026-09-30T20:59:59Z')).toBe(true); // 30 вересня 23:59:59 за Києвом
    expect(allowed('2026-09-15T12:00:00Z')).toBe(true);
    expect(allowed('2024-01-01T00:00:00Z')).toBe(true);
  });

  it('пізніший момент сьогоднішнього дня дозволений: годинник пристрою може випереджати', () => {
    expect(allowed('2026-10-15T12:00:01Z')).toBe(true);
    expect(allowed('2026-10-15T20:59:59Z')).toBe(true); // 15 жовтня 23:59:59 за Києвом
  });

  it('сьогодні рахується в часовому поясі користувача', () => {
    // 21:00 UTC: у Києві вже 16 жовтня, у Нью-Йорку ще 15-те
    expect(allowed('2026-10-15T21:00:00Z')).toBe(false);
    expect(allowed('2026-10-15T21:00:00Z', 'America/New_York')).toBe(true);
  });

  it('майбутня дата недоступна, навіть у межах поточного місяця', () => {
    expect(allowed('2026-10-16T12:00:00Z')).toBe(false);
    expect(allowed('2026-10-20T12:00:00Z')).toBe(false);
    expect(allowed('2026-11-01T12:00:00Z')).toBe(false);
  });
});
