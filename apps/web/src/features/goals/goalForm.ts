import {
  createGoalSchema,
  isValidDateString,
  updateGoalSchema,
  type Goal,
  type UpdateGoalInput,
} from '@hf/shared';
import { parsePlannedAmount, plannedAmountText } from '../budget/plannedAmount.ts';
import type { CreateGoalBody, PayoffStrategy } from './api.ts';

export type GoalKind = Goal['kind'];

export interface GoalFormValues {
  kind: GoalKind;
  name: string;
  description: string;
  targetDate: string;
  // накопичення
  accountId: string;
  targetAmount: string;
  monthlyContribution: string;
  // вихід із боргів
  debtIds: string[];
  extraPayment: string;
  strategy: PayoffStrategy;
}

export type GoalFormErrors = Partial<Record<keyof GoalFormValues, string>>;

const CURRENCY = 'UAH';

export function initialGoalValues(original?: Goal): GoalFormValues {
  const empty: GoalFormValues = {
    kind: 'savings',
    name: '',
    description: '',
    targetDate: '',
    accountId: '',
    targetAmount: '',
    monthlyContribution: '',
    debtIds: [],
    extraPayment: '',
    strategy: 'avalanche',
  };
  if (!original) return empty;

  const shared = {
    ...empty,
    kind: original.kind,
    name: original.name,
    description: original.description ?? '',
    targetDate: original.targetDate ?? '',
  };
  if (original.kind === 'savings') {
    return {
      ...shared,
      accountId: original.accountId,
      targetAmount: plannedAmountText(original.targetAmount, CURRENCY),
      monthlyContribution:
        original.monthlyContribution === null
          ? ''
          : plannedAmountText(original.monthlyContribution, CURRENCY),
    };
  }
  return {
    ...shared,
    debtIds: original.debts.map((debt) => debt.id),
    extraPayment: plannedAmountText(original.extraPayment, CURRENCY),
    strategy: original.strategy,
  };
}

function parsePositive(text: string): number | string {
  const amount = parsePlannedAmount(text, CURRENCY);
  return amount === 0 ? 'Сума має бути більшою за нуль' : amount;
}

/** Необов'язкова сума: порожнє поле — null. */
function parseOptionalPositive(text: string): number | null | string {
  return text.trim() === '' ? null : parsePositive(text);
}

/** Необов'язкова сума, де порожнє поле означає нуль. */
function parseOptionalAmount(text: string): number | string {
  return text.trim() === '' ? 0 : parsePlannedAmount(text, CURRENCY);
}

interface Parsed {
  name: string;
  description: string | null;
  targetDate: string | null;
  targetAmount: number | string;
  monthlyContribution: number | null | string;
  extraPayment: number | string;
}

/** Розбирає поля форми й складає помилки для полів, що стосуються цього виду цілі. */
function parse(values: GoalFormValues, today: string, errors: GoalFormErrors): Parsed {
  const isSavings = values.kind === 'savings';
  const name = values.name.trim();
  if (name === '') errors.name = 'Вкажіть назву';
  else if (name.length > 100) errors.name = 'Назва задовга (до 100 символів)';
  if (values.description.trim().length > 1000) errors.description = 'Опис задовгий';

  if (values.targetDate === '') {
    if (!isSavings) errors.targetDate = 'Вкажіть дату, до якої хочете погасити борги';
  } else if (!isValidDateString(values.targetDate)) {
    errors.targetDate = 'Некоректна дата';
  } else if (values.targetDate < today) {
    errors.targetDate = 'Дата не може бути в минулому';
  }

  const targetAmount = parsePositive(values.targetAmount);
  const monthlyContribution = parseOptionalPositive(values.monthlyContribution);
  const extraPayment = parseOptionalAmount(values.extraPayment);
  if (isSavings) {
    if (typeof targetAmount === 'string') errors.targetAmount = targetAmount;
    if (typeof monthlyContribution === 'string') errors.monthlyContribution = monthlyContribution;
  } else if (typeof extraPayment === 'string') {
    errors.extraPayment = extraPayment;
  }

  return {
    name,
    description: values.description.trim() || null,
    targetDate: values.targetDate || null,
    targetAmount,
    monthlyContribution,
    extraPayment,
  };
}

type Result<T> = { ok: true; input: T } | { ok: false; errors: GoalFormErrors };

function issuesToErrors(issues: readonly { path: PropertyKey[]; message: string }[]) {
  const errors: GoalFormErrors = {};
  for (const issue of issues) {
    const field = String(issue.path[0]) as keyof GoalFormValues;
    errors[field] ??= issue.message;
  }
  return errors;
}

/** Тіло запиту на створення цілі або помилки по полях. */
export function toCreateInput(values: GoalFormValues, today: string): Result<CreateGoalBody> {
  const errors: GoalFormErrors = {};
  const parsed = parse(values, today, errors);
  if (values.kind === 'savings' && values.accountId === '') errors.accountId = 'Оберіть рахунок';
  if (values.kind === 'debt_payoff' && values.debtIds.length === 0) {
    errors.debtIds = 'Виберіть хоча б один борг';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const shared = { name: parsed.name, description: parsed.description };
  const input: CreateGoalBody =
    values.kind === 'savings'
      ? {
          ...shared,
          kind: 'savings',
          accountId: values.accountId,
          targetAmount: parsed.targetAmount as number,
          targetDate: parsed.targetDate,
          monthlyContribution: parsed.monthlyContribution as number | null,
        }
      : {
          ...shared,
          kind: 'debt_payoff',
          debtIds: values.debtIds,
          targetDate: parsed.targetDate!,
          extraPayment: parsed.extraPayment as number,
          strategy: values.strategy,
        };
  // Остаточну перевірку робить та сама схема, що й на бекенді.
  const checked = createGoalSchema.safeParse(input);
  if (!checked.success) return { ok: false, errors: issuesToErrors(checked.error.issues) };
  return { ok: true, input };
}

/** Зміна наявної цілі: вид і борги цілі не змінюються. */
export function toUpdateInput(
  values: GoalFormValues,
  original: Goal,
  today: string,
): Result<UpdateGoalInput> {
  const errors: GoalFormErrors = {};
  const parsed = parse({ ...values, kind: original.kind }, today, errors);
  // Дату, що вже минула, можна лишити як була: помилкою є лише нова дата в минулому.
  if (values.targetDate === (original.targetDate ?? '')) delete errors.targetDate;
  if (original.kind === 'savings' && values.accountId === '') errors.accountId = 'Оберіть рахунок';
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const shared = {
    name: parsed.name,
    description: parsed.description,
    targetDate: parsed.targetDate,
  };
  const input: UpdateGoalInput =
    original.kind === 'savings'
      ? {
          ...shared,
          accountId: values.accountId,
          targetAmount: parsed.targetAmount as number,
          monthlyContribution: parsed.monthlyContribution as number | null,
        }
      : { ...shared, extraPayment: parsed.extraPayment as number, strategy: values.strategy };
  const checked = updateGoalSchema.safeParse(input);
  if (!checked.success) return { ok: false, errors: issuesToErrors(checked.error.issues) };
  return { ok: true, input };
}
