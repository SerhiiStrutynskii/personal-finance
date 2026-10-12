// Розрахунки цілей. Усі суми — цілі числа в мінімальних одиницях валюти (копійки);
// місяці — рядки YYYY-MM у часовому поясі домогосподарства.
import { shiftMonth } from '../budget/month.ts';
import { monthlyInterest, type MonthlyRate } from '../debts/calculations.ts';
import type { DateString } from '../incomes/recurrence.ts';

const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));

/** Різниця в місяцях між двома місяцями YYYY-MM; від'ємна, якщо `to` раніше. */
export function monthsBetween(from: string, to: string): number {
  return monthIndex(to) - monthIndex(from);
}

// --- Накопичення ---

export type SavingsState = 'achieved' | 'no_deadline' | 'overdue' | 'on_track' | 'behind';

export interface SavingsProgress {
  saved: number;
  remaining: number;
  /** Частка зібраного: 0,2 — це 20%; не більше 1. */
  progress: number;
  /** Скільки треба відкладати щомісяця, щоб встигнути до дати; null без дати або коли вже пізно чи зібрано. */
  requiredMonthly: number | null;
  /** Темп накопичення на місяць: плановий внесок або середній приріст; null, якщо темпу немає. */
  pace: number | null;
  /** Місяць, у якому ціль буде досягнуто за цього темпу. */
  projectedMonth: string | null;
  state: SavingsState;
}

/**
 * Прогрес цілі накопичення. Зібране — це баланс рахунку цілі (від'ємний баланс рахується як 0).
 * `recentAverage` — середній приріст балансу за три попередні повні місяці.
 */
export function getSavingsProgress(input: {
  targetAmount: number;
  balance: number;
  targetDate: DateString | null;
  monthlyContribution: number | null;
  recentAverage: number;
  today: DateString;
}): SavingsProgress {
  const { targetAmount, targetDate, today } = input;
  const saved = Math.max(0, input.balance);
  const remaining = Math.max(0, targetAmount - saved);
  const progress = Math.min(1, saved / targetAmount);
  const currentMonth = today.slice(0, 7);

  const pace = input.monthlyContribution ?? (input.recentAverage > 0 ? input.recentAverage : null);
  const inTime = targetDate !== null && targetDate >= today;
  const requiredMonthly =
    inTime && remaining > 0
      ? Math.ceil(remaining / Math.max(1, monthsBetween(currentMonth, targetDate.slice(0, 7))))
      : null;
  const projectedMonth =
    remaining > 0 && pace !== null ? shiftMonth(currentMonth, Math.ceil(remaining / pace)) : null;

  let state: SavingsState;
  if (remaining === 0) state = 'achieved';
  else if (targetDate === null) state = 'no_deadline';
  else if (targetDate < today) state = 'overdue';
  else if (pace !== null && requiredMonthly !== null && pace >= requiredMonthly) state = 'on_track';
  else state = 'behind';

  return { saved, remaining, progress, requiredMonthly, pace, projectedMonth, state };
}

// --- Вихід із боргів ---

export type PayoffStrategy = 'avalanche' | 'snowball';

/** Борг у плані погашення. */
export interface PayoffDebt {
  id: string;
  balance: number;
  rate: MonthlyRate;
  /** Річна ставка у відсотках — для порядку «лавини». */
  annualRatePercent: number;
  /** Мінімальний щомісячний платіж. */
  monthlyPayment: number;
  /** false — борг не отримує додаткових грошей понад мінімальний платіж. */
  earlyRepaymentAllowed: boolean;
}

export const MAX_PAYOFF_MONTHS = 600;

export interface PayoffPlan {
  /** Кількість місяців до погашення всіх боргів; null — борги не погашаються. */
  months: number | null;
  debtFreeMonth: string | null;
  /** Скільки відсотків буде сплачено; null, якщо борги не погашаються. */
  totalInterest: number | null;
  /** Борги в порядку погашення з місяцем останнього платежу. */
  payoffOrder: { debtId: string; month: string }[];
  /** Сумарний залишок на кінець кожного місяця. */
  timeline: { month: string; balance: number }[];
}

