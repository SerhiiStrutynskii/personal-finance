import {
  createDebtSchema,
  getMonthPayment,
  interestRateSchema,
  isValidDateString,
  missesMaturity,
  nextDueDate,
  projectPayoff,
  requiredPaymentForMaturity,
  shiftMonth,
  toMonthlyRate,
  updateDebtSchema,
  type Debt,
  type DebtProjection,
  type UpdateDebtInput,
} from '@hf/shared';
import { parsePlannedAmount, plannedAmountText } from '../budget/plannedAmount.ts';
import type { CreateDebtBody } from './api.ts';
import type { DebtType, RatePeriod } from './labels.ts';

/** Значення «створити новий рахунок-картку» у виборі рахунку кредитки. */
export const NEW_CARD_ACCOUNT = '';

/** Значення «перший платіж — найближчий за графіком» у виборі місяця першого платежу. */
export const FIRST_PAYMENT_BY_SCHEDULE = '';

/** Скільки місяців наперед можна вибрати для першого платежу. */
const FIRST_PAYMENT_MONTHS_AHEAD = 12;

/**
 * Місяці для вибору першого платежу: від поточного на рік уперед. Уже збережений місяць
 * лишається у списку, навіть якщо він минув.
 */
export function firstPaymentMonths(today: string, selected: string): string[] {
  const current = today.slice(0, 7);
  const months = Array.from({ length: FIRST_PAYMENT_MONTHS_AHEAD + 1 }, (_, index) =>
    shiftMonth(current, index),
  );
  if (selected !== FIRST_PAYMENT_BY_SCHEDULE && !months.includes(selected)) months.push(selected);
  return months.sort();
}

export interface DebtFormValues {
  name: string;
  description: string;
  type: DebtType;
  initialAmount: string;
  startDate: string;
  maturityDate: string;
  interestRate: string;
  ratePeriod: RatePeriod;
  monthlyPayment: string;
  paymentDay: string;
  /** Місяць першого платежу (YYYY-MM) або FIRST_PAYMENT_BY_SCHEDULE. */
  firstPaymentMonth: string;
  earlyRepaymentAllowed: boolean;
  defaultAccountId: string;
  creditLimit: string;
  /** Наявний рахунок, що стане карткою, або NEW_CARD_ACCOUNT. */
  cardAccountId: string;
}

export type DebtFormErrors = Partial<Record<keyof DebtFormValues, string>>;

/** Типові значення за типом боргу — лише підказки, усе редагується. */
const TYPE_DEFAULTS: Record<DebtType, Pick<DebtFormValues, 'ratePeriod' | 'interestRate'>> = {
  credit_card: { ratePeriod: 'year', interestRate: '' },
  installment: { ratePeriod: 'year', interestRate: '0' },
  mfo_loan: { ratePeriod: 'day', interestRate: '' },
  bank_loan: { ratePeriod: 'year', interestRate: '' },
};

const CURRENCY = 'UAH';
const rateText = (rate: number) => String(rate).replace('.', ',');

export function initialDebtValues(today: string, original?: Debt): DebtFormValues {
  if (original) {
    return {
      name: original.name,
      description: original.description ?? '',
      type: original.type,
      initialAmount: plannedAmountText(original.initialAmount, CURRENCY),
      startDate: original.startDate,
      maturityDate: original.maturityDate ?? '',
      interestRate: rateText(original.interestRate),
      ratePeriod: original.ratePeriod,
      monthlyPayment: plannedAmountText(original.monthlyPayment, CURRENCY),
      paymentDay: String(original.paymentDay),
      firstPaymentMonth: original.firstPaymentMonth ?? FIRST_PAYMENT_BY_SCHEDULE,
      earlyRepaymentAllowed: original.earlyRepaymentAllowed,
      defaultAccountId: original.defaultAccountId ?? '',
      creditLimit: original.card ? plannedAmountText(original.card.creditLimit, CURRENCY) : '',
      cardAccountId: NEW_CARD_ACCOUNT,
    };
  }
  return {
    name: '',
    description: '',
    type: 'bank_loan',
    initialAmount: '',
    startDate: today,
    maturityDate: '',
    monthlyPayment: '',
    paymentDay: today.slice(8, 10).replace(/^0/, ''),
    firstPaymentMonth: FIRST_PAYMENT_BY_SCHEDULE,
    earlyRepaymentAllowed: true,
    defaultAccountId: '',
    creditLimit: '',
    cardAccountId: NEW_CARD_ACCOUNT,
    ...TYPE_DEFAULTS.bank_loan,
  };
}

