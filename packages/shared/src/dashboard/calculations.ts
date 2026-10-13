// Списки головної сторінки. Нових розрахунків тут немає: елементи складаються зі статусів,
// які вже порахували борги, доходи, бюджет і цілі.
import { getPlanState, type PlanState } from '../budget/calculations.ts';
import type { PaymentStatus } from '../debts/calculations.ts';
import type { DateString } from '../incomes/recurrence.ts';
import type { OccurrenceStatus } from '../incomes/status.ts';

export type AttentionKind =
  | 'debt_overdue'
  | 'income_overdue'
  | 'budget_over'
  | 'goal_overdue'
  | 'debt_due_soon'
  | 'goal_behind';

/** Порядок видів у списку «Потребує уваги»: найважливіше згори. */
export const ATTENTION_ORDER: readonly AttentionKind[] = [
  'debt_overdue',
  'income_overdue',
  'budget_over',
  'goal_overdue',
  'debt_due_soon',
  'goal_behind',
];

export interface AttentionItem {
  kind: AttentionKind;
  /** Борг, надходження чи ціль; для budget_over — категорія або null (витрати без категорії). */
  id: string | null;
  name: string;
  amount: number | null;
  date: DateString | null;
}

export interface DashboardDebt {
  id: string;
  name: string;
  status: 'active' | 'closed';
  month: { dueDate: DateString; required: number; paid: number; status: PaymentStatus };
}

export interface DashboardOccurrence {
  id: string;
  name: string;
  plannedDate: DateString;
  plannedAmount: number;
  actualAmount: number;
  status: OccurrenceStatus;
}

export interface DashboardGoal {
  id: string;
  name: string;
  status: 'active' | 'archived';
  state: string;
  targetDate: DateString | null;
  requiredMonthly: number | null;
}

export interface DashboardOverspent {
  categoryId: string | null;
  categoryName: string;
  overBy: number;
}

const unpaid = (debt: DashboardDebt) => Math.max(0, debt.month.required - debt.month.paid);
const missing = (occurrence: DashboardOccurrence) =>
  Math.max(0, occurrence.plannedAmount - occurrence.actualAmount);

export interface DebtPaymentsSummary {
  /** Скільки треба сплатити по боргах за місяць. */
  required: number;
  /** Скільки з цього вже сплачено; переплата понад потрібне не рахується. */
  paid: number;
  remaining: number;
}

/** Обов'язкові платежі місяця по активних боргах: сума їхніх платежів і сплаченого з них. */
export function summarizeDebtPayments(debts: readonly DashboardDebt[]): DebtPaymentsSummary {
  const active = debts.filter((debt) => debt.status === 'active');
  const required = active.reduce((sum, debt) => sum + debt.month.required, 0);
  const remaining = active.reduce((sum, debt) => sum + unpaid(debt), 0);
  return { required, paid: required - remaining, remaining };
}

export interface MonthPlan {
  plannedIncome: number;
  plannedExpenses: number | null;
  balance: number | null;
  state: PlanState | null;
}

/** План місяця; без бюджету витрати невідомі, тож різниці й стану немає. */
export function buildMonthPlan(plannedIncome: number, plannedExpenses: number | null): MonthPlan {
  if (plannedExpenses === null) {
    return { plannedIncome, plannedExpenses, balance: null, state: null };
  }
  return {
    plannedIncome,
    plannedExpenses,
    balance: plannedIncome - plannedExpenses,
    state: getPlanState(plannedIncome, plannedExpenses),
  };
}