/** Порядок, у якому борги отримують додаткові гроші. */
function byStrategy(strategy: PayoffStrategy) {
  return (a: PayoffDebt, b: PayoffDebt) =>
    strategy === 'avalanche'
      ? b.annualRatePercent - a.annualRatePercent || a.balance - b.balance
      : a.balance - b.balance || b.annualRatePercent - a.annualRatePercent;
}

/**
 * Помісячна симуляція погашення: відсотки, мінімальні платежі, а потім додаткові гроші
 * (`extra` і мінімальні платежі вже погашених боргів) за порядком стратегії.
 * `rollover: false` — базовий сценарій: кожен борг гаситься лише своїм мінімальним платежем.
 */
export function simulatePayoff(input: {
  debts: readonly PayoffDebt[];
  extra: number;
  strategy: PayoffStrategy;
  /** Місяць першого платежу. */
  firstMonth: string;
  rollover?: boolean;
}): PayoffPlan {
  const rollover = input.rollover ?? true;
  const debts = input.debts.filter((debt) => debt.balance > 0).map((debt) => ({ ...debt }));
  const payoffOrder: PayoffPlan['payoffOrder'] = [];
  const timeline: PayoffPlan['timeline'] = [];
  let totalInterest = 0;
  // Мінімальні платежі погашених боргів, що звільнилися для інших.
  let freed = 0;

  if (debts.length === 0) {
    return { months: 0, debtFreeMonth: null, totalInterest: 0, payoffOrder, timeline };
  }

  for (let step = 0; step < MAX_PAYOFF_MONTHS; step += 1) {
    const month = shiftMonth(input.firstMonth, step);
    const open = debts.filter((debt) => debt.balance > 0);
    let pool = rollover ? input.extra + freed : 0;

    for (const debt of open) {
      const interest = monthlyInterest(debt.balance, debt.rate);
      totalInterest += interest;
      debt.balance += interest;
      debt.balance -= Math.min(debt.monthlyPayment, debt.balance);
    }
    for (const debt of open
      .filter((item) => item.earlyRepaymentAllowed)
      .sort(byStrategy(input.strategy))) {
      if (pool === 0) break;
      const payment = Math.min(pool, debt.balance);
      debt.balance -= payment;
      pool -= payment;
    }
    for (const debt of open) {
      if (debt.balance === 0) {
        payoffOrder.push({ debtId: debt.id, month });
        freed += debt.monthlyPayment;
      }
    }

    const balance = debts.reduce((sum, debt) => sum + debt.balance, 0);
    timeline.push({ month, balance });
    if (balance === 0) {
      return { months: step + 1, debtFreeMonth: month, totalInterest, payoffOrder, timeline };
    }
  }
  return { months: null, debtFreeMonth: null, totalInterest: null, payoffOrder, timeline };
}

/** Чи закінчується план не пізніше за `months` місяців. */
const finishesWithin = (plan: PayoffPlan, months: number) =>
  plan.months !== null && plan.months <= months;

/**
 * Найменший додатковий платіж, з яким борги буде погашено за `monthsAvailable` місяців;
 * null, якщо цього не досягти жодним додатковим платежем (наприклад, борг без дострокового
 * погашення триває довше).
 */
export function requiredExtraPayment(input: {
  debts: readonly PayoffDebt[];
  strategy: PayoffStrategy;
  firstMonth: string;
  monthsAvailable: number;
}): number | null {
  if (input.monthsAvailable < 1) return null;
  const plan = (extra: number) => simulatePayoff({ ...input, extra });
  if (finishesWithin(plan(0), input.monthsAvailable)) return 0;

  // Цієї суми досить, щоб закрити все, що можна гасити достроково, першим же платежем.
  let high = input.debts.reduce(
    (sum, debt) => sum + debt.balance + monthlyInterest(debt.balance, debt.rate),
    0,
  );
  if (!finishesWithin(plan(high), input.monthsAvailable)) return null;

  // Більший додатковий платіж не подовжує план, тому мінімальний шукається двійковим пошуком.
  let low = 0;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (finishesWithin(plan(middle), input.monthsAvailable)) high = middle;
    else low = middle + 1;
  }
  return low;
}

