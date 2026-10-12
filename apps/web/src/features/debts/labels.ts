import type { Debt } from '@hf/shared';
import { Banknote, CreditCard, Landmark, ShoppingBag, type LucideIcon } from 'lucide-react';

export type DebtType = Debt['type'];
export type RatePeriod = Debt['ratePeriod'];
export type PaymentStatus = Debt['month']['status'];

export const DEBT_TYPES: DebtType[] = ['credit_card', 'installment', 'mfo_loan', 'bank_loan'];

export const DEBT_TYPE_LABELS: Record<DebtType, string> = {
  credit_card: 'Кредитна картка',
  installment: 'Розстрочка',
  mfo_loan: 'Позика МФО',
  bank_loan: 'Позика банку',
};

export const DEBT_TYPE_ICONS: Record<DebtType, LucideIcon> = {
  credit_card: CreditCard,
  installment: ShoppingBag,
  mfo_loan: Banknote,
  bank_loan: Landmark,
};

export const RATE_PERIODS: RatePeriod[] = ['year', 'month', 'day'];

export const RATE_PERIOD_LABELS: Record<RatePeriod, string> = {
  year: 'річних',
  month: 'на місяць',
  day: 'на день',
};

/** «24,99% річних». */
export function rateText(debt: Pick<Debt, 'interestRate' | 'ratePeriod'>): string {
  return `${String(debt.interestRate).replace('.', ',')}% ${RATE_PERIOD_LABELS[debt.ratePeriod]}`;
}

/** Оформлення рядка за статусом платежу, який порахував бекенд. */
export const PAYMENT_ROW_CLASS: Record<PaymentStatus, string> = {
  paid: 'border-status-surplus bg-status-surplus/10',
  partial: 'border-status-partial bg-status-partial/10',
  due_soon: 'border-status-due-soon bg-status-due-soon/10',
  overdue: 'border-status-over bg-status-over/10',
  pending: 'border-border',
  none: 'border-border',
};

/** «5 місяців», «1 місяць», «2 місяці». */
export function monthsText(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (tens >= 11 && tens <= 14) return `${count} місяців`;
  if (ones === 1) return `${count} місяць`;
  if (ones >= 2 && ones <= 4) return `${count} місяці`;
  return `${count} місяців`;
}