/** Список «Потребує уваги» з готових статусів боргів, доходів, бюджету й цілей. */
export function buildAttention(input: {
  debts: readonly DashboardDebt[];
  occurrences: readonly DashboardOccurrence[];
  overspent: readonly DashboardOverspent[];
  goals: readonly DashboardGoal[];
}): AttentionItem[] {
  const debts = input.debts.filter((debt) => debt.status === 'active');
  const goals = input.goals.filter((goal) => goal.status === 'active');

  const debtItem = (kind: AttentionKind) => (debt: DashboardDebt) => ({
    kind,
    id: debt.id,
    name: debt.name,
    amount: unpaid(debt),
    date: debt.month.dueDate,
  });
  const goalItem = (kind: AttentionKind, withAmount: boolean) => (goal: DashboardGoal) => ({
    kind,
    id: goal.id,
    name: goal.name,
    amount: withAmount ? goal.requiredMonthly : null,
    date: goal.targetDate,
  });

  const items: AttentionItem[] = [
    ...debts.filter((debt) => debt.month.status === 'overdue').map(debtItem('debt_overdue')),
    ...input.occurrences
      .filter((occurrence) => occurrence.status === 'overdue')
      .map((occurrence) => ({
        kind: 'income_overdue' as const,
        id: occurrence.id,
        name: occurrence.name,
        amount: missing(occurrence),
        date: occurrence.plannedDate,
      })),
    ...input.overspent.map((row) => ({
      kind: 'budget_over' as const,
      id: row.categoryId,
      name: row.categoryName,
      amount: row.overBy,
      date: null,
    })),
    ...goals.filter((goal) => goal.state === 'overdue').map(goalItem('goal_overdue', false)),
    ...debts.filter((debt) => debt.month.status === 'due_soon').map(debtItem('debt_due_soon')),
    ...goals.filter((goal) => goal.state === 'behind').map(goalItem('goal_behind', true)),
  ];

  // У межах виду: з датою — раніша першою, без дати — більша сума першою.
  return items.sort(
    (a, b) =>
      ATTENTION_ORDER.indexOf(a.kind) - ATTENTION_ORDER.indexOf(b.kind) ||
      (a.date ?? '').localeCompare(b.date ?? '') ||
      (b.amount ?? 0) - (a.amount ?? 0) ||
      a.name.localeCompare(b.name, 'uk'),
  );
}

export interface UpcomingItem {
  kind: 'debt_payment' | 'income';
  id: string;
  name: string;
  amount: number;
  date: DateString;
}

const UPCOMING_PAYMENT = new Set<PaymentStatus>(['pending', 'due_soon', 'partial']);
const UPCOMING_INCOME = new Set<OccurrenceStatus>(['pending', 'partial']);

/**
 * Найближчі платежі по боргах і надходження: від сьогодні до кінця поточного місяця.
 * Прострочене сюди не входить — воно в списку «Потребує уваги».
 */
export function buildUpcoming(input: {
  debts: readonly DashboardDebt[];
  occurrences: readonly DashboardOccurrence[];
  today: DateString;
}): UpcomingItem[] {
  const month = input.today.slice(0, 7);
  const inRange = (date: DateString) => date >= input.today && date.slice(0, 7) === month;

  const items: UpcomingItem[] = [
    ...input.debts
      .filter(
        (debt) =>
          debt.status === 'active' &&
          UPCOMING_PAYMENT.has(debt.month.status) &&
          inRange(debt.month.dueDate),
      )
      .map((debt) => ({
        kind: 'debt_payment' as const,
        id: debt.id,
        name: debt.name,
        amount: unpaid(debt),
        date: debt.month.dueDate,
      })),
    ...input.occurrences
      .filter(
        (occurrence) => UPCOMING_INCOME.has(occurrence.status) && inRange(occurrence.plannedDate),
      )
      .map((occurrence) => ({
        kind: 'income' as const,
        id: occurrence.id,
        name: occurrence.name,
        amount: missing(occurrence),
        date: occurrence.plannedDate,
      })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'uk'));
}

/** Чисті активи: рахунки в гривні мінус залишки позик і розстрочок (борг кредитки вже в балансі). */
export function netWorthOf(accountsTotal: number, loanBalances: readonly number[]): number {
  return accountsTotal - loanBalances.reduce((sum, balance) => sum + Math.max(0, balance), 0);
}
