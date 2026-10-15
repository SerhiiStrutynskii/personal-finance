import type { DateString } from './recurrence.ts';

/** Збережений стан надходження: skipped — користувач позначив, що цього разу прибутку не буде. */
export type OccurrenceStoredStatus = 'expected' | 'skipped';

/** Стан отримання, який показується індикатором. */
export type OccurrenceStatus = 'received' | 'partial' | 'pending' | 'overdue' | 'skipped';

export interface OccurrenceForStatus {
  status: OccurrenceStoredStatus;
  plannedDate: DateString;
  plannedAmount: number;
}

/**
 * Статус отримання надходження. `today` — поточна дата в часовому поясі домогосподарства;
 * у сам день plannedDate надходження ще не прострочене.
 */
export function getOccurrenceStatus(
  occurrence: OccurrenceForStatus,
  actualAmount: number,
  today: DateString,
): OccurrenceStatus {
  if (occurrence.status === 'skipped') return 'skipped';
  if (actualAmount >= occurrence.plannedAmount) return 'received';
  if (actualAmount > 0) return 'partial';
  if (today > occurrence.plannedDate) return 'overdue';
  return 'pending';
}

export interface OccurrenceForSummary {
  plannedAmount: number;
  actualAmount: number;
  status: OccurrenceStatus;
}

export interface IncomeSummary {
  /** Сума запланованих надходжень періоду, крім пропущених. */
  plannedTotal: number;
  /** Усі прибутки з датою в періоді: періодичні й разові. */
  receivedTotal: number;
  receivedRecurring: number;
  oneTimeTotal: number;
  /** Скільки ще очікується за неотриманими й частково отриманими надходженнями. */
  expectedRemaining: number;
  counts: Record<OccurrenceStatus, number>;
}

/**
 * Підсумок прибутків за період. Надходження належать до періоду за plannedDate, а фактичні суми
 * (`receivedRecurring`, `oneTimeTotal`) — за датою транзакцій, тому передаються окремо:
 * зарплата за жовтень, що прийшла 1 листопада, отримана в жовтневому надходженні,
 * але гроші рахуються в листопаді.
 */
export function summarizeIncomes(
  occurrences: readonly OccurrenceForSummary[],
  received: { receivedRecurring: number; oneTimeTotal: number },
): IncomeSummary {
  const counts: Record<OccurrenceStatus, number> = {
    received: 0,
    partial: 0,
    pending: 0,
    overdue: 0,
    skipped: 0,
  };
  let plannedTotal = 0;
  let expectedRemaining = 0;

  for (const occurrence of occurrences) {
    counts[occurrence.status] += 1;
    if (occurrence.status === 'skipped') continue;
    plannedTotal += occurrence.plannedAmount;
    if (occurrence.status !== 'received') {
      expectedRemaining += Math.max(0, occurrence.plannedAmount - occurrence.actualAmount);
    }
  }

  return {
    plannedTotal,
    receivedTotal: received.receivedRecurring + received.oneTimeTotal,
    receivedRecurring: received.receivedRecurring,
    oneTimeTotal: received.oneTimeTotal,
    expectedRemaining,
    counts,
  };
}