/** Зміна типу підставляє типові ставку й період, решту полів не чіпає. */
export function withType(values: DebtFormValues, type: DebtType): DebtFormValues {
  return { ...values, type, ...TYPE_DEFAULTS[type] };
}

function parseRate(text: string): number | string {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '') return 'Вкажіть ставку';
  if (!/^\d+(\.\d+)?$/.test(normalized)) return 'Некоректна ставка, приклад: 24,99';
  const rate = Number(normalized);
  return interestRateSchema.safeParse(rate).success
    ? rate
    : 'Ставка: до чотирьох знаків після коми';
}

function parsePositiveAmount(text: string): number | string {
  const amount = parsePlannedAmount(text, CURRENCY);
  return amount === 0 ? 'Сума має бути більшою за нуль' : amount;
}

function parsePaymentDay(text: string): number | string {
  const day = Number(text.trim());
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : 'День від 1 до 31';
}

interface ParsedConditions {
  interestRate: number;
  monthlyPayment: number;
  paymentDay: number;
  creditLimit: number | null;
}

/** Розбирає числові поля умов; помилки складає в `errors`. */
function parseConditions(values: DebtFormValues, errors: DebtFormErrors): ParsedConditions | null {
  const isCard = values.type === 'credit_card';
  const interestRate = parseRate(values.interestRate);
  const monthlyPayment = parsePositiveAmount(values.monthlyPayment);
  const paymentDay = parsePaymentDay(values.paymentDay);
  const creditLimit = isCard ? parsePositiveAmount(values.creditLimit) : null;

  if (typeof interestRate === 'string') errors.interestRate = interestRate;
  if (typeof monthlyPayment === 'string') errors.monthlyPayment = monthlyPayment;
  if (typeof paymentDay === 'string') errors.paymentDay = paymentDay;
  if (typeof creditLimit === 'string') errors.creditLimit = creditLimit;

  if (
    typeof interestRate === 'string' ||
    typeof monthlyPayment === 'string' ||
    typeof paymentDay === 'string' ||
    typeof creditLimit === 'string'
  ) {
    return null;
  }
  return { interestRate, monthlyPayment, paymentDay, creditLimit };
}

function validateShared(values: DebtFormValues, startDate: string, errors: DebtFormErrors) {
  const isCard = values.type === 'credit_card';
  if (values.name.trim() === '') errors.name = 'Вкажіть назву';
  else if (values.name.trim().length > 100) errors.name = 'Назва задовга (до 100 символів)';
  if (values.description.trim().length > 1000) errors.description = 'Опис задовгий';

  if (values.maturityDate === '') {
    if (!isCard) errors.maturityDate = 'Вкажіть дату, до якої виданий борг';
  } else if (!isValidDateString(values.maturityDate)) {
    errors.maturityDate = 'Некоректна дата';
  } else if (values.maturityDate <= startDate) {
    errors.maturityDate = 'Строк має бути пізніше за дату початку';
  }
  if (values.firstPaymentMonth && values.firstPaymentMonth < startDate.slice(0, 7)) {
    errors.firstPaymentMonth = 'Перший платіж не може бути раніше за місяць початку';
  }
}

type Result<T> = { ok: true; input: T } | { ok: false; errors: DebtFormErrors };

