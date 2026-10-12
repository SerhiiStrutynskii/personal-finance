import { describe, expect, it } from 'vitest';
import { toMonthlyRate } from '../../debts/calculations.ts';
import {
  comparePayoff,
  getDebtGoalProgress,
  getSavingsProgress,
  monthsBetween,
  requiredExtraPayment,
  simulatePayoff,
  type PayoffDebt,
} from '../calculations.ts';

const TODAY = '2026-10-12';

describe('monthsBetween', () => {
  it('різниця в календарних місяцях', () => {
    expect(monthsBetween('2026-10', '2026-10')).toBe(0);
    expect(monthsBetween('2026-10', '2027-06')).toBe(8);
    expect(monthsBetween('2026-10', '2026-09')).toBe(-1);
    expect(monthsBetween('2025-12', '2026-01')).toBe(1);
  });
});

describe('getSavingsProgress', () => {
  const savings = (override: object = {}) =>
    getSavingsProgress({
      targetAmount: 10_000_000,
      balance: 2_000_000,
      targetDate: '2027-06-30',
      monthlyContribution: 500_000,
      recentAverage: 0,
      today: TODAY,
      ...override,
    });

  it('зібрано, лишилося, частка й потрібний внесок', () => {
    // до червня 2027 — 8 місяців
    expect(savings()).toEqual({
      saved: 2_000_000,
      remaining: 8_000_000,
      progress: 0.2,
      requiredMonthly: 1_000_000,
      pace: 500_000,
      // 8 000 000 / 500 000 = 16 місяців
      projectedMonth: '2028-02',
      state: 'behind',
    });
  });

  it('від’ємний баланс рахується як нуль зібраного', () => {
    expect(savings({ balance: -5_000 })).toMatchObject({
      saved: 0,
      remaining: 10_000_000,
      progress: 0,
    });
  });

  it('перевиконання: ціль досягнуто, частка не більша за 1', () => {
    expect(savings({ balance: 12_000_000 })).toEqual({
      saved: 12_000_000,
      remaining: 0,
      progress: 1,
      requiredMonthly: null,
      pace: 500_000,
      projectedMonth: null,
      state: 'achieved',
    });
    expect(savings({ balance: 10_000_000 }).state).toBe('achieved');
  });

  it('потрібний внесок округлюється вгору', () => {
    // лишилося 100 копійок на 3 місяці
    const result = savings({ targetAmount: 100, balance: 0, targetDate: '2027-01-15' });
    expect(result.requiredMonthly).toBe(34);
  });

  it('у місяці цілі лишається один внесок', () => {
    expect(savings({ targetDate: '2026-10-31' }).requiredMonthly).toBe(8_000_000);
    expect(savings({ targetDate: TODAY }).requiredMonthly).toBe(8_000_000);
  });

  it('темп: плановий внесок важливіший за фактичний приріст', () => {
    expect(savings({ recentAverage: 900_000 }).pace).toBe(500_000);
    expect(savings({ monthlyContribution: null, recentAverage: 900_000 })).toMatchObject({
      pace: 900_000,
      // 8 000 000 / 900 000 → 9 місяців
      projectedMonth: '2027-07',
    });
  });

  it('без темпу прогнозу немає', () => {
    for (const recentAverage of [0, -300_000]) {
      expect(savings({ monthlyContribution: null, recentAverage })).toMatchObject({
        pace: null,
        projectedMonth: null,
        state: 'behind',
      });
    }
  });

  it('стани: встигаєте рівно на межі, відстаєте на копійку нижче', () => {
    expect(savings({ monthlyContribution: 1_000_000 }).state).toBe('on_track');
    expect(savings({ monthlyContribution: 999_999 }).state).toBe('behind');
  });

  it('без дати — немає потрібного внеску, але прогноз є', () => {
    expect(savings({ targetDate: null })).toMatchObject({
      requiredMonthly: null,
      projectedMonth: '2028-02',
      state: 'no_deadline',
    });
  });

  it('строк минув', () => {
    expect(savings({ targetDate: '2026-10-11' })).toMatchObject({
      requiredMonthly: null,
      state: 'overdue',
    });
  });
});

