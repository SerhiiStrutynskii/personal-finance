// Розрахунки боргів. Усі суми — цілі числа в мінімальних одиницях валюти (копійки).
// Ставки не є сумами, але множення суми на ставку виконується в цілих числах (BigInt),
// щоб відсотки не залежали від похибок float.
import { shiftMonth } from '../budget/month.ts';
import type { DateString } from '../incomes/recurrence.ts';

export type DebtType = 'credit_card' | 'installment' | 'mfo_loan' | 'bank_loan';
export type RatePeriod = 'year' | 'month' | 'day';

/** Місячна ставка як частка num/den: 3% на місяць — це 3/100. */
export interface MonthlyRate {
  num: bigint;
  den: bigint;
}

/** Ставка зберігається з чотирма знаками після коми; одиниця — 0,0001%. */
const RATE_SCALE = 10_000;
const DAYS_IN_YEAR = 365n;
const MONTHS_IN_YEAR = 12n;

const divRound = (value: bigint, divisor: bigint) => (value * 2n + divisor) / (divisor * 2n);

/**
 * Нормалізує ставку у відсотках (річну, місячну чи денну) в місячну.
 * Денна ставка множиться на середню кількість днів у місяці: 365 / 12.
 */
export function toMonthlyRate(ratePercent: number, period: RatePeriod): MonthlyRate {
  const units = BigInt(Math.round(ratePercent * RATE_SCALE));
  const fraction = BigInt(RATE_SCALE) * 100n;
  if (period === 'month') return { num: units, den: fraction };
  if (period === 'year') return { num: units, den: fraction * MONTHS_IN_YEAR };
  return { num: units * DAYS_IN_YEAR, den: fraction * MONTHS_IN_YEAR };
}

/** Місячна ставка у відсотках, округлена до чотирьох знаків — лише для показу. */
export function monthlyRatePercent(rate: MonthlyRate): number {
  return Number(divRound(rate.num * 100n * BigInt(RATE_SCALE), rate.den)) / RATE_SCALE;
}

/** Річна ставка у відсотках (без капіталізації) — для порівняння боргів між собою. */
export function toAnnualRatePercent(ratePercent: number, period: RatePeriod): number {
  const factor = period === 'year' ? 1 : period === 'month' ? 12 : 365;
  return Math.round(ratePercent * factor * RATE_SCALE) / RATE_SCALE;
}

/** Відсотки за місяць на залишок, округлені до копійки. */
export function monthlyInterest(balance: number, rate: MonthlyRate): number {
  if (balance <= 0) return 0;
  return Number(divRound(BigInt(balance) * rate.num, rate.den));
}

// --- Залишок ---

export interface LoanMovements {
  /** Сума нарахувань (комісії, штрафи, відсотки). */
  charges: number;
  /** Сума частин платежів, що пішли в тіло боргу. */
  principalPaid: number;
  /** Знакова сума звірок. */
  adjustments: number;
}

export type DebtBalanceData = { accountBalance: number } | LoanMovements;

/**
 * Залишок боргу. Єдине місце, де вибирається спосіб обліку: для кредитки це від'ємний баланс
 * рахунку-картки (додатний баланс — власні кошти, борг 0), для позик і розстрочок — записи боргу.
 */
export function getDebtBalance(
  debt: { type: DebtType; initialAmount: number },
  data: DebtBalanceData,
): number {
  if (debt.type === 'credit_card') {
    if (!('accountBalance' in data)) throw new Error('Для кредитки потрібен баланс рахунку');
    return Math.max(0, -data.accountBalance);
  }
  if ('accountBalance' in data) throw new Error('Для позики потрібні записи боргу');
  return Math.max(0, debt.initialAmount + data.charges - data.principalPaid + data.adjustments);
}

// --- Кредитний ліміт ---

export interface CardLimitState {
  /** Скільки ще можна витратити; від'ємне — ліміт перевищено. */
  available: number;
  /** Частка використаного ліміту: 0,468 — це 46,8%. */
  usage: number;
  overLimitBy: number;
  /** Використано 90% ліміту або більше. */
  nearLimit: boolean;
}

export function getCardLimitState(creditLimit: number, balance: number): CardLimitState {
  const available = creditLimit + balance;
  const used = Math.max(0, -balance);
  return {
    available,
    usage: used / creditLimit,
    overLimitBy: Math.max(0, -available),
    // Порівняння в цілих числах: used / creditLimit >= 0,9.
    nearLimit: used * 10 >= creditLimit * 9,
  };
}

// --- Платіж ---

export interface PaymentSplit {
  principalPart: number;
  interestPart: number;
}