export type DebtGoalState = 'achieved' | 'overdue' | 'on_track' | 'behind';

export interface DebtGoalProgress {
  currentBalance: number;
  paid: number;
  /** Частка погашеного від стартового залишку; не більше 1. */
  progress: number;
  /** Сума мінімальних платежів боргів, що ще мають залишок. */
  minimumPayments: number;
  /** Мінімальні платежі плюс найменший додатковий платіж, щоб встигнути до дати. */
  requiredMonthly: number | null;
  /** Місяць виходу з боргів за додатковим платежем і стратегією цілі. */
  debtFreeMonth: string | null;
  state: DebtGoalState;
}

/** Прогрес цілі виходу з боргів і чи встигає користувач до дати за своїм планом. */
export function getDebtGoalProgress(input: {
  debts: readonly PayoffDebt[];
  startBalance: number;
  targetDate: DateString;
  extraPayment: number;
  strategy: PayoffStrategy;
  today: DateString;
}): DebtGoalProgress {
  const { debts, startBalance, targetDate, strategy, today } = input;
  const currentMonth = today.slice(0, 7);
  const targetMonth = targetDate.slice(0, 7);
  const currentBalance = debts.reduce((sum, debt) => sum + Math.max(0, debt.balance), 0);
  const paid = Math.max(0, startBalance - currentBalance);
  const progress =
    startBalance > 0 ? Math.min(1, paid / startBalance) : currentBalance === 0 ? 1 : 0;
  const minimumPayments = debts
    .filter((debt) => debt.balance > 0)
    .reduce((sum, debt) => sum + debt.monthlyPayment, 0);

  const plan = simulatePayoff({
    debts,
    extra: input.extraPayment,
    strategy,
    firstMonth: currentMonth,
  });
  // Платежі можливі в кожному місяці від поточного до місяця цілі включно.
  const monthsAvailable = monthsBetween(currentMonth, targetMonth) + 1;
  const requiredExtra =
    currentBalance > 0 && targetDate >= today
      ? requiredExtraPayment({ debts, strategy, firstMonth: currentMonth, monthsAvailable })
      : null;

  let state: DebtGoalState;
  if (currentBalance === 0) state = 'achieved';
  else if (targetDate < today) state = 'overdue';
  else if (finishesWithin(plan, monthsAvailable)) state = 'on_track';
  else state = 'behind';

  return {
    currentBalance,
    paid,
    progress,
    minimumPayments,
    requiredMonthly: requiredExtra === null ? null : minimumPayments + requiredExtra,
    debtFreeMonth: plan.debtFreeMonth,
    state,
  };
}

export interface PayoffComparison {
  plan: PayoffPlan;
  /** Лише мінімальні платежі, без додаткових грошей і перенесення звільнених платежів. */
  baseline: Pick<PayoffPlan, 'months' | 'debtFreeMonth' | 'totalInterest'>;
  /** null, якщо базовий сценарій або план не закінчується. */
  interestSaved: number | null;
  monthsSaved: number | null;
}

/** План погашення поруч із базовим сценарієм мінімальних платежів. */
export function comparePayoff(input: {
  debts: readonly PayoffDebt[];
  extra: number;
  strategy: PayoffStrategy;
  firstMonth: string;
}): PayoffComparison {
  const plan = simulatePayoff(input);
  const { months, debtFreeMonth, totalInterest } = simulatePayoff({
    ...input,
    extra: 0,
    rollover: false,
  });
  const comparable = plan.months !== null && months !== null;
  return {
    plan,
    baseline: { months, debtFreeMonth, totalInterest },
    interestSaved: comparable ? totalInterest! - plan.totalInterest! : null,
    monthsSaved: comparable ? months - plan.months! : null,
  };
}
