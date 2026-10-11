import {
  incomeSourceInputSchema,
  toDecimalString,
  type IncomeSource,
  type IncomeSourceInput,
  type RecurrenceRule,
} from '@hf/shared';
import { parsePlannedAmount } from '../budget/plannedAmount.ts';

export type Frequency = IncomeSource['frequency'];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  monthly: 'Щомісяця',
  every_n_months: 'Раз на кілька місяців',
  weekly: 'Щотижня',
  biweekly: 'Раз на два тижні',
};

/** Дні тижня за ISO: індекс 0 — понеділок (день 1). */
export const WEEKDAY_LABELS = [
  'понеділок',
  'вівторок',
  'середа',
  'четвер',
  'пʼятниця',
  'субота',
  'неділя',
];
// «у середу», «у пʼятницю» — знахідний відмінок для опису правила.
const WEEKDAY_ACCUSATIVE = [
  'понеділок',
  'вівторок',
  'середу',
  'четвер',
  'пʼятницю',
  'суботу',
  'неділю',
];

/** Поля форми джерела — рядками, як їх уводить користувач. */
export interface SourceFormValues {
  name: string;
  accountId: string;
  amount: string;
  frequency: Frequency;
  dayOfMonth: string;
  dayOfWeek: string;
  intervalMonths: string;
  startDate: string;
  endDate: string;
}

export type SourceFormErrors = Partial<Record<keyof SourceFormValues, string>>;

export function initialSourceValues(
  source: IncomeSource | undefined,
  defaults: { accountId: string; today: string },
): SourceFormValues {
  if (!source) {
    return {
      name: '',
      accountId: defaults.accountId,
      amount: '',
      frequency: 'monthly',
      dayOfMonth: String(Number(defaults.today.slice(8, 10))),
      dayOfWeek: '1',
      intervalMonths: '3',
      startDate: defaults.today,
      endDate: '',
    };
  }
  return {
    name: source.name,
    accountId: source.accountId ?? defaults.accountId,
    amount: toDecimalString({
      amountMinor: source.plannedAmount,
      currency: source.currency,
    }).replace('.', ','),
    frequency: source.frequency,
    dayOfMonth: String(source.dayOfMonth ?? Number(source.startDate.slice(8, 10))),
    dayOfWeek: String(source.dayOfWeek ?? 1),
    intervalMonths: String(source.intervalMonths ?? 3),
    startDate: source.startDate,
    endDate: source.endDate ?? '',
  };
}

const wholeNumber = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN);

/** Правило повторення з полів форми — для прев'ю дат, ще до повної перевірки. */
export function ruleFromValues(values: SourceFormValues): RecurrenceRule | undefined {
  const byMonth = values.frequency === 'monthly' || values.frequency === 'every_n_months';
  const dayOfMonth = wholeNumber(values.dayOfMonth);
  const dayOfWeek = wholeNumber(values.dayOfWeek);
  const intervalMonths = wholeNumber(values.intervalMonths);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.startDate)) return undefined;
  if (byMonth && !(dayOfMonth >= 1 && dayOfMonth <= 31)) return undefined;
  if (!byMonth && !(dayOfWeek >= 1 && dayOfWeek <= 7)) return undefined;
  if (values.frequency === 'every_n_months' && !(intervalMonths >= 1)) return undefined;

  return {
    frequency: values.frequency,
    dayOfMonth,
    dayOfWeek,
    intervalMonths,
    startDate: values.startDate,
    endDate: values.endDate || null,
  };
}

const FIELD_MESSAGES: SourceFormErrors = {
  name: 'Вкажіть назву до 100 символів',
  accountId: 'Оберіть рахунок',
  dayOfMonth: 'День місяця від 1 до 31',
  dayOfWeek: 'Оберіть день тижня',
  intervalMonths: 'Інтервал від 1 місяця',
  startDate: 'Вкажіть дату початку',
  endDate: 'Дата завершення не може бути раніше за дату початку',
};

/** Перетворює поля форми на тіло запиту або повертає помилки по полях. */
export function toSourceInput(
  values: SourceFormValues,
  currency: string,
): { ok: true; input: IncomeSourceInput } | { ok: false; errors: SourceFormErrors } {
  const errors: SourceFormErrors = {};
  const amount = parsePlannedAmount(values.amount, currency);
  if (typeof amount === 'string') errors.amount = amount;
  else if (amount === 0) errors.amount = 'Сума має бути більшою за нуль';

  const byMonth = values.frequency === 'monthly' || values.frequency === 'every_n_months';
  const parsed = incomeSourceInputSchema.safeParse({
    name: values.name,
    accountId: values.accountId,
    plannedAmount: typeof amount === 'number' && amount > 0 ? amount : 1,
    frequency: values.frequency,
    dayOfMonth: byMonth ? wholeNumber(values.dayOfMonth) : null,
    dayOfWeek: byMonth ? null : wholeNumber(values.dayOfWeek),
    intervalMonths:
      values.frequency === 'every_n_months' ? wholeNumber(values.intervalMonths) : null,
    startDate: values.startDate,
    endDate: values.endDate || null,
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]) as keyof SourceFormValues;
      errors[field] ??= FIELD_MESSAGES[field] ?? 'Некоректне значення';
    }
  }
  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, input: parsed.data };
}

/** Опис правила словами: «Щомісяця 5-го», «Щотижня у пʼятницю», «Кожні 3 міс. 15-го». */
export function describeRule(
  rule: Pick<IncomeSource, 'frequency' | 'dayOfMonth' | 'dayOfWeek' | 'intervalMonths'>,
): string {
  const weekday = WEEKDAY_ACCUSATIVE[(rule.dayOfWeek ?? 1) - 1];
  switch (rule.frequency) {
    case 'monthly':
      return `Щомісяця ${rule.dayOfMonth}-го`;
    case 'every_n_months':
      return `Кожні ${rule.intervalMonths} міс. ${rule.dayOfMonth}-го`;
    case 'weekly':
      return `Щотижня у ${weekday}`;
    case 'biweekly':
      return `Раз на два тижні у ${weekday}`;
  }
}
