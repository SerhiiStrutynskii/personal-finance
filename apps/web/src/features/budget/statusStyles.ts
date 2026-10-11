import type { BudgetView } from '@hf/shared';

export type CategoryStatus = BudgetView['expenseLines'][number]['status'];

/** Оформлення рядка за статусом, який порахував бекенд. Фронтенд статус не обчислює. */
export const STATUS_ROW_CLASS: Record<CategoryStatus, string> = {
  over: 'border-status-over bg-status-over/10',
  surplus: 'border-status-surplus bg-status-surplus/10',
  neutral: 'border-border',
};

export const STATUS_BAR_CLASS: Record<CategoryStatus, string> = {
  over: '[&>[data-slot=progress-indicator]]:bg-status-over',
  surplus: '[&>[data-slot=progress-indicator]]:bg-status-surplus',
  neutral: '',
};
