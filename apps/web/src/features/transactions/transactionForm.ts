import {
  MoneyParseError,
  MoneyRangeError,
  localDateKey,
  parseMoney,
  startOfLocalDay,
  toDecimalString,
  transactionInputSchema,
  type Account,
  type Transaction,
  type TransactionInput,
  type TransactionType,
} from '@hf/shared';

/** Значення полів форми — усе рядками, як їх уводить користувач. */
export interface TransactionFormValues {
  accountId: string;
  /** Тільки для переказу. */
  toAccountId: string;
  /** Порожній рядок — без категорії. */
  categoryId: string;
  /** Сума у звичному записі: «1 234,50». */
  amount: string;
  /** Дата у форматі YYYY-MM-DD в часовому поясі користувача. */
  date: string;
  description: string;
}

export type FormErrors = Partial<Record<keyof TransactionFormValues, string>>;

export type FormResult = { ok: true; input: TransactionInput } | { ok: false; errors: FormErrors };

export interface FormContext {
  accounts: readonly Account[];
  timeZone: string;
  now: Date;
  /** Транзакція, яку редагують. */
  original?: Transaction | undefined;
}

export function initialValues(
  { accounts, timeZone, now, original }: FormContext,
  defaults: Partial<TransactionFormValues> = {},
): TransactionFormValues {
  if (original) {
    return {
      accountId: original.accountId,
      toAccountId: original.toAccountId ?? '',
      categoryId: original.categoryId ?? '',
      amount: toDecimalString(original).replace('.', ','),
      date: localDateKey(new Date(original.occurredAt), timeZone),
      description: original.description,
    };
  }
  return {
    accountId: accounts[0]?.id ?? '',
    toAccountId: '',
    categoryId: '',
    amount: '',
    date: localDateKey(now, timeZone),
    description: '',
    ...defaults,
  };
}

/**
 * Момент транзакції для обраної дати. У формі вибирається лише день, тому:
 * якщо дата не змінилася під час редагування — лишається початковий час;
 * сьогоднішня дата отримує поточний час, щоб нові записи йшли в порядку додавання;
 * інша дата — початок цього дня в часовому поясі користувача.
 */
function resolveOccurredAt(
  date: string,
  { timeZone, now, original }: FormContext,
): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];

  const start = startOfLocalDay(year, month, day, timeZone);
  // Відсікає неіснуючі дати на кшталт 31 лютого.
  if (Number.isNaN(start.getTime()) || localDateKey(start, timeZone) !== date) return undefined;

  if (original && localDateKey(new Date(original.occurredAt), timeZone) === date) {
    return new Date(original.occurredAt);
  }
  return localDateKey(now, timeZone) === date ? now : start;
}

function parseAmount(amount: string, currency: string): number | string {
  if (amount.trim() === '') return 'Вкажіть суму';
  try {
    const { amountMinor } = parseMoney(amount.trim(), currency);
    return amountMinor > 0 ? amountMinor : 'Сума має бути більшою за нуль';
  } catch (error) {
    if (error instanceof MoneyRangeError) return 'Сума завелика';
    if (error instanceof MoneyParseError) return 'Некоректна сума, приклад: 1234,50';
    throw error;
  }
}

/** Перетворює поля форми на тіло запиту до API або повертає помилки по полях. */
export function toTransactionInput(
  type: TransactionType,
  values: TransactionFormValues,
  context: FormContext,
): FormResult {
  const errors: FormErrors = {};

  const account = context.accounts.find((item) => item.id === values.accountId);
  if (!account) errors.accountId = 'Оберіть рахунок';

  let toAccount: Account | undefined;
  if (type === 'transfer') {
    toAccount = context.accounts.find((item) => item.id === values.toAccountId);
    if (!toAccount) errors.toAccountId = 'Оберіть рахунок призначення';
    else if (toAccount.id === account?.id) errors.toAccountId = 'Оберіть інший рахунок';
    else if (account && toAccount.currency !== account.currency) {
      errors.toAccountId = 'Перекази між рахунками в різних валютах поки не підтримуються';
    }
  }

  // Без рахунку валюта невідома, тож суму розібрати неможливо.
  const amount = account ? parseAmount(values.amount, account.currency) : undefined;
  if (typeof amount === 'string') errors.amount = amount;

  const occurredAt = resolveOccurredAt(values.date, context);
  if (!occurredAt) errors.date = 'Вкажіть дату';

  const description = values.description.trim();
  if (description.length > 500) errors.description = 'Опис задовгий (до 500 символів)';

  if (Object.keys(errors).length > 0 || !account || typeof amount !== 'number' || !occurredAt) {
    return { ok: false, errors };
  }

  const base = {
    accountId: account.id,
    amountMinor: amount,
    currency: account.currency,
    description,
    occurredAt: occurredAt.toISOString(),
  };
  const candidate =
    type === 'transfer'
      ? { ...base, type, toAccountId: toAccount!.id }
      : { ...base, type, categoryId: values.categoryId || null };

  const parsed = transactionInputSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] === 'amountMinor' ? 'amount' : String(issue.path[0]);
      errors[field as keyof TransactionFormValues] ??= 'Некоректне значення';
    }
    return { ok: false, errors };
  }
  return { ok: true, input: parsed.data };
}
