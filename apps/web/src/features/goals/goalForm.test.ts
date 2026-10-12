import type { Goal } from '@hf/shared';
import { describe, expect, it } from 'vitest';
import {
  initialGoalValues,
  toCreateInput,
  toUpdateInput,
  type GoalFormValues,
} from './goalForm.ts';

const TODAY = '2026-10-12';
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const savings = (override: Partial<GoalFormValues> = {}): GoalFormValues => ({
  ...initialGoalValues(),
  name: ' Подушка ',
  accountId: id(1),
  targetAmount: '100000',
  targetDate: '2027-06-30',
  monthlyContribution: '5000,50',
  ...override,
});

const payoff = (override: Partial<GoalFormValues> = {}): GoalFormValues => ({
  ...initialGoalValues(),
  kind: 'debt_payoff',
  name: 'Без боргів',
  targetDate: '2028-03-31',
  debtIds: [id(2), id(3)],
  extraPayment: '2000',
  strategy: 'snowball',
  ...override,
});

const savingsGoal: Extract<Goal, { kind: 'savings' }> = {
  id: id(9),
  kind: 'savings',
  name: 'Подушка',
  description: null,
  status: 'active',
  currency: 'UAH',
  targetDate: null,
  accountId: id(1),
  accountName: 'Депозит',
  targetAmount: 10_000_000,
  monthlyContribution: null,
  saved: 0,
  remaining: 10_000_000,
  progress: 0,
  requiredMonthly: null,
  pace: null,
  projectedMonth: null,
  state: 'no_deadline',
};

const payoffGoal: Extract<Goal, { kind: 'debt_payoff' }> = {
  id: id(8),
  kind: 'debt_payoff',
  name: 'Без боргів',
  description: 'План',
  status: 'active',
  currency: 'UAH',
  targetDate: '2026-09-30',
  debts: [{ id: id(2), name: 'Позика', balance: 100_000 }],
  startBalance: 300_000,
  currentBalance: 100_000,
  paid: 200_000,
  progress: 0.6667,
  extraPayment: 200_000,
  strategy: 'snowball',
  minimumPayments: 10_000,
  requiredMonthly: null,
  debtFreeMonth: '2027-01',
  state: 'overdue',
};

describe('початкові значення', () => {
  it('нова ціль — накопичення з порожніми полями', () => {
    expect(initialGoalValues()).toMatchObject({
      kind: 'savings',
      strategy: 'avalanche',
      debtIds: [],
    });
  });

  it('редагування накопичення й виходу з боргів', () => {
    expect(initialGoalValues(savingsGoal)).toMatchObject({
      kind: 'savings',
      accountId: id(1),
      targetAmount: '100000,00',
      targetDate: '',
      monthlyContribution: '',
    });
    expect(initialGoalValues(payoffGoal)).toMatchObject({
      kind: 'debt_payoff',
      description: 'План',
      targetDate: '2026-09-30',
      debtIds: [id(2)],
      extraPayment: '2000,00',
      strategy: 'snowball',
    });
  });
});

describe('toCreateInput', () => {
  it('накопичення: суми в копійках', () => {
    expect(toCreateInput(savings({ description: ' На чорний день ' }), TODAY)).toEqual({
      ok: true,
      input: {
        kind: 'savings',
        name: 'Подушка',
        description: 'На чорний день',
        accountId: id(1),
        targetAmount: 10_000_000,
        targetDate: '2027-06-30',
        monthlyContribution: 500_050,
      },
    });
  });

  it('накопичення без дати й без планового внеску', () => {
    expect(
      toCreateInput(savings({ targetDate: '', monthlyContribution: '' }), TODAY),
    ).toMatchObject({
      ok: true,
      input: { targetDate: null, monthlyContribution: null },
    });
  });

  it('вихід із боргів: порожній додатковий платіж — нуль', () => {
    expect(toCreateInput(payoff({ extraPayment: '' }), TODAY)).toEqual({
      ok: true,
      input: {
        kind: 'debt_payoff',
        name: 'Без боргів',
        description: null,
        debtIds: [id(2), id(3)],
        targetDate: '2028-03-31',
        extraPayment: 0,
        strategy: 'snowball',
      },
    });
  });

  it.each<[string, GoalFormValues, keyof GoalFormValues]>([
    ['без назви', savings({ name: ' ' }), 'name'],
    ['без рахунку', savings({ accountId: '' }), 'accountId'],
    ['без суми цілі', savings({ targetAmount: '' }), 'targetAmount'],
    ['нульова сума цілі', savings({ targetAmount: '0' }), 'targetAmount'],
    ['некоректний внесок', savings({ monthlyContribution: 'багато' }), 'monthlyContribution'],
    ['нульовий внесок', savings({ monthlyContribution: '0' }), 'monthlyContribution'],
    ['дата в минулому', savings({ targetDate: '2026-10-11' }), 'targetDate'],
    ['вихід із боргів без дати', payoff({ targetDate: '' }), 'targetDate'],
    ['вихід із боргів без боргів', payoff({ debtIds: [] }), 'debtIds'],
    ['від’ємний додатковий платіж', payoff({ extraPayment: '-5' }), 'extraPayment'],
  ])('помилка: %s', (_name, values, field) => {
    const result = toCreateInput(values, TODAY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[field]).toBeTruthy();
  });

  it('поля іншого виду цілі не заважають', () => {
    const result = toCreateInput(savings({ extraPayment: 'x', debtIds: [] }), TODAY);
    expect(result.ok).toBe(true);
    expect(toCreateInput(payoff({ targetAmount: '', accountId: '' }), TODAY).ok).toBe(true);
  });

  it('сьогоднішня дата дозволена', () => {
    expect(toCreateInput(savings({ targetDate: TODAY }), TODAY).ok).toBe(true);
  });
});

describe('toUpdateInput', () => {
  it('накопичення: лише свої поля', () => {
    const values = {
      ...initialGoalValues(savingsGoal),
      targetAmount: '2500',
      monthlyContribution: '100',
    };
    expect(toUpdateInput(values, savingsGoal, TODAY)).toEqual({
      ok: true,
      input: {
        name: 'Подушка',
        description: null,
        targetDate: null,
        accountId: id(1),
        targetAmount: 250_000,
        monthlyContribution: 10_000,
      },
    });
  });

  it('вихід із боргів: без боргів і полів накопичення', () => {
    const values = {
      ...initialGoalValues(payoffGoal),
      extraPayment: '',
      strategy: 'avalanche' as const,
    };
    const result = toUpdateInput(values, payoffGoal, TODAY);
    expect(result).toEqual({
      ok: true,
      input: {
        name: 'Без боргів',
        description: 'План',
        targetDate: '2026-09-30',
        extraPayment: 0,
        strategy: 'avalanche',
      },
    });
  });

  it('стару дату в минулому можна лишити, нову в минулому — ні', () => {
    const untouched = initialGoalValues(payoffGoal);
    expect(toUpdateInput(untouched, payoffGoal, TODAY).ok).toBe(true);
    const moved = toUpdateInput({ ...untouched, targetDate: '2026-10-01' }, payoffGoal, TODAY);
    expect(moved).toMatchObject({
      ok: false,
      errors: { targetDate: 'Дата не може бути в минулому' },
    });
  });

  it('вид цілі береться з наявної цілі, а не з форми', () => {
    const values = { ...initialGoalValues(savingsGoal), kind: 'debt_payoff' as const };
    expect(toUpdateInput(values, savingsGoal, TODAY)).toMatchObject({
      ok: true,
      input: { accountId: id(1) },
    });
  });
});