const ZERO = toMonthlyRate(0, 'year');
const debt = (id: string, override: Partial<PayoffDebt> = {}): PayoffDebt => ({
  id,
  balance: 100_000,
  rate: ZERO,
  annualRatePercent: 0,
  monthlyPayment: 10_000,
  earlyRepaymentAllowed: true,
  ...override,
});
const withRate = (percent: number) => ({
  rate: toMonthlyRate(percent, 'year'),
  annualRatePercent: percent,
});
const simulate = (
  debts: PayoffDebt[],
  extra = 0,
  strategy: 'avalanche' | 'snowball' = 'avalanche',
) => simulatePayoff({ debts, extra, strategy, firstMonth: '2026-10' });

describe('simulatePayoff', () => {
  it('один борг без відсотків', () => {
    const plan = simulate([debt('a')]);
    expect(plan).toMatchObject({
      months: 10,
      debtFreeMonth: '2027-07',
      totalInterest: 0,
      payoffOrder: [{ debtId: 'a', month: '2027-07' }],
    });
    expect(plan.timeline[0]).toEqual({ month: '2026-10', balance: 90_000 });
    expect(plan.timeline.at(-1)).toEqual({ month: '2027-07', balance: 0 });
    expect(plan.timeline).toHaveLength(10);
  });

  it('борг не гаситься й не росте до місяця свого першого платежу', () => {
    const plan = simulate([debt('later', { ...withRate(36), firstPaymentMonth: '2026-12' })]);
    expect(plan.timeline.slice(0, 2)).toEqual([
      { month: '2026-10', balance: 100_000 },
      { month: '2026-11', balance: 100_000 },
    ]);
    // грудень: +3 000 відсотків −10 000 платежу
    expect(plan.timeline[2]).toEqual({ month: '2026-12', balance: 93_000 });
  });

  it('додаткові гроші йдуть на інші борги, поки перший платіж не настав', () => {
    const plan = simulate(
      [
        debt('later', { ...withRate(36), firstPaymentMonth: '2026-12' }),
        debt('now', { balance: 30_000 }),
      ],
      5_000,
    );
    // «later» дорожчий, але до грудня доплата дістається «now»: 30 000 − 15 000 − 15 000
    expect(plan.payoffOrder[0]).toEqual({ debtId: 'now', month: '2026-11' });
    expect(plan.timeline[1]).toEqual({ month: '2026-11', balance: 100_000 });
  });

  it('додатковий платіж скорочує строк', () => {
    expect(simulate([debt('a')], 15_000)).toMatchObject({ months: 4, debtFreeMonth: '2027-01' });
  });

  it('відсотки нараховуються до платежу й підсумовуються', () => {
    // 100 000 під 3% на місяць, платіж 60 000: +3 000 −60 000 = 43 000; +1 290 −44 290 = 0
    const plan = simulate([debt('a', { ...withRate(36), monthlyPayment: 60_000 })]);
    expect(plan).toMatchObject({ months: 2, totalInterest: 4_290 });
  });

  it('лавина гасить спершу найдорожчий борг, сніжна куля — найменший', () => {
    const debts = [
      debt('small', { balance: 30_000, ...withRate(12) }),
      debt('costly', { balance: 200_000, ...withRate(48) }),
    ];
    const avalanche = simulate(debts, 20_000, 'avalanche');
    const snowball = simulate(debts, 20_000, 'snowball');

    expect(snowball.payoffOrder.map((item) => item.debtId)).toEqual(['small', 'costly']);
    // лавина спрямовує додаткові гроші на дорогий борг і платить менше відсотків
    expect(avalanche.totalInterest!).toBeLessThan(snowball.totalInterest!);
    expect(snowball.payoffOrder[0]!.month < avalanche.payoffOrder[0]!.month).toBe(true);
  });

  it('звільнений мінімальний платіж переходить на наступний борг', () => {
    const debts = [debt('first', { balance: 20_000 }), debt('second', { balance: 100_000 })];
    // без перенесення другий борг гасився б 10 місяців
    const plan = simulate(debts, 0, 'snowball');
    expect(plan.payoffOrder).toEqual([
      { debtId: 'first', month: '2026-11' },
      // з грудня на другий борг іде 20 000: 80 000 після двох місяців → ще 4 місяці
      { debtId: 'second', month: '2027-03' },
    ]);
    expect(plan.months).toBe(6);
  });

  it('борг без дострокового погашення додаткових грошей не отримує', () => {
    const debts = [
      debt('locked', { earlyRepaymentAllowed: false, ...withRate(60) }),
      debt('open', withRate(12)),
    ];
    const plan = simulate(debts, 50_000, 'avalanche');
    expect(plan.payoffOrder.map((item) => item.debtId)).toEqual(['open', 'locked']);
    // замкнений борг гаситься лише своїм платежем
    const alone = simulate([debts[0]!]);
    expect(plan.payoffOrder[1]!.month).toBe(alone.debtFreeMonth);
  });

  it('платіж не покриває відсотки — борги не погашаються', () => {
    const plan = simulate([debt('a', { ...withRate(240), monthlyPayment: 1_000 })]);
    expect(plan).toMatchObject({
      months: null,
      debtFreeMonth: null,
      totalInterest: null,
      payoffOrder: [],
    });
    expect(plan.timeline).toHaveLength(600);
  });

  it('порожній список і погашені борги', () => {
    const empty = {
      months: 0,
      debtFreeMonth: null,
      totalInterest: 0,
      payoffOrder: [],
      timeline: [],
    };
    expect(simulate([])).toEqual(empty);
    expect(simulate([debt('a', { balance: 0 })])).toEqual(empty);
  });

  it('вхідні борги не змінюються', () => {
    const debts = [debt('a')];
    simulate(debts, 5_000);
    expect(debts[0]!.balance).toBe(100_000);
  });
});