/** Пропозиція розбивки платежу: спершу відсотки за місяць, решта — в тіло боргу. */
export function suggestPaymentSplit(
  balance: number,
  rate: MonthlyRate,
  amount: number,
): PaymentSplit {
  const interestPart = Math.min(amount, monthlyInterest(balance, rate));
  return { principalPart: amount - interestPart, interestPart };
}

/** Дата платежу в місяці YYYY-MM; якщо в місяці менше днів — його останній день. */
export function paymentDueDate(month: string, paymentDay: number): DateString {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(paymentDay, daysInMonth)).padStart(2, '0')}`;
}

/** Скільки треба сплатити за місяць: плановий платіж, але не більше за сам борг. */
export function getRequiredPayment(
  monthlyPayment: number,
  balanceAtMonthStart: number,
  chargesInMonth: number,
): number {
  return Math.min(monthlyPayment, Math.max(0, balanceAtMonthStart + chargesInMonth));
}

export type PaymentStatus = 'none' | 'paid' | 'partial' | 'due_soon' | 'pending' | 'overdue';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Кількість днів від `from` до `to`; від'ємна, якщо `to` раніше. */
export function daysBetween(from: DateString, to: DateString): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export const DUE_SOON_DAYS = 3;

/**
 * Статус платежу за місяць. `today` — дата в часовому поясі домогосподарства;
 * у сам день dueDate платіж ще не прострочений.
 */
export function getPaymentStatus(
  required: number,
  paid: number,
  dueDate: DateString,
  today: DateString,
): PaymentStatus {
  if (required === 0) return 'none';
  if (paid >= required) return 'paid';
  if (today > dueDate) return 'overdue';
  if (paid > 0) return 'partial';
  if (daysBetween(today, dueDate) <= DUE_SOON_DAYS) return 'due_soon';
  return 'pending';
}

export interface MonthPayment {
  dueDate: DateString;
  required: number;
  paid: number;
  status: PaymentStatus;
}

/**
 * Платіж боргу за місяць. Якщо борг почався після дати платежу цього місяця (або пізніше),
 * перший платіж — наступного місяця, тож у цьому платити нічого.
 */
export function getMonthPayment(input: {
  month: string;
  paymentDay: number;
  startDate: DateString;
  monthlyPayment: number;
  balanceAtMonthStart: number;
  chargesInMonth: number;
  paid: number;
  today: DateString;
}): MonthPayment {
  const dueDate = paymentDueDate(input.month, input.paymentDay);
  const required =
    input.startDate > dueDate
      ? 0
      : getRequiredPayment(input.monthlyPayment, input.balanceAtMonthStart, input.chargesInMonth);
  return {
    dueDate,
    required,
    paid: input.paid,
    status: getPaymentStatus(required, input.paid, dueDate, input.today),
  };
}

/** Платіж достроковий, якщо разом із ним за місяць сплачено більше, ніж потрібно. */
export function isEarlyPayment(required: number, paidBefore: number, amount: number): boolean {
  return paidBefore + amount > required;
}

// --- Прогноз ---

export const MAX_PROJECTION_MONTHS = 600;

export interface PayoffProjection {
  /** Кількість платежів до погашення; null — борг не погашається. */
  months: number | null;
  /** Дата останнього платежу; null, якщо боргу немає або він не погашається. */
  payoffDate: DateString | null;
  /** Скільки відсотків ще буде сплачено; null, якщо борг не погашається. */
  totalInterest: number | null;
  /** false — платіж не перевищує відсотків за місяць, борг не зменшується. */
  paymentCoversInterest: boolean;
}

/** Дата n-го платежу, рахуючи від місяця першого платежу (n від 1). */
function nthDueDate(firstDueDate: DateString, paymentDay: number, n: number): DateString {
  return paymentDueDate(shiftMonth(firstDueDate.slice(0, 7), n - 1), paymentDay);
}

/** Скільки місяців потрібно, щоб погасити борг; null — понад межу симуляції. */
function simulate(balance: number, rate: MonthlyRate, monthlyPayment: number) {
  let rest = balance;
  let totalInterest = 0;
  for (let months = 1; months <= MAX_PROJECTION_MONTHS; months += 1) {
    const interest = monthlyInterest(rest, rate);
    totalInterest += interest;
    rest = rest + interest - Math.min(monthlyPayment, rest + interest);
    if (rest === 0) return { months, totalInterest };
  }
  return null;
}

/**
 * Помісячна симуляція погашення: щомісяця нараховуються відсотки й вноситься плановий платіж.
 * `firstDueDate` — дата найближчого ще не внесеного платежу.
 */
export function projectPayoff(input: {
  balance: number;
  rate: MonthlyRate;
  monthlyPayment: number;
  firstDueDate: DateString;
  paymentDay: number;
}): PayoffProjection {
  const { balance, rate, monthlyPayment } = input;
  if (balance <= 0) {
    return { months: 0, payoffDate: null, totalInterest: 0, paymentCoversInterest: true };
  }
  const never = { months: null, payoffDate: null, totalInterest: null };
  if (monthlyPayment <= monthlyInterest(balance, rate)) {
    return { ...never, paymentCoversInterest: false };
  }
  const result = simulate(balance, rate, monthlyPayment);
  if (!result) return { ...never, paymentCoversInterest: true };
  return {
    months: result.months,
    payoffDate: nthDueDate(input.firstDueDate, input.paymentDay, result.months),
    totalInterest: result.totalInterest,
    paymentCoversInterest: true,
  };
}

/**
 * Мінімальний щомісячний платіж, з яким борг буде погашено до maturityDate.
 * Якщо до строку не лишилося жодної дати платежу, потрібно сплатити все одним платежем.
 */
export function requiredPaymentForMaturity(input: {
  balance: number;
  rate: MonthlyRate;
  firstDueDate: DateString;
  paymentDay: number;
  maturityDate: DateString;
}): number {
  const { balance, rate } = input;
  if (balance <= 0) return 0;
  let payments = 0;
  while (
    payments < MAX_PROJECTION_MONTHS &&
    nthDueDate(input.firstDueDate, input.paymentDay, payments + 1) <= input.maturityDate
  ) {
    payments += 1;
  }
  const single = balance + monthlyInterest(balance, rate);
  if (payments <= 1) return single;

  // Більший платіж погашає борг не пізніше, тому мінімальний шукається двійковим пошуком.
  let low = Math.ceil(balance / payments);
  let high = single;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const result = simulate(balance, rate, middle);
    if (result && result.months <= payments) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** Найближча ще не внесена дата платежу: цього місяця, якщо він не сплачений, інакше наступного. */
export function nextDueDate(month: string, paymentDay: number, payment: MonthPayment): DateString {
  const unpaid = payment.required > 0 && payment.paid < payment.required;
  return unpaid ? payment.dueDate : paymentDueDate(shiftMonth(month, 1), paymentDay);
}

/** Чи буде борг погашено до кінцевого строку за прогнозом. */
export function missesMaturity(
  projection: PayoffProjection,
  maturityDate: DateString | null,
  balance: number,
): boolean {
  if (!maturityDate || balance <= 0) return false;
  return projection.payoffDate === null || projection.payoffDate > maturityDate;
}

// --- Огляд ---

export interface DebtForSummary {
  type: DebtType;
  status: 'active' | 'closed';
  balance: number;
  monthlyPayment: number;
  annualRatePercent: number;
  month: Pick<MonthPayment, 'required' | 'paid' | 'status'>;
  payoffDate: DateString | null;
  /** Доступні кошти кредитки; для інших типів — null. */
  cardAvailable: number | null;
}

export interface DebtsSummary {
  totalBalance: number;
  totalMonthlyPayments: number;
  /** Середня річна ставка, зважена за залишком; null, якщо боргів немає. */
  weightedAnnualRate: number | null;
  dueThisMonth: number;
  /** Найпізніша прогнозована дата погашення; null, якщо якийсь борг не погашається або боргів немає. */
  debtFreeDate: DateString | null;
  totalCreditAvailable: number;
}

export function summarizeDebts(debts: readonly DebtForSummary[]): DebtsSummary {
  const active = debts.filter((debt) => debt.status === 'active');
  const owing = active.filter((debt) => debt.balance > 0);
  const totalBalance = owing.reduce((sum, debt) => sum + debt.balance, 0);

  // Зважена сума рахується в цілих числах: ставка в одиницях 0,0001%.
  const weighted = owing.reduce(
    (sum, debt) =>
      sum + BigInt(debt.balance) * BigInt(Math.round(debt.annualRatePercent * RATE_SCALE)),
    0n,
  );
  const unpaid = new Set<PaymentStatus>(['pending', 'due_soon', 'partial', 'overdue']);
  const everyPaysOff = owing.every((debt) => debt.payoffDate !== null);

  return {
    totalBalance,
    totalMonthlyPayments: owing.reduce((sum, debt) => sum + debt.monthlyPayment, 0),
    weightedAnnualRate:
      totalBalance > 0
        ? // округлення до сотих відсотка
          Number(divRound(weighted, BigInt(totalBalance) * 100n)) / 100
        : null,
    dueThisMonth: active
      .filter((debt) => unpaid.has(debt.month.status))
      .reduce((sum, debt) => sum + Math.max(0, debt.month.required - debt.month.paid), 0),
    debtFreeDate:
      owing.length > 0 && everyPaysOff
        ? owing.map((debt) => debt.payoffDate!).reduce((a, b) => (a > b ? a : b))
        : null,
    totalCreditAvailable: active.reduce(
      (sum, debt) => sum + Math.max(0, debt.cardAvailable ?? 0),
      0,
    ),
  };
}
