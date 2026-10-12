import type { Account, Transaction } from '@hf/shared';
import { describe, expect, it } from 'vitest';
import {
  initialValues,
  toTransactionInput,
  type FormContext,
  type TransactionFormValues,
} from './transactionForm.ts';

const KYIV = 'Europe/Kyiv';
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const account = (n: number, currency = 'UAH'): Account => ({
  id: id(n),
  name: `Рахунок ${n}`,
  type: 'card',
  currency,
  balance: 0,
  creditLimit: null,
  isArchived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const card = account(1);
const cash = account(2);
const usd = account(3, 'USD');
const yen = account(4, 'JPY');

// 14:00 15 березня 2026 за Києвом
const now = new Date('2026-03-15T12:00:00.000Z');
const context: FormContext = { accounts: [card, cash, usd, yen], timeZone: KYIV, now };

const values = (override: Partial<TransactionFormValues> = {}): TransactionFormValues => ({
  accountId: card.id,
  toAccountId: '',
  categoryId: '',
  amount: '100',
  date: '2026-03-15',
  description: '',
  ...override,
});

const input = (override: Partial<TransactionFormValues> = {}, ctx = context) => {
  const result = toTransactionInput('expense', values(override), ctx);
  if (!result.ok) throw new Error(`очікувався успіх: ${JSON.stringify(result.errors)}`);
  return result.input;
};

const errors = (
  override: Partial<TransactionFormValues> = {},
  type: 'expense' | 'transfer' = 'expense',
) => {
  const result = toTransactionInput(type, values(override), context);
  if (result.ok) throw new Error('очікувалася помилка');
  return result.errors;
};

describe('сума', () => {
  it.each([
    ['1284,50', 128450],
    ['1284.5', 128450],
    ['1 284,50', 128450],
    ['0,01', 1],
    ['  42  ', 4200],
    ['0,1', 10],
    ['1,15', 115],
  ])('%j -> %i копійок', (amount, expected) => {
    expect(input({ amount }).amountMinor).toBe(expected);
  });

  it.each([
    ['', 'Вкажіть суму'],
    ['   ', 'Вкажіть суму'],
    ['abc', 'Некоректна сума, приклад: 1234,50'],
    ['12,345', 'Некоректна сума, приклад: 1234,50'],
    ['1e3', 'Некоректна сума, приклад: 1234,50'],
    ['0', 'Сума має бути більшою за нуль'],
    ['0,00', 'Сума має бути більшою за нуль'],
    ['-5', 'Сума має бути більшою за нуль'],
    ['99999999999999999', 'Сума завелика'],
  ])('%j -> помилка «%s»', (amount, message) => {
    expect(errors({ amount })).toEqual({ amount: message });
  });

  it('бере валюту й кількість знаків із рахунку', () => {
    expect(input({ accountId: usd.id, amount: '10,50' })).toMatchObject({
      currency: 'USD',
      amountMinor: 1050,
    });
    expect(input({ accountId: yen.id, amount: '500' })).toMatchObject({
      currency: 'JPY',
      amountMinor: 500,
    });
    expect(errors({ accountId: yen.id, amount: '500,5' }).amount).toBeDefined();
  });
});

describe('дата', () => {
  it('сьогоднішня дата отримує поточний час', () => {
    expect(input({ date: '2026-03-15' }).occurredAt).toBe('2026-03-15T12:00:00.000Z');
  });

  it('інша дата — початок дня в поясі користувача', () => {
    expect(input({ date: '2026-03-10' }).occurredAt).toBe('2026-03-09T22:00:00.000Z');
    // після переходу на літній час зсув інший
    expect(input({ date: '2026-03-30' }).occurredAt).toBe('2026-03-29T21:00:00.000Z');
  });

  it('«сьогодні» визначається в поясі користувача, а не за UTC', () => {
    // 23:30 UTC 15 березня — у Києві вже 01:30 16 березня
    const lateNow = new Date('2026-03-15T23:30:00.000Z');
    const ctx = { ...context, now: lateNow };

    expect(input({ date: '2026-03-16' }, ctx).occurredAt).toBe('2026-03-15T23:30:00.000Z');
    expect(input({ date: '2026-03-15' }, ctx).occurredAt).toBe('2026-03-14T22:00:00.000Z');
    expect(initialValues(ctx).date).toBe('2026-03-16');
  });

  it.each(['', '15.03.2026', '2026-02-31', '2026-13-01', '2026-00-10'])('відхиляє %j', (date) => {
    expect(errors({ date })).toEqual({ date: 'Вкажіть дату' });
  });
});

describe('редагування', () => {
  const original: Transaction = {
    id: id(9),
    type: 'expense',
    accountId: cash.id,
    toAccountId: null,
    categoryId: id(7),
    occurrenceId: null,
    amountMinor: 128450,
    currency: 'UAH',
    description: 'Ринок',
    // 23:15 10 березня за Києвом
    occurredAt: '2026-03-10T21:15:00.000Z',
    createdAt: '2026-03-10T21:15:00.000Z',
    updatedAt: '2026-03-10T21:15:00.000Z',
  };
  const ctx = { ...context, original };

  it('заповнює форму значеннями транзакції', () => {
    expect(initialValues(ctx)).toEqual({
      accountId: cash.id,
      toAccountId: '',
      categoryId: id(7),
      amount: '1284,50',
      date: '2026-03-10',
      description: 'Ринок',
    });
  });

  it('без змін дає ті самі дані, зокрема точний час', () => {
    const result = toTransactionInput('expense', initialValues(ctx), ctx);
    expect(result).toEqual({
      ok: true,
      input: {
        type: 'expense',
        accountId: cash.id,
        categoryId: id(7),
        amountMinor: 128450,
        currency: 'UAH',
        description: 'Ринок',
        occurredAt: '2026-03-10T21:15:00.000Z',
      },
    });
  });

  it('зміна дати скидає час на початок нового дня', () => {
    const result = toTransactionInput(
      'expense',
      { ...initialValues(ctx), date: '2026-03-11' },
      ctx,
    );
    expect(result.ok && result.input.occurredAt).toBe('2026-03-10T22:00:00.000Z');
  });
});

describe('рахунок, категорія, опис', () => {
  it('вимагає рахунок і не перевіряє суму без нього', () => {
    expect(errors({ accountId: '', amount: 'abc' })).toEqual({ accountId: 'Оберіть рахунок' });
    expect(errors({ accountId: id(8) })).toEqual({ accountId: 'Оберіть рахунок' });
  });

  it('порожня категорія стає null', () => {
    expect(input()).toMatchObject({ type: 'expense', categoryId: null });
    expect(input({ categoryId: id(7) })).toMatchObject({ categoryId: id(7) });
  });

  it('обрізає пробіли в описі й обмежує довжину', () => {
    expect(input({ description: '  Кава  ' }).description).toBe('Кава');
    expect(input({ description: 'x'.repeat(500) }).description).toHaveLength(500);
    expect(errors({ description: 'x'.repeat(501) }).description).toBeDefined();
  });

  it('збирає всі помилки разом', () => {
    expect(Object.keys(errors({ amount: '', date: '' })).sort()).toEqual(['amount', 'date']);
  });

  it('підставляє перший рахунок і сьогоднішню дату для нової транзакції', () => {
    expect(initialValues(context)).toMatchObject({
      accountId: card.id,
      date: '2026-03-15',
      amount: '',
    });
    expect(initialValues({ ...context, accounts: [] }).accountId).toBe('');
  });
});

describe('переказ', () => {
  const transfer = (override: Partial<TransactionFormValues> = {}) =>
    toTransactionInput('transfer', values({ toAccountId: cash.id, ...override }), context);

  it('формує переказ без категорії', () => {
    expect(transfer({ categoryId: id(7), amount: '2000' })).toEqual({
      ok: true,
      input: {
        type: 'transfer',
        accountId: card.id,
        toAccountId: cash.id,
        amountMinor: 200000,
        currency: 'UAH',
        description: '',
        occurredAt: '2026-03-15T12:00:00.000Z',
      },
    });
  });

  it('вимагає інший рахунок призначення в тій самій валюті', () => {
    expect(errors({ toAccountId: '' }, 'transfer')).toEqual({
      toAccountId: 'Оберіть рахунок призначення',
    });
    expect(errors({ toAccountId: card.id }, 'transfer')).toEqual({
      toAccountId: 'Оберіть інший рахунок',
    });
    expect(errors({ toAccountId: usd.id }, 'transfer')).toEqual({
      toAccountId: 'Перекази між рахунками в різних валютах поки не підтримуються',
    });
  });
});

describe('дохід і надходження', () => {
  const original: Transaction = {
    id: id(9),
    type: 'income',
    accountId: card.id,
    toAccountId: null,
    categoryId: null,
    occurrenceId: id(6),
    amountMinor: 4500000,
    currency: 'UAH',
    description: 'Зарплата',
    occurredAt: '2026-03-05T08:00:00.000Z',
    createdAt: '2026-03-05T08:00:00.000Z',
    updatedAt: '2026-03-05T08:00:00.000Z',
  };

  it('редагування доходу зберігає його звʼязок із надходженням', () => {
    const ctx = { ...context, original };
    expect(toTransactionInput('income', initialValues(ctx), ctx)).toMatchObject({
      ok: true,
      input: { occurrenceId: id(6), occurredAt: '2026-03-05T08:00:00.000Z' },
    });
  });

  it('новий дохід не привʼязаний до надходження', () => {
    expect(toTransactionInput('income', values(), context)).toMatchObject({
      ok: true,
      input: { type: 'income', occurrenceId: null },
    });
  });

  it('витрата й переказ надходження не передають', () => {
    const ctx = { ...context, original };
    const result = toTransactionInput('expense', values(), ctx);
    expect(result.ok && 'occurrenceId' in result.input).toBe(false);

    const transfer = toTransactionInput('transfer', values({ toAccountId: cash.id }), ctx);
    expect(transfer.ok && 'occurrenceId' in transfer.input).toBe(false);
  });
});

describe('межі дат (minDate / maxDate)', () => {
  // Сьогодні 15 березня 2026: видаток можна внести з 1 по 15 березня.
  const limited = { ...context, minDate: '2026-03-01', maxDate: '2026-03-15' };
  const dateError = (date: string) => {
    const result = toTransactionInput('expense', values({ date }), limited);
    return result.ok ? undefined : result.errors.date;
  };

  it('приймає дати в межах включно', () => {
    expect(dateError('2026-03-01')).toBeUndefined();
    expect(dateError('2026-03-10')).toBeUndefined();
    expect(dateError('2026-03-15')).toBeUndefined();
  });

  it('відхиляє минулий місяць і майбутні дати', () => {
    const message = 'Дата має бути в поточному місяці й не пізніше сьогодні';
    expect(dateError('2026-02-28')).toBe(message);
    expect(dateError('2026-03-16')).toBe(message);
    expect(dateError('2026-04-01')).toBe(message);
  });

  it('порожня дата лишається окремою помилкою', () => {
    expect(dateError('')).toBe('Вкажіть дату');
  });

  it('без меж обмежень немає', () => {
    const result = toTransactionInput('income', values({ date: '2025-01-01' }), context);
    expect(result.ok).toBe(true);
  });

  it('сьогоднішня дата отримує поточний час, тож не виходить у майбутнє', () => {
    const result = toTransactionInput('expense', values({ date: '2026-03-15' }), limited);
    expect(result.ok && result.input.occurredAt).toBe(now.toISOString());
  });
});