describe('comparePayoff', () => {
  it('заощаджені відсотки й місяці проти мінімальних платежів', () => {
    const debts = [debt('a', { ...withRate(36), monthlyPayment: 5_000 })];
    const result = comparePayoff({
      debts,
      extra: 10_000,
      strategy: 'avalanche',
      firstMonth: '2026-10',
    });
    expect(result.baseline.months!).toBeGreaterThan(result.plan.months!);
    expect(result.monthsSaved).toBe(result.baseline.months! - result.plan.months!);
    expect(result.interestSaved).toBe(result.baseline.totalInterest! - result.plan.totalInterest!);
    expect(result.interestSaved!).toBeGreaterThan(0);
  });

  it('базовий сценарій не переносить звільнені платежі', () => {
    const debts = [debt('first', { balance: 20_000 }), debt('second', { balance: 100_000 })];
    const result = comparePayoff({ debts, extra: 0, strategy: 'snowball', firstMonth: '2026-10' });
    expect(result.baseline.months).toBe(10);
    expect(result.plan.months).toBe(6);
    expect(result).toMatchObject({ monthsSaved: 4, interestSaved: 0 });
  });

  it('якщо базовий сценарій не закінчується, порівняння немає', () => {
    const debts = [debt('a', { ...withRate(240), monthlyPayment: 1_000 })];
    const result = comparePayoff({
      debts,
      extra: 50_000,
      strategy: 'avalanche',
      firstMonth: '2026-10',
    });
    expect(result.plan.months).not.toBeNull();
    expect(result).toMatchObject({ interestSaved: null, monthsSaved: null });
  });
});

