import type { Debt } from '@hf/shared';
import { describe, expect, it } from 'vitest';
import {
  initialDebtValues,
  previewProjection,
  toCreateInput,
  toUpdateInput,
  withType,
  type DebtFormValues,
} from './debtForm.ts';
import { monthsText } from './labels.ts';

const TODAY = '2026-10-12';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';

const loan = (override: Partial<DebtFormValues> = {}): DebtFormValues => ({
  ...initialDebtValues(TODAY),
  name: ' Позика банку ',
  initialAmount: '10000',
  startDate: '2026-01-15',
  maturityDate: '2027-01-15',
  interestRate: '24,99',
  monthlyPayment: '1000,50',
  paymentDay: '20',
  ...override,
});

const card = (override: Partial<DebtFormValues> = {}): DebtFormValues => ({
  ...withType(loan({ maturityDate: '' }), 'credit_card'),
  interestRate: '3,1',
  ratePeriod: 'month',
  creditLimit: '50000',
  ...override,
});

const existing: Debt = {
  id: '00000000-0000-4000-8000-000000000009',
  name: 'Позика',
  description: null,
  type: 'bank_loan',
  status: 'active',
  accountId: null,
  currency: 'UAH',
  initialAmount: 1_000_000,
  startDate: '2026-01-15',
  maturityDate: '2027-01-15',
  interestRate: 24,
  ratePeriod: 'year',
  monthlyPayment: 100_000,
  paymentDay: 20,
  earlyRepaymentAllowed: true,
  defaultAccountId: null,
  balance: 600_000,
  card: null,
  month: { dueDate: '2026-10-20', required: 100_000, paid: 0, status: 'pending' },
  projection: {
    months: 7,
    payoffDate: '2027-04-20',
    totalInterest: 0,
    paymentCoversInterest: true,
    maturityWarning: null,
    assumesNoNewPurchases: false,
  },
};

describe('початкові значення', () => {
  it('новий борг: позика банку з сьогоднішньою датою і днем платежу', () => {
    expect(initialDebtValues(TODAY)).toMatchObject({
      type: 'bank_loan',
      startDate: TODAY,
      paymentDay: '12',
      ratePeriod: 'year',
      earlyRepaymentAllowed: true,
    });
    expect(initialDebtValues('2026-10-05').paymentDay).toBe('5');
  });

  it('редагування: значення боргу', () => {
    expect(initialDebtValues(TODAY, existing)).toMatchObject({
      name: 'Позика',
      initialAmount: '10000,00',
      interestRate: '24',
      monthlyPayment: '1000,00',
      paymentDay: '20',
      maturityDate: '2027-01-15',
    });
  });

  it('зміна типу підставляє типові ставку й період', () => {
    expect(withType(loan(), 'mfo_loan')).toMatchObject({ ratePeriod: 'day', interestRate: '' });
    expect(withType(loan(), 'installment')).toMatchObject({
      ratePeriod: 'year',
      interestRate: '0',
    });
    expect(withType(loan(), 'installment').name).toBe(' Позика банку ');
  });
});

describe('toCreateInput', () => {
  it('позика: суми в копійках, ставка числом', () => {
    expect(toCreateInput(loan({ description: ' На ремонт ' }), TODAY)).toEqual({
      ok: true,
      input: {
        name: 'Позика банку',
        description: 'На ремонт',
        type: 'bank_loan',
        initialAmount: 1_000_000,
        startDate: '2026-01-15',
        maturityDate: '2027-01-15',
        interestRate: 24.99,
        ratePeriod: 'year',
        monthlyPayment: 100_050,
        paymentDay: 20,
        earlyRepaymentAllowed: true,
        defaultAccountId: null,
        creditLimit: null,
        existingAccountId: null,
      },
    });
  });

  it('кредитка з новим рахунком: ліміт обов’язковий, строк — ні', () => {
    const result = toCreateInput(card({ earlyRepaymentAllowed: false }), TODAY);
    expect(result).toMatchObject({
      ok: true,
      input: {
        type: 'credit_card',
        maturityDate: null,
        creditLimit: 5_000_000,
        existingAccountId: null,
        earlyRepaymentAllowed: true,
      },
    });
    expect(toCreateInput(card({ creditLimit: '' }), TODAY)).toMatchObject({
      ok: false,
      errors: { creditLimit: 'Вкажіть суму' },
    });
  });

  it('кредитка з наявним рахунком: початкова сума не вводиться', () => {
    const result = toCreateInput(card({ cardAccountId: ACCOUNT_ID, initialAmount: '' }), TODAY);
    expect(result).toMatchObject({
      ok: true,
      input: { existingAccountId: ACCOUNT_ID, initialAmount: 0 },
    });
  });

  it('позика без кредитного ліміту, навіть якщо поле заповнене', () => {
    const result = toCreateInput(loan({ creditLimit: '500' }), TODAY);
    expect(result).toMatchObject({ ok: true, input: { creditLimit: null } });
  });

  it.each<[string, Partial<DebtFormValues>, keyof DebtFormValues]>([
    ['без назви', { name: '  ' }, 'name'],
    ['без початкової суми', { initialAmount: '' }, 'initialAmount'],
    ['некоректна сума', { initialAmount: '12,345' }, 'initialAmount'],
    ['без строку', { maturityDate: '' }, 'maturityDate'],
    ['строк не пізніше за початок', { maturityDate: '2026-01-15' }, 'maturityDate'],
    ['початок у майбутньому', { startDate: '2026-10-13', maturityDate: '2028-01-01' }, 'startDate'],
    ['без ставки', { interestRate: '' }, 'interestRate'],
    ['ставка не число', { interestRate: 'багато' }, 'interestRate'],
    ['ставка з п’ятьма знаками', { interestRate: '1,23456' }, 'interestRate'],
    ['нульовий платіж', { monthlyPayment: '0' }, 'monthlyPayment'],
    ['день платежу 0', { paymentDay: '0' }, 'paymentDay'],
    ['день платежу 32', { paymentDay: '32' }, 'paymentDay'],
    ['день платежу дробовий', { paymentDay: '1.5' }, 'paymentDay'],
  ])('помилка: %s', (_name, override, field) => {
    const result = toCreateInput(loan(override), TODAY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[field]).toBeTruthy();
  });

  it('нульова початкова сума й нульова ставка дозволені', () => {
    const result = toCreateInput(loan({ initialAmount: '0', interestRate: '0' }), TODAY);
    expect(result).toMatchObject({ ok: true, input: { initialAmount: 0, interestRate: 0 } });
  });
});

