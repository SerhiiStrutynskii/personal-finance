import { describe, expect, it } from 'vitest';
import { getOccurrenceStatus, summarizeIncomes, type OccurrenceForStatus } from '../status.ts';

const occurrence = (override: Partial<OccurrenceForStatus> = {}): OccurrenceForStatus => ({
  status: 'expected',
  plannedDate: '2026-10-05',
  plannedAmount: 4500000,
  ...override,
});

describe('getOccurrenceStatus', () => {
  it('skipped — незалежно від суми й дати', () => {
    const skipped = occurrence({ status: 'skipped' });
    expect(getOccurrenceStatus(skipped, 0, '2026-10-01')).toBe('skipped');
    expect(getOccurrenceStatus(skipped, 0, '2026-12-01')).toBe('skipped');
    expect(getOccurrenceStatus(skipped, 4500000, '2026-10-05')).toBe('skipped');
  });

  it('received рівно на заплановану суму', () => {
    expect(getOccurrenceStatus(occurrence(), 4500000, '2026-10-05')).toBe('received');
  });

  it('received з переплатою', () => {
    expect(getOccurrenceStatus(occurrence(), 4500001, '2026-10-05')).toBe('received');
    expect(getOccurrenceStatus(occurrence(), 9000000, '2026-12-01')).toBe('received');
  });

  it('partial: отримано менше за план, навіть після планової дати', () => {
    expect(getOccurrenceStatus(occurrence(), 1, '2026-10-01')).toBe('partial');
    expect(getOccurrenceStatus(occurrence(), 4499999, '2026-10-05')).toBe('partial');
    expect(getOccurrenceStatus(occurrence(), 2000000, '2026-11-01')).toBe('partial');
  });

  it('overdue з наступного дня після plannedDate', () => {
    expect(getOccurrenceStatus(occurrence(), 0, '2026-10-06')).toBe('overdue');
    expect(getOccurrenceStatus(occurrence(), 0, '2027-01-01')).toBe('overdue');
  });

  it('pending у день plannedDate і до нього', () => {
    expect(getOccurrenceStatus(occurrence(), 0, '2026-10-05')).toBe('pending');
    expect(getOccurrenceStatus(occurrence(), 0, '2026-10-04')).toBe('pending');
    expect(getOccurrenceStatus(occurrence(), 0, '2025-12-31')).toBe('pending');
  });
});

describe('summarizeIncomes', () => {
  it('рахує підсумок за період', () => {
    const summary = summarizeIncomes(
      [
        { plannedAmount: 4500000, actualAmount: 4500000, status: 'received' },
        { plannedAmount: 1500000, actualAmount: 0, status: 'pending' },
        { plannedAmount: 1000000, actualAmount: 400000, status: 'partial' },
        { plannedAmount: 800000, actualAmount: 0, status: 'overdue' },
        { plannedAmount: 700000, actualAmount: 0, status: 'skipped' },
      ],
      { receivedRecurring: 4900000, oneTimeTotal: 750000 },
    );

    expect(summary).toEqual({
      plannedTotal: 7800000,
      receivedTotal: 5650000,
      receivedRecurring: 4900000,
      oneTimeTotal: 750000,
      expectedRemaining: 2900000,
      counts: { received: 1, partial: 1, pending: 1, overdue: 1, skipped: 1 },
    });
  });

  it('переплата не зменшує те, що ще очікується за іншими надходженнями', () => {
    const summary = summarizeIncomes(
      [
        { plannedAmount: 1000, actualAmount: 5000, status: 'received' },
        { plannedAmount: 2000, actualAmount: 0, status: 'pending' },
      ],
      { receivedRecurring: 5000, oneTimeTotal: 0 },
    );
    expect(summary.expectedRemaining).toBe(2000);
    expect(summary.plannedTotal).toBe(3000);
  });

  it('пропущене надходження не входить ні в план, ні в очікуване', () => {
    const summary = summarizeIncomes(
      [{ plannedAmount: 700000, actualAmount: 0, status: 'skipped' }],
      { receivedRecurring: 0, oneTimeTotal: 0 },
    );
    expect(summary).toMatchObject({ plannedTotal: 0, expectedRemaining: 0 });
    expect(summary.counts.skipped).toBe(1);
  });

  it('без надходжень — лише разові доходи', () => {
    expect(summarizeIncomes([], { receivedRecurring: 0, oneTimeTotal: 750000 })).toEqual({
      plannedTotal: 0,
      receivedTotal: 750000,
      receivedRecurring: 0,
      oneTimeTotal: 750000,
      expectedRemaining: 0,
      counts: { received: 0, partial: 0, pending: 0, overdue: 0, skipped: 0 },
    });
  });
});