describe('requiredExtraPayment', () => {
  const input = { strategy: 'avalanche' as const, firstMonth: '2026-10' };

  it('мінімальних платежів досить — нуль', () => {
    expect(requiredExtraPayment({ ...input, debts: [debt('a')], monthsAvailable: 10 })).toBe(0);
  });

  it('знайдений платіж закінчує план вчасно, на копійку менший — ні', () => {
    const debts = [debt('a', withRate(24)), debt('b', { balance: 250_000, ...withRate(40) })];
    const extra = requiredExtraPayment({ ...input, debts, monthsAvailable: 6 })!;
    expect(extra).toBeGreaterThan(0);
    expect(simulate(debts, extra).months!).toBeLessThanOrEqual(6);
    expect(simulate(debts, extra - 1).months!).toBeGreaterThan(6);
  });

  it('без відсотків: борг ділиться на місяці', () => {
    // 100 000 за 4 місяці: 25 000 на місяць, із них 10 000 — мінімальний платіж
    expect(requiredExtraPayment({ ...input, debts: [debt('a')], monthsAvailable: 4 })).toBe(15_000);
  });

  it('борг без дострокового погашення не встигнути — null', () => {
    const debts = [debt('locked', { earlyRepaymentAllowed: false })];
    expect(requiredExtraPayment({ ...input, debts, monthsAvailable: 5 })).toBeNull();
    expect(requiredExtraPayment({ ...input, debts, monthsAvailable: 10 })).toBe(0);
  });

  it('місяців не лишилося — null', () => {
    expect(requiredExtraPayment({ ...input, debts: [debt('a')], monthsAvailable: 0 })).toBeNull();
  });
});

describe('getDebtGoalProgress', () => {
  const goal = (override: object = {}) =>
    getDebtGoalProgress({
      debts: [debt('a', { balance: 60_000 })],
      startBalance: 100_000,
      targetDate: '2027-03-31',
      extraPayment: 0,
      strategy: 'avalanche',
      today: TODAY,
      ...override,
    });

  it('погашено від стартового залишку; план встигає', () => {
    // 60 000 по 10 000 — 6 платежів: жовтень–березень
    expect(goal()).toEqual({
      currentBalance: 60_000,
      paid: 40_000,
      progress: 0.4,
      minimumPayments: 10_000,
      requiredMonthly: 10_000,
      debtFreeMonth: '2027-03',
      state: 'on_track',
    });
  });

  it('відстаєте: потрібний платіж більший за мінімальний', () => {
    const result = goal({ targetDate: '2026-12-31' });
    // 60 000 за 3 місяці
    expect(result).toMatchObject({
      requiredMonthly: 20_000,
      debtFreeMonth: '2027-03',
      state: 'behind',
    });
    expect(goal({ targetDate: '2026-12-31', extraPayment: 10_000 }).state).toBe('on_track');
    expect(goal({ targetDate: '2026-12-31', extraPayment: 9_999 }).state).toBe('behind');
  });

  it('борг виріс понад стартовий — прогрес нульовий, а не від’ємний', () => {
    expect(goal({ debts: [debt('a', { balance: 130_000 })] })).toMatchObject({
      paid: 0,
      progress: 0,
    });
  });

  it('досягнуто: боргів не лишилося', () => {
    expect(goal({ debts: [debt('a', { balance: 0 })] })).toEqual({
      currentBalance: 0,
      paid: 100_000,
      progress: 1,
      minimumPayments: 0,
      requiredMonthly: null,
      debtFreeMonth: null,
      state: 'achieved',
    });
    expect(goal({ debts: [], startBalance: 0 })).toMatchObject({ progress: 1, state: 'achieved' });
  });

  it('строк минув', () => {
    expect(goal({ targetDate: '2026-10-11' })).toMatchObject({
      requiredMonthly: null,
      state: 'overdue',
    });
  });

  it('до дати не встигнути жодним платежем', () => {
    const result = goal({
      debts: [debt('locked', { earlyRepaymentAllowed: false })],
      targetDate: '2026-12-31',
    });
    expect(result).toMatchObject({ requiredMonthly: null, state: 'behind' });
  });
});
