import type { IncomesView } from '@hf/shared';

export type Occurrence = IncomesView['occurrences'][number];
export type OccurrenceStatus = Occurrence['status'];

/** Оформлення рядка за статусом, який порахував бекенд. Фронтенд статус не обчислює. */
export const OCCURRENCE_ROW_CLASS: Record<OccurrenceStatus, string> = {
  received: 'border-status-surplus bg-status-surplus/10',
  partial: 'border-status-partial bg-status-partial/10',
  overdue: 'border-status-over bg-status-over/10',
  pending: 'border-border',
  skipped: 'border-border bg-muted/50',
};