/** Тіло запиту на створення боргу або помилки по полях. */
export function toCreateInput(values: DebtFormValues, today: string): Result<CreateDebtBody> {
  const errors: DebtFormErrors = {};
  const isCard = values.type === 'credit_card';
  const bindsAccount = isCard && values.cardAccountId !== NEW_CARD_ACCOUNT;

  validateShared(values, values.startDate, errors);
  if (!isValidDateString(values.startDate)) errors.startDate = 'Вкажіть дату';
  else if (values.startDate > today) errors.startDate = 'Дата не може бути в майбутньому';

  // Борг прив'язаної картки — її поточний баланс, тож початкова сума не вводиться.
  const initialAmount = bindsAccount ? 0 : parsePlannedAmount(values.initialAmount, CURRENCY);
  if (typeof initialAmount === 'string') errors.initialAmount = initialAmount;
  const conditions = parseConditions(values, errors);

  if (Object.keys(errors).length > 0 || !conditions || typeof initialAmount !== 'number') {
    return { ok: false, errors };
  }

  const input: CreateDebtBody = {
    name: values.name.trim(),
    description: values.description.trim() || null,
    type: values.type,
    initialAmount,
    startDate: values.startDate,
    maturityDate: values.maturityDate || null,
    interestRate: conditions.interestRate,
    ratePeriod: values.ratePeriod,
    monthlyPayment: conditions.monthlyPayment,
    paymentDay: conditions.paymentDay,
    firstPaymentMonth: values.firstPaymentMonth || null,
    earlyRepaymentAllowed: isCard ? true : values.earlyRepaymentAllowed,
    defaultAccountId: values.defaultAccountId || null,
    creditLimit: conditions.creditLimit,
    existingAccountId: bindsAccount ? values.cardAccountId : null,
  };
  // Остаточну перевірку робить та сама схема, що й на бекенді.
  const parsed = createDebtSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error.issues) };
  return { ok: true, input };
}

/** Зміна умов наявного боргу: тип, початкова сума й дата початку не змінюються. */
export function toUpdateInput(values: DebtFormValues, original: Debt): Result<UpdateDebtInput> {
  const errors: DebtFormErrors = {};
  const isCard = original.type === 'credit_card';
  validateShared(values, original.startDate, errors);
  const conditions = parseConditions(values, errors);
  if (Object.keys(errors).length > 0 || !conditions) return { ok: false, errors };

  const input: UpdateDebtInput = {
    name: values.name.trim(),
    description: values.description.trim() || null,
    maturityDate: values.maturityDate || null,
    interestRate: conditions.interestRate,
    ratePeriod: values.ratePeriod,
    monthlyPayment: conditions.monthlyPayment,
    paymentDay: conditions.paymentDay,
    firstPaymentMonth: values.firstPaymentMonth || null,
    defaultAccountId: values.defaultAccountId || null,
    ...(isCard
      ? { creditLimit: conditions.creditLimit }
      : { earlyRepaymentAllowed: values.earlyRepaymentAllowed }),
  };
  const parsed = updateDebtSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error.issues) };
  return { ok: true, input };
}

function issuesToErrors(issues: readonly { path: PropertyKey[]; message: string }[]) {
  const errors: DebtFormErrors = {};
  for (const issue of issues) {
    const field = String(issue.path[0]) as keyof DebtFormValues;
    errors[field] ??= issue.message;
  }
  return errors;
}

/**
 * Прогноз погашення для значень форми — ті самі функції, що й на бекенді. Для нового боргу
 * залишок дорівнює початковій сумі, для наявного береться його поточний залишок.
 * null, якщо полів ще недостатньо для розрахунку.
 */
export function previewProjection(
  values: DebtFormValues,
  today: string,
  original?: Debt,
): DebtProjection | null {
  const conditions = parseConditions(values, {});
  const startDate = original?.startDate ?? values.startDate;
  const balance = original
    ? original.balance
    : parsePlannedAmount(values.initialAmount || '0', CURRENCY);
  if (!conditions || typeof balance !== 'number' || !isValidDateString(startDate)) return null;

  const month = today.slice(0, 7);
  const payment = getMonthPayment({
    month,
    paymentDay: conditions.paymentDay,
    startDate,
    firstPaymentMonth: values.firstPaymentMonth || null,
    monthlyPayment: conditions.monthlyPayment,
    balanceAtMonthStart: balance,
    chargesInMonth: 0,
    paid: original?.month.paid ?? 0,
    today,
  });
  const schedule = {
    balance,
    rate: toMonthlyRate(conditions.interestRate, values.ratePeriod),
    firstDueDate: nextDueDate(
      month,
      conditions.paymentDay,
      payment,
      values.firstPaymentMonth || null,
    ),
    paymentDay: conditions.paymentDay,
  };
  const projection = projectPayoff({ ...schedule, monthlyPayment: conditions.monthlyPayment });
  const maturityDate = isValidDateString(values.maturityDate) ? values.maturityDate : null;
  return {
    ...projection,
    maturityWarning:
      maturityDate && missesMaturity(projection, maturityDate, balance)
        ? { requiredPayment: requiredPaymentForMaturity({ ...schedule, maturityDate }) }
        : null,
    assumesNoNewPurchases: values.type === 'credit_card',
  };
}