describe('toUpdateInput', () => {
  it('позика: лише умови, без типу, суми й дати початку', () => {
    const values = {
      ...initialDebtValues(TODAY, existing),
      monthlyPayment: '1500',
      paymentDay: '5',
    };
    expect(toUpdateInput(values, existing)).toEqual({
      ok: true,
      input: {
        name: 'Позика',
        description: null,
        maturityDate: '2027-01-15',
        interestRate: 24,
        ratePeriod: 'year',
        monthlyPayment: 150_000,
        paymentDay: 5,
        defaultAccountId: null,
        earlyRepaymentAllowed: true,
      },
    });
  });

  it('кредитка: кредитний ліміт замість перемикача дострокового погашення', () => {
    const cardDebt: Debt = {
      ...existing,
      type: 'credit_card',
      maturityDate: null,
      card: {
        creditLimit: 5_000_000,
        available: 4_400_000,
        usage: 0.12,
        overLimitBy: 0,
        nearLimit: false,
      },
    };
    const values = { ...initialDebtValues(TODAY, cardDebt), creditLimit: '80000' };
    const result = toUpdateInput(values, cardDebt);
    expect(result).toMatchObject({
      ok: true,
      input: { creditLimit: 8_000_000, maturityDate: null },
    });
    if (result.ok) expect(result.input).not.toHaveProperty('earlyRepaymentAllowed');
  });

  it('строк перевіряється відносно дати початку боргу', () => {
    const values = { ...initialDebtValues(TODAY, existing), maturityDate: '2026-01-15' };
    expect(toUpdateInput(values, existing)).toMatchObject({
      ok: false,
      errors: { maturityDate: 'Строк має бути пізніше за дату початку' },
    });
  });
});

describe('previewProjection', () => {
  it('розстрочка без відсотків і попередження про строк', () => {
    const values = loan({
      type: 'installment',
      interestRate: '0',
      initialAmount: '12000',
      monthlyPayment: '2700',
      paymentDay: '10',
      startDate: '2026-10-11',
      maturityDate: '2027-02-10',
    });
    expect(previewProjection(values, TODAY)).toEqual({
      months: 5,
      payoffDate: '2027-03-10',
      totalInterest: 0,
      paymentCoversInterest: true,
      maturityWarning: { requiredPayment: 300_000 },
      assumesNoNewPurchases: false,
    });
  });

  it('платіж не покриває відсотки', () => {
    const values = loan({ interestRate: '1', ratePeriod: 'day', monthlyPayment: '100' });
    expect(previewProjection(values, TODAY)).toMatchObject({
      months: null,
      paymentCoversInterest: false,
    });
  });

  it('для наявного боргу береться поточний залишок', () => {
    const values = { ...initialDebtValues(TODAY, existing), interestRate: '0' };
    // 600 000 / 100 000 = 6 платежів, перший — 20 жовтня
    expect(previewProjection(values, TODAY, existing)).toMatchObject({
      months: 6,
      payoffDate: '2027-03-20',
    });
  });

  it('кредитка: прогноз припускає, що нових покупок не буде', () => {
    expect(previewProjection(card(), TODAY)?.assumesNoNewPurchases).toBe(true);
  });

  it('поки полів недостатньо, прогнозу немає', () => {
    expect(previewProjection(loan({ monthlyPayment: '' }), TODAY)).toBeNull();
    expect(previewProjection(loan({ interestRate: 'x' }), TODAY)).toBeNull();
    expect(previewProjection(loan({ initialAmount: 'x' }), TODAY)).toBeNull();
  });
});

describe('monthsText', () => {
  it('відмінює «місяць»', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 31, 111].map(monthsText)).toEqual([
      '1 місяць',
      '2 місяці',
      '5 місяців',
      '11 місяців',
      '12 місяців',
      '21 місяць',
      '22 місяці',
      '25 місяців',
      '31 місяць',
      '111 місяців',
    ]);
  });
});
